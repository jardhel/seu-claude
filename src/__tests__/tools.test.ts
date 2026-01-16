import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { IndexCodebase, IndexResult } from '../tools/index-codebase.js';
import { SearchCodebase, SearchOptions, FormattedSearchResult } from '../tools/search-codebase.js';
import { ReadSemanticContext, ContextOptions, ContextResult } from '../tools/read-context.js';
import { EmbeddingEngine } from '../vector/embed.js';
import { VectorStore, StoredChunk } from '../vector/store.js';
import { loadConfig, Config } from '../utils/config.js';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// ============================================================================
// Mock Embedder for tests (avoids network dependency)
// ============================================================================

const createMockEmbedder = () => {
  return {
    embed: (text: string): Promise<number[]> => {
      const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const vector = new Array(384).fill(0).map((_, i) => Math.sin(hash + i) * 0.5 + 0.5);
      const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      return Promise.resolve(vector.map(v => v / magnitude));
    },
    embedQuery: (text: string): Promise<number[]> => {
      const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const vector = new Array(384).fill(0).map((_, i) => Math.sin(hash + i) * 0.5 + 0.5);
      const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      return Promise.resolve(vector.map(v => v / magnitude));
    },
    embedBatch: async (texts: string[]) => {
      const embedder = createMockEmbedder();
      return Promise.all(texts.map(t => embedder.embed(t)));
    },
    initialize: async () => {},
    isInitialized: () => true,
    getDimensions: () => 384,
  } as unknown as EmbeddingEngine;
};

// ============================================================================
// IndexCodebase Tests
// ============================================================================

