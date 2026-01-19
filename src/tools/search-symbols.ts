/**
 * Search Symbols MCP Tool
 *
 * Provides fuzzy symbol search with typo tolerance and
 * CamelCase/snake_case normalization.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { FuzzyMatcher } from '../search/fuzzy.js';
import { logger } from '../utils/logger.js';

/**
 * Input parameters for search_symbols tool
 */
export interface SearchSymbolsInput {
  /** Pattern to search for (function/class name, can include typos) */
  pattern: string;
  /** Minimum similarity threshold (0-1, default: 0.4) */
  fuzzy_threshold?: number;
  /** Filter by symbol types (e.g., ["function", "class"]) */
  types?: string[];
  /** Maximum number of results (default: 10) */
  limit?: number;
}

/**
 * A single symbol match result
 */
export interface SymbolMatch {
  symbol: string;
  score: number;
  type: string;
  filePath: string;
  line?: number;
}

/**
 * Result from search_symbols execution
 */
export interface SearchSymbolsResult {
  success: boolean;
  matches: SymbolMatch[];
  error?: string;
  totalIndexed?: number;
}

/**
 * Search Symbols tool for MCP
 */
export class SearchSymbols {
  private log = logger.child('search-symbols');
  private dataDir: string;
  private fuzzyMatcher: FuzzyMatcher | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  /**
   * Get the tool name for MCP
   */
  getName(): string {
    return 'search_symbols';
  }

  /**
   * Get the tool description for MCP
   */
  getDescription(): string {
    return (
      'Search for functions, classes, and other symbols with fuzzy matching. ' +
      'Handles typos, case variations, and CamelCase/snake_case differences.'
    );
  }

  /**
   * Get the input schema for MCP
   */
  getInputSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The symbol pattern to search for (e.g., "getUser", "UserService")',
        },
        fuzzy_threshold: {
          type: 'number',
          description:
            'Minimum similarity score (0-1). Lower values return more results. Default: 0.4',
          minimum: 0,
          maximum: 1,
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Filter by symbol types (e.g., ["function", "class", "method", "interface"])',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return. Default: 10',
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['pattern'],
    };
  }

  /**
   * Load the fuzzy index from disk
   */
  private async loadIndex(): Promise<FuzzyMatcher> {
    if (this.fuzzyMatcher) {
      return this.fuzzyMatcher;
    }

    const indexPath = join(this.dataDir, 'fuzzy-index.json');

    try {
      const data = await readFile(indexPath, 'utf-8');
      this.fuzzyMatcher = new FuzzyMatcher();
      this.fuzzyMatcher.deserialize(data);
      this.log.debug(`Loaded fuzzy index with ${this.fuzzyMatcher.size} symbols`);
      return this.fuzzyMatcher;
    } catch (error) {
      throw new Error(`Failed to load fuzzy index: ${(error as Error).message}`);
    }
  }

  /**
   * Execute the search
   */
  async execute(input: SearchSymbolsInput): Promise<SearchSymbolsResult> {
    const { pattern, fuzzy_threshold = 0.4, types, limit = 10 } = input;

    // Handle empty pattern
    if (!pattern || pattern.trim() === '') {
      return {
        success: true,
        matches: [],
        totalIndexed: 0,
      };
    }

    try {
      const matcher = await this.loadIndex();

      // Perform the search
      const results = matcher.search(pattern.trim(), limit, fuzzy_threshold, types);

      // Transform results to output format
      const matches: SymbolMatch[] = results.map(r => ({
        symbol: r.symbol,
        score: Math.round(r.score * 100) / 100, // Round to 2 decimal places
        type: r.metadata.type,
        filePath: r.metadata.filePath,
        line: r.metadata.line,
      }));

      this.log.debug(`Found ${matches.length} matches for pattern "${pattern}"`);

      return {
        success: true,
        matches,
        totalIndexed: matcher.size,
      };
    } catch (error) {
      this.log.error(`Search failed: ${(error as Error).message}`);
      return {
        success: false,
        matches: [],
        error: (error as Error).message,
      };
    }
  }

  /**
   * Reset the cached index (useful after re-indexing)
   */
  resetCache(): void {
    this.fuzzyMatcher = null;
  }
}
