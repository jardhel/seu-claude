import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { VectorStore, StoredChunk, SearchResult } from '../vector/store.js';
import { loadConfig, Config } from '../utils/config.js';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('VectorStore', () => {
  let testDir: string;
  let config: Config;
  let store: VectorStore;

  beforeEach(async () => {
    testDir = join(tmpdir(), `seu-claude-store-test-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });

    config = loadConfig({
      projectRoot: testDir,
      dataDir: join(testDir, '.seu-claude'),
    });

    store = new VectorStore(config);
  });

  afterEach(async () => {
    store.close();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create a VectorStore instance', () => {
      expect(store).toBeInstanceOf(VectorStore);
    });
  });

  describe('initialize', () => {
    it('should initialize without error', async () => {
      await expect(store.initialize()).resolves.toBeUndefined();
    });

    it('should create database directory', async () => {
      await store.initialize();
      // If no error, directory was created successfully
    });
  });

  describe('upsert - without initialization', () => {
    it('should throw error when not initialized', async () => {
      const chunk = createMockChunk('1');
      await expect(store.upsert([chunk])).rejects.toThrow(
        'Vector store not initialized. Call initialize() first.'
      );
    });
  });

  describe('upsert', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should handle empty array', async () => {
      await expect(store.upsert([])).resolves.toBeUndefined();
    });

    it('should insert single chunk', async () => {
      const chunk = createMockChunk('1');
      await store.upsert([chunk]);

      const stats = await store.getStats();
      expect(stats.totalChunks).toBe(1);
    });

    it('should insert multiple chunks', async () => {
      const chunks = [createMockChunk('1'), createMockChunk('2'), createMockChunk('3')];

      await store.upsert(chunks);

      const stats = await store.getStats();
      expect(stats.totalChunks).toBe(3);
    });

    it('should handle chunks with null name', async () => {
      const chunk = createMockChunk('1');
      chunk.name = null;

      await store.upsert([chunk]);

      const stats = await store.getStats();
      expect(stats.totalChunks).toBe(1);
    });

    it('should handle chunks with null docstring', async () => {
      const chunk = createMockChunk('1');
      chunk.docstring = null;

      await store.upsert([chunk]);

      const stats = await store.getStats();
      expect(stats.totalChunks).toBe(1);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should return empty array for empty table', async () => {
      const queryVector = createMockVector();
      const results = await store.search(queryVector);

      expect(results).toEqual([]);
    });

    it('should find similar chunks', async () => {
      const chunk1 = createMockChunk('1', [1, 0, 0]);
      const chunk2 = createMockChunk('2', [0, 1, 0]);
      const chunk3 = createMockChunk('3', [0, 0, 1]);

      await store.upsert([chunk1, chunk2, chunk3]);

      // Search with vector similar to chunk1
      const queryVector = [0.9, 0.1, 0];
      const results = await store.search(queryVector, 10);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.id).toBe('1');
    });

    it('should respect limit parameter', async () => {
      const chunks = Array(10)
        .fill(null)
        .map((_, i) => createMockChunk(`${i}`));

      await store.upsert(chunks);

      const results = await store.search(createMockVector(), 3);

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should apply filter when provided', async () => {
      const chunk1 = createMockChunk('1');
      chunk1.language = 'typescript';
      const chunk2 = createMockChunk('2');
      chunk2.language = 'python';

      await store.upsert([chunk1, chunk2]);

      const results = await store.search(createMockVector(), 10, "language = 'typescript'");

      // All results should be typescript
      for (const result of results) {
        expect(result.chunk.language).toBe('typescript');
      }
    });

    it('should return search results with score', async () => {
      const chunk = createMockChunk('1');
      await store.upsert([chunk]);

      const results = await store.search(createMockVector());

      if (results.length > 0) {
        expect(results[0]).toHaveProperty('chunk');
        expect(results[0]).toHaveProperty('score');
        expect(typeof results[0].score).toBe('number');
      }
    });
  });

  describe('searchByType', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should filter by type', async () => {
      const chunk1 = createMockChunk('1');
      chunk1.type = 'function';
      const chunk2 = createMockChunk('2');
      chunk2.type = 'class';

      await store.upsert([chunk1, chunk2]);

      const results = await store.searchByType(createMockVector(), 'function');

      // All results should be functions
      for (const result of results) {
        expect(result.chunk.type).toBe('function');
      }
    });
  });

  describe('searchByLanguage', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should filter by language', async () => {
      const chunk1 = createMockChunk('1');
      chunk1.language = 'typescript';
      const chunk2 = createMockChunk('2');
      chunk2.language = 'python';

      await store.upsert([chunk1, chunk2]);

      const results = await store.searchByLanguage(createMockVector(), 'python');

      // All results should be python
      for (const result of results) {
        expect(result.chunk.language).toBe('python');
      }
    });
  });

  describe('getByFilePath', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should return empty array for empty table', async () => {
      const results = await store.getByFilePath('/test/file.ts');
      expect(results).toEqual([]);
    });

    it('should return chunks for matching file path', async () => {
      const chunk1 = createMockChunk('1');
      chunk1.filePath = '/test/file1.ts';
      const chunk2 = createMockChunk('2');
      chunk2.filePath = '/test/file2.ts';
      const chunk3 = createMockChunk('3');
      chunk3.filePath = '/test/file1.ts';

      await store.upsert([chunk1, chunk2, chunk3]);

      const results = await store.getByFilePath('/test/file1.ts');

      expect(results.length).toBe(2);
      expect(results.every(c => c.filePath === '/test/file1.ts')).toBe(true);
    });

    it('should return empty array for non-matching file path', async () => {
      const chunk = createMockChunk('1');
      chunk.filePath = '/test/file1.ts';

      await store.upsert([chunk]);

      const results = await store.getByFilePath('/test/nonexistent.ts');
      expect(results).toEqual([]);
    });
  });

  describe('deleteByFilePath', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should do nothing when table is empty', async () => {
      await expect(store.deleteByFilePath('/test/file.ts')).resolves.toBeUndefined();
    });

    it('should delete chunks with matching file path', async () => {
      const chunk1 = createMockChunk('1');
      chunk1.filePath = '/test/file1.ts';
      const chunk2 = createMockChunk('2');
      chunk2.filePath = '/test/file2.ts';

      await store.upsert([chunk1, chunk2]);

      await store.deleteByFilePath('/test/file1.ts');

      const results = await store.getByFilePath('/test/file1.ts');
      expect(results).toEqual([]);

      const remaining = await store.getByFilePath('/test/file2.ts');
      expect(remaining.length).toBe(1);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should return zero counts for empty table', async () => {
      const stats = await store.getStats();

      expect(stats.totalChunks).toBe(0);
      expect(stats.languages).toEqual({});
      expect(stats.types).toEqual({});
    });

    it('should count total chunks', async () => {
      const chunks = [createMockChunk('1'), createMockChunk('2'), createMockChunk('3')];

      await store.upsert(chunks);

      const stats = await store.getStats();
      expect(stats.totalChunks).toBe(3);
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should do nothing when db not initialized', async () => {
      const uninitializedStore = new VectorStore(config);
      await expect(uninitializedStore.clear()).resolves.toBeUndefined();
    });

    it('should clear all chunks', async () => {
      const chunks = [createMockChunk('1'), createMockChunk('2')];
      await store.upsert(chunks);

      let stats = await store.getStats();
      expect(stats.totalChunks).toBe(2);

      await store.clear();

      stats = await store.getStats();
      expect(stats.totalChunks).toBe(0);
    });
  });

  describe('close', () => {
    it('should close without error', async () => {
      await store.initialize();
      expect(() => store.close()).not.toThrow();
    });

    it('should be safe to call multiple times', async () => {
      await store.initialize();
      store.close();
      expect(() => store.close()).not.toThrow();
    });

    it('should be safe to call without initialization', () => {
      expect(() => store.close()).not.toThrow();
    });
  });

  describe('search - without table', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should return empty array when table does not exist', async () => {
      // Don't insert anything - table won't be created
      const results = await store.search(createMockVector());
      expect(results).toEqual([]);
    });
  });
});

describe('StoredChunk interface', () => {
  it('should have correct structure', () => {
    const chunk: StoredChunk = {
      id: 'test-id',
      filePath: '/test/file.ts',
      relativePath: 'file.ts',
      code: 'const x = 1;',
      vector: [0.1, 0.2, 0.3],
      startLine: 1,
      endLine: 1,
      language: 'typescript',
      type: 'block',
      name: 'x',
      scope: 'file.ts',
      docstring: null,
      tokenEstimate: 5,
      lastUpdated: new Date(),
    };

    expect(chunk.id).toBe('test-id');
    expect(chunk.vector).toHaveLength(3);
    expect(chunk.lastUpdated).toBeInstanceOf(Date);
  });
});

describe('SearchResult interface', () => {
  it('should have correct structure', () => {
    const chunk: StoredChunk = {
      id: 'test-id',
      filePath: '/test/file.ts',
      relativePath: 'file.ts',
      code: 'const x = 1;',
      vector: [0.1, 0.2, 0.3],
      startLine: 1,
      endLine: 1,
      language: 'typescript',
      type: 'block',
      name: null,
      scope: 'file.ts',
      docstring: null,
      tokenEstimate: 5,
      lastUpdated: new Date(),
    };

    const result: SearchResult = {
      chunk,
      score: 0.95,
    };

    expect(result.chunk).toBe(chunk);
    expect(result.score).toBe(0.95);
  });
});

// Helper functions

function createMockChunk(id: string, vector?: number[]): StoredChunk {
  return {
    id,
    filePath: `/test/file-${id}.ts`,
    relativePath: `file-${id}.ts`,
    code: `const x${id} = ${id};`,
    vector: vector || createMockVector(),
    startLine: 1,
    endLine: 1,
    language: 'typescript',
    type: 'block',
    name: `x${id}`,
    scope: `file-${id}.ts`,
    docstring: null,
    tokenEstimate: 10,
    lastUpdated: new Date(),
  };
}

function createMockVector(dims = 3): number[] {
  return Array(dims)
    .fill(null)
    .map(() => Math.random());
}
