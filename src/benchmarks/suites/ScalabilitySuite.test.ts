/**
 * Tests for ScalabilitySuite
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScalabilitySuite } from './ScalabilitySuite.js';
import { rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ScalabilitySuite', () => {
  let suite: ScalabilitySuite;
  let testDir: string;

  beforeEach(async () => {
    suite = new ScalabilitySuite();
    testDir = join(tmpdir(), `scalability-test-${Date.now()}`);
    await mkdir(join(testDir, 'src'), { recursive: true });

    // Create test files
    for (let i = 0; i < 10; i++) {
      await writeFile(
        join(testDir, 'src', `file${i}.ts`),
        `
export function func${i}(x: number): number {
  return x * ${i};
}

export class Class${i} {
  value = ${i};

  method(): number {
    return this.value;
  }
}
`
      );
    }

    // Create an entry file that imports others
    await writeFile(
      join(testDir, 'src', 'index.ts'),
      `
import { func0 } from './file0.js';
import { func1 } from './file1.js';
import { Class2 } from './file2.js';

export function main(): number {
  const obj = new Class2();
  return func0(1) + func1(2) + obj.method();
}
`
    );
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(suite.name).toBe('scalability');
    });

    it('should have correct description', () => {
      expect(suite.description).toContain('throughput');
    });

    it('should support expected languages', () => {
      expect(suite.supportedLanguages).toContain('typescript');
      expect(suite.supportedLanguages).toContain('javascript');
      expect(suite.supportedLanguages).toContain('python');
    });
  });

  describe('loadTestCases', () => {
    it('should generate test cases based on file count', async () => {
      const testCases = await suite.loadTestCases(testDir);

      // Should generate test cases for different operations
      expect(testCases.length).toBeGreaterThan(0);

      // Should have different operation types
      const operations = new Set(testCases.map(tc => tc.input.operation));
      expect(operations.has('parse')).toBe(true);
      expect(operations.has('build-graph')).toBe(true);
      expect(operations.has('symbol-lookup')).toBe(true);
    });

    it('should assign difficulty levels', async () => {
      const testCases = await suite.loadTestCases(testDir);

      for (const tc of testCases) {
        expect(['easy', 'medium', 'hard']).toContain(tc.difficulty);
      }
    });

    it('should include scalability tags', async () => {
      const testCases = await suite.loadTestCases(testDir);

      for (const tc of testCases) {
        expect(tc.tags).toContain('scalability');
      }
    });
  });

  describe('runTestCase', () => {
    it('should benchmark parse operation', async () => {
      const testCase = {
        id: 'scalability:parse:test',
        description: 'Parse test files',
        input: {
          fileCount: 5,
          entryPoints: [join(testDir, 'src', 'index.ts')],
          operation: 'parse' as const,
        },
        expected: {
          minThroughput: 1,
        },
      };

      const result = await suite.runTestCase(testCase);

      expect(result.testCaseId).toBe('scalability:parse:test');
      expect(result.executionTimeMs).toBeGreaterThan(0);
      expect(result.metrics.length).toBeGreaterThan(0);

      // Should have throughput metric
      const throughput = result.metrics.find(m => m.name === 'throughput');
      expect(throughput).toBeDefined();
    });

    it('should benchmark build-graph operation', async () => {
      const testCase = {
        id: 'scalability:graph:test',
        description: 'Build graph test',
        input: {
          fileCount: 5,
          entryPoints: [join(testDir, 'src', 'index.ts')],
          operation: 'build-graph' as const,
        },
        expected: {
          maxLatencyMs: 10000,
        },
      };

      const result = await suite.runTestCase(testCase);

      expect(result.testCaseId).toBe('scalability:graph:test');

      // Should have graph metrics
      const graphNodes = result.metrics.find(m => m.name === 'graph_nodes');
      expect(graphNodes).toBeDefined();
      expect(graphNodes!.value).toBeGreaterThan(0);
    });

    it('should benchmark symbol-lookup operation', async () => {
      const testCase = {
        id: 'scalability:lookup:test',
        description: 'Symbol lookup test',
        input: {
          fileCount: 5,
          entryPoints: [join(testDir, 'src', 'index.ts')],
          operation: 'symbol-lookup' as const,
        },
        expected: {
          maxLatencyMs: 5000,
        },
      };

      const result = await suite.runTestCase(testCase);

      expect(result.testCaseId).toBe('scalability:lookup:test');

      // Should have lookup metrics
      const lookupP50 = result.metrics.find(m => m.name === 'lookup_p50');
      expect(lookupP50).toBeDefined();
    });

    it('should include memory metrics', async () => {
      const testCase = {
        id: 'scalability:memory:test',
        description: 'Memory test',
        input: {
          fileCount: 5,
          entryPoints: [join(testDir, 'src', 'index.ts')],
          operation: 'parse' as const,
        },
        expected: {},
      };

      const result = await suite.runTestCase(testCase);

      const memoryMetric = result.metrics.find(m => m.name === 'peak_memory_mb');
      expect(memoryMetric).toBeDefined();
      expect(memoryMetric!.value).toBeGreaterThan(0);
    });
  });

  describe('run', () => {
    it('should run complete suite', async () => {
      const config = {
        name: 'test-run',
        description: 'Test suite run',
      };

      const result = await suite.run(config, testDir);

      expect(result.config.name).toBe('scalability');
      expect(result.testResults.length).toBeGreaterThan(0);
      expect(result.latencyStats).toBeDefined();
      expect(result.totalExecutionTimeMs).toBeGreaterThan(0);
    }, 60000);
  });
});
