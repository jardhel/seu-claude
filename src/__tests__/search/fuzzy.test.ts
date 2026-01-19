/**
 * Fuzzy Symbol Search Tests
 *
 * Tests for typo-tolerant function/class name search with
 * CamelCase/snake_case normalization.
 */

import {
  FuzzyMatcher,
  normalizeSymbol,
  levenshteinDistance,
} from '../../search/fuzzy.js';

describe('FuzzyMatcher', () => {
  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
      expect(levenshteinDistance('getUserById', 'getUserById')).toBe(0);
    });

    it('should return correct distance for single character difference', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1); // substitution
      expect(levenshteinDistance('cat', 'cats')).toBe(1); // insertion
      expect(levenshteinDistance('cats', 'cat')).toBe(1); // deletion
    });

    it('should handle empty strings', () => {
      expect(levenshteinDistance('', '')).toBe(0);
      expect(levenshteinDistance('hello', '')).toBe(5);
      expect(levenshteinDistance('', 'hello')).toBe(5);
    });

    it('should calculate distance for common typos', () => {
      expect(levenshteinDistance('getUser', 'getUsr')).toBe(1); // missing 'e'
      expect(levenshteinDistance('function', 'funciton')).toBe(2); // transposition
      expect(levenshteinDistance('authenticate', 'authentcate')).toBe(1); // missing 'i'
    });

    it('should handle case differences', () => {
      // Note: Levenshtein is case-sensitive by default
      expect(levenshteinDistance('Hello', 'hello')).toBe(1);
      expect(levenshteinDistance('GetUser', 'getUser')).toBe(1);
    });
  });

  describe('normalizeSymbol', () => {
    it('should convert camelCase to lowercase with spaces', () => {
      expect(normalizeSymbol('getUserById')).toBe('get user by id');
      expect(normalizeSymbol('XMLHttpRequest')).toBe('xml http request');
      expect(normalizeSymbol('parseJSON')).toBe('parse json');
    });

    it('should convert snake_case to lowercase with spaces', () => {
      expect(normalizeSymbol('get_user_by_id')).toBe('get user by id');
      expect(normalizeSymbol('PARSE_JSON_DATA')).toBe('parse json data');
    });

    it('should convert PascalCase to lowercase with spaces', () => {
      expect(normalizeSymbol('GetUserById')).toBe('get user by id');
      expect(normalizeSymbol('UserService')).toBe('user service');
    });

    it('should handle mixed formats', () => {
      expect(normalizeSymbol('get_userById')).toBe('get user by id');
      expect(normalizeSymbol('XMLParser_v2')).toBe('xml parser v 2');
    });

    it('should handle single words', () => {
      expect(normalizeSymbol('user')).toBe('user');
      expect(normalizeSymbol('USER')).toBe('user');
      expect(normalizeSymbol('User')).toBe('user');
    });

    it('should handle numbers', () => {
      expect(normalizeSymbol('getUser2')).toBe('get user 2');
      expect(normalizeSymbol('user123')).toBe('user 123');
      expect(normalizeSymbol('v2Parser')).toBe('v 2 parser');
    });

    it('should handle empty string', () => {
      expect(normalizeSymbol('')).toBe('');
    });
  });

  describe('FuzzyMatcher class', () => {
    let matcher: FuzzyMatcher;

    beforeEach(() => {
      matcher = new FuzzyMatcher();
    });

    describe('addSymbol', () => {
      it('should add symbols to the index', () => {
        matcher.addSymbol('getUserById', { filePath: 'user.ts', type: 'function' });
        expect(matcher.size).toBe(1);
      });

      it('should update existing symbols', () => {
        matcher.addSymbol('getUserById', { filePath: 'user.ts', type: 'function' });
        matcher.addSymbol('getUserById', { filePath: 'updated.ts', type: 'function' });
        expect(matcher.size).toBe(1);
      });

      it('should handle multiple symbols', () => {
        matcher.addSymbol('getUserById', { filePath: 'user.ts', type: 'function' });
        matcher.addSymbol('getOrderById', { filePath: 'order.ts', type: 'function' });
        matcher.addSymbol('UserService', { filePath: 'service.ts', type: 'class' });
        expect(matcher.size).toBe(3);
      });
    });

    describe('search', () => {
      beforeEach(() => {
        // Add test symbols
        matcher.addSymbol('getUserById', { filePath: 'user.ts', type: 'function', line: 10 });
        matcher.addSymbol('getOrderById', { filePath: 'order.ts', type: 'function', line: 20 });
        matcher.addSymbol('UserService', { filePath: 'service.ts', type: 'class', line: 1 });
        matcher.addSymbol('authenticate', { filePath: 'auth.ts', type: 'function', line: 5 });
        matcher.addSymbol('validateUser', { filePath: 'validation.ts', type: 'function', line: 15 });
        matcher.addSymbol('get_user_by_name', {
          filePath: 'user.ts',
          type: 'function',
          line: 50,
        });
      });

      it('should find exact matches with score 1.0', () => {
        const results = matcher.search('getUserById');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].symbol).toBe('getUserById');
        expect(results[0].score).toBe(1.0);
      });

      it('should find matches with typos', () => {
        const results = matcher.search('getUsr'); // typo
        expect(results.length).toBeGreaterThan(0);
        // Should find getUserById or similar
        const hasUserMatch = results.some(r => r.symbol.toLowerCase().includes('user'));
        expect(hasUserMatch).toBe(true);
      });

      it('should be case-insensitive', () => {
        const results1 = matcher.search('GETUSERBYID');
        const results2 = matcher.search('getuserbyid');
        expect(results1.length).toBeGreaterThan(0);
        expect(results2.length).toBeGreaterThan(0);
        expect(results1[0].symbol).toBe(results2[0].symbol);
      });

      it('should match camelCase with snake_case', () => {
        const results = matcher.search('get_user_by_id');
        expect(results.length).toBeGreaterThan(0);
        // Should find both getUserById and get_user_by_name
        const symbols = results.map(r => r.symbol);
        expect(symbols).toContain('getUserById');
      });

      it('should respect the limit parameter', () => {
        const results = matcher.search('get', 2);
        expect(results.length).toBeLessThanOrEqual(2);
      });

      it('should respect the threshold parameter', () => {
        const resultsLowThreshold = matcher.search('xyz', 10, 0.1);
        const resultsHighThreshold = matcher.search('xyz', 10, 0.9);
        expect(resultsHighThreshold.length).toBeLessThanOrEqual(resultsLowThreshold.length);
      });

      it('should return empty array for no matches', () => {
        const results = matcher.search('xyzabc123', 10, 0.9);
        expect(results).toEqual([]);
      });

      it('should include metadata in results', () => {
        const results = matcher.search('getUserById');
        expect(results[0].metadata).toBeDefined();
        expect(results[0].metadata.filePath).toBe('user.ts');
        expect(results[0].metadata.type).toBe('function');
        expect(results[0].metadata.line).toBe(10);
      });

      it('should sort results by score descending', () => {
        const results = matcher.search('user');
        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
        }
      });
    });

    describe('searchByType', () => {
      beforeEach(() => {
        matcher.addSymbol('getUserById', { filePath: 'user.ts', type: 'function' });
        matcher.addSymbol('UserService', { filePath: 'service.ts', type: 'class' });
        matcher.addSymbol('IUserRepository', { filePath: 'repo.ts', type: 'interface' });
        matcher.addSymbol('getOrderById', { filePath: 'order.ts', type: 'function' });
      });

      it('should filter results by type', () => {
        const functions = matcher.search('user', 10, 0.3, ['function']);
        const classes = matcher.search('user', 10, 0.3, ['class']);

        expect(functions.every(r => r.metadata.type === 'function')).toBe(true);
        expect(classes.every(r => r.metadata.type === 'class')).toBe(true);
      });

      it('should accept multiple types', () => {
        const results = matcher.search('user', 10, 0.3, ['function', 'class']);
        const types = new Set(results.map(r => r.metadata.type));
        expect(types.has('interface')).toBe(false);
      });
    });

    describe('removeSymbol', () => {
      it('should remove a symbol from the index', () => {
        matcher.addSymbol('getUserById', { filePath: 'user.ts', type: 'function' });
        expect(matcher.size).toBe(1);

        matcher.removeSymbol('getUserById');
        expect(matcher.size).toBe(0);
      });

      it('should return true if symbol was removed', () => {
        matcher.addSymbol('getUserById', { filePath: 'user.ts', type: 'function' });
        expect(matcher.removeSymbol('getUserById')).toBe(true);
      });

      it('should return false if symbol did not exist', () => {
        expect(matcher.removeSymbol('nonExistent')).toBe(false);
      });
    });

    describe('clear', () => {
      it('should remove all symbols', () => {
        matcher.addSymbol('func1', { filePath: 'a.ts', type: 'function' });
        matcher.addSymbol('func2', { filePath: 'b.ts', type: 'function' });
        matcher.addSymbol('Class1', { filePath: 'c.ts', type: 'class' });
        expect(matcher.size).toBe(3);

        matcher.clear();
        expect(matcher.size).toBe(0);
      });
    });

    describe('serialization', () => {
      it('should serialize and deserialize the index', () => {
        matcher.addSymbol('getUserById', { filePath: 'user.ts', type: 'function', line: 10 });
        matcher.addSymbol('UserService', { filePath: 'service.ts', type: 'class', line: 1 });

        const serialized = matcher.serialize();
        expect(typeof serialized).toBe('string');

        const newMatcher = new FuzzyMatcher();
        newMatcher.deserialize(serialized);

        expect(newMatcher.size).toBe(2);

        const results = newMatcher.search('getUserById');
        expect(results[0].symbol).toBe('getUserById');
        expect(results[0].metadata.filePath).toBe('user.ts');
      });

      it('should handle empty index serialization', () => {
        const serialized = matcher.serialize();
        const newMatcher = new FuzzyMatcher();
        newMatcher.deserialize(serialized);
        expect(newMatcher.size).toBe(0);
      });
    });

    describe('getSymbols', () => {
      it('should return all symbol names', () => {
        matcher.addSymbol('func1', { filePath: 'a.ts', type: 'function' });
        matcher.addSymbol('func2', { filePath: 'b.ts', type: 'function' });

        const symbols = matcher.getSymbols();
        expect(symbols).toContain('func1');
        expect(symbols).toContain('func2');
        expect(symbols.length).toBe(2);
      });
    });

    describe('hasSymbol', () => {
      it('should return true for existing symbols', () => {
        matcher.addSymbol('getUserById', { filePath: 'user.ts', type: 'function' });
        expect(matcher.hasSymbol('getUserById')).toBe(true);
      });

      it('should return false for non-existing symbols', () => {
        expect(matcher.hasSymbol('nonExistent')).toBe(false);
      });
    });
  });

  describe('edge cases', () => {
    let matcher: FuzzyMatcher;

    beforeEach(() => {
      matcher = new FuzzyMatcher();
    });

    it('should handle symbols with special characters', () => {
      matcher.addSymbol('$scope', { filePath: 'angular.ts', type: 'variable' });
      matcher.addSymbol('_privateMethod', { filePath: 'class.ts', type: 'method' });
      matcher.addSymbol('__init__', { filePath: 'python.py', type: 'method' });

      expect(matcher.size).toBe(3);
      const results = matcher.search('scope');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle very long symbol names', () => {
      const longSymbol = 'thisIsAVeryLongFunctionNameThatShouldStillWorkCorrectly';
      matcher.addSymbol(longSymbol, { filePath: 'long.ts', type: 'function' });

      const results = matcher.search('veryLongFunction');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle unicode characters', () => {
      matcher.addSymbol('getUsuário', { filePath: 'i18n.ts', type: 'function' });
      matcher.addSymbol('获取用户', { filePath: 'chinese.ts', type: 'function' });

      expect(matcher.size).toBe(2);
    });

    it('should handle numeric symbol names', () => {
      matcher.addSymbol('func123', { filePath: 'a.ts', type: 'function' });
      matcher.addSymbol('123func', { filePath: 'b.ts', type: 'function' });

      const results = matcher.search('func123');
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
