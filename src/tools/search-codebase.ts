import { EmbeddingEngine } from '../vector/embed.js';
import { VectorStore, SearchResult } from '../vector/store.js';
import { logger } from '../utils/logger.js';

export interface SearchOptions {
  query: string;
  limit?: number;
  filterType?: string;
  filterLanguage?: string;
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
  private log = logger.child('search-codebase');

  constructor(embedder: EmbeddingEngine, store: VectorStore) {
    this.embedder = embedder;
    this.store = store;
  }

  async execute(options: SearchOptions): Promise<FormattedSearchResult[]> {
    const { query, limit = 10, filterType, filterLanguage } = options;

    this.log.debug(`Searching for: "${query}" (limit: ${limit})`);

    try {
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

      // Execute search
      const results = await this.store.search(queryVector, limit, filter);

      // Format results
      const formatted = results.map(r => this.formatResult(r));

      this.log.debug(`Found ${formatted.length} results`);

      return formatted;
    } catch (err) {
      this.log.error('Search failed:', err);
      throw err;
    }
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
