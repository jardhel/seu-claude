/**
 * Tests for Hybrid Search (BM25 + Semantic)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { HybridSearcher } from '../../search/hybrid.js';

describe('HybridSearcher', () => {
  let searcher: HybridSearcher;

  beforeEach(() => {
    searcher = new HybridSearcher();
  });

  describe('constructor', () => {
    it('should create with default semantic weight of 0.7', () => {
      expect(searcher.getSemanticWeight()).toBe(0.7);
    });

    it('should accept custom semantic weight', () => {
      const custom = new HybridSearcher({ semanticWeight: 0.5 });
      expect(custom.getSemanticWeight()).toBe(0.5);
    });

    it('should throw for invalid weight', () => {
      expect(() => new HybridSearcher({ semanticWeight: 1.5 })).toThrow();
      expect(() => new HybridSearcher({ semanticWeight: -0.1 })).toThrow();
    });
  });

  describe('setSemanticWeight', () => {
    it('should update the semantic weight', () => {
      searcher.setSemanticWeight(0.8);
      expect(searcher.getSemanticWeight()).toBe(0.8);
    });

    it('should throw for invalid weight', () => {
      expect(() => searcher.setSemanticWeight(1.5)).toThrow();
      expect(() => searcher.setSemanticWeight(-0.1)).toThrow();
    });
  });

  describe('combine', () => {
    it('should combine results from both sources', () => {
      const semantic = [
        { id: 'doc1', score: 0.9 },
        { id: 'doc2', score: 0.7 },
      ];
      const keyword = [
        { id: 'doc2', score: 10 },
        { id: 'doc3', score: 5 },
      ];

      const results = searcher.combine(semantic, keyword);

      // Should have all 3 documents
      expect(results.length).toBe(3);
      const ids = results.map(r => r.id);
      expect(ids).toContain('doc1');
      expect(ids).toContain('doc2');
      expect(ids).toContain('doc3');
    });

    it('should rank documents in both lists higher', () => {
      // doc2 appears in both semantic and keyword results
      const semantic = [
        { id: 'doc1', score: 0.8 },
        { id: 'doc2', score: 0.7 },
      ];
      const keyword = [
        { id: 'doc2', score: 10 },
        { id: 'doc3', score: 8 },
      ];

      const results = searcher.combine(semantic, keyword);

      // doc2 should be ranked high since it's in both lists
      const doc2Idx = results.findIndex(r => r.id === 'doc2');
      expect(doc2Idx).toBeLessThanOrEqual(1);
    });

    it('should respect limit parameter', () => {
      const semantic = [
        { id: 'doc1', score: 0.9 },
        { id: 'doc2', score: 0.8 },
        { id: 'doc3', score: 0.7 },
      ];
      const keyword = [
        { id: 'doc4', score: 10 },
        { id: 'doc5', score: 8 },
      ];

      const results = searcher.combine(semantic, keyword, 2);
      expect(results.length).toBe(2);
    });

    it('should handle empty semantic results', () => {
      const semantic: Array<{ id: string; score: number }> = [];
      const keyword = [
        { id: 'doc1', score: 10 },
        { id: 'doc2', score: 5 },
      ];

      const results = searcher.combine(semantic, keyword);
      expect(results.length).toBe(2);
    });

    it('should handle empty keyword results', () => {
      const semantic = [
        { id: 'doc1', score: 0.9 },
        { id: 'doc2', score: 0.7 },
      ];
      const keyword: Array<{ id: string; score: number }> = [];

      const results = searcher.combine(semantic, keyword);
      expect(results.length).toBe(2);
    });

    it('should handle both empty results', () => {
      const results = searcher.combine([], []);
      expect(results).toEqual([]);
    });

    it('should preserve metadata', () => {
      const semantic = [{ id: 'doc1', score: 0.9, metadata: { file: 'a.ts' } }];
      const keyword = [{ id: 'doc2', score: 10, metadata: { file: 'b.ts' } }];

      const results = searcher.combine(semantic, keyword);

      const doc1 = results.find(r => r.id === 'doc1');
      const doc2 = results.find(r => r.id === 'doc2');
      expect(doc1?.metadata).toEqual({ file: 'a.ts' });
      expect(doc2?.metadata).toEqual({ file: 'b.ts' });
    });

    it('should sort by combined score descending', () => {
      const semantic = [
        { id: 'doc1', score: 0.5 },
        { id: 'doc2', score: 0.9 },
      ];
      const keyword = [
        { id: 'doc1', score: 10 },
        { id: 'doc2', score: 2 },
      ];

      const results = searcher.combine(semantic, keyword);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].combinedScore).toBeGreaterThanOrEqual(results[i].combinedScore);
      }
    });

    it('should weight semantic vs keyword according to semanticWeight', () => {
      // With 100% semantic weight
      const pureSemanticSearcher = new HybridSearcher({ semanticWeight: 1.0 });
      const semantic = [
        { id: 'doc1', score: 0.9 },
        { id: 'doc2', score: 0.3 },
      ];
      const keyword = [
        { id: 'doc2', score: 100 }, // High keyword score
        { id: 'doc1', score: 1 },
      ];

      const results = pureSemanticSearcher.combine(semantic, keyword);
      // With pure semantic, doc1 should be first
      expect(results[0].id).toBe('doc1');

      // With 100% keyword weight
      const pureKeywordSearcher = new HybridSearcher({ semanticWeight: 0 });
      const keywordResults = pureKeywordSearcher.combine(semantic, keyword);
      // With pure keyword, doc2 should be first
      expect(keywordResults[0].id).toBe('doc2');
    });
  });

  describe('combineRRF', () => {
    it('should combine using reciprocal rank fusion', () => {
      const semantic = [
        { id: 'doc1', score: 0.9 },
        { id: 'doc2', score: 0.7 },
      ];
      const keyword = [
        { id: 'doc2', score: 10 },
        { id: 'doc3', score: 5 },
      ];

      const results = searcher.combineRRF(semantic, keyword);

      expect(results.length).toBe(3);
      // doc2 should be high since it's ranked well in both lists
      const doc2Idx = results.findIndex(r => r.id === 'doc2');
      expect(doc2Idx).toBeLessThanOrEqual(1);
    });

    it('should respect limit parameter', () => {
      const semantic = [
        { id: 'doc1', score: 0.9 },
        { id: 'doc2', score: 0.8 },
        { id: 'doc3', score: 0.7 },
      ];
      const keyword = [{ id: 'doc4', score: 10 }];

      const results = searcher.combineRRF(semantic, keyword, 2);
      expect(results.length).toBe(2);
    });

    it('should handle documents only in one list', () => {
      const semantic = [{ id: 'doc1', score: 0.9 }];
      const keyword = [{ id: 'doc2', score: 10 }];

      const results = searcher.combineRRF(semantic, keyword);
      expect(results.length).toBe(2);
    });
  });

  describe('integration scenarios', () => {
    it('should boost exact function name matches', () => {
      // Scenario: User searches for "getUserById"
      // - Semantic finds conceptually similar functions
      // - BM25 finds exact name matches

      const semantic = [
        { id: 'findUser', score: 0.85, metadata: { name: 'findUserByEmail' } },
        { id: 'getUser', score: 0.82, metadata: { name: 'getUserById' } },
        { id: 'userLookup', score: 0.75, metadata: { name: 'lookupUser' } },
      ];

      const keyword = [
        { id: 'getUser', score: 15, metadata: { name: 'getUserById' } }, // Exact match
        { id: 'getUserData', score: 8, metadata: { name: 'getUserData' } },
      ];

      const results = searcher.combine(semantic, keyword);

      // getUser should be first due to combination of good semantic + exact keyword
      expect(results[0].id).toBe('getUser');
    });

    it('should handle code similarity without keyword match', () => {
      // Scenario: User searches for "fetch user data"
      // - Semantic finds similar concepts
      // - BM25 might not find exact keywords

      const semantic = [
        { id: 'loadUserProfile', score: 0.88 },
        { id: 'getUserDetails', score: 0.85 },
        { id: 'fetchCustomerInfo', score: 0.72 },
      ];

      // No keyword matches
      const keyword: Array<{ id: string; score: number }> = [];

      const results = searcher.combine(semantic, keyword);

      // Should still return semantic results
      expect(results.length).toBe(3);
      expect(results[0].id).toBe('loadUserProfile');
    });
  });
});
