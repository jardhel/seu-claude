/**
 * Search Symbols Tool Tests
 */

import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { SearchSymbols } from '../../tools/search-symbols.js';
import { FuzzyMatcher } from '../../search/fuzzy.js';

describe('SearchSymbols', () => {
  let testDir: string;
  let dataDir: string;
  let searchSymbols: SearchSymbols;
  let fuzzyMatcher: FuzzyMatcher;

  beforeEach(async () => {
    // Create temp directories
    testDir = join(tmpdir(), `seu-test-symbols-${Date.now()}`);
    dataDir = join(testDir, '.seu-claude');
    await mkdir(dataDir, { recursive: true });

    // Create matcher with test data
    fuzzyMatcher = new FuzzyMatcher();
    fuzzyMatcher.addSymbol('getUserById', {
      filePath: join(testDir, 'user.ts'),
      type: 'function',
      line: 10,
    });
    fuzzyMatcher.addSymbol('getOrderById', {
      filePath: join(testDir, 'order.ts'),
      type: 'function',
      line: 20,
    });
    fuzzyMatcher.addSymbol('UserService', {
      filePath: join(testDir, 'service.ts'),
      type: 'class',
      line: 1,
    });
    fuzzyMatcher.addSymbol('IUserRepository', {
      filePath: join(testDir, 'repository.ts'),
      type: 'interface',
      line: 5,
    });
    fuzzyMatcher.addSymbol('validateUser', {
      filePath: join(testDir, 'validation.ts'),
      type: 'function',
      line: 15,
    });

    // Save the index
    const indexPath = join(dataDir, 'fuzzy-index.json');
    await writeFile(indexPath, fuzzyMatcher.serialize());

    // Create the tool
    searchSymbols = new SearchSymbols(dataDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('execute', () => {
    it('should find exact matches', async () => {
      const result = await searchSymbols.execute({ pattern: 'getUserById' });

      expect(result.success).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].symbol).toBe('getUserById');
      expect(result.matches[0].score).toBe(1.0);
    });

    it('should find fuzzy matches with typos', async () => {
      const result = await searchSymbols.execute({ pattern: 'getUsr' });

      expect(result.success).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
      // Should find user-related symbols
      const hasUserMatch = result.matches.some(m => m.symbol.toLowerCase().includes('user'));
      expect(hasUserMatch).toBe(true);
    });

    it('should be case-insensitive', async () => {
      const result = await searchSymbols.execute({ pattern: 'GETUSERBYID' });

      expect(result.success).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].symbol).toBe('getUserById');
    });

    it('should filter by type', async () => {
      const result = await searchSymbols.execute({
        pattern: 'user',
        types: ['class'],
      });

      expect(result.success).toBe(true);
      expect(result.matches.every(m => m.type === 'class')).toBe(true);
    });

    it('should filter by multiple types', async () => {
      const result = await searchSymbols.execute({
        pattern: 'user',
        types: ['function', 'class'],
      });

      expect(result.success).toBe(true);
      const types = new Set(result.matches.map(m => m.type));
      expect(types.has('interface')).toBe(false);
    });

    it('should respect the limit parameter', async () => {
      const result = await searchSymbols.execute({
        pattern: 'user',
        limit: 2,
      });

      expect(result.success).toBe(true);
      expect(result.matches.length).toBeLessThanOrEqual(2);
    });

    it('should respect the fuzzy_threshold parameter', async () => {
      const lowThreshold = await searchSymbols.execute({
        pattern: 'xyz',
        fuzzy_threshold: 0.1,
      });
      const highThreshold = await searchSymbols.execute({
        pattern: 'xyz',
        fuzzy_threshold: 0.9,
      });

      expect(highThreshold.matches.length).toBeLessThanOrEqual(lowThreshold.matches.length);
    });

    it('should include file path and line in results', async () => {
      const result = await searchSymbols.execute({ pattern: 'getUserById' });

      expect(result.success).toBe(true);
      expect(result.matches[0].filePath).toContain('user.ts');
      expect(result.matches[0].line).toBe(10);
    });

    it('should handle empty pattern gracefully', async () => {
      const result = await searchSymbols.execute({ pattern: '' });

      expect(result.success).toBe(true);
      expect(result.matches).toEqual([]);
    });

    it('should handle no matches gracefully', async () => {
      const result = await searchSymbols.execute({
        pattern: 'xyznonexistent',
        fuzzy_threshold: 0.9,
      });

      expect(result.success).toBe(true);
      expect(result.matches).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle missing index file', async () => {
      // Create a tool pointing to non-existent index
      const badTool = new SearchSymbols(join(testDir, 'nonexistent'));
      const result = await badTool.execute({ pattern: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('schema', () => {
    it('should have correct input schema', () => {
      const schema = searchSymbols.getInputSchema();

      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('pattern');
      expect(schema.properties).toHaveProperty('fuzzy_threshold');
      expect(schema.properties).toHaveProperty('types');
      expect(schema.properties).toHaveProperty('limit');
      expect(schema.required).toContain('pattern');
    });
  });
});
