/**
 * BM25 (Best Match 25) Text Search Implementation
 *
 * BM25 is a probabilistic ranking function used to estimate the relevance
 * of documents to a search query. It's particularly effective for exact
 * keyword matching, complementing semantic search.
 */

import { logger } from '../utils/logger.js';

/**
 * Configuration for BM25 algorithm
 */
export interface BM25Config {
  /** Term frequency saturation parameter (default: 1.2) */
  k1?: number;
  /** Document length normalization parameter (default: 0.75) */
  b?: number;
}

/**
 * A document in the BM25 index
 */
export interface BM25Document {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

/**
 * Search result from BM25
 */
export interface BM25Result {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Internal term entry for inverted index
 */
interface TermEntry {
  docId: string;
  termFrequency: number;
}

/**
 * BM25 search engine for text-based code search
 */
export class BM25Engine {
  private k1: number;
  private b: number;
  private log = logger.child('bm25');

  // Inverted index: term -> documents containing the term
  private invertedIndex: Map<string, TermEntry[]> = new Map();

  // Document metadata
  private documents: Map<string, { length: number; metadata?: Record<string, unknown> }> =
    new Map();

  // Statistics for IDF calculation
  private totalDocs = 0;
  private avgDocLength = 0;
  private totalLength = 0;

  constructor(config: BM25Config = {}) {
    this.k1 = config.k1 ?? 1.2;
    this.b = config.b ?? 0.75;
  }

  /**
   * Tokenize text into terms for indexing/searching
   */
  private tokenize(text: string): string[] {
    // Split on non-alphanumeric characters, convert to lowercase
    // Also handle camelCase and snake_case
    const tokens = text
      // Split camelCase: "getUserById" -> "get User By Id"
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Split snake_case: "get_user_by_id" -> "get user by id"
      .replace(/_/g, ' ')
      // Remove special characters and split
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 1); // Filter single chars

    return tokens;
  }

  /**
   * Add a document to the index
   */
  addDocument(doc: BM25Document): void {
    const tokens = this.tokenize(doc.text);
    const docLength = tokens.length;

    // Remove existing document if updating
    if (this.documents.has(doc.id)) {
      this.removeDocument(doc.id);
    }

    // Store document metadata
    this.documents.set(doc.id, { length: docLength, metadata: doc.metadata });

    // Update statistics
    this.totalDocs++;
    this.totalLength += docLength;
    this.avgDocLength = this.totalLength / this.totalDocs;

    // Count term frequencies
    const termFreqs = new Map<string, number>();
    for (const token of tokens) {
      termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
    }

    // Add to inverted index
    for (const [term, freq] of termFreqs) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, []);
      }
      this.invertedIndex.get(term)!.push({
        docId: doc.id,
        termFrequency: freq,
      });
    }
  }

  /**
   * Add multiple documents to the index
   */
  addDocuments(docs: BM25Document[]): void {
    for (const doc of docs) {
      this.addDocument(doc);
    }
    this.log.debug(`Indexed ${docs.length} documents, total: ${this.totalDocs}`);
  }

  /**
   * Remove a document from the index
   */
  removeDocument(docId: string): boolean {
    const docInfo = this.documents.get(docId);
    if (!docInfo) return false;

    // Update statistics
    this.totalDocs--;
    this.totalLength -= docInfo.length;
    this.avgDocLength = this.totalDocs > 0 ? this.totalLength / this.totalDocs : 0;

    // Remove from inverted index
    for (const [term, entries] of this.invertedIndex) {
      const filtered = entries.filter(e => e.docId !== docId);
      if (filtered.length === 0) {
        this.invertedIndex.delete(term);
      } else {
        this.invertedIndex.set(term, filtered);
      }
    }

    // Remove document metadata
    this.documents.delete(docId);

    return true;
  }

  /**
   * Calculate IDF (Inverse Document Frequency) for a term
   */
  private idf(term: string): number {
    const entries = this.invertedIndex.get(term);
    const docFreq = entries?.length ?? 0;

    // BM25 IDF formula
    return Math.log((this.totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);
  }

  /**
   * Search for documents matching the query
   */
  search(query: string, limit = 10): BM25Result[] {
    const queryTerms = this.tokenize(query);

    if (queryTerms.length === 0) {
      return [];
    }

    // Calculate scores for each document
    const scores = new Map<string, number>();

    for (const term of queryTerms) {
      const entries = this.invertedIndex.get(term);
      if (!entries) continue;

      const termIdf = this.idf(term);

      for (const entry of entries) {
        const docInfo = this.documents.get(entry.docId);
        if (!docInfo) continue;

        // BM25 term score
        const tf = entry.termFrequency;
        const docLength = docInfo.length;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
        const termScore = termIdf * (numerator / denominator);

        // Accumulate score
        scores.set(entry.docId, (scores.get(entry.docId) || 0) + termScore);
      }
    }

    // Sort by score and return top results
    const results: BM25Result[] = [];
    for (const [docId, score] of scores) {
      const docInfo = this.documents.get(docId);
      results.push({
        id: docId,
        score,
        metadata: docInfo?.metadata,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.invertedIndex.clear();
    this.documents.clear();
    this.totalDocs = 0;
    this.totalLength = 0;
    this.avgDocLength = 0;
  }

  /**
   * Get statistics about the index
   */
  getStats(): { totalDocs: number; totalTerms: number; avgDocLength: number } {
    return {
      totalDocs: this.totalDocs,
      totalTerms: this.invertedIndex.size,
      avgDocLength: this.avgDocLength,
    };
  }

  /**
   * Serialize the index to JSON
   */
  serialize(): string {
    return JSON.stringify({
      k1: this.k1,
      b: this.b,
      totalDocs: this.totalDocs,
      totalLength: this.totalLength,
      avgDocLength: this.avgDocLength,
      invertedIndex: Array.from(this.invertedIndex.entries()),
      documents: Array.from(this.documents.entries()),
    });
  }

  /**
   * Deserialize the index from JSON
   */
  deserialize(json: string): void {
    const data = JSON.parse(json);
    this.k1 = data.k1;
    this.b = data.b;
    this.totalDocs = data.totalDocs;
    this.totalLength = data.totalLength;
    this.avgDocLength = data.avgDocLength;
    this.invertedIndex = new Map(data.invertedIndex);
    this.documents = new Map(data.documents);
  }

  /**
   * Check if a document exists in the index
   */
  hasDocument(docId: string): boolean {
    return this.documents.has(docId);
  }

  /**
   * Get the number of documents in the index
   */
  get size(): number {
    return this.totalDocs;
  }

  /**
   * Get all document IDs in the index
   */
  getDocumentIds(): string[] {
    return Array.from(this.documents.keys());
  }

  /**
   * Remove all documents matching a prefix
   */
  removeDocumentsByPrefix(prefix: string): number {
    const idsToRemove = this.getDocumentIds().filter(id => id.startsWith(prefix));
    for (const id of idsToRemove) {
      this.removeDocument(id);
    }
    return idsToRemove.length;
  }
}