describe('IndexCodebase', () => {
  let testDir: string;
  let config: Config;
  let embedder: EmbeddingEngine;
  let store: VectorStore;
  let indexTool: IndexCodebase;

  beforeEach(async () => {
    testDir = join(tmpdir(), `seu-claude-index-test-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });

    config = loadConfig({
      projectRoot: testDir,
      dataDir: join(testDir, '.seu-claude'),
      embeddingDimensions: 384,
    });

    // Use mock embedder to avoid network dependency
    embedder = createMockEmbedder();
    store = new VectorStore(config);
    indexTool = new IndexCodebase(config, embedder, store);
  });

  afterEach(async () => {
    store.close();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create an IndexCodebase instance', () => {
      expect(indexTool).toBeInstanceOf(IndexCodebase);
    });

    it('should accept optional languagesDir', () => {
      const toolWithDir = new IndexCodebase(config, embedder, store, '/custom/languages');
      expect(toolWithDir).toBeInstanceOf(IndexCodebase);
    });
  });

  describe('initialize', () => {
    it('should initialize without error', async () => {
      await expect(indexTool.initialize()).resolves.toBeUndefined();
    });

    it('should be idempotent', async () => {
      await indexTool.initialize();
      await expect(indexTool.initialize()).resolves.toBeUndefined();
    });
  });

  describe('execute - empty directory', () => {
    it('should handle empty directory', async () => {
      await store.initialize();
      await embedder.initialize();

      const result = await indexTool.execute();

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(0);
      expect(result.chunksCreated).toBe(0);
    });
  });

  describe('execute - with files', () => {
    it('should index TypeScript files', async () => {
      // Create test TypeScript file
      await writeFile(
        join(testDir, 'test.ts'),
        `function hello(): string {
  return "world";
}

export { hello };
`
      );

      await store.initialize();
      await embedder.initialize();

      const result = await indexTool.execute();

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBeGreaterThan(0);
      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.languages).toHaveProperty('typescript');
    });

    it('should handle force mode', async () => {
      // Create test file
      await writeFile(join(testDir, 'app.ts'), 'const x = 1;');

      await store.initialize();
      await embedder.initialize();

      // First indexing
      const result1 = await indexTool.execute();
      expect(result1.success).toBe(true);
      expect(result1.filesProcessed).toBeGreaterThan(0);

      // Force re-index should process all files again
      const result2 = await indexTool.execute(true);
      expect(result2.success).toBe(true);
      expect(result2.filesProcessed).toBeGreaterThan(0);
    });

    it('should skip unchanged files in incremental mode', async () => {
      // Create test file
      await writeFile(join(testDir, 'stable.ts'), 'const stable = true;');

      await store.initialize();
      await embedder.initialize();

      // First indexing
      const result1 = await indexTool.execute();
      expect(result1.success).toBe(true);

      // Second indexing without changes should skip files
      const result2 = await indexTool.execute();
      expect(result2.success).toBe(true);
      expect(result2.filesProcessed).toBe(0);
      expect(result2.filesSkipped).toBeGreaterThan(0);
    });

    it('should call progress callback', async () => {
      await writeFile(join(testDir, 'progress.ts'), 'const x = 1;');

      await store.initialize();
      await embedder.initialize();

      const progressCalls: Array<{ phase: string; message: string }> = [];
      const onProgress = (progress: { phase: string; message: string }) => {
        progressCalls.push({ phase: progress.phase, message: progress.message });
      };

      await indexTool.execute(false, onProgress);

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls.some(p => p.phase === 'crawling')).toBe(true);
    });

    it('should handle multiple file types', async () => {
      await writeFile(join(testDir, 'file1.ts'), 'const ts = 1;');
      await writeFile(join(testDir, 'file2.js'), 'const js = 1;');

      await store.initialize();
      await embedder.initialize();

      const result = await indexTool.execute();

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBeGreaterThanOrEqual(2);
    });

    it('should detect and process new files', async () => {
      await writeFile(join(testDir, 'initial.ts'), 'const initial = 1;');

      await store.initialize();
      await embedder.initialize();

      // First index
      const result1 = await indexTool.execute();
      expect(result1.success).toBe(true);

      // Add new file
      await writeFile(join(testDir, 'newfile.ts'), 'const newFile = 2;');

      // Second index should pick up new file
      const result2 = await indexTool.execute();
      expect(result2.success).toBe(true);
      expect(result2.filesProcessed).toBe(1);
      expect(result2.filesUpdated).toBe(1);
    });

    it('should handle file modifications', async () => {
      const filePath = join(testDir, 'modified.ts');
      await writeFile(filePath, 'const original = 1;');

      await store.initialize();
      await embedder.initialize();

      // First index
      const result1 = await indexTool.execute();
      expect(result1.success).toBe(true);

      // Modify the file (need small delay to ensure mtime changes)
      await new Promise(resolve => setTimeout(resolve, 100));
      await writeFile(filePath, 'const modified = 2; const another = 3;');

      // Second index should pick up modification
      const result2 = await indexTool.execute();
      expect(result2.success).toBe(true);
      expect(result2.filesProcessed).toBe(1);
    });

    it('should handle subdirectories', async () => {
      await mkdir(join(testDir, 'src'), { recursive: true });
      await mkdir(join(testDir, 'src', 'utils'), { recursive: true });

      await writeFile(join(testDir, 'src', 'index.ts'), 'export const main = 1;');
      await writeFile(join(testDir, 'src', 'utils', 'helper.ts'), 'export const helper = 2;');

      await store.initialize();
      await embedder.initialize();

      const result = await indexTool.execute();

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBeGreaterThanOrEqual(2);
    });

    it('should include filesDeleted in result', async () => {
      const filePath = join(testDir, 'toDelete.ts');
      await writeFile(filePath, 'const x = 1;');

      await store.initialize();
      await embedder.initialize();

      // First index
      await indexTool.execute();

      // Delete the file
      await rm(filePath);

      // Second index should report deletion
      const result = await indexTool.execute();
      expect(result.success).toBe(true);
      expect(result.filesDeleted).toBe(1);
    });
  });
});

describe('IndexResult interface', () => {
  it('should have correct structure for success', () => {
    const result: IndexResult = {
      success: true,
      filesProcessed: 10,
      chunksCreated: 50,
      languages: { typescript: 5, python: 3, rust: 2 },
      durationMs: 1500,
      filesSkipped: 5,
      filesUpdated: 10,
      filesDeleted: 2,
    };

    expect(result.success).toBe(true);
    expect(result.filesProcessed).toBe(10);
    expect(result.chunksCreated).toBe(50);
    expect(result.languages).toEqual({ typescript: 5, python: 3, rust: 2 });
    expect(result.durationMs).toBe(1500);
    expect(result.filesSkipped).toBe(5);
    expect(result.filesUpdated).toBe(10);
    expect(result.filesDeleted).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it('should have correct structure for failure', () => {
    const result: IndexResult = {
      success: false,
      filesProcessed: 0,
      chunksCreated: 0,
      languages: {},
      durationMs: 100,
      filesSkipped: 0,
      filesUpdated: 0,
      filesDeleted: 0,
      error: 'Something went wrong',
    };

    expect(result.success).toBe(false);
    expect(result.filesSkipped).toBe(0);
    expect(result.error).toBe('Something went wrong');
  });
});

// ============================================================================
// SearchCodebase Tests
// ============================================================================

describe('SearchCodebase', () => {
  let testDir: string;
  let config: Config;
  let embedder: EmbeddingEngine;
  let store: VectorStore;
  let searchTool: SearchCodebase;

  beforeEach(async () => {
    testDir = join(tmpdir(), `seu-claude-search-test-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });

    config = loadConfig({
      projectRoot: testDir,
      dataDir: join(testDir, '.seu-claude'),
    });

    embedder = new EmbeddingEngine(config);
    store = new VectorStore(config);
    searchTool = new SearchCodebase(embedder, store, config.dataDir);
  });

  afterEach(async () => {
    store.close();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create a SearchCodebase instance', () => {
      expect(searchTool).toBeInstanceOf(SearchCodebase);
    });
  });

  describe('formatForClaude', () => {
    it('should return message for empty results', () => {
      const output = searchTool.formatForClaude([]);
      expect(output).toBe('No results found for your query.');
    });

    it('should format single result correctly', () => {
      const results: FormattedSearchResult[] = [
        {
          filePath: '/test/file.ts',
          relativePath: 'file.ts',
          startLine: 1,
          endLine: 10,
          type: 'function',
          name: 'myFunc',
          scope: 'file.ts:myFunc',
          language: 'typescript',
          code: 'function myFunc() { return 1; }',
          score: 0.95,
        },
      ];

      const output = searchTool.formatForClaude(results);

      expect(output).toContain('## Result 1:');
      expect(output).toContain('file.ts:1-10');
      expect(output).toContain('**Type:** function');
      expect(output).toContain('**Score:** 0.950');
      expect(output).toContain('function myFunc()');
    });

    it('should format multiple results with separators', () => {
      const results: FormattedSearchResult[] = [
        {
          filePath: '/test/a.ts',
          relativePath: 'a.ts',
          startLine: 1,
          endLine: 5,
          type: 'function',
          name: 'funcA',
          scope: 'a.ts',
          language: 'typescript',
          code: 'function funcA() {}',
          score: 0.9,
        },
        {
          filePath: '/test/b.ts',
          relativePath: 'b.ts',
          startLine: 1,
          endLine: 5,
          type: 'class',
          name: 'ClassB',
          scope: 'b.ts',
          language: 'typescript',
          code: 'class ClassB {}',
          score: 0.8,
        },
      ];

      const output = searchTool.formatForClaude(results);

      expect(output).toContain('## Result 1:');
      expect(output).toContain('## Result 2:');
      expect(output).toContain('---'); // Separator
    });

    it('should handle null name', () => {
      const results: FormattedSearchResult[] = [
        {
          filePath: '/test/file.ts',
          relativePath: 'file.ts',
          startLine: 1,
          endLine: 5,
          type: 'block',
          name: null,
          scope: 'file.ts',
          language: 'typescript',
          code: 'const x = 1;',
          score: 0.7,
        },
      ];

      const output = searchTool.formatForClaude(results);
      expect(output).toContain('## Result 1:');
    });
  });
});

