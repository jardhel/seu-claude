import { QueryAnalyticsCollector } from '../../stats/query-analytics.js';
import type { Config } from '../../utils/config.js';
import { mkdtemp, rm, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('QueryAnalyticsCollector', () => {
  let tempDir: string;
  let config: Config;
  let collector: QueryAnalyticsCollector;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'seu-claude-query-analytics-test-'));
    config = {
      projectRoot: tempDir,
      dataDir: join(tempDir, '.seu-claude'),
      embeddingModel: 'Xenova/all-MiniLM-L6-v2',
      embeddingDimensions: 384,
      maxChunkTokens: 512,
      minChunkLines: 5,
      chunkOverlapRatio: 0.25,
      chunkGroundingLines: 6,
      supportedLanguages: ['typescript', 'javascript'],
      ignorePatterns: ['**/node_modules/**'],
    };

    await mkdir(config.dataDir, { recursive: true });
    collector = new QueryAnalyticsCollector(config);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('recordQuery', () => {
    it('should record a query', () => {
      collector.recordQuery('find authentication', 50, 5);

      const analytics = collector.getAnalytics();
      expect(analytics.totalQueries).toBe(1);
      expect(analytics.recentQueries.length).toBe(1);
      expect(analytics.recentQueries[0].query).toBe('find authentication');
      expect(analytics.recentQueries[0].latencyMs).toBe(50);
      expect(analytics.recentQueries[0].resultsCount).toBe(5);
    });

    it('should record multiple queries', () => {
      collector.recordQuery('find auth', 50, 5);
      collector.recordQuery('find database', 100, 10);
      collector.recordQuery('find api', 75, 8);

      const analytics = collector.getAnalytics();
      expect(analytics.totalQueries).toBe(3);
      expect(analytics.recentQueries.length).toBe(3);
    });

    it('should track filters', () => {
      collector.recordQuery('find method', 50, 5, { type: 'method' });
      collector.recordQuery('find class', 60, 3, { type: 'class', language: 'typescript' });

      const analytics = collector.getAnalytics();
      expect(analytics.filterUsage.byType['method']).toBe(1);
      expect(analytics.filterUsage.byType['class']).toBe(1);
      expect(analytics.filterUsage.byLanguage['typescript']).toBe(1);
    });
  });

  describe('cache detection', () => {
    it('should detect cache hits for repeated queries', () => {
      collector.recordQuery('find auth', 50, 5);
      collector.recordQuery('find auth', 20, 5); // Same query should be cache hit

      const analytics = collector.getAnalytics();
      expect(analytics.cacheHits).toBe(1);
      expect(analytics.cacheMisses).toBe(1);
      expect(analytics.cacheHitRate).toBeCloseTo(0.5);
    });

    it('should consider normalized queries the same', () => {
      collector.recordQuery('Find Auth', 50, 5);
      collector.recordQuery('find auth', 20, 5); // Same normalized

      const analytics = collector.getAnalytics();
      expect(analytics.cacheHits).toBe(1);
    });

    it('should distinguish queries with different filters', () => {
      collector.recordQuery('find auth', 50, 5, { type: 'method' });
      collector.recordQuery('find auth', 50, 5, { type: 'class' });

      const analytics = collector.getAnalytics();
      expect(analytics.cacheHits).toBe(0);
      expect(analytics.cacheMisses).toBe(2);
    });
  });

  describe('latencyHistogram', () => {
    it('should calculate percentiles correctly', () => {
      // Add queries with known latencies
      for (let i = 1; i <= 100; i++) {
        collector.recordQuery(`query ${i}`, i, 1);
      }

      const analytics = collector.getAnalytics();
      const h = analytics.latencyHistogram;

      expect(h.min).toBe(1);
      expect(h.max).toBe(100);
      expect(h.count).toBe(100);
      expect(h.avg).toBeCloseTo(50.5, 1);
      // Percentiles should be approximately correct (floor-based)
      expect(h.p50).toBeGreaterThanOrEqual(49);
      expect(h.p50).toBeLessThanOrEqual(52);
      expect(h.p90).toBeGreaterThanOrEqual(89);
      expect(h.p90).toBeLessThanOrEqual(92);
      expect(h.p95).toBeGreaterThanOrEqual(94);
      expect(h.p95).toBeLessThanOrEqual(97);
      expect(h.p99).toBeGreaterThanOrEqual(98);
      expect(h.p99).toBeLessThanOrEqual(100);
    });
  });

  describe('patterns', () => {
    it('should extract common patterns', () => {
      collector.recordQuery('find authentication', 50, 5);
      collector.recordQuery('find authorization', 60, 3);
      collector.recordQuery('find auth handler', 70, 4);

      const analytics = collector.getAnalytics();
      expect(analytics.commonPatterns.length).toBeGreaterThan(0);
    });

    it('should group similar patterns', () => {
      collector.recordQuery('function handleAuth', 50, 5);
      collector.recordQuery('function handlePayment', 60, 3);
      collector.recordQuery('function handleUser', 70, 4);

      const analytics = collector.getAnalytics();
      const fnPattern = analytics.commonPatterns.find(p => p.pattern.includes('function'));
      expect(fnPattern).toBeDefined();
    });

    it('should track pattern examples', () => {
      collector.recordQuery('find auth', 50, 5);
      collector.recordQuery('find auth again', 60, 3);

      const analytics = collector.getAnalytics();
      const pattern = analytics.commonPatterns[0];
      expect(pattern.examples.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('persistence', () => {
    it('should save and load analytics', async () => {
      collector.recordQuery('find auth', 50, 5);
      collector.recordQuery('find database', 100, 10);

      await collector.save();

      const newCollector = new QueryAnalyticsCollector(config);
      await newCollector.load();

      const analytics = newCollector.getAnalytics();
      expect(analytics.totalQueries).toBe(2);
    });

    it('should handle missing file gracefully', async () => {
      await collector.load(); // Should not throw
      const analytics = collector.getAnalytics();
      expect(analytics.totalQueries).toBe(0);
    });
  });

  describe('formatForClaude', () => {
    beforeEach(() => {
      collector.recordQuery('find auth', 50, 5, { type: 'method' });
      collector.recordQuery('find database', 100, 10, { language: 'typescript' });
    });

    it('should format as summary', () => {
      const output = collector.formatForClaude('summary');

      expect(output).toContain('Query Analytics');
      expect(output).toContain('Total Queries');
      expect(output).toContain('Cache Hit Rate');
    });

    it('should format as json', () => {
      const output = collector.formatForClaude('json');

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('totalQueries', 2);
      expect(parsed).toHaveProperty('latencyHistogram');
      expect(parsed).toHaveProperty('filterUsage');
    });

    it('should format as detailed markdown', () => {
      const output = collector.formatForClaude('detailed');

      expect(output).toContain('# Query Analytics');
      expect(output).toContain('## Overview');
      expect(output).toContain('## Latency Distribution');
      expect(output).toContain('| Metric |');
    });

    it('should default to summary format', () => {
      const output = collector.formatForClaude();
      expect(output).toContain('Query Analytics');
    });
  });

  describe('reset', () => {
    it('should reset all analytics', () => {
      collector.recordQuery('find auth', 50, 5);
      collector.recordQuery('find database', 100, 10);

      collector.reset();

      const analytics = collector.getAnalytics();
      expect(analytics.totalQueries).toBe(0);
      expect(analytics.recentQueries.length).toBe(0);
      expect(analytics.cacheHits).toBe(0);
      expect(analytics.commonPatterns.length).toBe(0);
    });
  });

  describe('limits', () => {
    it('should limit recent queries', () => {
      // Add more than the max
      for (let i = 0; i < 150; i++) {
        collector.recordQuery(`query ${i}`, i, 1);
      }

      const analytics = collector.getAnalytics();
      expect(analytics.recentQueries.length).toBeLessThanOrEqual(100);
    });

    it('should limit common patterns', () => {
      // Add many unique patterns
      for (let i = 0; i < 50; i++) {
        collector.recordQuery(`unique query type ${i}`, i, 1);
      }

      const analytics = collector.getAnalytics();
      expect(analytics.commonPatterns.length).toBeLessThanOrEqual(20);
    });
  });
});
