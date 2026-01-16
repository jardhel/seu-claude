/**
 * Hybrid Search - Combines BM25 keyword search with semantic vector search
 *
 * The hybrid approach provides the best of both worlds:
 * - BM25: Excellent for exact matches (function names, variables, keywords)
 * - Semantic: Excellent for conceptual similarity (finding related code)
 *
 * Final score = α × semantic_score + (1-α) × normalized_bm25_score
 * Default α = 0.7 (70% semantic, 30% keyword)
 */

import { logger } from '../utils/logger.js';

/**
 * A search result with combined scores
 */
export interface HybridResult {
  id: string;
  semanticScore: number;
  keywordScore: number;
  combinedScore: number;
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for hybrid search
 */
export interface HybridConfig {
  /** Weight for semantic search (0-1). Default: 0.7 */
  semanticWeight?: number;
}

/**
 * Combines results from semantic and keyword searches
 */
export class HybridSearcher {
  private semanticWeight: number;
  private log = logger.child('hybrid-search');

  constructor(config: HybridConfig = {}) {
    this.semanticWeight = config.semanticWeight ?? 0.7;

    if (this.semanticWeight < 0 || this.semanticWeight > 1) {
      throw new Error('semanticWeight must be between 0 and 1');
    }
  }

  /**
   * Set the semantic weight
   */
  setSemanticWeight(weight: number): void {
    if (weight < 0 || weight > 1) {
      throw new Error('semanticWeight must be between 0 and 1');
    }
    this.semanticWeight = weight;
  }

  /**
   * Get the current semantic weight
   */
  getSemanticWeight(): number {
    return this.semanticWeight;
  }

  /**
   * Combine semantic and keyword search results
   *
   * @param semanticResults - Results from vector similarity search (scores 0-1, higher is better)
   * @param keywordResults - Results from BM25 search (unbounded scores, higher is better)
   * @param limit - Maximum number of results to return
   */
  combine(
    semanticResults: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>,
    keywordResults: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>,
    limit = 10
  ): HybridResult[] {
    // Build maps for quick lookup
    const semanticMap = new Map(semanticResults.map(r => [r.id, r]));
    const keywordMap = new Map(keywordResults.map(r => [r.id, r]));

    // Get all unique IDs
    const allIds = new Set([...semanticMap.keys(), ...keywordMap.keys()]);

    // Normalize BM25 scores to 0-1 range
    const maxBM25 = Math.max(...keywordResults.map(r => r.score), 0);
    const minBM25 = Math.min(...keywordResults.map(r => r.score), 0);
    const bm25Range = maxBM25 - minBM25 || 1; // Avoid division by zero

    // Calculate combined scores
    const results: HybridResult[] = [];

    for (const id of allIds) {
      const semantic = semanticMap.get(id);
      const keyword = keywordMap.get(id);

      // Semantic score is already 0-1 (similarity from distance)
      const semanticScore = semantic?.score ?? 0;

      // Normalize BM25 score to 0-1
      const rawKeywordScore = keyword?.score ?? 0;
      const keywordScore = maxBM25 > 0 ? (rawKeywordScore - minBM25) / bm25Range : 0;

      // Calculate combined score
      const combinedScore =
        this.semanticWeight * semanticScore + (1 - this.semanticWeight) * keywordScore;

      // Use metadata from whichever source has it
      const metadata = semantic?.metadata ?? keyword?.metadata;

      results.push({
        id,
        semanticScore,
        keywordScore,
        combinedScore,
        metadata,
      });
    }

    // Sort by combined score (descending)
    results.sort((a, b) => b.combinedScore - a.combinedScore);

    this.log.debug(
      `Combined ${semanticResults.length} semantic + ${keywordResults.length} keyword results → ${Math.min(results.length, limit)} hybrid results`
    );

    return results.slice(0, limit);
  }

  /**
   * Combine with reciprocal rank fusion (RRF)
   * An alternative combination method that's less sensitive to score normalization
   *
   * RRF score = Σ 1 / (k + rank)
   * where k is a constant (default 60) and rank is the position in each list
   */
  combineRRF(
    semanticResults: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>,
    keywordResults: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>,
    limit = 10,
    k = 60
  ): HybridResult[] {
    // Build rank maps (1-indexed)
    const semanticRanks = new Map(semanticResults.map((r, i) => [r.id, i + 1]));
    const keywordRanks = new Map(keywordResults.map((r, i) => [r.id, i + 1]));
    const semanticMap = new Map(semanticResults.map(r => [r.id, r]));
    const keywordMap = new Map(keywordResults.map(r => [r.id, r]));

    // Get all unique IDs
    const allIds = new Set([...semanticRanks.keys(), ...keywordRanks.keys()]);

    // Calculate RRF scores
    const results: HybridResult[] = [];
    const maxRank = Math.max(semanticResults.length, keywordResults.length) + 1;

    for (const id of allIds) {
      const semanticRank = semanticRanks.get(id) ?? maxRank;
      const keywordRank = keywordRanks.get(id) ?? maxRank;

      const semanticRRF = this.semanticWeight / (k + semanticRank);
      const keywordRRF = (1 - this.semanticWeight) / (k + keywordRank);
      const combinedScore = semanticRRF + keywordRRF;

      const semantic = semanticMap.get(id);
      const keyword = keywordMap.get(id);

      results.push({
        id,
        semanticScore: semantic?.score ?? 0,
        keywordScore: keyword?.score ?? 0,
        combinedScore,
        metadata: semantic?.metadata ?? keyword?.metadata,
      });
    }

    results.sort((a, b) => b.combinedScore - a.combinedScore);

    return results.slice(0, limit);
  }
}
