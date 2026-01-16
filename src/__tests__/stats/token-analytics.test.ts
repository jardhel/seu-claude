import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { TokenAnalyticsCollector } from '../../stats/token-analytics.js';
import type { Config } from '../../utils/config.js';

describe('TokenAnalyticsCollector', () => {
  let testDir: string;
  let config: Config;
  let collector: TokenAnalyticsCollector;

  beforeEach(() => {
    testDir = join(process.cwd(), '.test-token-analytics-' + Date.now());
    mkdirSync(testDir, { recursive: true });

    config = {
      projectRoot: testDir,
      dataDir: testDir,
      embeddingModel: 'test-model',
      embeddingDimensions: 384,
      maxChunkTokens: 512,
      minChunkLines: 5,
      supportedLanguages: ['typescript'],
      ignorePatterns: [],
    };

    collector = new TokenAnalyticsCollector(config);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initialize', () => {
    it('should create empty analytics on first init', async () => {
      await collector.initialize();
      const analytics = collector.getAnalytics();

      expect(analytics).not.toBeNull();
      expect(analytics?.totalQueries).toBe(0);
      expect(analytics?.totalTokensUsed).toBe(0);
      expect(analytics?.projectRoot).toBe(testDir);
    });

    it('should create a new session on init', async () => {
      await collector.initialize();
      const session = collector.getSessionStats();

      expect(session).not.toBeNull();
      expect(session?.sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
      expect(session?.queries).toHaveLength(0);
    });

    it('should load existing analytics from disk', async () => {
      // First collector records queries
      await collector.initialize();
      collector.recordQuery('test query', 'result text', 5);
      await collector.save();

      // Second collector loads from disk
      const collector2 = new TokenAnalyticsCollector(config);
      await collector2.initialize();
      const analytics = collector2.getAnalytics();

      expect(analytics?.totalQueries).toBe(1);
    });
  });

  describe('recordQuery', () => {
    beforeEach(async () => {
      await collector.initialize();
    });

    it('should record a query with token estimates', () => {
      const record = collector.recordQuery('find authentication', 'function login() {}', 3);

      expect(record.query).toBe('find authentication');
      expect(record.queryTokens).toBeGreaterThan(0);
      expect(record.resultsTokens).toBeGreaterThan(0);
      expect(record.resultsCount).toBe(3);
    });

    it('should calculate tokens saved vs naive approach', () => {
      const record = collector.recordQuery(
        'search query',
        'short result',
        1,
        'very long naive content that would be much more expensive to process'
      );

      expect(record.naiveTokens).toBeGreaterThan(record.resultsTokens);
      expect(record.tokensSaved).toBeGreaterThan(0);
    });

    it('should update session totals', () => {
      collector.recordQuery('query 1', 'result 1', 1);
      collector.recordQuery('query 2', 'result 2', 2);

      const session = collector.getSessionStats();
      expect(session?.queries).toHaveLength(2);
      expect(session?.totalQueryTokens).toBeGreaterThan(0);
      expect(session?.totalResultsTokens).toBeGreaterThan(0);
    });

    it('should update aggregate analytics', () => {
      collector.recordQuery('query 1', 'result 1', 1);
      collector.recordQuery('query 2', 'result 2', 2);

      const analytics = collector.getAnalytics();
      expect(analytics?.totalQueries).toBe(2);
      expect(analytics?.totalTokensUsed).toBeGreaterThan(0);
      expect(analytics?.avgTokensPerQuery).toBeGreaterThan(0);
    });

    it('should throw if not initialized', () => {
      const freshCollector = new TokenAnalyticsCollector(config);
      expect(() => freshCollector.recordQuery('query', 'result', 1)).toThrow(
        'Analytics not initialized'
      );
    });
  });

  describe('formatForClaude', () => {
    beforeEach(async () => {
      await collector.initialize();
    });

    it('should return message when no analytics', async () => {
      const freshCollector = new TokenAnalyticsCollector(config);
      const result = freshCollector.formatForClaude();
      expect(result).toBe('No analytics data available.');
    });

    it('should format analytics as markdown', () => {
      collector.recordQuery('test query', 'some result text here', 5);
      const formatted = collector.formatForClaude();

      expect(formatted).toContain('## Token Analytics');
      expect(formatted).toContain('### Summary');
      expect(formatted).toContain('**Total Queries:** 1');
      expect(formatted).toContain('**Tokens Used:**');
      expect(formatted).toContain('**Tokens Saved:**');
    });

    it('should include current session stats', () => {
      collector.recordQuery('query 1', 'result 1', 1);
      const formatted = collector.formatForClaude();

      expect(formatted).toContain('### Current Session');
      expect(formatted).toContain('**Queries:** 1');
    });
  });

  describe('exportToJson', () => {
    beforeEach(async () => {
      await collector.initialize();
    });

    it('should export valid JSON', () => {
      collector.recordQuery('test', 'result', 1);
      const json = collector.exportToJson();

      const parsed = JSON.parse(json);
      expect(parsed.totalQueries).toBe(1);
      expect(parsed.projectRoot).toBe(testDir);
    });
  });

  describe('exportToCsv', () => {
    beforeEach(async () => {
      await collector.initialize();
    });

    it('should export empty CSV when no queries', async () => {
      await collector.save(); // Save session with no queries

      const freshCollector = new TokenAnalyticsCollector(config);
      await freshCollector.initialize();
      const csv = freshCollector.exportToCsv();

      // Should just have header
      const lines = csv.split('\n').filter(l => l.length > 0);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('session_id');
    });
  });

  describe('save', () => {
    beforeEach(async () => {
      await collector.initialize();
    });

    it('should persist analytics to disk', async () => {
      collector.recordQuery('test query', 'result', 1);
      await collector.save();

      const analyticsPath = join(testDir, 'token-analytics.json');
      expect(existsSync(analyticsPath)).toBe(true);
    });

    it('should preserve session history', async () => {
      collector.recordQuery('query 1', 'result 1', 1);
      await collector.save();

      // Start new collector/session
      const collector2 = new TokenAnalyticsCollector(config);
      await collector2.initialize();
      collector2.recordQuery('query 2', 'result 2', 2);
      await collector2.save();

      // Third collector should see both sessions
      const collector3 = new TokenAnalyticsCollector(config);
      await collector3.initialize();
      const analytics = collector3.getAnalytics();

      expect(analytics?.sessions.length).toBeGreaterThanOrEqual(1);
      expect(analytics?.totalQueries).toBe(2);
    });

    it('should limit session history to 100', async () => {
      // Create many sessions
      for (let i = 0; i < 105; i++) {
        const c = new TokenAnalyticsCollector(config);
        await c.initialize();
        c.recordQuery(`query ${i}`, `result ${i}`, 1);
        await c.save();
      }

      const final = new TokenAnalyticsCollector(config);
      await final.initialize();
      const analytics = final.getAnalytics();

      expect(analytics?.sessions.length).toBeLessThanOrEqual(100);
    });
  });

  describe('token estimation', () => {
    beforeEach(async () => {
      await collector.initialize();
    });

    it('should estimate ~4 chars per token', () => {
      // 100 chars should be ~25 tokens
      const text = 'a'.repeat(100);
      const record = collector.recordQuery('q', text, 1);

      expect(record.resultsTokens).toBe(25); // 100 / 4 = 25
    });

    it('should round up token estimates', () => {
      // 10 chars should be 3 tokens (10/4 = 2.5, rounded up)
      const record = collector.recordQuery('q', '1234567890', 1);

      expect(record.resultsTokens).toBe(3);
    });
  });

  describe('savings calculation', () => {
    beforeEach(async () => {
      await collector.initialize();
    });

    it('should calculate savings percentage', () => {
      collector.recordQuery('q', 'small result', 1, 'very large naive content '.repeat(10));
      const analytics = collector.getAnalytics();

      expect(analytics?.savingsPercentage).toBeGreaterThan(0);
      expect(analytics?.savingsPercentage).toBeLessThanOrEqual(100);
    });

    it('should handle zero naive tokens gracefully', () => {
      collector.recordQuery('q', '', 0);
      const analytics = collector.getAnalytics();

      // Should not throw, percentage should be 0
      expect(analytics?.savingsPercentage).toBeDefined();
    });
  });
});
