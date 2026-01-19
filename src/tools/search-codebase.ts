import { EmbeddingEngine } from '../vector/embed.js';
import { VectorStore, SearchResult } from '../vector/store.js';
import { BM25Engine, BM25Result } from '../search/bm25.js';
import { HybridSearcher } from '../search/hybrid.js';
import { SearchRanker, RankingInput } from '../search/ranker.js';
import { logger } from '../utils/logger.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import micromatch from 'micromatch';

/**
 * Scope options for filtering search results by file path patterns
 */
export interface SearchScope {
  /** Glob patterns to include - e.g., src/**, lib/** */
  includePaths?: string[];
  /** Glob patterns to exclude - e.g., *.test.ts, node_modules/** */
  excludePaths?: string[];
}

/**
 * Search mode determines how results are ranked
 */
export type SearchMode = 'semantic' | 'keyword' | 'hybrid';

export interface SearchOptions {
  query: string;
  limit?: number;
  filterType?: string;
  filterLanguage?: string;
  /** Scope to limit search to specific paths */
  scope?: SearchScope;
  /** Search mode: 'semantic' (default), 'keyword', or 'hybrid' */
  mode?: SearchMode;
  /** Weight for semantic search when using hybrid mode (0-1, default: 0.7) */
  semanticWeight?: number;
  /** Enable improved ranking (default: true) - combines semantic score with git recency, exports, and entry point detection */
  useRanking?: boolean;
}

export interface FormattedSearchResult {
  filePath: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  type: string;
  name: string | null;
  scope: string;
  language: string;
  code: string;
  score: number;
}

export class SearchCodebase {
  private embedder: EmbeddingEngine;
  private store: VectorStore;
  private dataDir: string;
  private bm25Engine: BM25Engine | null = null;
  private hybridSearcher: HybridSearcher;
  private ranker: SearchRanker;
  private log = logger.child('search-codebase');

  constructor(embedder: EmbeddingEngine, store: VectorStore, dataDir: string) {
    this.embedder = embedder;
    this.store = store;
    this.dataDir = dataDir;
    this.hybridSearcher = new HybridSearcher();
    this.ranker = new SearchRanker();
  }

  /**
   * Load BM25 index from disk (lazy loading)
   */
  private async loadBM25Index(): Promise<BM25Engine> {
    if (this.bm25Engine) {
      return this.bm25Engine;
    }

    this.bm25Engine = new BM25Engine();
    const bm25Path = join(this.dataDir, 'bm25-index.json');

    try {
      const content = await readFile(bm25Path, 'utf-8');
      this.bm25Engine.deserialize(content);
      const stats = this.bm25Engine.getStats();
      this.log.debug(`Loaded BM25 index: ${stats.totalDocs} documents`);
    } catch {
      this.log.warn('BM25 index not found - keyword search unavailable');
    }

    return this.bm25Engine;
  }

  async execute(options: SearchOptions): Promise<FormattedSearchResult[]> {
    const {
      query,
      limit = 10,
      filterType,
      filterLanguage,
      scope,
      mode = 'semantic',
      semanticWeight = 0.7,
      useRanking = true,
    } = options;

    this.log.debug(
      `Searching for: "${query}" (mode: ${mode}, limit: ${limit}, ranking: ${useRanking})`
    );

    try {
      // Fetch more results when ranking is enabled for better reranking
      const fetchLimit = useRanking ? limit * 2 : limit;
      let formatted: FormattedSearchResult[];

      switch (mode) {
        case 'keyword':
          formatted = await this.executeKeywordSearch(query, fetchLimit, scope);
          break;

        case 'hybrid':
          formatted = await this.executeHybridSearch(
            query,
            fetchLimit,
            filterType,
            filterLanguage,
            scope,
            semanticWeight
          );
          break;

        case 'semantic':
        default:
          formatted = await this.executeSemanticSearch(
            query,
            fetchLimit,
            filterType,
            filterLanguage,
            scope
          );
          break;
      }

      // Apply improved ranking if enabled
      if (useRanking && formatted.length > 0) {
        formatted = this.applyRanking(formatted, mode);
      }

      this.log.debug(`Found ${formatted.length} results`);
      return formatted.slice(0, limit);
    } catch (err) {
      this.log.error('Search failed:', err);
      throw err;
    }
  }

