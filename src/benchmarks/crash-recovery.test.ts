import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { CrashRecoveryBenchmark, CrashRecoverySuite } from './crash-recovery.js';
import { SQLiteTaskStore } from '../adapters/db/SQLiteTaskStore.js';
import { createBugFixChallenge } from './challenges/index.js';
import type { BenchmarkCase } from './runner.js';

describe('CrashRecoveryBenchmark', () => {
  const testDbPath = '/tmp/seu-claude-crash-test.db';
  let store: SQLiteTaskStore;
  let benchmark: CrashRecoveryBenchmark;

  beforeEach(async () => {
    // Clean up any existing test database
    try {
      await fs.unlink(testDbPath);
    } catch {
      // File doesn't exist, that's fine
    }

    store = new SQLiteTaskStore(testDbPath);
    benchmark = new CrashRecoveryBenchmark(store, {
      crashPoint: 0.5,
      simulateCrashType: 'memory-clear',
    });
  });

  afterEach(async () => {
    store.close();
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('run()', () => {
    it('should measure recovery time after simulated crash', async () => {
      const testCase: BenchmarkCase = {
        id: 'recovery-test',
        name: 'Recovery Test',
        category: 'bug-fix',
        difficulty: 'easy',
        setup: async () => {},
        prompt: 'Test recovery',
        validate: async () => true,
        expectedFiles: [],
      };

      const result = await benchmark.run(testCase);

      expect(result.caseId).toBe('recovery-test');
      expect(result.recoveryTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });

    it('should preserve state after crash', async () => {
      const testCase: BenchmarkCase = {
        id: 'state-preservation',
        name: 'State Preservation Test',
        category: 'feature',
        difficulty: 'medium',
        setup: async () => {},
        prompt: 'Create subtasks and verify they persist',
        validate: async () => true,
        expectedFiles: [],
      };

      const result = await benchmark.run(testCase);

      expect(result.statePreserved).toBe(true);
      expect(result.dataLoss).toBe(0);
    });

    it('should report progress before and after crash', async () => {
      const testCase: BenchmarkCase = {
        id: 'progress-tracking',
        name: 'Progress Tracking',
        category: 'refactor',
        difficulty: 'hard',
        setup: async () => {},
        prompt: 'Track progress through crash',
        validate: async () => true,
        expectedFiles: [],
      };

      const result = await benchmark.run(testCase);

      expect(result.progressBeforeCrash).toBeGreaterThanOrEqual(0);
      expect(result.progressBeforeCrash).toBeLessThanOrEqual(1);
      expect(result.progressAfterRecovery).toBeGreaterThanOrEqual(0);
    });

    it('should handle validation failure gracefully', async () => {
      const failingCase: BenchmarkCase = {
        id: 'failing-validation',
        name: 'Failing Validation',
        category: 'bug-fix',
        difficulty: 'easy',
        setup: async () => {},
        prompt: 'This will fail validation',
        validate: async () => false,
        expectedFiles: [],
      };

      const result = await benchmark.run(failingCase);

      expect(result.taskCompleted).toBe(false);
    });
  });

  describe('crash simulation types', () => {
    it('should handle memory-clear crash type', async () => {
      const memoryBenchmark = new CrashRecoveryBenchmark(store, {
        crashPoint: 0.3,
        simulateCrashType: 'memory-clear',
      });

      const testCase = createBugFixChallenge({
        id: 'memory-crash',
        name: 'Memory Crash Test',
        difficulty: 'easy',
        prompt: 'Test memory crash',
        targetFiles: [],
        bugDescription: 'Test',
      });

      const result = await memoryBenchmark.run(testCase);
      expect(result.statePreserved).toBe(true);
    });

    it('should handle different crash points', async () => {
      const earlyCrash = new CrashRecoveryBenchmark(store, {
        crashPoint: 0.1,
        simulateCrashType: 'memory-clear',
      });

      const lateCrash = new CrashRecoveryBenchmark(store, {
        crashPoint: 0.9,
        simulateCrashType: 'memory-clear',
      });

      const testCase = createBugFixChallenge({
        id: 'crash-point-test',
        name: 'Crash Point Test',
        difficulty: 'medium',
        prompt: 'Test different crash points',
        targetFiles: [],
        bugDescription: 'Test',
      });

      const earlyResult = await earlyCrash.run(testCase);
      const lateResult = await lateCrash.run(testCase);

      expect(earlyResult.progressBeforeCrash).toBeLessThan(lateResult.progressBeforeCrash);
    });
  });
});

describe('CrashRecoverySuite', () => {
  const testDbPath = '/tmp/seu-claude-suite-test.db';
  let store: SQLiteTaskStore;

  beforeEach(async () => {
    try {
      await fs.unlink(testDbPath);
    } catch {
      // File doesn't exist
    }
    store = new SQLiteTaskStore(testDbPath);
  });

  afterEach(async () => {
    store.close();
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore
    }
  });

  it('should run multiple crash recovery tests', async () => {
    const benchmark = new CrashRecoveryBenchmark(store);
    const cases: BenchmarkCase[] = [
      createBugFixChallenge({
        id: 'suite-test-1',
        name: 'Suite Test 1',
        difficulty: 'easy',
        prompt: 'Test 1',
        targetFiles: [],
        bugDescription: 'Test',
      }),
      createBugFixChallenge({
        id: 'suite-test-2',
        name: 'Suite Test 2',
        difficulty: 'medium',
        prompt: 'Test 2',
        targetFiles: [],
        bugDescription: 'Test',
      }),
    ];

    const suite = new CrashRecoverySuite(benchmark, cases);
    const result = await suite.runAll();

    expect(result.results).toHaveLength(2);
    expect(result.summary.totalCases).toBe(2);
  });

  it('should calculate summary statistics', async () => {
    const benchmark = new CrashRecoveryBenchmark(store);
    const cases: BenchmarkCase[] = [
      createBugFixChallenge({
        id: 'stats-test',
        name: 'Stats Test',
        difficulty: 'easy',
        prompt: 'Test stats',
        targetFiles: [],
        bugDescription: 'Test',
      }),
    ];

    const suite = new CrashRecoverySuite(benchmark, cases);
    const result = await suite.runAll();

    expect(result.summary.averageRecoveryTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.summary.averageDataLoss).toBeGreaterThanOrEqual(0);
    expect(result.summary.averageDataLoss).toBeLessThanOrEqual(1);
    expect(result.runId).toContain('crash-recovery-');
  });
});
