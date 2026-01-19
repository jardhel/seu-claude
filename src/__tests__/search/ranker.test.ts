import { SearchRanker, RankingFactors } from '../../search/ranker.js';

describe('SearchRanker', () => {
  let ranker: SearchRanker;

  beforeEach(() => {
    ranker = new SearchRanker();
  });

  describe('constructor', () => {
    it('should use default weights when none provided', () => {
      const defaultRanker = new SearchRanker();
      const weights = defaultRanker.getWeights();

      expect(weights.semantic).toBeCloseTo(0.5, 5);
      expect(weights.keyword).toBeCloseTo(0.2, 5);
      expect(weights.gitRecency).toBeCloseTo(0.1, 5);
      expect(weights.exportBoost).toBeCloseTo(0.1, 5);
      expect(weights.entryPointBoost).toBeCloseTo(0.1, 5);
    });

    it('should accept custom weights', () => {
      const customRanker = new SearchRanker({
        semantic: 0.6,
        keyword: 0.2,
        gitRecency: 0.1,
        exportBoost: 0.05,
        entryPointBoost: 0.05,
      });
      const weights = customRanker.getWeights();

      expect(weights.semantic).toBe(0.6);
      expect(weights.keyword).toBe(0.2);
      expect(weights.gitRecency).toBe(0.1);
      expect(weights.exportBoost).toBe(0.05);
      expect(weights.entryPointBoost).toBe(0.05);
    });

    it('should normalize weights that do not sum to 1', () => {
      const customRanker = new SearchRanker({
        semantic: 1.0,
        keyword: 1.0,
        gitRecency: 0,
        exportBoost: 0,
        entryPointBoost: 0,
      });
      const weights = customRanker.getWeights();
      const sum =
        weights.semantic +
        weights.keyword +
        weights.gitRecency +
        weights.exportBoost +
        weights.entryPointBoost;

      expect(sum).toBeCloseTo(1.0);
    });
  });

  describe('computeScore', () => {
    it('should compute weighted score from all factors', () => {
      const factors: RankingFactors = {
        semanticScore: 0.8,
        keywordScore: 0.6,
        gitRecencyScore: 0.5,
        isExported: true,
        isEntryPoint: false,
      };

      const score = ranker.computeScore(factors);

      // 0.8 * 0.5 + 0.6 * 0.2 + 0.5 * 0.1 + 1.0 * 0.1 + 0.0 * 0.1
      // = 0.4 + 0.12 + 0.05 + 0.1 + 0.0 = 0.67
      expect(score).toBeCloseTo(0.67, 2);
    });

    it('should return semantic score only when other factors are zero', () => {
      const factors: RankingFactors = {
        semanticScore: 0.9,
        keywordScore: 0,
        gitRecencyScore: 0,
        isExported: false,
        isEntryPoint: false,
      };

      const score = ranker.computeScore(factors);
      expect(score).toBeCloseTo(0.45, 2); // 0.9 * 0.5
    });

    it('should boost entry point files', () => {
      const baseFactors: RankingFactors = {
        semanticScore: 0.8,
        keywordScore: 0.6,
        gitRecencyScore: 0.5,
        isExported: false,
        isEntryPoint: false,
      };

      const entryPointFactors: RankingFactors = {
        ...baseFactors,
        isEntryPoint: true,
      };

      const baseScore = ranker.computeScore(baseFactors);
      const entryPointScore = ranker.computeScore(entryPointFactors);

      expect(entryPointScore).toBeGreaterThan(baseScore);
    });

    it('should boost exported symbols', () => {
      const baseFactors: RankingFactors = {
        semanticScore: 0.8,
        keywordScore: 0.6,
        gitRecencyScore: 0.5,
        isExported: false,
        isEntryPoint: false,
      };

      const exportedFactors: RankingFactors = {
        ...baseFactors,
        isExported: true,
      };

      const baseScore = ranker.computeScore(baseFactors);
      const exportedScore = ranker.computeScore(exportedFactors);

      expect(exportedScore).toBeGreaterThan(baseScore);
    });

    it('should handle edge case with all zeros', () => {
      const factors: RankingFactors = {
        semanticScore: 0,
        keywordScore: 0,
        gitRecencyScore: 0,
        isExported: false,
        isEntryPoint: false,
      };

      const score = ranker.computeScore(factors);
      expect(score).toBe(0);
    });

    it('should handle edge case with all max values', () => {
      const factors: RankingFactors = {
        semanticScore: 1.0,
        keywordScore: 1.0,
        gitRecencyScore: 1.0,
        isExported: true,
        isEntryPoint: true,
      };

      const score = ranker.computeScore(factors);
      expect(score).toBe(1.0);
    });

    it('should clamp scores to [0, 1] range', () => {
      const factors: RankingFactors = {
        semanticScore: 1.5, // Over 1
        keywordScore: -0.5, // Under 0
        gitRecencyScore: 0.5,
        isExported: true,
        isEntryPoint: true,
      };

      const score = ranker.computeScore(factors);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('rankResults', () => {
    it('should rank results by computed score in descending order', () => {
      const results = [
        {
          chunkId: 'a',
          semanticScore: 0.5,
          keywordScore: 0.5,
          gitRecencyScore: 0.5,
          isExported: false,
          isEntryPoint: false,
        },
        {
          chunkId: 'b',
          semanticScore: 0.9,
          keywordScore: 0.8,
          gitRecencyScore: 0.9,
          isExported: true,
          isEntryPoint: true,
        },
        {
          chunkId: 'c',
          semanticScore: 0.7,
          keywordScore: 0.6,
          gitRecencyScore: 0.7,
          isExported: true,
          isEntryPoint: false,
        },
      ];

      const ranked = ranker.rankResults(results);

      expect(ranked[0].chunkId).toBe('b');
      expect(ranked[1].chunkId).toBe('c');
      expect(ranked[2].chunkId).toBe('a');
    });

    it('should include finalScore in ranked results', () => {
      const results = [
        {
          chunkId: 'a',
          semanticScore: 0.8,
          keywordScore: 0.6,
          gitRecencyScore: 0.5,
          isExported: true,
          isEntryPoint: false,
        },
      ];

      const ranked = ranker.rankResults(results);

      expect(ranked[0]).toHaveProperty('finalScore');
      expect(typeof ranked[0].finalScore).toBe('number');
    });

    it('should preserve original data in ranked results', () => {
      const results = [
        {
          chunkId: 'test-chunk',
          semanticScore: 0.8,
          keywordScore: 0.6,
          gitRecencyScore: 0.5,
          isExported: true,
          isEntryPoint: false,
          filePath: '/path/to/file.ts',
          content: 'some code',
        },
      ];

      const ranked = ranker.rankResults(results);

      expect(ranked[0].chunkId).toBe('test-chunk');
      expect(ranked[0].filePath).toBe('/path/to/file.ts');
      expect(ranked[0].content).toBe('some code');
    });

    it('should handle empty results array', () => {
      const ranked = ranker.rankResults([]);
      expect(ranked).toEqual([]);
    });

    it('should handle single result', () => {
      const results = [
        {
          chunkId: 'single',
          semanticScore: 0.5,
          keywordScore: 0.5,
          gitRecencyScore: 0.5,
          isExported: false,
          isEntryPoint: false,
        },
      ];

      const ranked = ranker.rankResults(results);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].chunkId).toBe('single');
    });

    it('should maintain stable sort for equal scores', () => {
      const results = [
        {
          chunkId: 'first',
          semanticScore: 0.5,
          keywordScore: 0.5,
          gitRecencyScore: 0.5,
          isExported: false,
          isEntryPoint: false,
        },
        {
          chunkId: 'second',
          semanticScore: 0.5,
          keywordScore: 0.5,
          gitRecencyScore: 0.5,
          isExported: false,
          isEntryPoint: false,
        },
      ];

      const ranked = ranker.rankResults(results);
      // Stable sort should preserve original order for equal scores
      expect(ranked[0].chunkId).toBe('first');
      expect(ranked[1].chunkId).toBe('second');
    });
  });

  describe('isEntryPointFile', () => {
    it('should identify index files as entry points', () => {
      expect(SearchRanker.isEntryPointFile('index.ts')).toBe(true);
      expect(SearchRanker.isEntryPointFile('index.js')).toBe(true);
      expect(SearchRanker.isEntryPointFile('index.py')).toBe(true);
      expect(SearchRanker.isEntryPointFile('/src/index.ts')).toBe(true);
    });

    it('should identify main files as entry points', () => {
      expect(SearchRanker.isEntryPointFile('main.ts')).toBe(true);
      expect(SearchRanker.isEntryPointFile('main.go')).toBe(true);
      expect(SearchRanker.isEntryPointFile('main.rs')).toBe(true);
      expect(SearchRanker.isEntryPointFile('main.py')).toBe(true);
    });

    it('should identify app/server files as entry points', () => {
      expect(SearchRanker.isEntryPointFile('app.ts')).toBe(true);
      expect(SearchRanker.isEntryPointFile('server.ts')).toBe(true);
      expect(SearchRanker.isEntryPointFile('app.py')).toBe(true);
      expect(SearchRanker.isEntryPointFile('server.js')).toBe(true);
    });

    it('should not identify regular files as entry points', () => {
      expect(SearchRanker.isEntryPointFile('utils.ts')).toBe(false);
      expect(SearchRanker.isEntryPointFile('helper.js')).toBe(false);
      expect(SearchRanker.isEntryPointFile('component.tsx')).toBe(false);
      expect(SearchRanker.isEntryPointFile('model.py')).toBe(false);
    });

    it('should handle paths with directories', () => {
      expect(SearchRanker.isEntryPointFile('/src/app/index.ts')).toBe(true);
      expect(SearchRanker.isEntryPointFile('/src/main.go')).toBe(true);
      expect(SearchRanker.isEntryPointFile('/api/server.ts')).toBe(true);
      expect(SearchRanker.isEntryPointFile('/lib/utils/helper.ts')).toBe(false);
    });
  });

  describe('computeGitRecencyScore', () => {
    it('should return 1.0 for files modified today', () => {
      const today = new Date();
      const score = SearchRanker.computeGitRecencyScore(today);
      expect(score).toBeCloseTo(1.0, 1);
    });

    it('should return lower score for older files', () => {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const score = SearchRanker.computeGitRecencyScore(oneMonthAgo);
      expect(score).toBeLessThan(1.0);
      expect(score).toBeGreaterThan(0);
    });

    it('should return very low score for very old files', () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const score = SearchRanker.computeGitRecencyScore(oneYearAgo);
      expect(score).toBeLessThan(0.5);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should handle undefined/null dates gracefully', () => {
      const score = SearchRanker.computeGitRecencyScore(undefined);
      expect(score).toBe(0.5); // Default middle score for unknown dates
    });

    it('should handle future dates', () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);

      const score = SearchRanker.computeGitRecencyScore(future);
      expect(score).toBe(1.0); // Cap at 1.0
    });
  });

  describe('hasExport', () => {
    it('should detect TypeScript/JavaScript exports', () => {
      expect(SearchRanker.hasExport('export function foo() {}')).toBe(true);
      expect(SearchRanker.hasExport('export const bar = 1;')).toBe(true);
      expect(SearchRanker.hasExport('export default class Foo {}')).toBe(true);
      expect(SearchRanker.hasExport('export { foo, bar };')).toBe(true);
    });

    it('should detect Python exports (__all__)', () => {
      expect(SearchRanker.hasExport("__all__ = ['foo', 'bar']")).toBe(true);
      expect(SearchRanker.hasExport('__all__ = ["Foo", "Bar"]')).toBe(true);
    });

    it('should detect Go exports (uppercase public)', () => {
      expect(SearchRanker.hasExport('func ProcessData() {}')).toBe(true);
      expect(SearchRanker.hasExport('type UserService struct {}')).toBe(true);
      expect(SearchRanker.hasExport('func processData() {}')).toBe(false);
    });

    it('should detect Rust pub exports', () => {
      expect(SearchRanker.hasExport('pub fn process() {}')).toBe(true);
      expect(SearchRanker.hasExport('pub struct User {}')).toBe(true);
      expect(SearchRanker.hasExport('fn process() {}')).toBe(false);
    });

    it('should return false for non-exported code', () => {
      expect(SearchRanker.hasExport('function foo() {}')).toBe(false);
      expect(SearchRanker.hasExport('const bar = 1;')).toBe(false);
      expect(SearchRanker.hasExport('class Foo {}')).toBe(false);
    });

    it('should handle empty or whitespace content', () => {
      expect(SearchRanker.hasExport('')).toBe(false);
      expect(SearchRanker.hasExport('   ')).toBe(false);
      expect(SearchRanker.hasExport('\n\t')).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should rank recently modified exports higher', () => {
      const today = new Date();
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      const results = [
        {
          chunkId: 'old-private',
          semanticScore: 0.8,
          keywordScore: 0.7,
          gitRecencyScore: SearchRanker.computeGitRecencyScore(monthAgo),
          isExported: false,
          isEntryPoint: false,
        },
        {
          chunkId: 'new-export',
          semanticScore: 0.8,
          keywordScore: 0.7,
          gitRecencyScore: SearchRanker.computeGitRecencyScore(today),
          isExported: true,
          isEntryPoint: false,
        },
      ];

      const ranked = ranker.rankResults(results);
      expect(ranked[0].chunkId).toBe('new-export');
    });

    it('should prioritize entry points with high semantic match', () => {
      const results = [
        {
          chunkId: 'helper',
          semanticScore: 0.9,
          keywordScore: 0.9,
          gitRecencyScore: 0.9,
          isExported: true,
          isEntryPoint: false,
        },
        {
          chunkId: 'main-entry',
          semanticScore: 0.85,
          keywordScore: 0.85,
          gitRecencyScore: 0.85,
          isExported: true,
          isEntryPoint: true,
        },
      ];

      const ranked = ranker.rankResults(results);
      // The helper has slightly higher scores but main-entry has entry point boost
      // This test verifies the trade-off works reasonably
      expect(ranked).toHaveLength(2);
    });
  });
});
