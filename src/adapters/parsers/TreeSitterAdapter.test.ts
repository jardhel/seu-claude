import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { TreeSitterAdapter } from './TreeSitterAdapter';

describe('TreeSitterAdapter', () => {
  let testDir: string;
  let adapter: TreeSitterAdapter;

  beforeEach(async () => {
    testDir = join(tmpdir(), `tree-sitter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    adapter = new TreeSitterAdapter();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('File Support', () => {
    it('supports TypeScript files', () => {
      expect(adapter.isSupported('file.ts')).toBe(true);
      expect(adapter.isSupported('file.tsx')).toBe(true);
    });

    it('supports JavaScript files', () => {
      expect(adapter.isSupported('file.js')).toBe(true);
      expect(adapter.isSupported('file.jsx')).toBe(true);
    });

    it('supports Python files', () => {
      expect(adapter.isSupported('file.py')).toBe(true);
      expect(adapter.isSupported('file.pyi')).toBe(true);
    });

    it('returns false for unsupported files', () => {
      expect(adapter.isSupported('file.rs')).toBe(false);
      expect(adapter.isSupported('file.go')).toBe(false);
    });

    it('returns all supported extensions', () => {
      const extensions = adapter.getSupportedExtensions();
      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.py');
    });
  });

  describe('TypeScript Parsing', () => {
    it('extracts function declarations', async () => {
      const filePath = join(testDir, 'functions.ts');
      await writeFile(filePath, `
        function greet(name: string): string {
          return 'Hello, ' + name;
        }

        function add(a: number, b: number): number {
          return a + b;
        }
      `);

      const functions = await adapter.getFunctions(filePath);
      expect(functions).toHaveLength(2);
      expect(functions.map(f => f.name)).toContain('greet');
      expect(functions.map(f => f.name)).toContain('add');
    });

    it('extracts arrow functions', async () => {
      const filePath = join(testDir, 'arrows.ts');
      await writeFile(filePath, `
        const multiply = (a: number, b: number) => a * b;
        const divide = (a: number, b: number) => {
          return a / b;
        };
      `);

      const functions = await adapter.getFunctions(filePath);
      expect(functions).toHaveLength(2);
      expect(functions.map(f => f.name)).toContain('multiply');
      expect(functions.map(f => f.name)).toContain('divide');
    });

    it('extracts class declarations', async () => {
      const filePath = join(testDir, 'classes.ts');
      await writeFile(filePath, `
        class Animal {
          name: string;
          constructor(name: string) {
            this.name = name;
          }
        }

        class Dog extends Animal {
          bark() {
            console.log('Woof!');
          }
        }
      `);

      const classes = await adapter.getClasses(filePath);
      expect(classes).toHaveLength(2);
      expect(classes.map(c => c.name)).toContain('Animal');
      expect(classes.map(c => c.name)).toContain('Dog');
    });

    it('extracts method definitions with parent class', async () => {
      const filePath = join(testDir, 'methods.ts');
      await writeFile(filePath, `
        class Calculator {
          add(a: number, b: number): number {
            return a + b;
          }
          subtract(a: number, b: number): number {
            return a - b;
          }
        }
      `);

      const result = await adapter.parseFile(filePath);
      const methods = result.symbols.filter(s => s.type === 'method');
      expect(methods).toHaveLength(2);
      expect(methods[0].parentClass).toBe('Calculator');
      expect(methods[1].parentClass).toBe('Calculator');
    });

    it('extracts call sites', async () => {
      const filePath = join(testDir, 'calls.ts');
      await writeFile(filePath, `
        console.log('Hello');
        fetch('/api/data');
        const result = process.exit(1);
      `);

      const calls = await adapter.getCallSites(filePath);
      expect(calls.length).toBeGreaterThanOrEqual(3);
      expect(calls.map(c => c.callee)).toContain('log');
      expect(calls.map(c => c.callee)).toContain('fetch');
      expect(calls.map(c => c.callee)).toContain('exit');
    });

    it('extracts import statements', async () => {
      const filePath = join(testDir, 'imports.ts');
      await writeFile(filePath, `
        import { readFile, writeFile } from 'fs/promises';
        import path from 'path';
        import * as utils from './utils';
        import type { Config } from '../config';
      `);

      const imports = await adapter.getImports(filePath);
      expect(imports).toHaveLength(4);

      const fsImport = imports.find(i => i.modulePath === 'fs/promises');
      expect(fsImport?.importedSymbols).toContain('readFile');
      expect(fsImport?.importedSymbols).toContain('writeFile');

      const pathImport = imports.find(i => i.modulePath === 'path');
      expect(pathImport?.isDefault).toBe(true);

      const utilsImport = imports.find(i => i.modulePath === './utils');
      expect(utilsImport?.isNamespace).toBe(true);
    });
  });

  describe('Python Parsing', () => {
    it('extracts function definitions', async () => {
      const filePath = join(testDir, 'functions.py');
      await writeFile(filePath, `
def greet(name):
    return f"Hello, {name}"

def add(a, b):
    return a + b
      `);

      const functions = await adapter.getFunctions(filePath);
      expect(functions).toHaveLength(2);
      expect(functions.map(f => f.name)).toContain('greet');
      expect(functions.map(f => f.name)).toContain('add');
    });

    it('extracts class definitions', async () => {
      const filePath = join(testDir, 'classes.py');
      await writeFile(filePath, `
class Animal:
    def __init__(self, name):
        self.name = name

class Dog(Animal):
    def bark(self):
        print("Woof!")
      `);

      const classes = await adapter.getClasses(filePath);
      expect(classes).toHaveLength(2);
      expect(classes.map(c => c.name)).toContain('Animal');
      expect(classes.map(c => c.name)).toContain('Dog');
    });

    it('extracts methods with parent class', async () => {
      const filePath = join(testDir, 'methods.py');
      await writeFile(filePath, `
class Calculator:
    def add(self, a, b):
        return a + b

    def subtract(self, a, b):
        return a - b
      `);

      const result = await adapter.parseFile(filePath);
      const methods = result.symbols.filter(s => s.type === 'method');
      expect(methods).toHaveLength(2);
      expect(methods[0].parentClass).toBe('Calculator');
    });

    it('extracts import statements', async () => {
      const filePath = join(testDir, 'imports.py');
      await writeFile(filePath, `
import os
import json
from pathlib import Path
from typing import List, Dict
      `);

      const imports = await adapter.getImports(filePath);
      expect(imports.length).toBeGreaterThanOrEqual(3);

      const osImport = imports.find(i => i.modulePath === 'os');
      expect(osImport).toBeDefined();

      const pathlibImport = imports.find(i => i.modulePath === 'pathlib');
      expect(pathlibImport).toBeDefined();
    });
  });

  describe('Caching', () => {
    it('caches parse results', async () => {
      const filePath = join(testDir, 'cached.ts');
      await writeFile(filePath, `function test() {}`);

      // First parse
      const result1 = await adapter.parseFile(filePath);
      const stats1 = adapter.getCacheStats();
      expect(stats1.size).toBe(1);

      // Second parse should use cache
      const result2 = await adapter.parseFile(filePath);
      expect(result2).toEqual(result1);
    });

    it('invalidates cache on clear', async () => {
      const filePath = join(testDir, 'cached.ts');
      await writeFile(filePath, `function test() {}`);

      await adapter.parseFile(filePath);
      expect(adapter.getCacheStats().size).toBe(1);

      adapter.clearCache();
      expect(adapter.getCacheStats().size).toBe(0);
    });

    it('invalidates cache for specific file', async () => {
      const file1 = join(testDir, 'file1.ts');
      const file2 = join(testDir, 'file2.ts');
      await writeFile(file1, `function test1() {}`);
      await writeFile(file2, `function test2() {}`);

      await adapter.parseFile(file1);
      await adapter.parseFile(file2);
      expect(adapter.getCacheStats().size).toBe(2);

      adapter.invalidateCache(file1);
      expect(adapter.getCacheStats().size).toBe(1);
      expect(adapter.getCacheStats().files).toContain(file2);
    });
  });

  describe('Error Handling', () => {
    it('handles non-existent files', async () => {
      const result = await adapter.parseFile('/nonexistent/file.ts');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.symbols).toHaveLength(0);
    });

    it('handles unsupported file types', async () => {
      const filePath = join(testDir, 'file.rs');
      await writeFile(filePath, 'fn main() {}');

      const result = await adapter.parseFile(filePath);
      expect(result.errors).toContain('Unsupported file type: .rs');
      expect(result.language).toBe('unknown');
    });

    it('reports parse time', async () => {
      const filePath = join(testDir, 'timed.ts');
      await writeFile(filePath, `function test() { return 42; }`);

      const result = await adapter.parseFile(filePath);
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Batch Parsing', () => {
    it('parses multiple files', async () => {
      const file1 = join(testDir, 'file1.ts');
      const file2 = join(testDir, 'file2.py');
      await writeFile(file1, `function test1() {}`);
      await writeFile(file2, `def test2(): pass`);

      const results = await adapter.parseFiles([file1, file2]);
      expect(results).toHaveLength(2);
      expect(results[0].language).toBe('typescript');
      expect(results[1].language).toBe('python');
    });
  });
});
