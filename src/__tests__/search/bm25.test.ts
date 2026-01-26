/**
 * Tests for BM25 Text Search Engine
 */
import { BM25Engine } from '../../search/bm25.js';

describe('BM25Engine', () => {
  let engine: BM25Engine;

  beforeEach(() => {
    engine = new BM25Engine();
  });

  describe('constructor', () => {
    it('should create engine with default parameters', () => {
      expect(engine).toBeInstanceOf(BM25Engine);
      expect(engine.size).toBe(0);
    });

    it('should accept custom k1 and b parameters', () => {
      const customEngine = new BM25Engine({ k1: 1.5, b: 0.8 });
      expect(customEngine).toBeInstanceOf(BM25Engine);
    });
  });

  describe('addDocument', () => {
    it('should add a document to the index', () => {
      engine.addDocument({ id: 'doc1', text: 'hello world' });
      expect(engine.size).toBe(1);
      expect(engine.hasDocument('doc1')).toBe(true);
    });

    it('should handle multiple documents', () => {
      engine.addDocument({ id: 'doc1', text: 'hello world' });
      engine.addDocument({ id: 'doc2', text: 'goodbye world' });
      expect(engine.size).toBe(2);
    });

    it('should update existing document', () => {
      engine.addDocument({ id: 'doc1', text: 'original text' });
      engine.addDocument({ id: 'doc1', text: 'updated text' });
      expect(engine.size).toBe(1);
    });

    it('should store metadata', () => {
      engine.addDocument({
        id: 'doc1',
        text: 'hello world',
        metadata: { filePath: 'test.ts' },
      });
      const results = engine.search('hello');
      expect(results[0].metadata).toEqual({ filePath: 'test.ts' });
    });
  });

  describe('addDocuments', () => {
    it('should add multiple documents at once', () => {
      engine.addDocuments([
        { id: 'doc1', text: 'hello world' },
        { id: 'doc2', text: 'goodbye world' },
        { id: 'doc3', text: 'hello again' },
      ]);
      expect(engine.size).toBe(3);
    });
  });

  describe('removeDocument', () => {
    it('should remove a document from the index', () => {
      engine.addDocument({ id: 'doc1', text: 'hello world' });
      expect(engine.removeDocument('doc1')).toBe(true);
      expect(engine.size).toBe(0);
      expect(engine.hasDocument('doc1')).toBe(false);
    });

    it('should return false for non-existent document', () => {
      expect(engine.removeDocument('nonexistent')).toBe(false);
    });

    it('should not affect other documents', () => {
      engine.addDocument({ id: 'doc1', text: 'hello world' });
      engine.addDocument({ id: 'doc2', text: 'goodbye world' });
      engine.removeDocument('doc1');
      expect(engine.size).toBe(1);
      expect(engine.hasDocument('doc2')).toBe(true);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      engine.addDocuments([
        { id: 'doc1', text: 'function getUserById returns the user object' },
        { id: 'doc2', text: 'class UserService handles user authentication' },
        { id: 'doc3', text: 'async function fetchData from the API' },
        { id: 'doc4', text: 'interface User with id and name properties' },
      ]);
    });

    it('should find documents containing query terms', () => {
      const results = engine.search('user');
      expect(results.length).toBeGreaterThan(0);
      // Should find docs containing "user" (doc1, doc2, doc4)
      const ids = results.map(r => r.id);
      expect(ids).toContain('doc1');
      expect(ids).toContain('doc2');
    });

    it('should rank exact matches higher', () => {
      const results = engine.search('getUserById');
      expect(results.length).toBeGreaterThan(0);
      // doc1 should be first as it contains the exact function name
      expect(results[0].id).toBe('doc1');
    });

    it('should return empty array for no matches', () => {
      const results = engine.search('nonexistent term xyz');
      expect(results).toEqual([]);
    });

    it('should respect limit parameter', () => {
      const results = engine.search('user', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle empty query', () => {
      const results = engine.search('');
      expect(results).toEqual([]);
    });

    it('should handle camelCase queries', () => {
      const results = engine.search('UserService');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('doc2');
    });

    it('should handle snake_case queries', () => {
      engine.addDocument({ id: 'snake', text: 'get_user_by_id function' });
      const results = engine.search('get_user_by_id');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('snake');
    });

    it('should return scores in descending order', () => {
      const results = engine.search('user');
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should give higher scores to documents with more matching terms', () => {
      engine.addDocument({
        id: 'many_users',
        text: 'user user user user user',
      });
      const results = engine.search('user');
      // The document with repeated "user" should score high
      expect(results[0].id).toBe('many_users');
    });
  });

  describe('clear', () => {
    it('should remove all documents', () => {
      engine.addDocuments([
        { id: 'doc1', text: 'hello' },
        { id: 'doc2', text: 'world' },
      ]);
      engine.clear();
      expect(engine.size).toBe(0);
      expect(engine.search('hello')).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      engine.addDocuments([
        { id: 'doc1', text: 'hello world foo' },
        { id: 'doc2', text: 'goodbye world bar' },
      ]);
      const stats = engine.getStats();
      expect(stats.totalDocs).toBe(2);
      expect(stats.totalTerms).toBeGreaterThan(0);
      expect(stats.avgDocLength).toBe(3); // 3 tokens each
    });
  });

  describe('serialize/deserialize', () => {
    it('should serialize and deserialize the index', () => {
      engine.addDocuments([
        { id: 'doc1', text: 'hello world', metadata: { type: 'greeting' } },
        { id: 'doc2', text: 'goodbye world' },
      ]);

      const serialized = engine.serialize();
      expect(typeof serialized).toBe('string');

      const newEngine = new BM25Engine();
      newEngine.deserialize(serialized);

      expect(newEngine.size).toBe(2);
      expect(newEngine.hasDocument('doc1')).toBe(true);

      const results = newEngine.search('hello');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('doc1');
      expect(results[0].metadata).toEqual({ type: 'greeting' });
    });
  });

  describe('code search scenarios', () => {
    beforeEach(() => {
      engine.addDocuments([
        {
          id: 'auth-handler',
          text: 'async function handleAuthentication(req, res) { validateToken(req.token); }',
        },
        {
          id: 'token-validator',
          text: 'function validateToken(token) { return jwt.verify(token, secret); }',
        },
        {
          id: 'user-controller',
          text: 'class UserController { getUser(id) { return userService.findById(id); } }',
        },
        {
          id: 'database',
          text: 'async function connectDatabase() { await mongoose.connect(uri); }',
        },
      ]);
    });

    it('should find authentication related code', () => {
      const results = engine.search('authentication');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('auth-handler');
    });

    it('should find token validation', () => {
      const results = engine.search('validateToken');
      expect(results.length).toBeGreaterThan(0);
      // Both auth-handler and token-validator mention validateToken
      const ids = results.map(r => r.id);
      expect(ids).toContain('token-validator');
      expect(ids).toContain('auth-handler');
    });

    it('should find by function parameters', () => {
      const results = engine.search('req res');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('auth-handler');
    });

    it('should find database connection code', () => {
      const results = engine.search('connect database mongoose');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('database');
    });
  });
});