describe('SearchOptions interface', () => {
  it('should have required query field', () => {
    const options: SearchOptions = {
      query: 'search term',
    };
    expect(options.query).toBe('search term');
  });

  it('should have optional fields', () => {
    const options: SearchOptions = {
      query: 'search term',
      limit: 5,
      filterType: 'function',
      filterLanguage: 'typescript',
    };

    expect(options.limit).toBe(5);
    expect(options.filterType).toBe('function');
    expect(options.filterLanguage).toBe('typescript');
  });
});

describe('FormattedSearchResult interface', () => {
  it('should have correct structure', () => {
    const result: FormattedSearchResult = {
      filePath: '/test/file.ts',
      relativePath: 'file.ts',
      startLine: 10,
      endLine: 20,
      type: 'method',
      name: 'myMethod',
      scope: 'MyClass:myMethod',
      language: 'typescript',
      code: 'myMethod() { return 1; }',
      score: 0.85,
    };

    expect(result.filePath).toBe('/test/file.ts');
    expect(result.startLine).toBe(10);
    expect(result.score).toBe(0.85);
  });
});

// ============================================================================
// ReadSemanticContext Tests
// ============================================================================

describe('ReadSemanticContext', () => {
  let testDir: string;
  let config: Config;
  let store: VectorStore;
  let contextTool: ReadSemanticContext;

  beforeEach(async () => {
    testDir = join(tmpdir(), `seu-claude-context-test-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });

    config = loadConfig({
      projectRoot: testDir,
      dataDir: join(testDir, '.seu-claude'),
    });

    store = new VectorStore(config);
    contextTool = new ReadSemanticContext(store);
  });

  afterEach(async () => {
    store.close();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create a ReadSemanticContext instance', () => {
      expect(contextTool).toBeInstanceOf(ReadSemanticContext);
    });
  });

  describe('execute', () => {
    it('should read file content', async () => {
      const testFile = join(testDir, 'test.ts');
      await writeFile(testFile, 'const x = 1;\nconst y = 2;\nconst z = 3;\n');

      await store.initialize();

      const result = await contextTool.execute({
        filePath: testFile,
      });

      expect(result.filePath).toBe(testFile);
      expect(result.code).toContain('const x = 1');
    });

    it('should respect context lines', async () => {
      const lines = Array(20)
        .fill(null)
        .map((_, i) => `line ${i + 1}`)
        .join('\n');
      const testFile = join(testDir, 'test.ts');
      await writeFile(testFile, lines);

      await store.initialize();

      const result = await contextTool.execute({
        filePath: testFile,
        startLine: 10,
        endLine: 10,
        contextLines: 2,
      });

      expect(result.startLine).toBe(8); // 10 - 2
      expect(result.endLine).toBe(12); // 10 + 2
    });

    it('should throw for non-existent file', async () => {
      await store.initialize();

      await expect(
        contextTool.execute({
          filePath: join(testDir, 'nonexistent.ts'),
        })
      ).rejects.toThrow();
    });

    it('should find symbol by name', async () => {
      const testFile = join(testDir, 'test.ts');
      await writeFile(
        testFile,
        `function hello() {
  return "world";
}

function goodbye() {
  return "world";
}
`
      );

      await store.initialize();

      // Add a chunk for the function
      const chunk: StoredChunk = {
        id: '1',
        filePath: testFile,
        relativePath: 'test.ts',
        code: 'function hello() { return "world"; }',
        vector: [0.1, 0.2, 0.3],
        startLine: 1,
        endLine: 3,
        language: 'typescript',
        type: 'function',
        name: 'hello',
        scope: 'test.ts:hello',
        docstring: null,
        tokenEstimate: 10,
        lastUpdated: new Date(),
      };
      await store.upsert([chunk]);

      const result = await contextTool.execute({
        filePath: testFile,
        symbol: 'hello',
        contextLines: 1,
      });

      // Should focus on the hello function
      expect(result.symbol).toBe('hello');
    });
  });

  describe('formatForClaude', () => {
    it('should format result without symbol', () => {
      const result: ContextResult = {
        filePath: '/test/file.ts',
        code: 'const x = 1;',
        startLine: 1,
        endLine: 1,
        relatedChunks: [],
      };

      const output = contextTool.formatForClaude(result);

      expect(output).toContain('## /test/file.ts');
      expect(output).toContain('Lines 1-1');
      expect(output).toContain('const x = 1;');
    });

    it('should format result with symbol', () => {
      const result: ContextResult = {
        filePath: '/test/file.ts',
        symbol: 'myFunction',
        code: 'function myFunction() {}',
        startLine: 1,
        endLine: 3,
        relatedChunks: [],
      };

      const output = contextTool.formatForClaude(result);

      expect(output).toContain('## /test/file.ts - myFunction');
    });

    it('should include related chunks', () => {
      const result: ContextResult = {
        filePath: '/test/file.ts',
        code: 'const x = 1;',
        startLine: 1,
        endLine: 1,
        relatedChunks: [
          {
            type: 'function',
            name: 'func1',
            scope: 'file.ts:func1',
            startLine: 10,
            endLine: 15,
          },
          {
            type: 'class',
            name: 'MyClass',
            scope: 'file.ts:MyClass',
            startLine: 20,
            endLine: 30,
          },
        ],
      };

      const output = contextTool.formatForClaude(result);

      expect(output).toContain('### Other definitions in this file:');
      expect(output).toContain('**function** `func1`');
      expect(output).toContain('**class** `MyClass`');
      expect(output).toContain('(lines 10-15)');
      expect(output).toContain('(lines 20-30)');
    });

    it('should handle null name in related chunks', () => {
      const result: ContextResult = {
        filePath: '/test/file.ts',
        code: 'const x = 1;',
        startLine: 1,
        endLine: 1,
        relatedChunks: [
          {
            type: 'block',
            name: null,
            scope: 'file.ts',
            startLine: 5,
            endLine: 10,
          },
        ],
      };

      const output = contextTool.formatForClaude(result);

      expect(output).toContain('**block** `file.ts`');
    });
  });
});

describe('ContextOptions interface', () => {
  it('should have required filePath field', () => {
    const options: ContextOptions = {
      filePath: '/test/file.ts',
    };
    expect(options.filePath).toBe('/test/file.ts');
  });

  it('should have optional fields', () => {
    const options: ContextOptions = {
      filePath: '/test/file.ts',
      symbol: 'myFunction',
      startLine: 10,
      endLine: 20,
      contextLines: 3,
    };

    expect(options.symbol).toBe('myFunction');
    expect(options.startLine).toBe(10);
    expect(options.endLine).toBe(20);
    expect(options.contextLines).toBe(3);
  });
});

describe('ContextResult interface', () => {
  it('should have correct structure', () => {
    const result: ContextResult = {
      filePath: '/test/file.ts',
      symbol: 'mySymbol',
      code: 'const x = 1;',
      startLine: 1,
      endLine: 10,
      relatedChunks: [
        {
          type: 'function',
          name: 'func',
          scope: 'file.ts:func',
          startLine: 20,
          endLine: 30,
        },
      ],
    };

    expect(result.filePath).toBe('/test/file.ts');
    expect(result.symbol).toBe('mySymbol');
    expect(result.relatedChunks).toHaveLength(1);
  });

  it('should allow undefined symbol', () => {
    const result: ContextResult = {
      filePath: '/test/file.ts',
      code: 'const x = 1;',
      startLine: 1,
      endLine: 10,
      relatedChunks: [],
    };

    expect(result.symbol).toBeUndefined();
  });
});

// ============================================================================
// SearchCodebase Integration Tests
// ============================================================================

describe('SearchCodebase - Integration', () => {
  let testDir: string;
  let config: Config;
  let store: VectorStore;
  let searchTool: SearchCodebase;
  let mockEmbedder: EmbeddingEngine;

  beforeEach(async () => {
    mockEmbedder = createMockEmbedder();
    testDir = join(tmpdir(), `seu-claude-search-integration-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });

    config = loadConfig({
      projectRoot: testDir,
      dataDir: join(testDir, '.seu-claude'),
      embeddingDimensions: 384,
    });

    store = new VectorStore(config);
    searchTool = new SearchCodebase(mockEmbedder, store, config.dataDir);

    await store.initialize();
  });

  afterEach(async () => {
    store.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('should execute search with type filter', async () => {
    // Create test data
    const testVector = await mockEmbedder.embed('test function code');
    const now = new Date();

    await store.upsert([
      {
        id: 'chunk1',
        filePath: join(testDir, 'file.ts'),
        relativePath: 'file.ts',
        code: 'function testFunction() { return 1; }',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
        type: 'function',
        name: 'testFunction',
        scope: 'file.ts',
        docstring: null,
        tokenEstimate: 20,
        vector: testVector,
        lastUpdated: now,
      },
      {
        id: 'chunk2',
        filePath: join(testDir, 'file.ts'),
        relativePath: 'file.ts',
        code: 'class TestClass { }',
        startLine: 10,
        endLine: 15,
        language: 'typescript',
        type: 'class',
        name: 'TestClass',
        scope: 'file.ts',
        docstring: null,
        tokenEstimate: 10,
        vector: testVector,
        lastUpdated: now,
      },
    ]);

    const results = await searchTool.execute({
      query: 'test function',
      filterType: 'function',
      limit: 10,
    });

    // Should only return functions
    expect(results.every(r => r.type === 'function')).toBe(true);
  });

  it('should execute search with language filter', async () => {
    const testVector = await mockEmbedder.embed('test code');
    const now = new Date();

    await store.upsert([
      {
        id: 'ts-chunk',
        filePath: join(testDir, 'file.ts'),
        relativePath: 'file.ts',
        code: 'const x = 1;',
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        type: 'block',
        name: null,
        scope: 'file.ts',
        docstring: null,
        tokenEstimate: 5,
        vector: testVector,
        lastUpdated: now,
      },
      {
        id: 'py-chunk',
        filePath: join(testDir, 'file.py'),
        relativePath: 'file.py',
        code: 'x = 1',
        startLine: 1,
        endLine: 1,
        language: 'python',
        type: 'block',
        name: null,
        scope: 'file.py',
        docstring: null,
        tokenEstimate: 3,
        vector: testVector,
        lastUpdated: now,
      },
    ]);

    const results = await searchTool.execute({
      query: 'variable x',
      filterLanguage: 'typescript',
      limit: 10,
    });

    // Should only return TypeScript chunks
    expect(results.every(r => r.language === 'typescript')).toBe(true);
  });

  it('should apply both type and language filters', async () => {
    const testVector = await mockEmbedder.embed('function code');
    const now = new Date();

    await store.upsert([
      {
        id: 'ts-func',
        filePath: join(testDir, 'file.ts'),
        relativePath: 'file.ts',
        code: 'function tsFunc() {}',
        startLine: 1,
        endLine: 3,
        language: 'typescript',
        type: 'function',
        name: 'tsFunc',
        scope: 'file.ts',
        docstring: null,
        tokenEstimate: 10,
        vector: testVector,
        lastUpdated: now,
      },
      {
        id: 'ts-class',
        filePath: join(testDir, 'file.ts'),
        relativePath: 'file.ts',
        code: 'class TsClass {}',
        startLine: 5,
        endLine: 7,
        language: 'typescript',
        type: 'class',
        name: 'TsClass',
        scope: 'file.ts',
        docstring: null,
        tokenEstimate: 8,
        vector: testVector,
        lastUpdated: now,
      },
      {
        id: 'py-func',
        filePath: join(testDir, 'file.py'),
        relativePath: 'file.py',
        code: 'def py_func(): pass',
        startLine: 1,
        endLine: 2,
        language: 'python',
        type: 'function',
        name: 'py_func',
        scope: 'file.py',
        docstring: null,
        tokenEstimate: 8,
        vector: testVector,
        lastUpdated: now,
      },
    ]);

    const results = await searchTool.execute({
      query: 'function',
      filterType: 'function',
      filterLanguage: 'typescript',
      limit: 10,
    });

    // Should only return TypeScript functions
    for (const r of results) {
      expect(r.type).toBe('function');
      expect(r.language).toBe('typescript');
    }
  });

  it('should respect limit parameter', async () => {
    const testVector = await mockEmbedder.embed('test');
    const now = new Date();

    // Create more chunks than the limit
    const chunks = [];
    for (let i = 0; i < 20; i++) {
      chunks.push({
        id: `chunk-${i}`,
        filePath: join(testDir, `file${i}.ts`),
        relativePath: `file${i}.ts`,
        code: `const x${i} = ${i};`,
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        type: 'block',
        name: null,
        scope: `file${i}.ts`,
        docstring: null,
        tokenEstimate: 5,
        vector: testVector,
        lastUpdated: now,
      });
    }

    await store.upsert(chunks);

    const results = await searchTool.execute({
      query: 'test',
      limit: 5,
    });

    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('should convert distance to similarity score', async () => {
    const testVector = await mockEmbedder.embed('function myFunction');
    const now = new Date();

    await store.upsert([
      {
        id: 'chunk1',
        filePath: join(testDir, 'file.ts'),
        relativePath: 'file.ts',
        code: 'function myFunction() { return 1; }',
        startLine: 1,
        endLine: 3,
        language: 'typescript',
        type: 'function',
        name: 'myFunction',
        scope: 'file.ts',
        docstring: null,
        tokenEstimate: 15,
        vector: testVector,
        lastUpdated: now,
      },
    ]);

    const results = await searchTool.execute({
      query: 'function myFunction',
      limit: 1,
    });

    if (results.length > 0) {
      // Score should be between 0 and 1 (converted from distance)
      expect(results[0].score).toBeGreaterThanOrEqual(0);
      expect(results[0].score).toBeLessThanOrEqual(1);
    }
  });

  describe('scoped search', () => {
    it('should filter results by includePaths', async () => {
      const testVector = await mockEmbedder.embed('test function');
      const now = new Date();

      await store.upsert([
        {
          id: 'src-chunk',
          filePath: join(testDir, 'src/app.ts'),
          relativePath: 'src/app.ts',
          code: 'function srcFunc() {}',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
          type: 'function',
          name: 'srcFunc',
          scope: 'src/app.ts',
          docstring: null,
          tokenEstimate: 5,
          vector: testVector,
          lastUpdated: now,
        },
        {
          id: 'lib-chunk',
          filePath: join(testDir, 'lib/util.ts'),
          relativePath: 'lib/util.ts',
          code: 'function libFunc() {}',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
          type: 'function',
          name: 'libFunc',
          scope: 'lib/util.ts',
          docstring: null,
          tokenEstimate: 5,
          vector: testVector,
          lastUpdated: now,
        },
      ]);

      const results = await searchTool.execute({
        query: 'function',
        limit: 10,
        scope: {
          includePaths: ['src/**'],
        },
      });

      // Should only return results from src/
      expect(results.length).toBe(1);
      expect(results[0].relativePath).toBe('src/app.ts');
    });

    it('should filter results by excludePaths', async () => {
      const testVector = await mockEmbedder.embed('test function');
      const now = new Date();

      await store.upsert([
        {
          id: 'main-chunk',
          filePath: join(testDir, 'main.ts'),
          relativePath: 'main.ts',
          code: 'function mainFunc() {}',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
          type: 'function',
          name: 'mainFunc',
          scope: 'main.ts',
          docstring: null,
          tokenEstimate: 5,
          vector: testVector,
          lastUpdated: now,
        },
        {
          id: 'test-chunk',
          filePath: join(testDir, 'main.test.ts'),
          relativePath: 'main.test.ts',
          code: 'function testFunc() {}',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
          type: 'function',
          name: 'testFunc',
          scope: 'main.test.ts',
          docstring: null,
          tokenEstimate: 5,
          vector: testVector,
          lastUpdated: now,
        },
      ]);

      const results = await searchTool.execute({
        query: 'function',
        limit: 10,
        scope: {
          excludePaths: ['**/*.test.ts'],
        },
      });

      // Should exclude test files
      expect(results.length).toBe(1);
      expect(results[0].relativePath).toBe('main.ts');
    });

    it('should combine include and exclude paths', async () => {
      const testVector = await mockEmbedder.embed('test');
      const now = new Date();

      await store.upsert([
        {
          id: 'src-main',
          filePath: join(testDir, 'src/main.ts'),
          relativePath: 'src/main.ts',
          code: 'const main = 1;',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
          type: 'block',
          name: null,
          scope: 'src/main.ts',
          docstring: null,
          tokenEstimate: 5,
          vector: testVector,
          lastUpdated: now,
        },
        {
          id: 'src-test',
          filePath: join(testDir, 'src/main.test.ts'),
          relativePath: 'src/main.test.ts',
          code: 'const test = 1;',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
          type: 'block',
          name: null,
          scope: 'src/main.test.ts',
          docstring: null,
          tokenEstimate: 5,
          vector: testVector,
          lastUpdated: now,
        },
        {
          id: 'lib-chunk',
          filePath: join(testDir, 'lib/util.ts'),
          relativePath: 'lib/util.ts',
          code: 'const lib = 1;',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
          type: 'block',
          name: null,
          scope: 'lib/util.ts',
          docstring: null,
          tokenEstimate: 5,
          vector: testVector,
          lastUpdated: now,
        },
      ]);

      const results = await searchTool.execute({
        query: 'const',
        limit: 10,
        scope: {
          includePaths: ['src/**'],
          excludePaths: ['**/*.test.ts'],
        },
      });

      // Should only return src/main.ts (in src/, not a test file)
      expect(results.length).toBe(1);
      expect(results[0].relativePath).toBe('src/main.ts');
    });

    it('should return all results when scope is not specified', async () => {
      const testVector = await mockEmbedder.embed('test');
      const now = new Date();

      await store.upsert([
        {
          id: 'chunk1',
          filePath: join(testDir, 'a.ts'),
          relativePath: 'a.ts',
          code: 'const a = 1;',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
          type: 'block',
          name: null,
          scope: 'a.ts',
          docstring: null,
          tokenEstimate: 5,
          vector: testVector,
          lastUpdated: now,
        },
        {
          id: 'chunk2',
          filePath: join(testDir, 'b.ts'),
          relativePath: 'b.ts',
          code: 'const b = 1;',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
          type: 'block',
          name: null,
          scope: 'b.ts',
          docstring: null,
          tokenEstimate: 5,
          vector: testVector,
          lastUpdated: now,
        },
      ]);

      const results = await searchTool.execute({
        query: 'const',
        limit: 10,
      });

      // Should return all results
      expect(results.length).toBe(2);
    });

    it('should handle empty includePaths array', async () => {
      const testVector = await mockEmbedder.embed('test');
      const now = new Date();

      await store.upsert([
        {
          id: 'chunk1',
          filePath: join(testDir, 'file.ts'),
          relativePath: 'file.ts',
          code: 'const x = 1;',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
          type: 'block',
          name: null,
          scope: 'file.ts',
          docstring: null,
          tokenEstimate: 5,
          vector: testVector,
          lastUpdated: now,
        },
      ]);

      const results = await searchTool.execute({
        query: 'const',
        limit: 10,
        scope: {
          includePaths: [],
        },
      });

      // Empty includePaths should return all results
      expect(results.length).toBe(1);
    });
  });
});
