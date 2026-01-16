import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { logger } from '../utils/logger.js';
import type { FileInfo } from './crawler.js';

const FILE_INDEX_VERSION = 1;
const FILE_INDEX_NAME = 'file-index.json';

export interface IndexedFileInfo {
  relativePath: string;
  hash: string;
  mtime: number;
  indexedAt: number;
  chunkCount: number;
}

interface FileIndexData {
  version: number;
  projectRoot: string;
  files: Record<string, IndexedFileInfo>;
}

export class FileIndex {
  private dataDir: string;
  private projectRoot: string;
  private files: Map<string, IndexedFileInfo> = new Map();
  private log = logger.child('file-index');
  private loaded = false;

  constructor(dataDir: string, projectRoot: string) {
    this.dataDir = dataDir;
    this.projectRoot = projectRoot;
  }

  private get filePath(): string {
    return join(this.dataDir, FILE_INDEX_NAME);
  }

  async load(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content) as FileIndexData;

      if (data.version !== FILE_INDEX_VERSION) {
        this.log.warn(
          `File index version mismatch (expected ${FILE_INDEX_VERSION}, got ${data.version}). Starting fresh.`
        );
        this.files = new Map();
        this.loaded = true;
        return;
      }

      if (data.projectRoot !== this.projectRoot) {
        this.log.warn('Project root changed. Starting fresh.');
        this.files = new Map();
        this.loaded = true;
        return;
      }

      this.files = new Map(Object.entries(data.files));
      this.log.info(`Loaded file index with ${this.files.size} files`);
      this.loaded = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.log.info('No existing file index found, starting fresh');
      } else {
        this.log.warn('Failed to load file index, starting fresh:', err);
      }
      this.files = new Map();
      this.loaded = true;
    }
  }

  async save(): Promise<void> {
    const data: FileIndexData = {
      version: FILE_INDEX_VERSION,
      projectRoot: this.projectRoot,
      files: Object.fromEntries(this.files),
    };

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2));
    this.log.debug(`Saved file index with ${this.files.size} files`);
  }

  async clear(): Promise<void> {
    this.files = new Map();
    try {
      const { unlink } = await import('fs/promises');
      await unlink(this.filePath);
    } catch {
      // File doesn't exist, that's fine
    }
    this.log.info('Cleared file index');
  }

  getChangedFiles(currentFiles: FileInfo[]): FileInfo[] {
    const changed: FileInfo[] = [];

    for (const file of currentFiles) {
      const indexed = this.files.get(file.relativePath);

      if (!indexed) {
        // New file
        changed.push(file);
        continue;
      }

      // Check if mtime or hash changed
      const currentMtime = file.modifiedAt.getTime();
      if (indexed.mtime !== currentMtime || indexed.hash !== file.hash) {
        changed.push(file);
      }
    }

    return changed;
  }

  getDeletedFiles(currentFiles: FileInfo[]): string[] {
    const currentPaths = new Set(currentFiles.map(f => f.relativePath));
    const deleted: string[] = [];

    for (const [relativePath] of this.files) {
      if (!currentPaths.has(relativePath)) {
        deleted.push(relativePath);
      }
    }

    return deleted;
  }

  updateFile(relativePath: string, info: Omit<IndexedFileInfo, 'relativePath'>): void {
    this.files.set(relativePath, {
      relativePath,
      ...info,
    });
  }

  removeFile(relativePath: string): void {
    this.files.delete(relativePath);
  }

  getFile(relativePath: string): IndexedFileInfo | undefined {
    return this.files.get(relativePath);
  }

  get size(): number {
    return this.files.size;
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}
