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
    });

    embedder = new EmbeddingEngine(config);
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

      // Embedder initialization may fail without network
      try {
        await embedder.initialize();
      } catch {
        // Skip test if embedder can't initialize
        return;
      }

      const result = await indexTool.execute();

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(0);
      expect(result.chunksCreated).toBe(0);
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
    };

    expect(result.success).toBe(true);
    expect(result.filesProcessed).toBe(10);
    expect(result.chunksCreated).toBe(50);
    expect(result.languages).toEqual({ typescript: 5, python: 3, rust: 2 });
    expect(result.durationMs).toBe(1500);
    expect(result.error).toBeUndefined();
  });

  it('should have correct structure for failure', () => {
    const result: IndexResult = {
      success: false,
      filesProcessed: 0,
      chunksCreated: 0,
      languages: {},
      durationMs: 100,
      error: 'Something went wrong',
    };

    expect(result.success).toBe(false);
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
    searchTool = new SearchCodebase(embedder, store);
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
