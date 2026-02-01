import { describe, it, expect, beforeEach } from 'vitest';
import { BenchmarkRunner, BenchmarkCase } from './runner.js';

describe('BenchmarkRunner', () => {
  let runner: BenchmarkRunner;

  beforeEach(() => {
    runner = new BenchmarkRunner();
  });

  describe('BenchmarkCase interface', () => {
    it('should define required case properties', () => {
      const testCase: BenchmarkCase = {
        id: 'test-001',
        name: 'Fix pagination bug',
        category: 'bug-fix',
        difficulty: 'easy',
        setup: async () => {},
        prompt: 'Fix the off-by-one error in pagination',
        validate: async () => true,
        expectedFiles: ['src/pagination.ts'],
      };

      expect(testCase.id).toBe('test-001');
      expect(testCase.category).toBe('bug-fix');
      expect(testCase.difficulty).toBe('easy');
    });
  });

  describe('run()', () => {
    it('should measure task completion rate', async () => {
      const successCase: BenchmarkCase = {
        id: 'success-case',
        name: 'Always succeeds',
        category: 'bug-fix',
        difficulty: 'easy',
        setup: async () => {},
        prompt: 'Do something simple',
        validate: async () => true,
        expectedFiles: [],
      };

      const result = await runner.run(successCase);

      expect(result.caseId).toBe('success-case');
      expect(result.completed).toBe(true);
      expect(result.metrics.completionRate).toBe(1);
    });

    it('should measure execution time', async () => {
      const timedCase: BenchmarkCase = {
        id: 'timed-case',
        name: 'Timed test',
        category: 'feature',
        difficulty: 'medium',
        setup: async () => {},
        prompt: 'Add a feature',
        validate: async () => true,
        expectedFiles: [],
      };

      const result = await runner.run(timedCase);

      expect(result.metrics.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.executionTimeMs).toBeDefined();
    });

    it('should handle validation failure', async () => {
      const failCase: BenchmarkCase = {
        id: 'fail-case',
        name: 'Always fails',
        category: 'refactor',
        difficulty: 'hard',
        setup: async () => {},
        prompt: 'Refactor something',
        validate: async () => false,
        expectedFiles: [],
      };

      const result = await runner.run(failCase);

      expect(result.completed).toBe(false);
      expect(result.metrics.completionRate).toBe(0);
    });
  });

  describe('runSuite()', () => {
    it('should run multiple cases and aggregate results', async () => {
      const cases: BenchmarkCase[] = [
        {
          id: 'case-1',
          name: 'Case 1',
          category: 'bug-fix',
          difficulty: 'easy',
          setup: async () => {},
          prompt: 'Fix bug 1',
          validate: async () => true,
          expectedFiles: [],
        },
        {
          id: 'case-2',
          name: 'Case 2',
          category: 'feature',
          difficulty: 'medium',
          setup: async () => {},
          prompt: 'Add feature',
          validate: async () => true,
          expectedFiles: [],
        },
      ];

      const results = await runner.runSuite(cases);

      expect(results.cases).toHaveLength(2);
      expect(results.summary.totalCases).toBe(2);
      expect(results.summary.passedCases).toBe(2);
      expect(results.summary.overallCompletionRate).toBe(1);
    });

    it('should calculate average metrics across suite', async () => {
      const cases: BenchmarkCase[] = [
        {
          id: 'pass',
          name: 'Pass',
          category: 'bug-fix',
          difficulty: 'easy',
          setup: async () => {},
          prompt: 'Pass',
          validate: async () => true,
          expectedFiles: [],
        },
        {
          id: 'fail',
          name: 'Fail',
          category: 'bug-fix',
          difficulty: 'easy',
          setup: async () => {},
          prompt: 'Fail',
          validate: async () => false,
          expectedFiles: [],
        },
      ];

      const results = await runner.runSuite(cases);

      expect(results.summary.overallCompletionRate).toBe(0.5);
      expect(results.summary.passedCases).toBe(1);
      expect(results.summary.failedCases).toBe(1);
    });
  });

  describe('metrics calculation', () => {
    it('should track token usage when provided', async () => {
      const caseWithTokens: BenchmarkCase = {
        id: 'token-case',
        name: 'Token tracking',
        category: 'feature',
        difficulty: 'medium',
        setup: async () => {},
        prompt: 'Track tokens',
        validate: async () => true,
        expectedFiles: [],
        tokenBudget: 1000,
      };

      const result = await runner.run(caseWithTokens);

      expect(result.metrics.tokensUsed).toBeDefined();
    });
  });
});
