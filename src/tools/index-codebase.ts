import { Crawler } from '../indexer/crawler.js';
import { SemanticChunker, CodeChunk } from '../indexer/chunker.js';
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
  error?: string;
}

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

  async execute(force = false): Promise<IndexResult> {
    const startTime = Date.now();

    try {
      await this.initialize();

      this.log.info(`Starting indexing of ${this.config.projectRoot}${force ? ' (force)' : ''}`);

      if (force) {
        await this.store.clear();
      }

      // Crawl the codebase
      const crawlResult = await this.crawler.crawl();

      this.log.info(
        `Found ${crawlResult.totalFiles} files (${(crawlResult.totalSize / 1024 / 1024).toFixed(2)} MB)`
      );

      let chunksCreated = 0;
      const batchSize = 50; // Process files in batches for memory efficiency
      const allChunks: CodeChunk[] = [];

      // Process files and create chunks
      for (const file of crawlResult.files) {
        try {
          const content = await readFile(file.path, 'utf-8');
          const chunks = await this.chunker.chunkFile(
            file.path,
            file.relativePath,
            content,
            file.language
          );
          allChunks.push(...chunks);

          if (allChunks.length >= batchSize) {
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
        await this.embedAndStore(allChunks);
        chunksCreated += allChunks.length;
      }

      // Finalize cross-references and save the graph
      this.chunker.finalizeXrefs();
      await this.saveXrefGraph();

      const durationMs = Date.now() - startTime;

      this.log.info(
        `Indexing complete: ${chunksCreated} chunks from ${crawlResult.totalFiles} files in ${(durationMs / 1000).toFixed(1)}s`
      );

      return {
        success: true,
        filesProcessed: crawlResult.totalFiles,
        chunksCreated,
        languages: crawlResult.languages,
        durationMs,
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
