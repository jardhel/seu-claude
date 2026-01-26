import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as tmp from 'tmp';
import { join } from 'path';
import { rm, writeFile } from 'fs/promises';
import { RecursiveScout } from '../usecases/RecursiveScout.js';
import { TreeSitterAdapter } from '../../adapters/parsers/TreeSitterAdapter.js';

describe('RecursiveScout', () => {
  let testDir: string;
  let scout: RecursiveScout;
  let adapter: TreeSitterAdapter;

  beforeEach(async () => {
    testDir = tmp.dirSync({ unsafeCleanup: true }).name;
    adapter = new TreeSitterAdapter();
    scout = new RecursiveScout(adapter);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Dependency Graph Building', () => {
    it('builds graph from single file with no imports', async () => {
      const filePath = join(testDir, 'standalone.ts');
      await writeFile(filePath, `
        export function hello() {
          return 'Hello, World!';
        }
      `);

      const graph = await scout.buildDependencyGraph([filePath]);

      expect(graph.nodes.size).toBe(1);
      expect(graph.nodes.get(filePath)).toBeDefined();
      expect(graph.nodes.get(filePath)?.dependencies).toHaveLength(0);
      expect(graph.roots).toContain(filePath);
      expect(graph.leaves).toContain(filePath);
    });

    it('builds graph with dependencies', async () => {
      // Create a simple dependency chain: main -> utils -> helpers
      const helpersPath = join(testDir, 'helpers.ts');
      const utilsPath = join(testDir, 'utils.ts');
      const mainPath = join(testDir, 'main.ts');

      await writeFile(helpersPath, `
        export function formatName(name: string) {
          return name.toUpperCase();
        }
      `);

      await writeFile(utilsPath, `
        import { formatName } from './helpers.js';
        export function greet(name: string) {
          return 'Hello, ' + formatName(name);
        }
      `);

      await writeFile(mainPath, `
        import { greet } from './utils.js';
        console.log(greet('World'));
      `);

      const graph = await scout.buildDependencyGraph([mainPath]);

      expect(graph.nodes.size).toBe(3);
      expect(graph.nodes.get(mainPath)?.dependencies).toContain(utilsPath);
      expect(graph.nodes.get(utilsPath)?.dependencies).toContain(helpersPath);
      expect(graph.nodes.get(helpersPath)?.dependencies).toHaveLength(0);

      // Check dependents (reverse edges)
      expect(graph.nodes.get(helpersPath)?.dependents).toContain(utilsPath);
      expect(graph.nodes.get(utilsPath)?.dependents).toContain(mainPath);
    });

    it('identifies roots and leaves', async () => {
      const leafPath = join(testDir, 'leaf.ts');
      const middlePath = join(testDir, 'middle.ts');
      const rootPath = join(testDir, 'root.ts');

      await writeFile(leafPath, `export const value = 42;`);
      await writeFile(middlePath, `import { value } from './leaf.js'; export const doubled = value * 2;`);
      await writeFile(rootPath, `import { doubled } from './middle.js'; console.log(doubled);`);

      const graph = await scout.buildDependencyGraph([rootPath]);

      expect(graph.roots).toContain(rootPath);
      expect(graph.leaves).toContain(leafPath);
      expect(graph.roots).not.toContain(middlePath);
      expect(graph.leaves).not.toContain(middlePath);
    });

    it('handles multiple entry points', async () => {
      const sharedPath = join(testDir, 'shared.ts');
      const entry1Path = join(testDir, 'entry1.ts');
      const entry2Path = join(testDir, 'entry2.ts');

      await writeFile(sharedPath, `export const CONSTANT = 'shared';`);
      await writeFile(entry1Path, `import { CONSTANT } from './shared.js'; console.log(CONSTANT);`);
      await writeFile(entry2Path, `import { CONSTANT } from './shared.js'; export { CONSTANT };`);

      const graph = await scout.buildDependencyGraph([entry1Path, entry2Path]);

      expect(graph.nodes.size).toBe(3);
      expect(graph.nodes.get(sharedPath)?.dependents).toHaveLength(2);
    });
  });

  describe('Circular Dependency Detection', () => {
    it('detects circular dependencies', async () => {
      const aPath = join(testDir, 'a.ts');
      const bPath = join(testDir, 'b.ts');

      await writeFile(aPath, `
        import { funcB } from './b.js';
        export function funcA() { return funcB(); }
      `);

      await writeFile(bPath, `
        import { funcA } from './a.js';
        export function funcB() { return funcA(); }
      `);

      const graph = await scout.buildDependencyGraph([aPath]);

      expect(graph.circularDeps.length).toBeGreaterThan(0);
      const cycle = graph.circularDeps[0];
      expect(cycle).toContain(aPath);
      expect(cycle).toContain(bPath);
    });

    it('detects longer circular chains', async () => {
      const aPath = join(testDir, 'a.ts');
      const bPath = join(testDir, 'b.ts');
      const cPath = join(testDir, 'c.ts');

      await writeFile(aPath, `import { b } from './b.js'; export const a = 1;`);
      await writeFile(bPath, `import { c } from './c.js'; export const b = 2;`);
      await writeFile(cPath, `import { a } from './a.js'; export const c = 3;`);

      const graph = await scout.buildDependencyGraph([aPath]);

      expect(graph.circularDeps.length).toBeGreaterThan(0);
    });
  });

  describe('Symbol Resolution', () => {
    it('finds symbol definitions', async () => {
      const filePath = join(testDir, 'symbols.ts');
      await writeFile(filePath, `
        export function myFunction() {}
        export class MyClass {}
        export const myArrow = () => {};
      `);

      const graph = await scout.buildDependencyGraph([filePath]);

      const funcDefs = await scout.findSymbolDefinitions('myFunction', graph);
      expect(funcDefs).toHaveLength(1);
      expect(funcDefs[0].symbol.type).toBe('function');

      const classDefs = await scout.findSymbolDefinitions('MyClass', graph);
      expect(classDefs).toHaveLength(1);
      expect(classDefs[0].symbol.type).toBe('class');
    });

    it('finds call sites', async () => {
      const utilsPath = join(testDir, 'utils.ts');
      const mainPath = join(testDir, 'main.ts');

      await writeFile(utilsPath, `export function helper() { return 42; }`);
      await writeFile(mainPath, `
        import { helper } from './utils.js';
        const a = helper();
        const b = helper();
      `);

      const graph = await scout.buildDependencyGraph([mainPath]);

      const calls = await scout.findCallSites('helper', graph);
      expect(calls.length).toBe(2);
      expect(calls.every(c => c.filePath === mainPath)).toBe(true);
    });
  });

  describe('Import Path Finding', () => {
    it('finds import path between files', async () => {
      const aPath = join(testDir, 'a.ts');
      const bPath = join(testDir, 'b.ts');
      const cPath = join(testDir, 'c.ts');

      await writeFile(aPath, `import { b } from './b.js'; export const a = 1;`);
      await writeFile(bPath, `import { c } from './c.js'; export const b = 2;`);
      await writeFile(cPath, `export const c = 3;`);

      const graph = await scout.buildDependencyGraph([aPath]);

      const path = scout.findImportPath(aPath, cPath, graph);
      expect(path).not.toBeNull();
      expect(path).toEqual([aPath, bPath, cPath]);
    });

    it('returns null when no path exists', async () => {
      const aPath = join(testDir, 'a.ts');
      const bPath = join(testDir, 'b.ts');

      await writeFile(aPath, `export const a = 1;`);
      await writeFile(bPath, `export const b = 2;`);

      const graph = await scout.buildDependencyGraph([aPath, bPath]);

      const path = scout.findImportPath(aPath, bPath, graph);
      expect(path).toBeNull();
    });
  });

  describe('Graph Statistics', () => {
    it('calculates correct statistics', async () => {
      const aPath = join(testDir, 'a.ts');
      const bPath = join(testDir, 'b.ts');
      const cPath = join(testDir, 'c.ts');

      await writeFile(aPath, `
        import { b } from './b.js';
        import { c } from './c.js';
        export function a() { return b() + c(); }
      `);
      await writeFile(bPath, `export function b() { return 1; }`);
      await writeFile(cPath, `export function c() { return 2; }`);

      const graph = await scout.buildDependencyGraph([aPath]);
      const stats = scout.getGraphStats(graph);

      expect(stats.totalFiles).toBe(3);
      expect(stats.maxDependencies.file).toBe(aPath);
      expect(stats.maxDependencies.count).toBe(2);
      expect(stats.circularCount).toBe(0);
    });
  });

  describe('Import Resolution', () => {
    it('resolves relative imports', async () => {
      const utilsPath = join(testDir, 'utils.ts');
      const mainPath = join(testDir, 'main.ts');

      await writeFile(utilsPath, `export const x = 1;`);
      await writeFile(mainPath, `import { x } from './utils.js';`);

      const resolved = scout.resolveImport('./utils', mainPath);
      expect(resolved).toBe(utilsPath);
    });

    it('resolves imports with index files', async () => {
      const libDir = join(testDir, 'lib');
      await mkdir(libDir);
      const indexPath = join(libDir, 'index.ts');
      const mainPath = join(testDir, 'main.ts');

      await writeFile(indexPath, `export const lib = 'library';`);
      await writeFile(mainPath, `import { lib } from './lib.js';`);

      const resolved = scout.resolveImport('./lib', mainPath);
      expect(resolved).toBe(indexPath);
    });

    it('skips node_modules by default', () => {
      const mainPath = join(testDir, 'main.ts');
      const resolved = scout.resolveImport('lodash', mainPath);
      expect(resolved).toBeNull();
    });
  });

  describe('Python Support', () => {
    it('builds graph for Python files', async () => {
      const utilsPath = join(testDir, 'utils.py');
      const mainPath = join(testDir, 'main.py');

      await writeFile(utilsPath, `
def helper():
    return 42
      `);

      await writeFile(mainPath, `
from utils import helper

result = helper()
      `);

      // Note: Python relative imports work differently, this tests basic parsing
      const graph = await scout.buildDependencyGraph([mainPath, utilsPath]);

      expect(graph.nodes.size).toBe(2);
      expect(graph.nodes.get(utilsPath)?.symbols.some(s => s.name === 'helper')).toBe(true);
    });
  });
});
