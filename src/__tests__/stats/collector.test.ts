import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StatsCollector } from '../../stats/collector.js';
import { loadConfig } from '../../utils/config.js';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('StatsCollector', () => {
  let testDir: string;
  let dataDir: string;
  let collector: StatsCollector;

  beforeEach(async () => {
    testDir = join(tmpdir(), `seu-claude-stats-test-${Date.now()}-${Math.random()}`);
    dataDir = join(testDir, '.seu-claude');
    await mkdir(dataDir, { recursive: true });

    const config = loadConfig({
      projectRoot: testDir,
      dataDir: dataDir,
    });
    collector = new StatsCollector(config);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('collect', () => {
    it('should return empty stats when index does not exist', async () => {
      const stats = await collector.collect();

      expect(stats.totalFiles).toBe(0);
      expect(stats.totalChunks).toBe(0);
      expect(stats.indexedAt).toBeNull();
      expect(Object.keys(stats.languages)).toHaveLength(0);
    });

    it('should aggregate file index stats correctly', async () => {
      const now = Date.now();
      await writeFile(
        join(dataDir, 'file-index.json'),
        JSON.stringify({
          version: 1,
          projectRoot: testDir,
          files: {
            'src/app.ts': {
              relativePath: 'src/app.ts',
              hash: 'abc',
              mtime: now - 2000,
              indexedAt: now - 2000,
              chunkCount: 5,
            },
            'src/utils.py': {
              relativePath: 'src/utils.py',
              hash: 'def',
              mtime: now - 1000,
              indexedAt: now - 1000,
              chunkCount: 3,
            },
            'lib/helper.js': {
              relativePath: 'lib/helper.js',
              hash: 'ghi',
              mtime: now,
              indexedAt: now,
              chunkCount: 2,
            },
          },
        })
      );

      const stats = await collector.collect();

      expect(stats.totalFiles).toBe(3);
      expect(stats.totalChunks).toBe(10);
      expect(stats.languages.typescript.files).toBe(1);
      expect(stats.languages.typescript.chunks).toBe(5);
      expect(stats.languages.python.files).toBe(1);
      expect(stats.languages.python.chunks).toBe(3);
      expect(stats.languages.javascript.files).toBe(1);
      expect(stats.languages.javascript.chunks).toBe(2);
      expect(stats.indexedAt).toEqual(new Date(now));
    });

    it('should collect xref stats correctly', async () => {
      await writeFile(
        join(dataDir, 'xref-graph.json'),
        JSON.stringify({
          definitions: {
            foo: { file: 'test.ts', line: 1, type: 'function' },
            bar: { file: 'test.ts', line: 10, type: 'function' },
            baz: { file: 'util.ts', line: 5, type: 'method' },
          },
          callSites: {
            foo: [
              { file: 'main.ts', line: 5, caller: 'init' },
              { file: 'app.ts', line: 20, caller: 'start' },
            ],
            bar: [{ file: 'main.ts', line: 10, caller: 'init' }],
          },
        })
      );

      const stats = await collector.collect();

      expect(stats.xrefs.totalDefinitions).toBe(3);
      expect(stats.xrefs.totalCallSites).toBe(3);
    });

    it('should calculate storage sizes', async () => {
      const fileIndexContent = JSON.stringify({
        version: 1,
        projectRoot: testDir,
        files: {},
      });
      await writeFile(join(dataDir, 'file-index.json'), fileIndexContent);

      const xrefContent = JSON.stringify({ definitions: {}, callSites: {} });
      await writeFile(join(dataDir, 'xref-graph.json'), xrefContent);

      const stats = await collector.collect();

      expect(stats.storage.fileIndexSize).toBe(Buffer.byteLength(fileIndexContent));
      expect(stats.storage.xrefGraphSize).toBe(Buffer.byteLength(xrefContent));
      expect(stats.storage.totalSize).toBeGreaterThan(0);
    });

    it('should handle missing xref graph gracefully', async () => {
      await writeFile(
        join(dataDir, 'file-index.json'),
        JSON.stringify({
          version: 1,
          projectRoot: testDir,
          files: {
            'test.ts': {
              relativePath: 'test.ts',
              hash: 'abc',
              mtime: 1000,
              indexedAt: 1000,
              chunkCount: 5,
            },
          },
        })
      );

      const stats = await collector.collect();

      expect(stats.totalFiles).toBe(1);
      expect(stats.xrefs.totalDefinitions).toBe(0);
      expect(stats.xrefs.totalCallSites).toBe(0);
    });

    it('should handle corrupted file index gracefully', async () => {
      await writeFile(join(dataDir, 'file-index.json'), 'not valid json {{{');

      const stats = await collector.collect();

      expect(stats.totalFiles).toBe(0);
      expect(stats.totalChunks).toBe(0);
    });

    it('should categorize unknown extensions as other', async () => {
      await writeFile(
        join(dataDir, 'file-index.json'),
        JSON.stringify({
          version: 1,
          projectRoot: testDir,
          files: {
            'data.xyz': {
              relativePath: 'data.xyz',
              hash: 'abc',
              mtime: 1000,
              indexedAt: 1000,
              chunkCount: 2,
            },
          },
        })
      );

      const stats = await collector.collect();

      expect(stats.languages.other.files).toBe(1);
      expect(stats.languages.other.chunks).toBe(2);
    });

    it('should handle corrupted xref graph gracefully', async () => {
      await writeFile(join(dataDir, 'xref-graph.json'), 'invalid json content {{{{');

      const stats = await collector.collect();

      expect(stats.xrefs.totalDefinitions).toBe(0);
      expect(stats.xrefs.totalCallSites).toBe(0);
    });

    it('should calculate lancedb directory size', async () => {
      // Create lancedb directory with some test files
      const lancedbPath = join(dataDir, 'lancedb');
      await mkdir(lancedbPath, { recursive: true });
      await writeFile(join(lancedbPath, 'test-data.bin'), 'x'.repeat(1024));
      await writeFile(join(lancedbPath, 'metadata.json'), '{"version":1}');

      const stats = await collector.collect();

      // Should calculate the size of files in lancedb directory
      expect(stats.storage.vectorDbSize).toBeGreaterThan(0);
      expect(stats.storage.vectorDbSize).toBeGreaterThanOrEqual(1024);
    });

    it('should handle nested directories in lancedb', async () => {
      // Create nested lancedb directory structure
      const lancedbPath = join(dataDir, 'lancedb');
      const nestedDir = join(lancedbPath, 'tables', 'chunks');
      await mkdir(nestedDir, { recursive: true });
      await writeFile(join(lancedbPath, 'root.bin'), 'root');
      await writeFile(join(nestedDir, 'data.bin'), 'nested data content');

      const stats = await collector.collect();

      // Should include sizes from nested directories
      expect(stats.storage.vectorDbSize).toBeGreaterThan(0);
    });

    it('should handle xref graph with empty or malformed callSites', async () => {
      await writeFile(
        join(dataDir, 'xref-graph.json'),
        JSON.stringify({
          definitions: { foo: { file: 'test.ts', line: 1 } },
          callSites: {
            foo: 'not-an-array', // Malformed - should be an array
            bar: null,
          },
        })
      );

      const stats = await collector.collect();

      expect(stats.xrefs.totalDefinitions).toBe(1);
      // Should handle non-array callSites gracefully
      expect(stats.xrefs.totalCallSites).toBe(0);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(collector.formatBytes(0)).toBe('0 B');
      expect(collector.formatBytes(500)).toBe('500.0 B');
      expect(collector.formatBytes(1024)).toBe('1.0 KB');
      expect(collector.formatBytes(1536)).toBe('1.5 KB');
      expect(collector.formatBytes(1048576)).toBe('1.0 MB');
      expect(collector.formatBytes(1073741824)).toBe('1.0 GB');
    });
  });
});