  /**
   * Apply improved ranking to search results
   * Combines original score with git recency, export status, and entry point detection
   */
  private applyRanking(
    results: FormattedSearchResult[],
    mode: SearchMode
  ): FormattedSearchResult[] {
    // Prepare ranking inputs
    const rankingInputs: (RankingInput & FormattedSearchResult)[] = results.map(result => {
      // Determine semantic vs keyword scores based on mode
      const isSemanticMode = mode === 'semantic';
      const isKeywordMode = mode === 'keyword';

      return {
        ...result,
        chunkId: `${result.relativePath}:${result.startLine}:${result.endLine}`,
        semanticScore: isKeywordMode ? 0 : result.score,
        keywordScore: isSemanticMode ? 0 : result.score,
        gitRecencyScore: 0.5, // Default - would need lastUpdated from store for actual value
        isExported: SearchRanker.hasExport(result.code),
        isEntryPoint: SearchRanker.isEntryPointFile(result.filePath),
      };
    });

    // Apply ranking
    const ranked = this.ranker.rankResults(rankingInputs);

    // Map back to FormattedSearchResult with updated scores
    return ranked.map(r => ({
      filePath: r.filePath,
      relativePath: r.relativePath,
      startLine: r.startLine,
      endLine: r.endLine,
      type: r.type,
      name: r.name,
      scope: r.scope,
      language: r.language,
      code: r.code,
      score: r.finalScore,
    }));
  }

  /**
   * Execute pure semantic (vector) search
   */
  private async executeSemanticSearch(
    query: string,
    limit: number,
    filterType?: string,
    filterLanguage?: string,
    scope?: SearchScope
  ): Promise<FormattedSearchResult[]> {
    // Generate query embedding
    const queryVector = await this.embedder.embedQuery(query);

    // Build filter
    let filter: string | undefined;
    const filters: string[] = [];

    if (filterType) {
      filters.push(`type = '${filterType}'`);
    }
    if (filterLanguage) {
      filters.push(`language = '${filterLanguage}'`);
    }

    if (filters.length > 0) {
      filter = filters.join(' AND ');
    }

    // Request more results if we need to filter by scope (post-filter)
    const searchLimit = scope ? limit * 3 : limit;

    // Execute search
    const results = await this.store.search(queryVector, searchLimit, filter);

    // Format results
    let formatted = results.map(r => this.formatResult(r));

    // Apply scope filtering if specified
    if (scope) {
      formatted = this.applyScopeFilter(formatted, scope);
    }

    // Apply final limit after scope filtering
    return formatted.slice(0, limit);
  }

  /**
   * Execute pure keyword (BM25) search
   */
  private async executeKeywordSearch(
    query: string,
    limit: number,
    scope?: SearchScope
  ): Promise<FormattedSearchResult[]> {
    const bm25 = await this.loadBM25Index();

    if (bm25.size === 0) {
      this.log.warn('BM25 index is empty - returning empty results');
      return [];
    }

    // Request more results if we need to filter by scope
    const searchLimit = scope ? limit * 3 : limit;
    const results = bm25.search(query, searchLimit);

    // Format BM25 results
    let formatted = results.map(r => this.formatBM25Result(r));

    // Apply scope filtering if specified
    if (scope) {
      formatted = this.applyScopeFilter(formatted, scope);
    }

    return formatted.slice(0, limit);
  }

