import { Crawler } from '../indexer/crawler.js';
import { SemanticChunker, CodeChunk } from '../indexer/chunker.js';
import { FileIndex } from '../indexer/file-index.js';
import { EmbeddingEngine } from '../vector/embed.js';
import { VectorStore, StoredChunk } from '../vector/store.js';
import { Config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

export interface IndexResult {
  success: boolean;
  filesProcessed: number;
  chunksCreated: number;
  languages: Record<string, number>;
  durationMs: number;
  filesSkipped: number;
  filesUpdated: number;
  filesDeleted: number;
  error?: string;
}

export type IndexPhase = 'crawling' | 'analyzing' | 'embedding' | 'saving' | 'complete';

export interface IndexProgress {
  phase: IndexPhase;
  message: string;
  /** Current item being processed (e.g., file number) */
  current?: number;
  /** Total items to process */
  total?: number;
  /** Current file path being processed */
  currentFile?: string;
}

export type ProgressCallback = (progress: IndexProgress) => void;

export class IndexCodebase {
  private config: Config;
  private crawler: Crawler;
  private chunker: SemanticChunker;
  private embedder: EmbeddingEngine;
  private store: VectorStore;
  private log = logger.child('index-codebase');
  private initialized = false;

  constructor(
    config: Config,
    embedder: EmbeddingEngine,
    store: VectorStore,
    languagesDir?: string
  ) {
    this.config = config;
    this.crawler = new Crawler(config);
    this.chunker = new SemanticChunker(config, languagesDir);
    this.embedder = embedder;
    this.store = store;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.chunker.initialize();
    this.initialized = true;
  }

  async execute(force = false, onProgress?: ProgressCallback): Promise<IndexResult> {
    const startTime = Date.now();
    const report = (progress: IndexProgress) => {
      if (onProgress) onProgress(progress);
    };

    try {
      await this.initialize();

      this.log.info(`Starting indexing of ${this.config.projectRoot}${force ? ' (force)' : ''}`);
      report({ phase: 'crawling', message: 'Scanning files...' });

      // Initialize file index for incremental tracking
      const fileIndex = new FileIndex(this.config.dataDir, this.config.projectRoot);

      if (force) {
        await this.store.clear();
        await fileIndex.clear();
      } else {
        await fileIndex.load();
      }

      // Crawl the codebase
      const crawlResult = await this.crawler.crawl();

      this.log.info(
        `Found ${crawlResult.totalFiles} files (${(crawlResult.totalSize / 1024 / 1024).toFixed(2)} MB)`
      );

      report({
        phase: 'crawling',
        message: `Found ${crawlResult.totalFiles} files`,
        total: crawlResult.totalFiles,
      });

      // Handle deleted files
      const deletedFiles = fileIndex.getDeletedFiles(crawlResult.files);
      for (const relativePath of deletedFiles) {
        const indexed = fileIndex.getFile(relativePath);
        if (indexed) {
          // Convert relative path to absolute for deletion
          const absolutePath = join(this.config.projectRoot, relativePath);
          await this.store.deleteByFilePath(absolutePath);
          fileIndex.removeFile(relativePath);
          this.log.debug(`Removed deleted file: ${relativePath}`);
        }
      }

      // Get changed/new files
      const changedFiles = fileIndex.getChangedFiles(crawlResult.files);
      const skippedCount = crawlResult.totalFiles - changedFiles.length;

      if (changedFiles.length === 0 && deletedFiles.length === 0) {
        this.log.info('No changes detected, index is up to date');
        return {
          success: true,
          filesProcessed: 0,
          chunksCreated: 0,
          languages: crawlResult.languages,
          durationMs: Date.now() - startTime,
          filesSkipped: skippedCount,
          filesUpdated: 0,
          filesDeleted: 0,
        };
      }

      this.log.info(
        `Processing ${changedFiles.length} changed files (${skippedCount} unchanged, ${deletedFiles.length} deleted)`
      );

      report({
        phase: 'analyzing',
        message: `Processing ${changedFiles.length} files`,
        current: 0,
        total: changedFiles.length,
      });

      let chunksCreated = 0;
      const batchSize = 50;
      const allChunks: CodeChunk[] = [];
      const fileChunkCounts: Map<string, number> = new Map();
      let processedCount = 0;

      // Process changed files
      for (const file of changedFiles) {
        processedCount++;
        report({
          phase: 'analyzing',
          message: `Analyzing ${file.relativePath}`,
          current: processedCount,
          total: changedFiles.length,
          currentFile: file.relativePath,
        });

        try {
          // Delete old chunks for this file if it was previously indexed
          const existingRecord = fileIndex.getFile(file.relativePath);
          if (existingRecord) {
            await this.store.deleteByFilePath(file.path);
          }

          const content = await readFile(file.path, 'utf-8');
          const chunks = await this.chunker.chunkFile(
            file.path,
            file.relativePath,
            content,
            file.language
          );

          // Track chunk count for this file
          fileChunkCounts.set(file.relativePath, chunks.length);
          allChunks.push(...chunks);

          if (allChunks.length >= batchSize) {
            report({
              phase: 'embedding',
              message: `Generating embeddings (${chunksCreated + allChunks.length} chunks)`,
              current: chunksCreated + allChunks.length,
            });
            await this.embedAndStore(allChunks);
            chunksCreated += allChunks.length;
            allChunks.length = 0;
          }
        } catch (err) {
          this.log.warn(`Failed to process file ${file.relativePath}:`, err);
        }
      }

      // Process remaining chunks
      if (allChunks.length > 0) {
        report({
          phase: 'embedding',
          message: `Generating final embeddings (${chunksCreated + allChunks.length} total chunks)`,
          current: chunksCreated + allChunks.length,
        });
        await this.embedAndStore(allChunks);
        chunksCreated += allChunks.length;
      }

      report({
        phase: 'saving',
        message: 'Saving index...',
      });

      // Update file index with processed files
      for (const file of changedFiles) {
        const chunkCount = fileChunkCounts.get(file.relativePath) ?? 0;
        fileIndex.updateFile(file.relativePath, {
          hash: file.hash,
          mtime: file.modifiedAt.getTime(),
          indexedAt: Date.now(),
          chunkCount,
        });
      }

      // Save file index
      await fileIndex.save();

      // Finalize cross-references and save the graph
      this.chunker.finalizeXrefs();
      await this.saveXrefGraph();

      const durationMs = Date.now() - startTime;

      this.log.info(
        `Indexing complete: ${chunksCreated} chunks from ${changedFiles.length} files in ${(durationMs / 1000).toFixed(1)}s`
      );

      report({
        phase: 'complete',
        message: `Indexed ${chunksCreated} chunks from ${changedFiles.length} files`,
        current: changedFiles.length,
        total: changedFiles.length,
      });

      return {
        success: true,
        filesProcessed: changedFiles.length,
        chunksCreated,
        languages: crawlResult.languages,
        durationMs,
        filesSkipped: skippedCount,
        filesUpdated: changedFiles.length,
        filesDeleted: deletedFiles.length,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.error('Indexing failed:', error);

      return {
        success: false,
        filesProcessed: 0,
        chunksCreated: 0,
        languages: {},
        durationMs: Date.now() - startTime,
        filesSkipped: 0,
        filesUpdated: 0,
        filesDeleted: 0,
        error,
      };
    }
  }

  private async embedAndStore(chunks: CodeChunk[]): Promise<void> {
    // Generate embeddings for all chunks
    const texts = chunks.map(c => c.code);
    const embeddings = await this.embedder.embedBatch(texts);

    // Combine chunks with their embeddings
    const storedChunks: StoredChunk[] = chunks.map((chunk, i) => ({
      ...chunk,
      vector: embeddings[i],
      lastUpdated: new Date(),
    }));

    // Store in vector database
    await this.store.upsert(storedChunks);

    this.log.debug(`Embedded and stored ${chunks.length} chunks`);
  }

  private async saveXrefGraph(): Promise<void> {
    const xrefTracker = this.chunker.getXrefTracker();
    const graph = xrefTracker.getGraph();

    // Serialize the graph
    const data = {
      definitions: Object.fromEntries(graph.definitions),
      callSites: Object.fromEntries(graph.callSites),
    };

    const xrefPath = join(this.config.dataDir, 'xref-graph.json');

    // Ensure data directory exists
    await mkdir(dirname(xrefPath), { recursive: true });

    await writeFile(xrefPath, JSON.stringify(data, null, 2));
    this.log.info(`Saved cross-reference graph: ${graph.definitions.size} definitions`);
  }
}
