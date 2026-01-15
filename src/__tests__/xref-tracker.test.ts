/**
 * Tests for Cross-Reference Tracker
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CrossReferenceTracker } from '../indexer/xref-tracker.js';
import Parser from 'web-tree-sitter';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { access } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const languagesDir = join(__dirname, '../../languages');

describe('CrossReferenceTracker', () => {
  let tracker: CrossReferenceTracker;
  let parser: Parser;
  let tsLanguage: Parser.Language | null = null;

  beforeEach(async () => {
    tracker = new CrossReferenceTracker();

    // Initialize parser
    await Parser.init();
    parser = new Parser();

    // Try to load TypeScript grammar
    const wasmPath = join(languagesDir, 'tree-sitter-typescript.wasm');
    try {
      await access(wasmPath);
      tsLanguage = await Parser.Language.load(wasmPath);
    } catch {
      tsLanguage = null;
    }
  });

  describe('extractReferences', () => {
    it('should extract function definitions', async () => {
      if (!tsLanguage) {
        console.log('Skipping: TypeScript grammar not available');
        return;
      }

      parser.setLanguage(tsLanguage);
      const code = `
        function processData(data: string): void {
          console.log(data);
        }

        function main() {
          processData("hello");
        }
      `;

      const tree = parser.parse(code);
      const { definitions } = tracker.extractReferences(tree, 'test.ts', 'typescript');

      expect(definitions.length).toBeGreaterThanOrEqual(2);
      
      const processData = definitions.find(d => d.name === 'processData');
      expect(processData).toBeDefined();
      expect(processData?.type).toBe('function');

      const main = definitions.find(d => d.name === 'main');
      expect(main).toBeDefined();
      expect(main?.calls).toContain('processData');
    });

    it('should extract method calls on objects', async () => {
      if (!tsLanguage) {
        console.log('Skipping: TypeScript grammar not available');
        return;
      }

      parser.setLanguage(tsLanguage);
      const code = `
        class Service {
          process(data: string): void {
            this.validate(data);
            this.save(data);
          }

          validate(data: string): boolean {
            return data.length > 0;
          }

          save(data: string): void {
            // save
          }
        }
      `;

      const tree = parser.parse(code);
      const { definitions, calls } = tracker.extractReferences(tree, 'test.ts', 'typescript');

      const process = definitions.find(d => d.name === 'process');
      expect(process).toBeDefined();
      expect(process?.calls).toContain('validate');
      expect(process?.calls).toContain('save');

      // Check that method calls are tracked
      const methodCalls = calls.filter(c => c.isMethodCall);
      expect(methodCalls.length).toBeGreaterThan(0);
    });

    it('should handle nested function calls', async () => {
      if (!tsLanguage) {
        console.log('Skipping: TypeScript grammar not available');
        return;
      }

      parser.setLanguage(tsLanguage);
      const code = `
        function outer() {
          inner1(inner2(inner3()));
        }

        function inner1(data: any) { return data; }
        function inner2(data: any) { return data; }
        function inner3() { return {}; }
      `;

      const tree = parser.parse(code);
      const { definitions } = tracker.extractReferences(tree, 'test.ts', 'typescript');

      const outer = definitions.find(d => d.name === 'outer');
      expect(outer).toBeDefined();
      expect(outer?.calls).toContain('inner1');
      expect(outer?.calls).toContain('inner2');
      expect(outer?.calls).toContain('inner3');
    });
  });

  describe('graph building', () => {
    it('should build call graph from multiple files', async () => {
      if (!tsLanguage) {
        console.log('Skipping: TypeScript grammar not available');
        return;
      }

      parser.setLanguage(tsLanguage);
      
      // File 1
      const code1 = `
        function utilityA() {
          utilityB();
        }
        function utilityB() {}
      `;

      const tree1 = parser.parse(code1);
      const refs1 = tracker.extractReferences(tree1, 'utils.ts', 'typescript');
      tracker.addToGraph('utils.ts', refs1.definitions, refs1.calls);

      // File 2
      const code2 = `
        function main() {
          utilityA();
        }
      `;

      const tree2 = parser.parse(code2);
      const refs2 = tracker.extractReferences(tree2, 'main.ts', 'typescript');
      tracker.addToGraph('main.ts', refs2.definitions, refs2.calls);

      // Build reverse references
      tracker.buildReverseReferences();

      // Check callers
      const callers = tracker.getCallers('utilityA');
      expect(callers.length).toBeGreaterThan(0);
      expect(callers.some(c => c.caller.includes('main'))).toBe(true);
    });

    it('should serialize and deserialize graph', async () => {
      if (!tsLanguage) {
        console.log('Skipping: TypeScript grammar not available');
        return;
      }

      parser.setLanguage(tsLanguage);
      
      const code = `
        function foo() { bar(); }
        function bar() {}
      `;

      const tree = parser.parse(code);
      const refs = tracker.extractReferences(tree, 'test.ts', 'typescript');
      tracker.addToGraph('test.ts', refs.definitions, refs.calls);
      tracker.buildReverseReferences();

      // Serialize
      const serialized = tracker.serialize();
      expect(serialized).toBeTruthy();

      // Create new tracker and deserialize
      const newTracker = new CrossReferenceTracker();
      newTracker.deserialize(serialized);

      // Verify data is preserved
      const callers = newTracker.getCallers('bar');
      expect(callers.length).toBeGreaterThan(0);
    });
  });

  describe('built-in filtering', () => {
    it('should filter out common built-in function names', async () => {
      if (!tsLanguage) {
        console.log('Skipping: TypeScript grammar not available');
        return;
      }

      parser.setLanguage(tsLanguage);
      
      const code = `
        function process() {
          console.log("test");
          arr.map(x => x);
          arr.filter(x => x);
          data.toString();
          customFunction();
        }
      `;

      const tree = parser.parse(code);
      const { definitions } = tracker.extractReferences(tree, 'test.ts', 'typescript');

      const process = definitions.find(d => d.name === 'process');
      expect(process).toBeDefined();
      
      // Should NOT include built-ins
      expect(process?.calls).not.toContain('log');
      expect(process?.calls).not.toContain('map');
      expect(process?.calls).not.toContain('filter');
      expect(process?.calls).not.toContain('toString');
      
      // Should include custom function
      expect(process?.calls).toContain('customFunction');
    });
  });
});
