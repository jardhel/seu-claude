/**
 * Search Ranking Improvements
 *
 * Combines multiple ranking factors to produce more relevant search results.
 * Factors include semantic similarity, keyword match, git recency, export status,
 * and entry point detection.
 */

/**
 * Weights for each ranking factor
 */
export interface RankingWeights {
  /** Weight for semantic (vector) similarity score */
  semantic: number;
  /** Weight for BM25 keyword match score */
  keyword: number;
  /** Weight for git recency score */
  gitRecency: number;
  /** Boost for exported/public symbols */
  exportBoost: number;
  /** Boost for entry point files (index, main, app, server) */
  entryPointBoost: number;
}

/**
 * Input factors for computing a ranking score
 */
export interface RankingFactors {
  /** Semantic similarity score (0-1) */
  semanticScore: number;
  /** BM25 keyword match score (0-1, normalized) */
  keywordScore: number;
  /** Git recency score (0-1) */
  gitRecencyScore: number;
  /** Whether the symbol is exported/public */
  isExported: boolean;
  /** Whether the file is an entry point */
  isEntryPoint: boolean;
}

/**
 * Input for ranking - extends RankingFactors with chunk metadata
 */
export interface RankingInput extends RankingFactors {
  chunkId: string;
  [key: string]: unknown;
}

/**
 * Output from ranking - includes final computed score
 */
export interface RankedResult extends RankingInput {
  finalScore: number;
}

/**
 * Default ranking weights based on empirical testing
 */
const DEFAULT_WEIGHTS: RankingWeights = {
  semantic: 0.5,
  keyword: 0.2,
  gitRecency: 0.1,
  exportBoost: 0.1,
  entryPointBoost: 0.1,
};

/**
 * Patterns for identifying entry point files
 */
const ENTRY_POINT_PATTERNS = [
  /\bindex\.(ts|js|tsx|jsx|py|go|rs|java|rb)$/i,
  /\bmain\.(ts|js|tsx|jsx|py|go|rs|java|rb|c|cpp)$/i,
  /\bapp\.(ts|js|tsx|jsx|py|go|rs|rb)$/i,
  /\bserver\.(ts|js|tsx|jsx|py|go|rs|rb)$/i,
  /\bmod\.rs$/i, // Rust module file
  /\b__init__\.py$/i, // Python package init
];

/**
 * Patterns for detecting exports in various languages
 */
