import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';
import { logger } from '../utils/logger.js';
import { type Config, LANGUAGE_EXTENSIONS } from '../utils/config.js';

export interface LanguageStats {
  files: number;
  chunks: number;
}

export interface XrefStats {
  totalDefinitions: number;
  totalCallSites: number;
}

export interface StorageStats {
  fileIndexSize: number;
  xrefGraphSize: number;
  vectorDbSize: number;
  totalSize: number;
}

export interface IndexStats {
  projectRoot: string;
  dataDir: string;
  indexedAt: Date | null;
  totalFiles: number;
  totalChunks: number;
  languages: Record<string, LanguageStats>;
  types: Record<string, number>;
  xrefs: XrefStats;
  storage: StorageStats;
}

interface FileIndexData {
  version: number;
  projectRoot: string;
  files: Record<
    string,
    {
      relativePath: string;
      hash: string;
      mtime: number;
      indexedAt: number;
      chunkCount: number;
    }
  >;
}

interface XrefGraphData {
  definitions: Record<string, unknown>;
  callSites: Record<string, unknown[]>;
}

export class StatsCollector {
  private config: Config;
  private log = logger.child('stats-collector');

  constructor(config: Config) {
    this.config = config;
  }

  async collect(): Promise<IndexStats> {
    const stats: IndexStats = {
      projectRoot: this.config.projectRoot,
      dataDir: this.config.dataDir,
      indexedAt: null,
      totalFiles: 0,
      totalChunks: 0,
      languages: {},
      types: {},
      xrefs: { totalDefinitions: 0, totalCallSites: 0 },
      storage: { fileIndexSize: 0, xrefGraphSize: 0, vectorDbSize: 0, totalSize: 0 },
    };

    await Promise.all([
      this.collectFileIndexStats(stats),
      this.collectXrefStats(stats),
      this.collectStorageStats(stats),
    ]);

    return stats;
  }

  private async collectFileIndexStats(stats: IndexStats): Promise<void> {
    const indexPath = join(this.config.dataDir, 'file-index.json');

    try {
      const content = await readFile(indexPath, 'utf-8');
      const data = JSON.parse(content) as FileIndexData;

      let latestIndexedAt = 0;

      for (const [, fileInfo] of Object.entries(data.files)) {
        stats.totalFiles++;
        stats.totalChunks += fileInfo.chunkCount;

        // Track by language (derive from extension)
        const lang = this.getLanguageFromPath(fileInfo.relativePath);
        if (!stats.languages[lang]) {
          stats.languages[lang] = { files: 0, chunks: 0 };
        }
        stats.languages[lang].files++;
        stats.languages[lang].chunks += fileInfo.chunkCount;

        if (fileInfo.indexedAt > latestIndexedAt) {
          latestIndexedAt = fileInfo.indexedAt;
        }
      }

      stats.indexedAt = latestIndexedAt > 0 ? new Date(latestIndexedAt) : null;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.log.debug('File index not found');
      } else {
        this.log.warn('Failed to read file index:', err);
      }
    }
  }

  private async collectXrefStats(stats: IndexStats): Promise<void> {
    const xrefPath = join(this.config.dataDir, 'xref-graph.json');

    try {
      const content = await readFile(xrefPath, 'utf-8');
      const data = JSON.parse(content) as XrefGraphData;

      stats.xrefs.totalDefinitions = Object.keys(data.definitions || {}).length;
      stats.xrefs.totalCallSites = Object.values(data.callSites || {}).reduce(
        (sum, sites) => sum + (Array.isArray(sites) ? sites.length : 0),
        0
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.log.debug('Xref graph not found');
      } else {
        this.log.warn('Failed to read xref graph:', err);
      }
    }
  }

  private async collectStorageStats(stats: IndexStats): Promise<void> {
    // File index size
    try {
      const indexStat = await stat(join(this.config.dataDir, 'file-index.json'));
      stats.storage.fileIndexSize = indexStat.size;
    } catch {
      // File doesn't exist
    }

    // Xref graph size
    try {
      const xrefStat = await stat(join(this.config.dataDir, 'xref-graph.json'));
      stats.storage.xrefGraphSize = xrefStat.size;
    } catch {
      // File doesn't exist
    }

    // Vector DB size (lancedb directory)
    const lancedbPath = join(this.config.dataDir, 'lancedb');
    if (existsSync(lancedbPath)) {
      stats.storage.vectorDbSize = await this.getDirectorySize(lancedbPath);
    }

    stats.storage.totalSize =
      stats.storage.fileIndexSize + stats.storage.xrefGraphSize + stats.storage.vectorDbSize;
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    const { readdir } = await import('fs/promises');

    let totalSize = 0;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(entryPath);
        } else if (entry.isFile()) {
          try {
            const fileStat = await stat(entryPath);
            totalSize += fileStat.size;
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return totalSize;
  }

  private getLanguageFromPath(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    return LANGUAGE_EXTENSIONS[ext] || 'other';
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
  }
}
