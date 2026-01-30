import { SearchCodebase, FormattedSearchResult } from '../../tools/search-codebase.js';
import { EmbeddingEngine } from '../../vector/embed.js';
import { VectorStore } from '../../vector/store.js';
import { loadConfig, Config } from '../../utils/config.js';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock embedder
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

describe('SearchCodebase Ranking', () => {
  let testDir: string;
  let config: Config;
  let embedder: EmbeddingEngine;
  let store: VectorStore;
  let searchTool: SearchCodebase;

  beforeEach(async () => {
    testDir = join(tmpdir(), `seu-claude-ranking-test-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });

    config = loadConfig({
      projectRoot: testDir,
      dataDir: join(testDir, '.seu-claude'),
      embeddingDimensions: 384,
    });

    embedder = createMockEmbedder();
    store = new VectorStore(config);
    await store.initialize();

    searchTool = new SearchCodebase(embedder, store, config.dataDir);
  });

  afterEach(async () => {
    store.close();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('applyRanking', () => {
    it('should boost exported symbols', () => {
      // Create mock results with different export status
      const mockResults: FormattedSearchResult[] = [
        {
          filePath: '/src/utils.ts',
          relativePath: 'src/utils.ts',
          startLine: 1,
          endLine: 5,
          type: 'function',
          name: 'helperFunction',
          scope: 'global',
          language: 'typescript',
          code: 'function helperFunction() { return true; }',
          score: 0.8,
        },
        {
          filePath: '/src/api.ts',
          relativePath: 'src/api.ts',
          startLine: 1,
          endLine: 5,
          type: 'function',
          name: 'exportedFunction',
          scope: 'global',
          language: 'typescript',
          code: 'export function exportedFunction() { return true; }',
          score: 0.8,
        },
      ];

      // Access the private method via type casting for testing
      const searchToolAny = searchTool as unknown as {
        applyRanking: (
          results: FormattedSearchResult[],
          mode: 'semantic' | 'keyword' | 'hybrid'
        ) => FormattedSearchResult[];
      };

      const ranked = searchToolAny.applyRanking(mockResults, 'semantic');

      // Exported function should be ranked higher
      expect(ranked[0].name).toBe('exportedFunction');
    });

    it('should boost entry point files', () => {
      const mockResults: FormattedSearchResult[] = [
        {
          filePath: '/src/utils/helper.ts',
          relativePath: 'src/utils/helper.ts',
          startLine: 1,
          endLine: 5,
          type: 'function',
          name: 'helper',
          scope: 'global',
          language: 'typescript',
          code: 'export function helper() { return true; }',
          score: 0.8,
        },
        {
          filePath: '/src/index.ts',
          relativePath: 'src/index.ts',
          startLine: 1,
          endLine: 5,
          type: 'function',
          name: 'main',
          scope: 'global',
          language: 'typescript',
          code: 'export function main() { return true; }',
          score: 0.8,
        },
      ];

      const searchToolAny = searchTool as unknown as {
        applyRanking: (
          results: FormattedSearchResult[],
          mode: 'semantic' | 'keyword' | 'hybrid'
        ) => FormattedSearchResult[];
      };

      const ranked = searchToolAny.applyRanking(mockResults, 'semantic');

      // Entry point (index.ts) should be ranked higher
      expect(ranked[0].relativePath).toBe('src/index.ts');
    });

    it('should combine multiple ranking factors', () => {
      const mockResults: FormattedSearchResult[] = [
        {
          // Non-exported, non-entry-point, high semantic score
          filePath: '/src/utils/helper.ts',
          relativePath: 'src/utils/helper.ts',
          startLine: 1,
          endLine: 5,
          type: 'function',
          name: 'privateHelper',
          scope: 'global',
          language: 'typescript',
          code: 'function privateHelper() { return true; }',
          score: 0.9,
        },
        {
          // Exported + entry-point, lower semantic score
          filePath: '/src/index.ts',
          relativePath: 'src/index.ts',
          startLine: 1,
          endLine: 5,
          type: 'function',
          name: 'main',
          scope: 'global',
          language: 'typescript',
          code: 'export function main() { return true; }',
          score: 0.7,
        },
        {
          // Only exported, medium semantic score
          filePath: '/src/api.ts',
          relativePath: 'src/api.ts',
          startLine: 1,
          endLine: 5,
          type: 'function',
          name: 'apiFunction',
          scope: 'global',
          language: 'typescript',
          code: 'export function apiFunction() { return true; }',
          score: 0.8,
        },
      ];

      const searchToolAny = searchTool as unknown as {
        applyRanking: (
          results: FormattedSearchResult[],
          mode: 'semantic' | 'keyword' | 'hybrid'
        ) => FormattedSearchResult[];
      };

      const ranked = searchToolAny.applyRanking(mockResults, 'semantic');

      // All results should be present
      expect(ranked).toHaveLength(3);
      // Final scores should be computed
      expect(ranked.every(r => typeof r.score === 'number')).toBe(true);
    });

    it('should handle empty results', () => {
      const searchToolAny = searchTool as unknown as {
        applyRanking: (
          results: FormattedSearchResult[],
          mode: 'semantic' | 'keyword' | 'hybrid'
        ) => FormattedSearchResult[];
      };

      const ranked = searchToolAny.applyRanking([], 'semantic');
      expect(ranked).toEqual([]);
    });

    it('should preserve result properties after ranking', () => {
      const mockResults: FormattedSearchResult[] = [
        {
          filePath: '/src/test.ts',
          relativePath: 'src/test.ts',
          startLine: 10,
          endLine: 20,
          type: 'function',
          name: 'testFunction',
          scope: 'module',
          language: 'typescript',
          code: 'export function testFunction() { return 42; }',
          score: 0.75,
        },
      ];

      const searchToolAny = searchTool as unknown as {
        applyRanking: (
          results: FormattedSearchResult[],
          mode: 'semantic' | 'keyword' | 'hybrid'
        ) => FormattedSearchResult[];
      };

      const ranked = searchToolAny.applyRanking(mockResults, 'semantic');

      expect(ranked[0].filePath).toBe('/src/test.ts');
      expect(ranked[0].relativePath).toBe('src/test.ts');
      expect(ranked[0].startLine).toBe(10);
      expect(ranked[0].endLine).toBe(20);
      expect(ranked[0].type).toBe('function');
      expect(ranked[0].name).toBe('testFunction');
      expect(ranked[0].scope).toBe('module');
      expect(ranked[0].language).toBe('typescript');
      expect(ranked[0].code).toContain('testFunction');
    });
  });

  describe('useRanking option', () => {
    it('should accept useRanking option in search options', async () => {
      // Create a test file
      const srcDir = join(testDir, 'src');
      await mkdir(srcDir, { recursive: true });
      await writeFile(join(srcDir, 'test.ts'), 'export function testSearch() { return "hello"; }');

      // Execute search with ranking disabled - should not throw
      await expect(
        searchTool.execute({
          query: 'test search',
          useRanking: false,
        })
      ).resolves.toBeDefined();
    });

    it('should use ranking by default', async () => {
      const srcDir = join(testDir, 'src');
      await mkdir(srcDir, { recursive: true });
      await writeFile(join(srcDir, 'test.ts'), 'export function testSearch() { return "hello"; }');

      // Execute search without specifying useRanking - should default to true
      await expect(
        searchTool.execute({
          query: 'test search',
        })
      ).resolves.toBeDefined();
    });
  });

  describe('ranking with different search modes', () => {
    it('should apply ranking in semantic mode', () => {
      const mockResults: FormattedSearchResult[] = [
        {
          filePath: '/src/utils.ts',
          relativePath: 'src/utils.ts',
          startLine: 1,
          endLine: 5,
          type: 'function',
          name: 'util',
          scope: 'global',
          language: 'typescript',
          code: 'function util() {}',
          score: 0.8,
        },
      ];

      const searchToolAny = searchTool as unknown as {
        applyRanking: (
          results: FormattedSearchResult[],
          mode: 'semantic' | 'keyword' | 'hybrid'
        ) => FormattedSearchResult[];
      };

      const ranked = searchToolAny.applyRanking(mockResults, 'semantic');
      expect(ranked).toHaveLength(1);
    });

    it('should apply ranking in keyword mode', () => {
      const mockResults: FormattedSearchResult[] = [
        {
          filePath: '/src/utils.ts',
          relativePath: 'src/utils.ts',
          startLine: 1,
          endLine: 5,
          type: 'function',
          name: 'util',
          scope: 'global',
          language: 'typescript',
          code: 'function util() {}',
          score: 0.8,
        },
      ];

      const searchToolAny = searchTool as unknown as {
        applyRanking: (
          results: FormattedSearchResult[],
          mode: 'semantic' | 'keyword' | 'hybrid'
        ) => FormattedSearchResult[];
      };

      const ranked = searchToolAny.applyRanking(mockResults, 'keyword');
      expect(ranked).toHaveLength(1);
    });

    it('should apply ranking in hybrid mode', () => {
      const mockResults: FormattedSearchResult[] = [
        {
          filePath: '/src/utils.ts',
          relativePath: 'src/utils.ts',
          startLine: 1,
          endLine: 5,
          type: 'function',
          name: 'util',
          scope: 'global',
          language: 'typescript',
          code: 'function util() {}',
          score: 0.8,
        },
      ];

      const searchToolAny = searchTool as unknown as {
        applyRanking: (
          results: FormattedSearchResult[],
          mode: 'semantic' | 'keyword' | 'hybrid'
        ) => FormattedSearchResult[];
      };

      const ranked = searchToolAny.applyRanking(mockResults, 'hybrid');
      expect(ranked).toHaveLength(1);
    });
  });
});