const EXPORT_PATTERNS = [
  // TypeScript/JavaScript
  /^\s*export\s+(default\s+)?(function|const|let|var|class|interface|type|enum)/m,
  /^\s*export\s*\{/m,
  /^\s*export\s+\*/m,
  // Python __all__
  /__all__\s*=/,
  // Rust pub
  /^\s*pub\s+(fn|struct|enum|trait|type|mod|const|static)/m,
];

/**
 * Pattern for Go public exports (uppercase first letter)
 */
const GO_EXPORT_PATTERN = /^(func|type|var|const)\s+[A-Z]/m;

/**
 * SearchRanker combines multiple factors to rank search results
 */
export class SearchRanker {
  private weights: RankingWeights;

  /**
   * Create a new SearchRanker with optional custom weights
   * @param weights - Custom weights (will be normalized to sum to 1)
   */
  constructor(weights?: Partial<RankingWeights>) {
    this.weights = this.normalizeWeights({
      ...DEFAULT_WEIGHTS,
      ...weights,
    });
  }

  /**
   * Get the current ranking weights
   */
  getWeights(): RankingWeights {
    return { ...this.weights };
  }

  /**
   * Normalize weights to sum to 1.0
   */
  private normalizeWeights(weights: RankingWeights): RankingWeights {
    const sum =
      weights.semantic +
      weights.keyword +
      weights.gitRecency +
      weights.exportBoost +
      weights.entryPointBoost;

    if (sum === 0) {
      return DEFAULT_WEIGHTS;
    }

    return {
      semantic: weights.semantic / sum,
      keyword: weights.keyword / sum,
      gitRecency: weights.gitRecency / sum,
      exportBoost: weights.exportBoost / sum,
      entryPointBoost: weights.entryPointBoost / sum,
    };
  }

  /**
   * Compute the final ranking score from input factors
   * @param factors - The ranking factors for a single result
   * @returns Final score between 0 and 1
   */
  computeScore(factors: RankingFactors): number {
    // Clamp input scores to [0, 1]
    const semantic = Math.max(0, Math.min(1, factors.semanticScore));
    const keyword = Math.max(0, Math.min(1, factors.keywordScore));
    const gitRecency = Math.max(0, Math.min(1, factors.gitRecencyScore));
    const exported = factors.isExported ? 1 : 0;
    const entryPoint = factors.isEntryPoint ? 1 : 0;

    // Compute weighted sum
    const score =
      semantic * this.weights.semantic +
      keyword * this.weights.keyword +
      gitRecency * this.weights.gitRecency +
      exported * this.weights.exportBoost +
      entryPoint * this.weights.entryPointBoost;

    // Ensure final score is in [0, 1]
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Rank an array of results by their computed scores
   * @param results - Array of results with ranking factors
   * @returns Sorted array with finalScore added to each result
   */
  rankResults<T extends RankingInput>(results: T[]): (T & { finalScore: number })[] {
    // Compute scores and create ranked results
    const ranked = results.map(result => ({
      ...result,
      finalScore: this.computeScore({
        semanticScore: result.semanticScore,
        keywordScore: result.keywordScore,
        gitRecencyScore: result.gitRecencyScore,
        isExported: result.isExported,
        isEntryPoint: result.isEntryPoint,
      }),
    }));

    // Sort by finalScore descending (stable sort preserves order for equal scores)
    ranked.sort((a, b) => {
      const diff = b.finalScore - a.finalScore;
      // For equal scores, maintain original order
      if (Math.abs(diff) < 1e-10) {
        return 0;
      }
      return diff;
    });

    return ranked;
  }

  /**
   * Check if a file path is an entry point file
   * @param filePath - Path to the file
   * @returns true if the file is likely an entry point
   */
  static isEntryPointFile(filePath: string): boolean {
    return ENTRY_POINT_PATTERNS.some(pattern => pattern.test(filePath));
  }

  /**
   * Compute a recency score based on git modification date
   * Uses exponential decay: score = e^(-days/halfLife)
   *
   * @param lastModified - Date of last modification
   * @param halfLife - Days until score drops to 0.5 (default: 30)
   * @returns Score between 0 and 1
   */
  static computeGitRecencyScore(lastModified: Date | undefined | null, halfLife = 30): number {
    if (!lastModified) {
      return 0.5; // Default middle score for unknown dates
    }

    const now = Date.now();
    const modified = lastModified.getTime();
    const daysSinceModification = (now - modified) / (1000 * 60 * 60 * 24);

    // Future dates get max score
    if (daysSinceModification <= 0) {
      return 1.0;
    }

    // Exponential decay: score = e^(-days * ln(2) / halfLife)
    // This gives 1.0 for today, 0.5 for halfLife days ago
    const decayRate = Math.log(2) / halfLife;
    const score = Math.exp(-daysSinceModification * decayRate);

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Detect if code content contains exports (language-aware)
   * @param content - Code content to analyze
   * @returns true if the code contains exports
   */
  static hasExport(content: string): boolean {
    if (!content || !content.trim()) {
      return false;
    }

    // Check standard export patterns
    for (const pattern of EXPORT_PATTERNS) {
      if (pattern.test(content)) {
        return true;
      }
    }

    // Check Go exports (uppercase identifiers)
    if (GO_EXPORT_PATTERN.test(content)) {
      return true;
    }

    return false;
  }
}
