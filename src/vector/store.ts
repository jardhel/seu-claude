import * as lancedb from '@lancedb/lancedb';
import type { Config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { CodeChunk } from '../indexer/chunker.js';
import { mkdir } from 'fs/promises';
import { join } from 'path';

export interface StoredChunk extends CodeChunk {
  vector: number[];
  lastUpdated: Date;
}

export interface SearchResult {
  chunk: StoredChunk;
  score: number;
}

const TABLE_NAME = 'code_chunks';

export class VectorStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private log = logger.child('store');
  private dbPath: string;

  constructor(config: Config) {
    this.dbPath = join(config.dataDir, 'lancedb');
  }

  async initialize(): Promise<void> {
    this.log.info('Initializing vector store...');

    // Ensure data directory exists
    await mkdir(this.dbPath, { recursive: true });

    try {
      this.db = await lancedb.connect(this.dbPath);

      // Try to open existing table or create new one
      const tableNames = await this.db.tableNames();

      if (tableNames.includes(TABLE_NAME)) {
        this.table = await this.db.openTable(TABLE_NAME);
        this.log.info('Opened existing code_chunks table');
      } else {
        this.log.info('Table does not exist, will be created on first insert');
      }
    } catch (err) {
      this.log.error('Failed to initialize vector store:', err);
      throw err;
    }
  }

  async upsert(chunks: StoredChunk[]): Promise<void> {
    if (!this.db) {
      throw new Error('Vector store not initialized. Call initialize() first.');
    }

    if (chunks.length === 0) {
      return;
    }

    // Convert to LanceDB format
    const records = chunks.map(chunk => ({
      id: chunk.id,
      file_path: chunk.filePath,
      relative_path: chunk.relativePath,
      code: chunk.code,
      vector: chunk.vector,
      start_line: chunk.startLine,
      end_line: chunk.endLine,
      language: chunk.language,
      type: chunk.type,
      name: chunk.name || '',
      scope: chunk.scope,
      docstring: chunk.docstring || '',
      token_estimate: chunk.tokenEstimate,
      last_updated: chunk.lastUpdated.toISOString(),
    }));

    try {
      if (!this.table) {
        // Create table with first batch
        this.table = await this.db.createTable(TABLE_NAME, records);
        this.log.info(`Created table with ${records.length} records`);
      } else {
        // Add new records
        await this.table.add(records);
        this.log.debug(`Added ${records.length} records to table`);
      }
    } catch (err) {
      this.log.error('Failed to upsert chunks:', err);
      throw err;
    }
  }

  async search(queryVector: number[], limit = 10, filter?: string): Promise<SearchResult[]> {
    if (!this.table) {
      this.log.warn('Table not initialized, returning empty results');
      return [];
    }

    try {
      let query = this.table.search(queryVector).limit(limit);

      if (filter) {
        query = query.where(filter);
      }

      const results = await query.toArray();

      return results.map((row: Record<string, unknown>) => ({
        chunk: this.rowToChunk(row),
        score: (row._distance as number) ?? 0,
      }));
    } catch (err) {
      this.log.error('Search failed:', err);
      throw err;
    }
  }

  async searchByType(queryVector: number[], type: string, limit = 10): Promise<SearchResult[]> {
    return this.search(queryVector, limit, `type = '${type}'`);
  }

  async searchByLanguage(
    queryVector: number[],
    language: string,
    limit = 10
  ): Promise<SearchResult[]> {
    return this.search(queryVector, limit, `language = '${language}'`);
  }

  async getByFilePath(filePath: string): Promise<StoredChunk[]> {
    if (!this.table) {
      return [];
    }

    try {
      // Use query to filter by file path
      const results = await this.table.query().where(`file_path = '${filePath}'`).toArray();

      return results.map((row: Record<string, unknown>) => this.rowToChunk(row));
    } catch (err) {
      this.log.error('Failed to get chunks by file path:', err);
      return [];
    }
  }

  async deleteByFilePath(filePath: string): Promise<void> {
    if (!this.table) {
      return;
    }

    try {
      await this.table.delete(`file_path = '${filePath}'`);
      this.log.debug(`Deleted chunks for: ${filePath}`);
    } catch (err) {
      this.log.error('Failed to delete chunks:', err);
    }
  }

  async getStats(): Promise<{
    totalChunks: number;
    languages: Record<string, number>;
    types: Record<string, number>;
  }> {
    if (!this.table) {
      return { totalChunks: 0, languages: {}, types: {} };
    }

    try {
      const count = await this.table.countRows();
      // Note: LanceDB doesn't have built-in aggregation, so we'd need to scan all rows
      // For now, return just the count
      return {
        totalChunks: count,
        languages: {},
        types: {},
      };
    } catch (err) {
      this.log.error('Failed to get stats:', err);
      return { totalChunks: 0, languages: {}, types: {} };
    }
  }

  async clear(): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      await this.db.dropTable(TABLE_NAME);
      this.table = null;
      this.log.info('Cleared all chunks from store');
    } catch (err) {
      this.log.error('Failed to clear store:', err);
    }
  }

  private rowToChunk(row: Record<string, unknown>): StoredChunk {
    return {
      id: row.id as string,
      filePath: row.file_path as string,
      relativePath: row.relative_path as string,
      code: row.code as string,
      vector: row.vector as number[],
      startLine: row.start_line as number,
      endLine: row.end_line as number,
      language: row.language as string,
      type: row.type as string,
      name: (row.name as string) || null,
      scope: row.scope as string,
      docstring: (row.docstring as string) || null,
      tokenEstimate: row.token_estimate as number,
      lastUpdated: new Date(row.last_updated as string),
    };
  }

  close(): void {
    // LanceDB connections are lightweight, no explicit close needed
    this.db = null;
    this.table = null;
    this.log.info('Vector store closed');
  }
}
