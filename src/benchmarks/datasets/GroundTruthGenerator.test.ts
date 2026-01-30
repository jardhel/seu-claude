/**
 * Tests for GroundTruthGenerator
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GroundTruthGenerator } from './GroundTruthGenerator.js';
import { rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

describe('GroundTruthGenerator', () => {
  let generator: GroundTruthGenerator;
  let testOutputDir: string;
  let testCodebaseDir: string;

  beforeEach(async () => {
    generator = new GroundTruthGenerator();
    testOutputDir = join(tmpdir(), `ground-truth-test-${Date.now()}`);
    testCodebaseDir = join(tmpdir(), `test-codebase-${Date.now()}`);

    // Create a minimal test codebase
    await mkdir(join(testCodebaseDir, 'src'), { recursive: true });

    // Create a simple TypeScript file with symbols
    await writeFile(
      join(testCodebaseDir, 'src', 'utils.ts'),
      `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export class Calculator {
  add(a: number, b: number): number {
    return add(a, b);
  }

  multiply(a: number, b: number): number {
    return multiply(a, b);
  }
}
`
    );

    // Create another file that imports from utils
    await writeFile(
      join(testCodebaseDir, 'src', 'main.ts'),
      `
import { add, multiply, Calculator } from './utils.js';

export function compute(x: number, y: number): number {
  const calc = new Calculator();
  return calc.add(x, y) + multiply(x, y);
}

export function doubleAdd(a: number, b: number): number {
  return add(a, b) * 2;
}
`
    );
  });

  afterEach(async () => {
    // Cleanup
    try {
      await rm(testOutputDir, { recursive: true, force: true });
      await rm(testCodebaseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    generator.clearCache();
  });

  describe('generate', () => {
    it('should generate a complete dataset from a codebase', async () => {
      const dataset = await generator.generate(testCodebaseDir, {
        entryPoints: ['src/main.ts', 'src/utils.ts'],
        outputDir: testOutputDir,
      });

      // Should have metadata
      expect(dataset.metadata).toBeDefined();
      expect(dataset.metadata.name).toBe(`test-codebase-${testCodebaseDir.split('-').pop()}`);
      expect(dataset.metadata.totalFiles).toBeGreaterThan(0);
      expect(dataset.metadata.languages).toContain('typescript');

      // Should have symbol lookups
      expect(dataset.symbolLookups.length).toBeGreaterThan(0);

      // Should have call graphs
      expect(dataset.callGraphs.length).toBeGreaterThanOrEqual(0);

      // Should have import resolutions
      expect(dataset.importResolutions.length).toBeGreaterThan(0);
    }, 30000);

    it('should save dataset files to output directory', async () => {
      await generator.generate(testCodebaseDir, {
        entryPoints: ['src/main.ts', 'src/utils.ts'],
        outputDir: testOutputDir,
      });

      // Check that files were created
      expect(existsSync(join(testOutputDir, 'metadata.json'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'symbol-lookups.json'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'call-graphs.json'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'import-resolutions.json'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'dataset.json'))).toBe(true);
    }, 30000);

    it('should generate symbol lookups with correct structure', async () => {
      const dataset = await generator.generate(testCodebaseDir, {
        entryPoints: ['src/utils.ts'],
        outputDir: testOutputDir,
      });

      // Find the 'add' function
      const addLookup = dataset.symbolLookups.find(s => s.symbolName === 'add');

      if (addLookup) {
        expect(addLookup.id).toMatch(/^symbol:/);
        expect(addLookup.definitions.length).toBeGreaterThan(0);
        expect(addLookup.definitions[0].file).toContain('utils.ts');
        expect(addLookup.definitions[0].type).toBe('function');
        expect(addLookup.difficulty).toMatch(/easy|medium|hard/);
        expect(Array.isArray(addLookup.tags)).toBe(true);
      }
    }, 30000);

    it('should generate import resolutions with resolved paths', async () => {
      const dataset = await generator.generate(testCodebaseDir, {
        entryPoints: ['src/main.ts'],
        outputDir: testOutputDir,
      });

      // Find import from main.ts to utils
      const utilsImport = dataset.importResolutions.find(
        i => i.sourceFile.includes('main.ts') && i.importPath.includes('utils')
      );

      if (utilsImport) {
        expect(utilsImport.id).toMatch(/^import:/);
        expect(utilsImport.resolvedPath).toContain('utils.ts');
        expect(utilsImport.importType).toBe('relative');
        expect(utilsImport.importedSymbols.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('should respect maxSymbols option', async () => {
      const dataset = await generator.generate(testCodebaseDir, {
        entryPoints: ['src/main.ts', 'src/utils.ts'],
        outputDir: testOutputDir,
        maxSymbols: 2,
      });

      expect(dataset.symbolLookups.length).toBeLessThanOrEqual(2);
    }, 30000);

    it('should assign difficulty levels', async () => {
      const dataset = await generator.generate(testCodebaseDir, {
        entryPoints: ['src/main.ts', 'src/utils.ts'],
        outputDir: testOutputDir,
      });

      // All symbol lookups should have difficulty
      for (const lookup of dataset.symbolLookups) {
        expect(['easy', 'medium', 'hard']).toContain(lookup.difficulty);
      }

      // All import resolutions should have difficulty
      for (const imp of dataset.importResolutions) {
        expect(['easy', 'medium', 'hard']).toContain(imp.difficulty);
      }
    }, 30000);
  });

  describe('edge cases', () => {
    it('should handle empty codebase', async () => {
      const emptyDir = join(tmpdir(), `empty-codebase-${Date.now()}`);
      await mkdir(emptyDir, { recursive: true });

      try {
        const dataset = await generator.generate(emptyDir, {
          entryPoints: [],
          outputDir: testOutputDir,
        });

        expect(dataset.symbolLookups.length).toBe(0);
        expect(dataset.metadata.totalFiles).toBe(0);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    }, 30000);

    it('should handle non-existent entry points gracefully', async () => {
      const dataset = await generator.generate(testCodebaseDir, {
        entryPoints: ['non-existent.ts'],
        outputDir: testOutputDir,
      });

      expect(dataset.metadata.totalFiles).toBe(0);
    }, 30000);
  });
});
