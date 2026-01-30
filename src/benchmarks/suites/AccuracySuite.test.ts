/**
 * Tests for AccuracySuite
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AccuracySuite } from './AccuracySuite.js';
import { rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('AccuracySuite', () => {
  let suite: AccuracySuite;
  let datasetDir: string;
  let codebaseDir: string;

  beforeEach(async () => {
    suite = new AccuracySuite();
    datasetDir = join(tmpdir(), `accuracy-dataset-${Date.now()}`);
    codebaseDir = join(tmpdir(), `accuracy-codebase-${Date.now()}`);

    await mkdir(datasetDir, { recursive: true });
    await mkdir(join(codebaseDir, 'src'), { recursive: true });

    // Create a simple codebase
    await writeFile(
      join(codebaseDir, 'src', 'utils.ts'),
      `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`
    );

    await writeFile(
      join(codebaseDir, 'src', 'main.ts'),
      `
import { add, multiply } from './utils.js';

export function calculate(x: number, y: number): number {
  return add(x, y) + multiply(x, y);
}
`
    );

    // Create ground truth dataset
    await writeFile(
      join(datasetDir, 'metadata.json'),
      JSON.stringify({
        name: 'test-dataset',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        sourceCodebase: codebaseDir,
        totalFiles: 2,
        totalLinesOfCode: 20,
        languages: ['typescript'],
        generatorVersion: '1.0.0',
      })
    );

    await writeFile(
      join(datasetDir, 'symbol-lookups.json'),
      JSON.stringify([
        {
          id: 'symbol:1',
          symbolName: 'add',
          definitions: [{ file: 'src/utils.ts', line: 2, type: 'function' }],
          callSites: [{ file: 'src/main.ts', line: 5, caller: 'calculate' }],
          difficulty: 'easy',
          tags: ['function'],
        },
      ])
    );

    await writeFile(
      join(datasetDir, 'call-graphs.json'),
      JSON.stringify([
        {
          id: 'callgraph:1',
          targetSymbol: 'calculate',
          targetFile: 'src/main.ts',
          callers: [],
          callees: [
            { name: 'add', callLine: 5 },
            { name: 'multiply', callLine: 5 },
          ],
          difficulty: 'easy',
          tags: ['function'],
        },
      ])
    );

    await writeFile(
      join(datasetDir, 'import-resolutions.json'),
      JSON.stringify([
        {
          id: 'import:1',
          sourceFile: 'src/main.ts',
          importPath: './utils.js',
          resolvedPath: 'src/utils.ts',
          importedSymbols: ['add', 'multiply'],
          importType: 'relative',
          difficulty: 'easy',
          tags: ['relative', 'named'],
        },
      ])
    );

    await writeFile(join(datasetDir, 'circular-dependencies.json'), JSON.stringify([]));
  });

  afterEach(async () => {
    try {
      await rm(datasetDir, { recursive: true, force: true });
      await rm(codebaseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(suite.name).toBe('accuracy');
    });

    it('should have correct description', () => {
      expect(suite.description).toContain('precision');
      expect(suite.description).toContain('recall');
    });

    it('should support expected languages', () => {
      expect(suite.supportedLanguages).toContain('typescript');
      expect(suite.supportedLanguages).toContain('javascript');
      expect(suite.supportedLanguages).toContain('python');
    });
  });

  describe('loadTestCases', () => {
    it('should load test cases from ground truth dataset', async () => {
      const testCases = await suite.loadTestCases(datasetDir);

      // Should load symbol lookup, call graph, and import resolution tests
      expect(testCases.length).toBeGreaterThan(0);

      // Should have different test types
      const types = new Set(testCases.map(tc => tc.input.type));
      expect(types.has('symbol-lookup')).toBe(true);
      expect(types.has('call-graph')).toBe(true);
      expect(types.has('import-resolution')).toBe(true);
    });

    it('should include accuracy tags', async () => {
      const testCases = await suite.loadTestCases(datasetDir);

      for (const tc of testCases) {
        expect(tc.tags).toContain('accuracy');
      }
    });

    it('should return empty for non-existent dataset', async () => {
      const testCases = await suite.loadTestCases('/non/existent/path');
      expect(testCases.length).toBe(0);
    });
  });

  describe('runTestCase', () => {
    it('should evaluate symbol lookup accuracy', async () => {
      const testCase = {
        id: 'accuracy:symbol:test',
        description: 'Test symbol lookup',
        input: {
          type: 'symbol-lookup' as const,
          groundTruth: {
            id: 'symbol:1',
            symbolName: 'add',
            definitions: [{ file: 'src/utils.ts', line: 2, type: 'function' }],
            callSites: [],
            difficulty: 'easy' as const,
            tags: ['function'],
          },
          codebasePath: codebaseDir,
        },
        expected: {
          minPrecision: 0.5,
        },
      };

      const result = await suite.runTestCase(testCase);

      expect(result.testCaseId).toBe('accuracy:symbol:test');
      expect(result.metrics.length).toBeGreaterThan(0);

      // Should have precision and recall metrics
      const precision = result.metrics.find(m => m.name === 'precision');
      const recall = result.metrics.find(m => m.name === 'recall');
      expect(precision).toBeDefined();
      expect(recall).toBeDefined();
    });

    it('should evaluate import resolution accuracy', async () => {
      const testCase = {
        id: 'accuracy:import:test',
        description: 'Test import resolution',
        input: {
          type: 'import-resolution' as const,
          groundTruth: {
            id: 'import:1',
            sourceFile: 'src/main.ts',
            importPath: './utils.js',
            resolvedPath: 'src/utils.ts',
            importedSymbols: ['add', 'multiply'],
            importType: 'relative' as const,
            difficulty: 'easy' as const,
            tags: ['relative'],
          },
          codebasePath: codebaseDir,
        },
        expected: {},
      };

      const result = await suite.runTestCase(testCase);

      expect(result.testCaseId).toBe('accuracy:import:test');

      // Should have resolution_correct metric
      const correct = result.metrics.find(m => m.name === 'resolution_correct');
      expect(correct).toBeDefined();
    });
  });

  describe('run', () => {
    it('should run complete suite', async () => {
      const config = {
        name: 'test-run',
        description: 'Test suite run',
      };

      const result = await suite.run(config, datasetDir);

      expect(result.config.name).toBe('accuracy');
      expect(result.testResults.length).toBeGreaterThan(0);
      expect(result.latencyStats).toBeDefined();
      expect(result.aggregatedMetrics.length).toBeGreaterThan(0);
    }, 60000);

    it('should include IR metrics', async () => {
      const config = {
        name: 'test-ir',
        description: 'Test IR metrics',
      };

      const result = await suite.run(config, datasetDir);

      // Should have IR metrics from accuracy calculations
      expect(result.irMetrics).toBeDefined();
    }, 60000);
  });
});
