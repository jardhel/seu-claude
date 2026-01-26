import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileIndex } from '../indexer/file-index.js';
import { FileInfo } from '../indexer/crawler.js';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('FileIndex', () => {
  let testDir: string;
  let dataDir: string;
  let fileIndex: FileIndex;

  beforeEach(async () => {
    testDir = join(tmpdir(), `seu-claude-file-index-test-${Date.now()}-${Math.random()}`);
    dataDir = join(testDir, '.seu-claude');
    await mkdir(dataDir, { recursive: true });
    fileIndex = new FileIndex(dataDir, testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('load', () => {
    it('should handle missing index file gracefully', async () => {
      await fileIndex.load();
      expect(fileIndex.isLoaded()).toBe(true);
      expect(fileIndex.size).toBe(0);
    });

    it('should load existing index file', async () => {
      const indexPath = join(dataDir, 'file-index.json');
      const data = {
        version: 1,
        projectRoot: testDir,
        files: {
          'src/test.ts': {
            relativePath: 'src/test.ts',
            hash: 'abc123',
            mtime: 1234567890,
            indexedAt: 1234567890,
            chunkCount: 5,
          },
        },
      };
      await writeFile(indexPath, JSON.stringify(data));

      await fileIndex.load();

      expect(fileIndex.isLoaded()).toBe(true);
      expect(fileIndex.size).toBe(1);
      expect(fileIndex.getFile('src/test.ts')).toEqual({
        relativePath: 'src/test.ts',
        hash: 'abc123',
        mtime: 1234567890,
        indexedAt: 1234567890,
        chunkCount: 5,
      });
    });

    it('should reset on version mismatch', async () => {
      const indexPath = join(dataDir, 'file-index.json');
      const data = {
        version: 999, // Wrong version
        projectRoot: testDir,
        files: {
          'test.ts': {
            relativePath: 'test.ts',
            hash: 'abc',
            mtime: 0,
            indexedAt: 0,
            chunkCount: 1,
          },
        },
      };
      await writeFile(indexPath, JSON.stringify(data));

      await fileIndex.load();

      expect(fileIndex.size).toBe(0); // Should be empty due to version mismatch
    });

    it('should reset on project root change', async () => {
      const indexPath = join(dataDir, 'file-index.json');
      const data = {
        version: 1,
        projectRoot: '/different/project', // Different project
        files: {
          'test.ts': {
            relativePath: 'test.ts',
            hash: 'abc',
            mtime: 0,
            indexedAt: 0,
            chunkCount: 1,
          },
        },
      };
      await writeFile(indexPath, JSON.stringify(data));

      await fileIndex.load();

      expect(fileIndex.size).toBe(0);
    });

    it('should handle corrupted JSON gracefully', async () => {
      const indexPath = join(dataDir, 'file-index.json');
      await writeFile(indexPath, 'not valid json {{{');

      await fileIndex.load();

      expect(fileIndex.isLoaded()).toBe(true);
      expect(fileIndex.size).toBe(0);
    });
  });

  describe('save', () => {
    it('should save index to file', async () => {
      await fileIndex.load();
      fileIndex.updateFile('test.ts', {
        hash: 'abc123',
        mtime: 1234567890,
        indexedAt: 1234567891,
        chunkCount: 3,
      });

      await fileIndex.save();

      const content = await readFile(join(dataDir, 'file-index.json'), 'utf-8');
      const data = JSON.parse(content);

      expect(data.version).toBe(1);
      expect(data.projectRoot).toBe(testDir);
      expect(data.files['test.ts']).toEqual({
        relativePath: 'test.ts',
        hash: 'abc123',
        mtime: 1234567890,
        indexedAt: 1234567891,
        chunkCount: 3,
      });
    });

    it('should create data directory if it does not exist', async () => {
      await rm(dataDir, { recursive: true, force: true });
      fileIndex = new FileIndex(dataDir, testDir);
      await fileIndex.load();
      fileIndex.updateFile('test.ts', { hash: 'abc', mtime: 0, indexedAt: 0, chunkCount: 1 });

      await fileIndex.save();

      const content = await readFile(join(dataDir, 'file-index.json'), 'utf-8');
      expect(JSON.parse(content).files['test.ts']).toBeDefined();
    });
  });

  describe('clear', () => {
    it('should clear all files', async () => {
      await fileIndex.load();
      fileIndex.updateFile('test1.ts', { hash: 'abc', mtime: 0, indexedAt: 0, chunkCount: 1 });
      fileIndex.updateFile('test2.ts', { hash: 'def', mtime: 0, indexedAt: 0, chunkCount: 2 });
      await fileIndex.save();

      await fileIndex.clear();

      expect(fileIndex.size).toBe(0);
    });
  });

  describe('getChangedFiles', () => {
    it('should detect new files', async () => {
      await fileIndex.load();

      const currentFiles: FileInfo[] = [createFileInfo('new-file.ts', 'hash1', Date.now())];

      const changed = fileIndex.getChangedFiles(currentFiles);

      expect(changed).toHaveLength(1);
      expect(changed[0].relativePath).toBe('new-file.ts');
    });

    it('should detect files with changed hash', async () => {
      await fileIndex.load();
      fileIndex.updateFile('existing.ts', {
        hash: 'old-hash',
        mtime: 1000,
        indexedAt: 1000,
        chunkCount: 5,
      });

      const currentFiles: FileInfo[] = [createFileInfo('existing.ts', 'new-hash', 1000)];

      const changed = fileIndex.getChangedFiles(currentFiles);

      expect(changed).toHaveLength(1);
      expect(changed[0].relativePath).toBe('existing.ts');
    });

    it('should detect files with changed mtime', async () => {
      await fileIndex.load();
      fileIndex.updateFile('existing.ts', {
        hash: 'same-hash',
        mtime: 1000,
        indexedAt: 1000,
        chunkCount: 5,
      });

      const currentFiles: FileInfo[] = [
        createFileInfo('existing.ts', 'same-hash', 2000), // Different mtime
      ];

      const changed = fileIndex.getChangedFiles(currentFiles);

      expect(changed).toHaveLength(1);
    });

    it('should not include unchanged files', async () => {
      await fileIndex.load();
      fileIndex.updateFile('unchanged.ts', {
        hash: 'same-hash',
        mtime: 1000,
        indexedAt: 1000,
        chunkCount: 5,
      });

      const currentFiles: FileInfo[] = [
        createFileInfo('unchanged.ts', 'same-hash', 1000),
        createFileInfo('new.ts', 'new-hash', 2000),
      ];

      const changed = fileIndex.getChangedFiles(currentFiles);

      expect(changed).toHaveLength(1);
      expect(changed[0].relativePath).toBe('new.ts');
    });
  });

  describe('getDeletedFiles', () => {
    it('should detect deleted files', async () => {
      await fileIndex.load();
      fileIndex.updateFile('deleted.ts', { hash: 'abc', mtime: 0, indexedAt: 0, chunkCount: 1 });
      fileIndex.updateFile('still-exists.ts', {
        hash: 'def',
        mtime: 0,
        indexedAt: 0,
        chunkCount: 2,
      });

      const currentFiles: FileInfo[] = [createFileInfo('still-exists.ts', 'def', 0)];

      const deleted = fileIndex.getDeletedFiles(currentFiles);

      expect(deleted).toHaveLength(1);
      expect(deleted[0]).toBe('deleted.ts');
    });

    it('should return empty array when no files deleted', async () => {
      await fileIndex.load();
      fileIndex.updateFile('file1.ts', { hash: 'abc', mtime: 0, indexedAt: 0, chunkCount: 1 });

      const currentFiles: FileInfo[] = [createFileInfo('file1.ts', 'abc', 0)];

      const deleted = fileIndex.getDeletedFiles(currentFiles);

      expect(deleted).toHaveLength(0);
    });
  });

  describe('updateFile and removeFile', () => {
    it('should update file record', async () => {
      await fileIndex.load();

      fileIndex.updateFile('test.ts', {
        hash: 'abc123',
        mtime: 1000,
        indexedAt: 2000,
        chunkCount: 10,
      });

      const record = fileIndex.getFile('test.ts');
      expect(record).toEqual({
        relativePath: 'test.ts',
        hash: 'abc123',
        mtime: 1000,
        indexedAt: 2000,
        chunkCount: 10,
      });
    });

    it('should remove file record', async () => {
      await fileIndex.load();
      fileIndex.updateFile('test.ts', { hash: 'abc', mtime: 0, indexedAt: 0, chunkCount: 1 });

      fileIndex.removeFile('test.ts');

      expect(fileIndex.getFile('test.ts')).toBeUndefined();
      expect(fileIndex.size).toBe(0);
    });
  });
});

function createFileInfo(relativePath: string, hash: string, mtime: number): FileInfo {
  return {
    path: `/test/${relativePath}`,
    relativePath,
    language: 'typescript',
    hash,
    size: 100,
    modifiedAt: new Date(mtime),
  };
}
