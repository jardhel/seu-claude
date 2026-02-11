import { Crawler } from '../indexer/crawler.js';
import { SemanticChunker, CodeChunk } from '../indexer/chunker.js';
import { FileIndex } from '../indexer/file-index.js';
import { GitAwareIndexer } from '../indexer/git-aware-indexer.js';
import { EmbeddingEngine } from '../vector/embed.js';
import { VectorStore, StoredChunk } from '../vector/store.js';
import { BM25Engine } from '../search/bm25.js';
import { FuzzyMatcher } from '../search/fuzzy.js';
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
  /** Whether git-based change detection was used */
  gitAware?: boolean;
  /** Last indexed commit (if git-aware) */
  lastIndexedCommit?: string;
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
  private bm25Engine: BM25Engine;
  private fuzzyMatcher: FuzzyMatcher;
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
    this.bm25Engine = new BM25Engine();
    this.fuzzyMatcher = new FuzzyMatcher();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.chunker.initialize();
    this.initialized = true;
  }

  /**
   * Execute git-aware incremental indexing
   * Uses git diff for efficient change detection in git repositories
   */
  async executeGitAware(
    options: {
      force?: boolean;
      includeUncommitted?: boolean;
    } = {},
    onProgress?: ProgressCallback
  ): Promise<IndexResult> {
    const { force = false, includeUncommitted = true } = options;
    const startTime = Date.now();
    const report = (progress: IndexProgress) => {
      if (onProgress) onProgress(progress);
    };

    try {
      await this.initialize();

      this.log.info(
        `Starting git-aware indexing of ${this.config.projectRoot}${force ? ' (force)' : ''}`
      );
      report({ phase: 'crawling', message: 'Analyzing git changes...' });

      const gitIndexer = new GitAwareIndexer(this.config);
      await gitIndexer.initialize();

      // If force, do regular full index
      if (force) {
        await this.store.clear();
        await gitIndexer.getFileIndex().clear();
        this.bm25Engine.clear();
        this.fuzzyMatcher.clear();

        // Run standard execute
        const result = await this.execute(true, onProgress);
        await gitIndexer.recordIndexSuccess(result.filesProcessed, includeUncommitted);
        return { ...result, gitAware: true };
      }

      // Plan incremental index using git
      const plan = await gitIndexer.planIncrementalIndex(includeUncommitted);

      this.log.info(`Index plan: ${plan.reason}`);
      this.log.info(
        `Stats: ${plan.stats.filesToAdd} to add, ${plan.stats.filesToUpdate} to update, ${plan.stats.filesToDelete} to delete, ${plan.stats.filesUnchanged} unchanged`
      );

      if (plan.filesToIndex.length === 0 && plan.filesToRemove.length === 0) {
        this.log.info('No changes detected, index is up to date');
        const state = gitIndexer.getState();
        return {
          success: true,
          filesProcessed: 0,
          chunksCreated: 0,
          languages: {},
          durationMs: Date.now() - startTime,
          filesSkipped: plan.stats.filesUnchanged,
          filesUpdated: 0,
          filesDeleted: 0,
          gitAware: true,
          lastIndexedCommit: state?.lastIndexedCommit || undefined,
        };
      }

      report({
        phase: 'analyzing',
        message: `Processing ${plan.filesToIndex.length} files (${plan.stats.filesUnchanged} unchanged)`,
        current: 0,
        total: plan.filesToIndex.length,
      });

      // Handle deleted files
      for (const relativePath of plan.filesToRemove) {
        const absolutePath = join(this.config.projectRoot, relativePath);
        await this.store.deleteByFilePath(absolutePath);
        this.removeBM25DocsForFile(relativePath);
        this.removeFuzzySymbolsForFile(relativePath);
        gitIndexer.removeFromFileIndex(relativePath);
        this.log.debug(`Removed deleted file: ${relativePath}`);
      }

      // Process changed files
      let chunksCreated = 0;
      const batchSize = 50;
      const allChunks: CodeChunk[] = [];
      const fileChunkCounts = new Map<string, number>();
      const languageCounts: Record<string, number> = {};
      let processedCount = 0;

      for (const file of plan.filesToIndex) {
        processedCount++;
        report({
          phase: 'analyzing',
          message: `Analyzing ${file.relativePath}`,
          current: processedCount,
          total: plan.filesToIndex.length,
          currentFile: file.relativePath,
        });

        try {
          // Delete old chunks if file was previously indexed
          const existingRecord = gitIndexer.getFileIndex().getFile(file.relativePath);
          if (existingRecord) {
            await this.store.deleteByFilePath(file.path);
            this.removeBM25DocsForFile(file.relativePath);
            this.removeFuzzySymbolsForFile(file.relativePath);
          }

          const content = await readFile(file.path, 'utf-8');
          const chunks = await this.chunker.chunkFile(
            file.path,
            file.relativePath,
            content,
            file.language
          );

          fileChunkCounts.set(file.relativePath, chunks.length);
          allChunks.push(...chunks);

          // Track language
          languageCounts[file.language] = (languageCounts[file.language] || 0) + 1;

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

      report({ phase: 'saving', message: 'Saving index...' });

      // Update file index
      for (const file of plan.filesToIndex) {
        const chunkCount = fileChunkCounts.get(file.relativePath) ?? 0;
        gitIndexer.updateFileIndex(file.relativePath, {
          hash: file.hash,
          mtime: file.modifiedAt.getTime(),
          indexedAt: Date.now(),
          chunkCount,
        });
      }

      // Save everything
      await gitIndexer.saveFileIndex();
      this.chunker.finalizeXrefs();
      await this.saveXrefGraph();
      await this.saveBM25Index();
      await this.saveFuzzyIndex();

      // Record success
      await gitIndexer.recordIndexSuccess(plan.stats.totalFilesInRepo, includeUncommitted);

      const durationMs = Date.now() - startTime;
      const state = gitIndexer.getState();

      this.log.info(
        `Git-aware indexing complete: ${chunksCreated} chunks from ${plan.filesToIndex.length} files in ${(durationMs / 1000).toFixed(1)}s`
      );

      report({
        phase: 'complete',
        message: `Indexed ${chunksCreated} chunks from ${plan.filesToIndex.length} files`,
        current: plan.filesToIndex.length,
        total: plan.filesToIndex.length,
      });

      return {
        success: true,
        filesProcessed: plan.filesToIndex.length,
        chunksCreated,
        languages: languageCounts,
        durationMs,
        filesSkipped: plan.stats.filesUnchanged,
        filesUpdated: plan.stats.filesToUpdate,
        filesDeleted: plan.filesToRemove.length,
        gitAware: true,
        lastIndexedCommit: state?.lastIndexedCommit || undefined,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.error('Git-aware indexing failed:', error);

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
        gitAware: true,
      };
    }
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
        this.bm25Engine.clear();
        this.fuzzyMatcher.clear();
      } else {
        await fileIndex.load();
        await this.loadBM25Index();
        await this.loadFuzzyIndex();
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
          // Remove BM25 documents for this file (uses chunk IDs pattern)
          this.removeBM25DocsForFile(relativePath);
          // Remove fuzzy symbols for this file
          this.removeFuzzySymbolsForFile(relativePath);
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
            // Remove old BM25 documents for this file
            this.removeBM25DocsForFile(file.relativePath);
            // Remove old fuzzy symbols for this file
            this.removeFuzzySymbolsForFile(file.relativePath);
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

      // Save BM25 index for keyword search
      await this.saveBM25Index();

      // Save fuzzy symbol index
      await this.saveFuzzyIndex();

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
    const texts = chunks.map(c => c.indexText ?? c.code);
    const embeddings = await this.embedder.embedBatch(texts);

    // Combine chunks with their embeddings
    const storedChunks: StoredChunk[] = chunks.map((chunk, i) => ({
      ...chunk,
      vector: embeddings[i],
      lastUpdated: new Date(),
    }));

    // Store in vector database
    await this.store.upsert(storedChunks);

    // Add chunks to BM25 index for keyword search
    for (const chunk of chunks) {
      const chunkId = this.getChunkId(chunk);
      this.bm25Engine.addDocument({
        id: chunkId,
        text: chunk.indexText ?? chunk.code,
        metadata: {
          filePath: chunk.filePath,
          relativePath: chunk.relativePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          type: chunk.type,
          name: chunk.name,
          scope: chunk.scope,
          language: chunk.language,
          // Used by keyword-only mode for displaying snippets
          code: chunk.code,
        },
      });

      // Add named symbols to fuzzy index
      if (chunk.name && this.isIndexableType(chunk.type)) {
        const symbolId = `${chunk.relativePath}:${chunk.name}`;
        this.fuzzyMatcher.addSymbol(symbolId, {
          filePath: chunk.filePath,
          type: chunk.type,
          line: chunk.startLine,
          relativePath: chunk.relativePath,
          name: chunk.name,
          scope: chunk.scope,
        });
      }
    }

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

  /**
   * Load BM25 index from disk
   */
  private async loadBM25Index(): Promise<void> {
    const bm25Path = join(this.config.dataDir, 'bm25-index.json');

    try {
      const content = await readFile(bm25Path, 'utf-8');
      this.bm25Engine.deserialize(content);
      const stats = this.bm25Engine.getStats();
      this.log.debug(`Loaded BM25 index: ${stats.totalDocs} documents`);
    } catch {
      // Index doesn't exist yet, start fresh
      this.log.debug('No existing BM25 index found, starting fresh');
    }
  }

  /**
   * Save BM25 index to disk
   */
  private async saveBM25Index(): Promise<void> {
    const bm25Path = join(this.config.dataDir, 'bm25-index.json');

    // Ensure data directory exists
    await mkdir(dirname(bm25Path), { recursive: true });

    const serialized = this.bm25Engine.serialize();
    await writeFile(bm25Path, serialized);

    const stats = this.bm25Engine.getStats();
    this.log.info(`Saved BM25 index: ${stats.totalDocs} documents, ${stats.totalTerms} terms`);
  }

  /**
   * Remove BM25 documents for a given file
   * BM25 documents are tracked using IDs formatted as relativePath:startLine:endLine
   */
  private removeBM25DocsForFile(relativePath: string): void {
    const prefix = `${relativePath}:`;
    const removed = this.bm25Engine.removeDocumentsByPrefix(prefix);
    this.log.debug(`Removed ${removed} BM25 documents for file: ${relativePath}`);
  }

  /**
   * Generate a unique chunk ID for BM25 indexing
   */
  private getChunkId(chunk: CodeChunk): string {
    return `${chunk.relativePath}:${chunk.startLine}:${chunk.endLine}`;
  }

  /**
   * Get the BM25 engine instance (for use by search tools)
   */
  getBM25Engine(): BM25Engine {
    return this.bm25Engine;
  }

  /**
   * Get the FuzzyMatcher instance (for use by search tools)
   */
  getFuzzyMatcher(): FuzzyMatcher {
    return this.fuzzyMatcher;
  }

  /**
   * Load fuzzy symbol index from disk
   */
  private async loadFuzzyIndex(): Promise<void> {
    const fuzzyPath = join(this.config.dataDir, 'fuzzy-index.json');

    try {
      const content = await readFile(fuzzyPath, 'utf-8');
      this.fuzzyMatcher.deserialize(content);
      this.log.debug(`Loaded fuzzy index: ${this.fuzzyMatcher.size} symbols`);
    } catch {
      // Index doesn't exist yet, start fresh
      this.log.debug('No existing fuzzy index found, starting fresh');
    }
  }

  /**
   * Save fuzzy symbol index to disk
   */
  private async saveFuzzyIndex(): Promise<void> {
    const fuzzyPath = join(this.config.dataDir, 'fuzzy-index.json');

    // Ensure data directory exists
    await mkdir(dirname(fuzzyPath), { recursive: true });

    const serialized = this.fuzzyMatcher.serialize();
    await writeFile(fuzzyPath, serialized);

    this.log.info(`Saved fuzzy index: ${this.fuzzyMatcher.size} symbols`);
  }

  /**
   * Remove fuzzy symbols for a given file
   */
  private removeFuzzySymbolsForFile(relativePath: string): void {
    const prefix = `${relativePath}:`;
    const symbols = this.fuzzyMatcher.getSymbols();
    let removed = 0;

    for (const symbol of symbols) {
      if (symbol.startsWith(prefix)) {
        this.fuzzyMatcher.removeSymbol(symbol);
        removed++;
      }
    }

    if (removed > 0) {
      this.log.debug(`Removed ${removed} fuzzy symbols for file: ${relativePath}`);
    }
  }

  /**
   * Check if a chunk type should be indexed for fuzzy symbol search
   */
  private isIndexableType(type: string): boolean {
    const indexableTypes = [
      'function',
      'method',
      'class',
      'interface',
      'type',
      'enum',
      'const',
      'variable',
      'struct',
      'trait',
      'impl',
    ];
    return indexableTypes.includes(type);
  }
}