  /**
   * Execute hybrid search combining semantic and keyword results
   */
  private async executeHybridSearch(
    query: string,
    limit: number,
    filterType?: string,
    filterLanguage?: string,
    scope?: SearchScope,
    semanticWeight = 0.7
  ): Promise<FormattedSearchResult[]> {
    // Set semantic weight
    this.hybridSearcher.setSemanticWeight(semanticWeight);

    // Get more results than needed for combination
    const overFetchLimit = limit * 3;

    // Run semantic and keyword searches in parallel
    const [semanticResults, bm25] = await Promise.all([
      this.executeSemanticSearch(query, overFetchLimit, filterType, filterLanguage),
      this.loadBM25Index(),
    ]);

    // Get keyword results
    const keywordResults = bm25.size > 0 ? bm25.search(query, overFetchLimit) : [];

    // Combine using hybrid searcher
    const hybridResults = this.hybridSearcher.combine(
      semanticResults.map(r => ({
        id: `${r.relativePath}:${r.startLine}:${r.endLine}`,
        score: r.score,
        metadata: r as unknown as Record<string, unknown>,
      })),
      keywordResults.map(r => ({
        id: r.id,
        score: r.score,
        metadata: r.metadata,
      })),
      overFetchLimit
    );

    // Map back to formatted results
    const resultMap = new Map<string, FormattedSearchResult>();

    // Add semantic results to map
    for (const r of semanticResults) {
      const id = `${r.relativePath}:${r.startLine}:${r.endLine}`;
      resultMap.set(id, r);
    }

    // Add keyword results (convert from BM25 format)
    for (const r of keywordResults) {
      if (!resultMap.has(r.id) && r.metadata) {
        resultMap.set(r.id, this.formatBM25Result(r));
      }
    }

    // Build final results using hybrid ranking
    let formatted = hybridResults
      .map(hr => {
        const result = resultMap.get(hr.id);
        if (result) {
          return { ...result, score: hr.combinedScore };
        }
        return null;
      })
      .filter((r): r is FormattedSearchResult => r !== null);

    // Apply scope filtering if specified
    if (scope) {
      formatted = this.applyScopeFilter(formatted, scope);
    }

    return formatted.slice(0, limit);
  }

  /**
   * Format a BM25 result into the standard format
   */
  private formatBM25Result(result: BM25Result): FormattedSearchResult {
    const meta = result.metadata as {
      filePath: string;
      relativePath: string;
      startLine: number;
      endLine: number;
      type: string;
      name: string | null;
      scope: string;
      language: string;
      code?: string;
    };

    return {
      filePath: meta.filePath,
      relativePath: meta.relativePath,
      startLine: meta.startLine,
      endLine: meta.endLine,
      type: meta.type,
      name: meta.name,
      scope: meta.scope,
      language: meta.language,
      code: meta.code ?? '',
      score: result.score,
    };
  }

  /**
   * Filter results based on scope (include/exclude path patterns)
   */
  private applyScopeFilter(
    results: FormattedSearchResult[],
    scope: SearchScope
  ): FormattedSearchResult[] {
    const { includePaths, excludePaths } = scope;

    return results.filter(result => {
      const path = result.relativePath;

      // Check includePaths - if specified and non-empty, path must match at least one
      if (includePaths && includePaths.length > 0) {
        if (!micromatch.isMatch(path, includePaths)) {
          return false;
        }
      }

      // Check excludePaths - if specified, path must NOT match any
      if (excludePaths && excludePaths.length > 0) {
        if (micromatch.isMatch(path, excludePaths)) {
          return false;
        }
      }

      return true;
    });
  }

  private formatResult(result: SearchResult): FormattedSearchResult {
    const { chunk, score } = result;

    return {
      filePath: chunk.filePath,
      relativePath: chunk.relativePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      type: chunk.type,
      name: chunk.name,
      scope: chunk.scope,
      language: chunk.language,
      code: chunk.code,
      score: 1 - score, // Convert distance to similarity score
    };
  }

  formatForClaude(results: FormattedSearchResult[]): string {
    if (results.length === 0) {
      return 'No results found for your query.';
    }

    const sections = results.map((r, i) => {
      const header = `## Result ${i + 1}: ${r.relativePath}:${r.startLine}-${r.endLine}`;
      const metadata = `**Type:** ${r.type} | **Scope:** ${r.scope} | **Language:** ${r.language} | **Score:** ${r.score.toFixed(3)}`;
      const code = '```' + r.language + '\n' + r.code + '\n```';

      return `${header}\n${metadata}\n\n${code}`;
    });

    return sections.join('\n\n---\n\n');
  }
}
