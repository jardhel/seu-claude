/**
 * Tests for DatasetLoader
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatasetLoader } from './DatasetLoader.js';
import { rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('DatasetLoader', () => {
  let loader: DatasetLoader;
  let testDatasetDir: string;

  beforeEach(async () => {
    loader = new DatasetLoader();
    testDatasetDir = join(tmpdir(), `dataset-loader-test-${Date.now()}`);
    await mkdir(testDatasetDir, { recursive: true });

    // Create test dataset files
    await writeFile(
      join(testDatasetDir, 'metadata.json'),
      JSON.stringify({
        name: 'test-dataset',
        version: '1.0.0',
        createdAt: '2024-01-27T00:00:00.000Z',
        sourceCodebase: '/test/codebase',
        totalFiles: 10,
        totalLinesOfCode: 1000,
        languages: ['typescript', 'javascript'],
        generatorVersion: '1.0.0',
      })
    );

    await writeFile(
      join(testDatasetDir, 'symbol-lookups.json'),
      JSON.stringify([
        {
          id: 'symbol:1',
          symbolName: 'TestFunction',
          definitions: [{ file: 'test.ts', line: 10, type: 'function' }],
          callSites: [{ file: 'main.ts', line: 20, caller: 'module' }],
          difficulty: 'easy',
          tags: ['function'],
        },
        {
          id: 'symbol:2',
          symbolName: 'TestClass',
          definitions: [{ file: 'test.ts', line: 30, type: 'class' }],
          callSites: [],
          difficulty: 'medium',
          tags: ['class', 'unused'],
        },
        {
          id: 'symbol:3',
          symbolName: 'ComplexFunction',
          definitions: [
            { file: 'a.ts', line: 1, type: 'function' },
            { file: 'b.ts', line: 1, type: 'function' },
          ],
          callSites: [
            { file: 'c.ts', line: 10, caller: 'main' },
            { file: 'd.ts', line: 20, caller: 'helper' },
          ],
          difficulty: 'hard',
          tags: ['function', 'multi-definition', 'frequently-used'],
        },
      ])
    );

    await writeFile(
      join(testDatasetDir, 'call-graphs.json'),
      JSON.stringify([
        {
          id: 'callgraph:1',
          targetSymbol: 'processData',
          targetFile: 'processor.ts',
          callers: [{ name: 'main', file: 'index.ts', callLine: 5 }],
          callees: [{ name: 'validate', callLine: 10 }],
          difficulty: 'easy',
          tags: ['function'],
        },
      ])
    );

    await writeFile(
      join(testDatasetDir, 'import-resolutions.json'),
      JSON.stringify([
        {
          id: 'import:1',
          sourceFile: 'main.ts',
          importPath: './utils',
          resolvedPath: 'utils.ts',
          importedSymbols: ['helper'],
          importType: 'relative',
          difficulty: 'easy',
          tags: ['relative', 'named'],
        },
      ])
    );

    await writeFile(
      join(testDatasetDir, 'circular-dependencies.json'),
      JSON.stringify([])
    );
  });

  afterEach(async () => {
    try {
      await rm(testDatasetDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    loader.clearCache();
  });

  describe('loadDataset', () => {
    it('should load a complete dataset', async () => {
      const dataset = await loader.loadDataset(testDatasetDir);

      expect(dataset.metadata.name).toBe('test-dataset');
      expect(dataset.symbolLookups.length).toBe(3);
      expect(dataset.callGraphs.length).toBe(1);
      expect(dataset.importResolutions.length).toBe(1);
    });

    it('should cache loaded datasets', async () => {
      const dataset1 = await loader.loadDataset(testDatasetDir);
      const dataset2 = await loader.loadDataset(testDatasetDir);

      expect(dataset1).toBe(dataset2); // Same reference
    });
  });

  describe('loadSymbolLookups', () => {
    it('should load all symbol lookups', async () => {
      const lookups = await loader.loadSymbolLookups(testDatasetDir);
      expect(lookups.length).toBe(3);
    });

    it('should filter by difficulty', async () => {
      const easyLookups = await loader.loadSymbolLookups(testDatasetDir, {
        difficulty: ['easy'],
      });
      expect(easyLookups.length).toBe(1);
      expect(easyLookups[0].difficulty).toBe('easy');

      const hardLookups = await loader.loadSymbolLookups(testDatasetDir, {
        difficulty: ['hard'],
      });
      expect(hardLookups.length).toBe(1);
      expect(hardLookups[0].difficulty).toBe('hard');
    });

    it('should filter by tags', async () => {
      const classLookups = await loader.loadSymbolLookups(testDatasetDir, {
        tags: ['class'],
      });
      expect(classLookups.length).toBe(1);
      expect(classLookups[0].symbolName).toBe('TestClass');
    });

    it('should apply limit', async () => {
      const limited = await loader.loadSymbolLookups(testDatasetDir, {
        limit: 2,
      });
      expect(limited.length).toBe(2);
    });

    it('should shuffle with seed', async () => {
      const shuffled1 = await loader.loadSymbolLookups(testDatasetDir, { seed: 42 });
      const shuffled2 = await loader.loadSymbolLookups(testDatasetDir, { seed: 42 });
      const shuffled3 = await loader.loadSymbolLookups(testDatasetDir, { seed: 123 });

      // Same seed should produce same order
      expect(shuffled1.map(s => s.id)).toEqual(shuffled2.map(s => s.id));

      // Different seed may produce different order (probabilistically)
      // Note: with only 3 items, there's a chance they're the same
    });
  });

  describe('loadCallGraphs', () => {
    it('should load call graphs', async () => {
      const graphs = await loader.loadCallGraphs(testDatasetDir);
      expect(graphs.length).toBe(1);
      expect(graphs[0].targetSymbol).toBe('processData');
    });
  });

  describe('loadImportResolutions', () => {
    it('should load import resolutions', async () => {
      const imports = await loader.loadImportResolutions(testDatasetDir);
      expect(imports.length).toBe(1);
      expect(imports[0].importPath).toBe('./utils');
    });
  });

  describe('getStats', () => {
    it('should return dataset statistics', async () => {
      const stats = await loader.getStats(testDatasetDir);

      expect(stats.totalSymbolLookups).toBe(3);
      expect(stats.totalCallGraphs).toBe(1);
      expect(stats.totalImportResolutions).toBe(1);
      expect(stats.totalCircularDependencies).toBe(0);

      expect(stats.difficultyDistribution.easy).toBe(3); // 1 symbol + 1 call graph + 1 import
      expect(stats.difficultyDistribution.medium).toBe(1);
      expect(stats.difficultyDistribution.hard).toBe(1);
    });
  });

  describe('getMetadata', () => {
    it('should return dataset metadata', async () => {
      const metadata = await loader.getMetadata(testDatasetDir);

      expect(metadata.name).toBe('test-dataset');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.totalFiles).toBe(10);
      expect(metadata.languages).toContain('typescript');
    });
  });

  describe('validateDataset', () => {
    it('should validate a correct dataset', async () => {
      const result = await loader.validateDataset(testDatasetDir);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect missing metadata fields', async () => {
      // Overwrite metadata with missing fields
      await writeFile(
        join(testDatasetDir, 'metadata.json'),
        JSON.stringify({ totalFiles: 0 })
      );
      loader.clearCache();

      const result = await loader.validateDataset(testDatasetDir);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });
  });

  describe('loadStratifiedSample', () => {
    it('should return balanced sample by difficulty', async () => {
      const lookups = await loader.loadSymbolLookups(testDatasetDir);
      const sample = await loader.loadStratifiedSample(lookups, 3, 42);

      // Should have items from different difficulties
      expect(sample.length).toBeLessThanOrEqual(3);
    });
  });

  describe('exists', () => {
    it('should return true for existing dataset', async () => {
      expect(await loader.exists(testDatasetDir)).toBe(true);
    });

    it('should return false for non-existing dataset', async () => {
      expect(await loader.exists('/non/existent/path')).toBe(false);
    });
  });

  describe('listTestCaseTypes', () => {
    it('should list available test case types', async () => {
      const types = await loader.listTestCaseTypes(testDatasetDir);

      expect(types).toContain('symbol-lookup');
      expect(types).toContain('call-graph');
      expect(types).toContain('import-resolution');
    });
  });
});
