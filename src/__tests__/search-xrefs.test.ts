/**
 * Tests for SearchXrefs tool
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SearchXrefs } from '../tools/search-xrefs.js';
import { Config, loadConfig } from '../utils/config.js';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('SearchXrefs', () => {
  let config: Config;
  let tempDir: string;
  let tool: SearchXrefs;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'seu-claude-xrefs-test-'));
    config = loadConfig({
      projectRoot: tempDir,
      dataDir: tempDir,
    });
    tool = new SearchXrefs(config);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('execute', () => {
    it('should return error when xref graph not available', async () => {
      const result = await tool.execute({ symbol: 'testFunction' });
      const parsed = JSON.parse(result);
      
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain('Cross-reference graph not available');
    });

    it('should search for symbol in graph when available', async () => {
      // Create a mock xref-graph.json
      const xrefGraph = {
        definitions: {
          'TestClass.testMethod': {
            name: 'testMethod',
            type: 'method',
            filePath: '/test/file.ts',
            startLine: 10,
            endLine: 20,
            calls: ['helperFunction'],
            calledBy: ['main'],
          },
          'main': {
            name: 'main',
            type: 'function',
            filePath: '/test/main.ts',
            startLine: 1,
            endLine: 30,
            calls: ['testMethod'],
            calledBy: [],
          },
        },
        callSites: {
          testMethod: [
            { file: '/test/main.ts', line: 15, caller: 'main' },
          ],
        },
      };

      await writeFile(
        join(tempDir, 'xref-graph.json'),
        JSON.stringify(xrefGraph)
      );

      await tool.initialize();
      const result = await tool.execute({ symbol: 'testMethod' });
      const parsed = JSON.parse(result);

      expect(parsed.symbol).toBe('testMethod');
      expect(parsed.callers).toBeDefined();
      expect(parsed.callees).toBeDefined();
    });

    it('should filter by direction callers', async () => {
      const xrefGraph = {
        definitions: {
          'processData': {
            name: 'processData',
            type: 'function',
            filePath: '/test/data.ts',
            startLine: 1,
            endLine: 10,
            calls: ['validate', 'transform'],
            calledBy: ['main', 'handler'],
          },
        },
        callSites: {
          processData: [
            { file: '/test/main.ts', line: 5, caller: 'main' },
            { file: '/test/handler.ts', line: 10, caller: 'handler' },
          ],
        },
      };

      await writeFile(
        join(tempDir, 'xref-graph.json'),
        JSON.stringify(xrefGraph)
      );

      await tool.initialize();
      const result = await tool.execute({
        symbol: 'processData',
        direction: 'callers',
      });
      const parsed = JSON.parse(result);

      expect(parsed.callers.length).toBeGreaterThan(0);
    });

    it('should filter by direction callees', async () => {
      const xrefGraph = {
        definitions: {
          'processData': {
            name: 'processData',
            type: 'function',
            filePath: '/test/data.ts',
            startLine: 1,
            endLine: 10,
            calls: ['validate', 'transform'],
            calledBy: [],
          },
        },
        callSites: {},
      };

      await writeFile(
        join(tempDir, 'xref-graph.json'),
        JSON.stringify(xrefGraph)
      );

      await tool.initialize();
      const result = await tool.execute({
        symbol: 'processData',
        direction: 'callees',
      });
      const parsed = JSON.parse(result);

      expect(parsed.callees.length).toBe(2);
      expect(parsed.callees.map((c: { callee: string }) => c.callee)).toContain('validate');
      expect(parsed.callees.map((c: { callee: string }) => c.callee)).toContain('transform');
    });

    it('should suggest similar symbols when no exact match', async () => {
      const xrefGraph = {
        definitions: {
          'processUserData': {
            name: 'processUserData',
            type: 'function',
            filePath: '/test/data.ts',
            startLine: 1,
            endLine: 10,
            calls: [],
            calledBy: [],
          },
        },
        callSites: {},
      };

      await writeFile(
        join(tempDir, 'xref-graph.json'),
        JSON.stringify(xrefGraph)
      );

      await tool.initialize();
      const result = await tool.execute({ symbol: 'User' });
      const parsed = JSON.parse(result);

      expect(parsed.suggestions).toBeDefined();
      expect(parsed.suggestions).toContain('processUserData');
    });

    it('should respect maxResults parameter', async () => {
      const callSites: Record<string, Array<{ file: string; line: number; caller: string }>> = {
        commonFunction: [],
      };
      
      for (let i = 0; i < 50; i++) {
        callSites.commonFunction.push({
          file: `/test/file${i}.ts`,
          line: i,
          caller: `caller${i}`,
        });
      }

      const xrefGraph = {
        definitions: {},
        callSites,
      };

      await writeFile(
        join(tempDir, 'xref-graph.json'),
        JSON.stringify(xrefGraph)
      );

      await tool.initialize();
      const result = await tool.execute({
        symbol: 'commonFunction',
        maxResults: 5,
      });
      const parsed = JSON.parse(result);

      expect(parsed.callers.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getFileSymbols', () => {
    it('should return symbols for a specific file', async () => {
      const xrefGraph = {
        definitions: {
          'FileA.methodOne': {
            name: 'methodOne',
            type: 'method',
            filePath: '/test/fileA.ts',
            startLine: 1,
            endLine: 10,
            calls: [],
            calledBy: [],
          },
          'FileA.methodTwo': {
            name: 'methodTwo',
            type: 'method',
            filePath: '/test/fileA.ts',
            startLine: 15,
            endLine: 25,
            calls: ['methodOne'],
            calledBy: [],
          },
          'FileB.otherMethod': {
            name: 'otherMethod',
            type: 'method',
            filePath: '/test/fileB.ts',
            startLine: 1,
            endLine: 10,
            calls: [],
            calledBy: [],
          },
        },
        callSites: {},
      };

      await writeFile(
        join(tempDir, 'xref-graph.json'),
        JSON.stringify(xrefGraph)
      );

      await tool.initialize();
      const result = await tool.getFileSymbols('/test/fileA.ts');
      const parsed = JSON.parse(result);

      expect(parsed.symbols.length).toBe(2);
      expect(parsed.symbols.map((s: { name: string }) => s.name)).toContain('methodOne');
      expect(parsed.symbols.map((s: { name: string }) => s.name)).toContain('methodTwo');
    });

    it('should return error when graph not available', async () => {
      const result = await tool.getFileSymbols('/test/file.ts');
      const parsed = JSON.parse(result);

      expect(parsed.error).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return graph statistics', async () => {
      const xrefGraph = {
        definitions: {
          func1: {
            name: 'func1',
            type: 'function',
            filePath: '/test/a.ts',
            startLine: 1,
            endLine: 10,
            calls: ['func2', 'func3'],
            calledBy: [],
          },
          func2: {
            name: 'func2',
            type: 'function',
            filePath: '/test/b.ts',
            startLine: 1,
            endLine: 10,
            calls: [],
            calledBy: ['func1'],
          },
        },
        callSites: {
          func2: [
            { file: '/test/a.ts', line: 5, caller: 'func1' },
          ],
          func3: [
            { file: '/test/a.ts', line: 6, caller: 'func1' },
          ],
        },
      };

      await writeFile(
        join(tempDir, 'xref-graph.json'),
        JSON.stringify(xrefGraph)
      );

      await tool.initialize();
      const result = tool.getStats();
      const parsed = JSON.parse(result);

      expect(parsed.totalDefinitions).toBe(2);
      expect(parsed.totalCallRelationships).toBe(2);
      expect(parsed.mostCalledFunctions).toBeDefined();
    });

    it('should return error when graph not available', () => {
      const result = tool.getStats();
      const parsed = JSON.parse(result);

      expect(parsed.error).toBeDefined();
    });
  });
});
