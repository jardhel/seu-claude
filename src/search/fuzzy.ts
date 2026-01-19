/**
 * Fuzzy Symbol Search Implementation
 *
 * Provides typo-tolerant function/class name search using:
 * - Levenshtein distance for fuzzy matching
 * - CamelCase/snake_case normalization
 */

import { logger } from '../utils/logger.js';

/**
 * Metadata associated with a symbol
 */
export interface SymbolMetadata {
  filePath: string;
  type: string;
  line?: number;
  [key: string]: unknown;
}

/**
 * Result from a fuzzy search
 */
export interface FuzzyMatchResult {
  symbol: string;
  score: number;
  metadata: SymbolMetadata;
}

/**
 * Serialized index structure
 */
interface SerializedFuzzyIndex {
  symbols: Array<[string, { normalized: string; metadata: SymbolMetadata }]>;
}

/**
 * Calculate Levenshtein distance between two strings
 *
 * The Levenshtein distance is the minimum number of single-character edits
 * (insertions, deletions, substitutions) required to transform one string into another.
 */
export function levenshteinDistance(a: string, b: string): number {
  // Handle edge cases
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Create matrix
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Normalize a symbol name for comparison
 *
 * Converts camelCase, PascalCase, and snake_case to lowercase with spaces.
 * Examples:
 * - "getUserById" -> "get user by id"
 * - "get_user_by_id" -> "get user by id"
 * - "XMLHttpRequest" -> "xml http request"
 */
export function normalizeSymbol(symbol: string): string {
  if (!symbol) return '';

  return (
    symbol
      // Insert space before uppercase letters (for camelCase/PascalCase)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Insert space before sequences of uppercase followed by lowercase (for acronyms like XMLParser)
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      // Insert space between letters and numbers
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-zA-Z])/g, '$1 $2')
      // Replace underscores with spaces
      .replace(/_/g, ' ')
      // Convert to lowercase
      .toLowerCase()
      // Normalize multiple spaces to single space
      .replace(/\s+/g, ' ')
      // Trim
      .trim()
  );
}

/**
 * Calculate similarity score between two strings (0-1)
 * Higher is more similar
 */
function calculateSimilarity(query: string, target: string): number {
  const distance = levenshteinDistance(query, target);
  const maxLength = Math.max(query.length, target.length);

  if (maxLength === 0) return 1;

  return 1 - distance / maxLength;
}

/**
 * Fuzzy symbol matcher for typo-tolerant code search
 */
export class FuzzyMatcher {
  private log = logger.child('fuzzy');

  // Symbol index: originalName -> { normalized, metadata }
  private symbols: Map<string, { normalized: string; metadata: SymbolMetadata }> = new Map();

  /**
   * Get the number of symbols in the index
   */
  get size(): number {
    return this.symbols.size;
  }

  /**
   * Add a symbol to the index
   */
  addSymbol(name: string, metadata: SymbolMetadata): void {
    const normalized = normalizeSymbol(name);
    this.symbols.set(name, { normalized, metadata });
  }

  /**
   * Remove a symbol from the index
   */
  removeSymbol(name: string): boolean {
    return this.symbols.delete(name);
  }

  /**
   * Check if a symbol exists in the index
   */
  hasSymbol(name: string): boolean {
    return this.symbols.has(name);
  }

  /**
   * Get all symbol names in the index
   */
  getSymbols(): string[] {
    return Array.from(this.symbols.keys());
  }

  /**
   * Clear all symbols from the index
   */
  clear(): void {
    this.symbols.clear();
  }

  /**
   * Search for symbols matching a query
   *
   * @param query - The search query (can be partial, typo'd, any case)
   * @param limit - Maximum number of results to return
   * @param threshold - Minimum similarity score (0-1) to include in results
   * @param types - Optional filter by symbol types
   * @returns Sorted array of matching symbols with scores
   */
  search(
    query: string,
    limit = 10,
    threshold = 0.3,
    types?: string[]
  ): FuzzyMatchResult[] {
    if (!query) return [];

    const normalizedQuery = normalizeSymbol(query);
    const queryLower = query.toLowerCase();
    const results: FuzzyMatchResult[] = [];

    for (const [symbol, { normalized, metadata }] of this.symbols) {
      // Filter by type if specified
      if (types && types.length > 0 && !types.includes(metadata.type)) {
        continue;
      }

      // Calculate similarity scores using multiple approaches
      const symbolLower = symbol.toLowerCase();

      // Exact match gets perfect score
      if (symbolLower === queryLower) {
        results.push({ symbol, score: 1.0, metadata });
        continue;
      }

      // Calculate normalized similarity (handles case variations)
      const normalizedSimilarity = calculateSimilarity(normalizedQuery, normalized);

      // Calculate direct similarity (for typos in original form)
      const directSimilarity = calculateSimilarity(queryLower, symbolLower);

      // Check for substring match (boost score if query is contained)
      const substringBoost = symbolLower.includes(queryLower) || normalized.includes(normalizedQuery) ? 0.2 : 0;

      // Use the best score
      const score = Math.min(1.0, Math.max(normalizedSimilarity, directSimilarity) + substringBoost);

      if (score >= threshold) {
        results.push({ symbol, score, metadata });
      }
    }

    // Sort by score descending, then by symbol name for stability
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.symbol.localeCompare(b.symbol);
    });

    // Apply limit
    return results.slice(0, limit);
  }

  /**
   * Serialize the index to JSON
   */
  serialize(): string {
    const data: SerializedFuzzyIndex = {
      symbols: Array.from(this.symbols.entries()),
    };
    return JSON.stringify(data);
  }

  /**
   * Deserialize the index from JSON
   */
  deserialize(json: string): void {
    const data = JSON.parse(json) as SerializedFuzzyIndex;
    this.symbols = new Map(data.symbols);
    this.log.debug(`Deserialized fuzzy index with ${this.symbols.size} symbols`);
  }
}
