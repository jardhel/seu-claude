/**
 * Tests for MemoryEfficiencySuite
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryEfficiencySuite } from './MemoryEfficiencySuite.js';
import { rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('MemoryEfficiencySuite', () => {
  let suite: MemoryEfficiencySuite;
  let testDir: string;

  beforeEach(async () => {
    suite = new MemoryEfficiencySuite();
    testDir = join(tmpdir(), `memory-efficiency-test-${Date.now()}`);
    await mkdir(join(testDir, 'src'), { recursive: true });

    // Create test files with various content
    await writeFile(
      join(testDir, 'src', 'utils.ts'),
      `
/**
 * Utility functions for data processing
 */
export function processData(input: string): string {
  const trimmed = input.trim();
  const normalized = trimmed.toLowerCase();
  return normalized;
}

export function validateInput(data: unknown): boolean {
  if (typeof data !== 'string') {
    return false;
  }
  return data.length > 0 && data.length < 1000;
}

export class DataProcessor {
  private cache: Map<string, string> = new Map();

  process(key: string, value: string): string {
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    const result = processData(value);
    this.cache.set(key, result);
    return result;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
`
    );

    await writeFile(
      join(testDir, 'src', 'handler.ts'),
      `
import { processData, validateInput, DataProcessor } from './utils.js';

export interface RequestOptions {
  timeout?: number;
  retries?: number;
}

export class RequestHandler {
  private processor: DataProcessor;

  constructor() {
    this.processor = new DataProcessor();
  }

  async handleRequest(input: string, options?: RequestOptions): Promise<string> {
    if (!validateInput(input)) {
      throw new Error('Invalid input');
    }

    const timeout = options?.timeout ?? 5000;
    const retries = options?.retries ?? 3;

    let result: string | null = null;
    let attempts = 0;

    while (attempts < retries && !result) {
      try {
        result = this.processor.process('request', input);
      } catch (error) {
        attempts++;
        if (attempts >= retries) {
          throw error;
        }
        await this.delay(timeout / retries);
      }
    }

    return result ?? '';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
`
    );

    await writeFile(
      join(testDir, 'src', 'index.ts'),
      `
import { RequestHandler } from './handler.js';
import { DataProcessor } from './utils.js';

export { RequestHandler, DataProcessor };

export async function main(): Promise<void> {
  const handler = new RequestHandler();
  const result = await handler.handleRequest('test input');
  console.log(result);
}
`
    );

    // Add a few more files for larger tests
    for (let i = 0; i < 5; i++) {
      await writeFile(
        join(testDir, 'src', `module${i}.ts`),
        `
export function module${i}Function(x: number): number {
  return x * ${i + 1};
}

export class Module${i}Class {
  value = ${i};

  compute(): number {
    return this.value * 2;
  }
}
`
      );
    }
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
      expect(suite.name).toBe('memory-efficiency');
    });

    it('should have correct description', () => {
      expect(suite.description).toContain('token');
      expect(suite.description).toContain('retrieval');
    });

    it('should support expected languages', () => {
      expect(suite.supportedLanguages).toContain('typescript');
      expect(suite.supportedLanguages).toContain('javascript');
      expect(suite.supportedLanguages).toContain('python');
    });
  });

  describe('loadTestCases', () => {
    it('should generate test cases for retrieval', async () => {
      const testCases = await suite.loadTestCases(testDir);

      // Should generate retrieval test cases
      const retrievalCases = testCases.filter(tc => tc.input.operation === 'retrieval');
      expect(retrievalCases.length).toBeGreaterThan(0);
    });

    it('should generate test cases for chunking', async () => {
      const testCases = await suite.loadTestCases(testDir);

      // Should generate chunking test cases
      const chunkingCases = testCases.filter(tc => tc.input.operation === 'chunking');
      expect(chunkingCases.length).toBeGreaterThan(0);
    });

    it('should generate search comparison test case', async () => {
      const testCases = await suite.loadTestCases(testDir);

      // Should have search comparison test
      const comparisonCase = testCases.find(tc => tc.input.operation === 'search-comparison');
      expect(comparisonCase).toBeDefined();
    });

    it('should include memory-efficiency tags', async () => {
      const testCases = await suite.loadTestCases(testDir);

      for (const tc of testCases) {
        expect(tc.tags).toContain('memory-efficiency');
      }
    });

    it('should return empty for non-existent dataset', async () => {
      const testCases = await suite.loadTestCases('/non/existent/path');
      expect(testCases.length).toBe(0);
    });
  });

  describe('runTestCase', () => {
    it('should benchmark retrieval efficiency', async () => {
      const testCase = {
        id: 'memory:retrieval:test',
        description: 'Test retrieval efficiency',
        input: {
          query: 'processData function',
          files: [join(testDir, 'src', 'utils.ts'), join(testDir, 'src', 'handler.ts')],
          operation: 'retrieval' as const,
        },
        expected: {
          minTokenReduction: 0.1,
        },
      };

      const result = await suite.runTestCase(testCase);

      expect(result.testCaseId).toBe('memory:retrieval:test');
      expect(result.executionTimeMs).toBeGreaterThan(0);
      expect(result.metrics.length).toBeGreaterThan(0);

      // Should have token reduction metric
      const tokenReduction = result.metrics.find(m => m.name === 'token_reduction_ratio');
      expect(tokenReduction).toBeDefined();
    });

    it('should benchmark chunking efficiency', async () => {
      const testCase = {
        id: 'memory:chunking:test',
        description: 'Test chunking efficiency',
        input: {
          query: '',
          files: [
            join(testDir, 'src', 'utils.ts'),
            join(testDir, 'src', 'handler.ts'),
            join(testDir, 'src', 'index.ts'),
          ],
          operation: 'chunking' as const,
        },
        expected: {},
      };

      const result = await suite.runTestCase(testCase);

      expect(result.testCaseId).toBe('memory:chunking:test');

      // Should have chunking metrics
      const totalChunks = result.metrics.find(m => m.name === 'total_chunks');
      expect(totalChunks).toBeDefined();
      expect(totalChunks!.value).toBeGreaterThan(0);

      const avgChunksPerFile = result.metrics.find(m => m.name === 'avg_chunks_per_file');
      expect(avgChunksPerFile).toBeDefined();
    });

    it('should benchmark search comparison', async () => {
      const testCase = {
        id: 'memory:search-comparison:test',
        description: 'Compare search modes',
        input: {
          query: 'data processing',
          files: [join(testDir, 'src', 'utils.ts'), join(testDir, 'src', 'handler.ts')],
          operation: 'search-comparison' as const,
        },
        expected: {},
      };

      const result = await suite.runTestCase(testCase);

      expect(result.testCaseId).toBe('memory:search-comparison:test');

      // Should have search latency metrics
      const keywordP50 = result.metrics.find(m => m.name === 'keyword_search_p50');
      expect(keywordP50).toBeDefined();

      const hybridP50 = result.metrics.find(m => m.name === 'hybrid_search_p50');
      expect(hybridP50).toBeDefined();
    });

    it('should include latency percentiles', async () => {
      const testCase = {
        id: 'memory:latency:test',
        description: 'Test latency measurement',
        input: {
          query: 'validate input',
          files: [join(testDir, 'src', 'utils.ts')],
          operation: 'retrieval' as const,
        },
        expected: {},
      };

      const result = await suite.runTestCase(testCase);

      // Should have latency percentiles
      const p50 = result.metrics.find(m => m.name.includes('p50'));
      const p95 = result.metrics.find(m => m.name.includes('p95'));
      expect(p50).toBeDefined();
      expect(p95).toBeDefined();
    });
  });

  describe('cache statistics', () => {
    it('should track cache stats', async () => {
      suite.resetCacheStats();

      const testCase = {
        id: 'memory:cache:test',
        description: 'Test cache tracking',
        input: {
          query: 'function',
          files: [join(testDir, 'src', 'utils.ts')],
          operation: 'retrieval' as const,
        },
        expected: {},
      };

      await suite.runTestCase(testCase);

      const stats = suite.getCacheStats();
      expect(stats.totalRequests).toBeGreaterThan(0);
    });

    it('should reset cache stats', () => {
      suite.resetCacheStats();
      const stats = suite.getCacheStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('run', () => {
    it('should run complete suite', async () => {
      const config = {
        name: 'test-run',
        description: 'Test suite run',
      };

      const result = await suite.run(config, testDir);

      expect(result.config.name).toBe('memory-efficiency');
      expect(result.testResults.length).toBeGreaterThan(0);
      expect(result.latencyStats).toBeDefined();
      expect(result.totalExecutionTimeMs).toBeGreaterThan(0);
    }, 60000);

    it('should include cache hit rate in aggregated metrics', async () => {
      const config = {
        name: 'test-cache',
        description: 'Test cache metrics',
      };

      const result = await suite.run(config, testDir);

      const cacheMetric = result.aggregatedMetrics.find(m => m.name === 'cache_hit_rate');
      expect(cacheMetric).toBeDefined();
    }, 60000);
  });
});
