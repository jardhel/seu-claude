/**
 * Query Analytics - Track search query performance and patterns
 *
 * This module tracks:
 * - Search latency (percentiles: p50, p90, p99)
 * - Cache hit/miss rates
 * - Common query patterns
 * - Results quality metrics
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../utils/logger.js';
import type { Config } from '../utils/config.js';

export interface QueryPerformance {
  timestamp: number;
  query: string;
  latencyMs: number;
  resultsCount: number;
  cacheHit: boolean;
  filters?: {
    type?: string;
    language?: string;
  };
}

export interface LatencyHistogram {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface QueryPattern {
  pattern: string;
  count: number;
  avgLatencyMs: number;
  avgResultsCount: number;
  examples: string[];
}

export interface QueryAnalytics {
  projectRoot: string;
  createdAt: number;
  updatedAt: number;
  // Performance metrics
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  // Latency stats
  latencyHistogram: LatencyHistogram;
  // Query patterns (top N most common)
  commonPatterns: QueryPattern[];
  // Recent queries (last N)
  recentQueries: QueryPerformance[];
  // Filter usage stats
  filterUsage: {
    byType: Record<string, number>;
    byLanguage: Record<string, number>;
  };
}

const MAX_RECENT_QUERIES = 100;
const MAX_PATTERNS = 20;
const PATTERN_EXAMPLES = 3;

export class QueryAnalyticsCollector {
  private analytics: QueryAnalytics;
  private queryHistory: QueryPerformance[] = [];
  private persistPath: string;
  private queryCache: Map<string, number> = new Map(); // query hash -> timestamp

  constructor(private config: Config) {
    this.persistPath = join(config.dataDir, 'query-analytics.json');
    this.analytics = this.createEmptyAnalytics();
  }

  private createEmptyAnalytics(): QueryAnalytics {
    const now = Date.now();
    return {
      projectRoot: this.config.projectRoot,
      createdAt: now,
      updatedAt: now,
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      latencyHistogram: {
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0,
        avg: 0,
        count: 0,
      },
      commonPatterns: [],
      recentQueries: [],
      filterUsage: {
        byType: {},
        byLanguage: {},
      },
    };
  }

  /**
   * Load analytics from disk
   */
  async load(): Promise<void> {
    try {
      if (existsSync(this.persistPath)) {
        const data = await readFile(this.persistPath, 'utf-8');
        const loaded = JSON.parse(data) as QueryAnalytics;
        this.analytics = loaded;
        this.queryHistory = loaded.recentQueries || [];
        logger.debug('Loaded query analytics', { totalQueries: this.analytics.totalQueries });
      }
    } catch (error) {
      logger.warn('Failed to load query analytics, starting fresh', { error });
      this.analytics = this.createEmptyAnalytics();
    }
  }

  /**
   * Save analytics to disk
   */
  async save(): Promise<void> {
    try {
      await mkdir(dirname(this.persistPath), { recursive: true });
      this.analytics.updatedAt = Date.now();
      this.analytics.recentQueries = this.queryHistory.slice(-MAX_RECENT_QUERIES);
      await writeFile(this.persistPath, JSON.stringify(this.analytics, null, 2));
      logger.debug('Saved query analytics');
    } catch (error) {
      logger.warn('Failed to save query analytics', { error });
    }
  }

  /**
   * Generate a hash for the query to detect cache hits
   */
  private hashQuery(query: string, filters?: { type?: string; language?: string }): string {
    const normalized = query.toLowerCase().trim();
    const filterStr = filters ? `|${filters.type || ''}|${filters.language || ''}` : '';
    return `${normalized}${filterStr}`;
  }

  /**
   * Check if this query was recently made (potential cache hit)
   */
  private checkCache(queryHash: string): boolean {
    const lastTime = this.queryCache.get(queryHash);
    if (lastTime) {
      // Consider it a cache hit if within 5 minutes
      const cacheWindow = 5 * 60 * 1000;
      return Date.now() - lastTime < cacheWindow;
    }
    return false;
  }

  /**
   * Record a query execution
   */
  recordQuery(
    query: string,
    latencyMs: number,
    resultsCount: number,
    filters?: { type?: string; language?: string }
  ): void {
    const queryHash = this.hashQuery(query, filters);
    const cacheHit = this.checkCache(queryHash);

    const record: QueryPerformance = {
      timestamp: Date.now(),
      query,
      latencyMs,
      resultsCount,
      cacheHit,
      filters,
    };

    // Update cache
    this.queryCache.set(queryHash, Date.now());

    // Add to history
    this.queryHistory.push(record);
    if (this.queryHistory.length > MAX_RECENT_QUERIES * 2) {
      // Trim to prevent memory growth
      this.queryHistory = this.queryHistory.slice(-MAX_RECENT_QUERIES);
    }

    // Update totals
    this.analytics.totalQueries++;
    if (cacheHit) {
      this.analytics.cacheHits++;
    } else {
      this.analytics.cacheMisses++;
    }
    this.analytics.cacheHitRate =
      this.analytics.totalQueries > 0
        ? this.analytics.cacheHits / this.analytics.totalQueries
        : 0;

    // Update filter usage
    if (filters?.type) {
      this.analytics.filterUsage.byType[filters.type] =
        (this.analytics.filterUsage.byType[filters.type] || 0) + 1;
    }
    if (filters?.language) {
      this.analytics.filterUsage.byLanguage[filters.language] =
        (this.analytics.filterUsage.byLanguage[filters.language] || 0) + 1;
    }

    // Update latency histogram
    this.updateLatencyHistogram();

    // Update patterns
    this.updatePatterns(query, latencyMs, resultsCount);
  }

  /**
   * Calculate latency percentiles from query history
   */
  private updateLatencyHistogram(): void {
    if (this.queryHistory.length === 0) return;

    const latencies = this.queryHistory.map((q) => q.latencyMs).sort((a, b) => a - b);
    const count = latencies.length;

    this.analytics.latencyHistogram = {
      p50: latencies[Math.floor(count * 0.5)] || 0,
      p90: latencies[Math.floor(count * 0.9)] || 0,
      p95: latencies[Math.floor(count * 0.95)] || 0,
      p99: latencies[Math.floor(count * 0.99)] || 0,
      min: latencies[0] || 0,
      max: latencies[count - 1] || 0,
      avg: latencies.reduce((a, b) => a + b, 0) / count,
      count,
    };
  }

  /**
   * Extract common patterns from queries
   */
  private updatePatterns(query: string, latencyMs: number, resultsCount: number): void {
    // Extract pattern by normalizing the query
    const pattern = this.extractPattern(query);

    const existing = this.analytics.commonPatterns.find((p) => p.pattern === pattern);
    if (existing) {
      existing.count++;
      // Running average
      existing.avgLatencyMs = (existing.avgLatencyMs * (existing.count - 1) + latencyMs) / existing.count;
      existing.avgResultsCount =
        (existing.avgResultsCount * (existing.count - 1) + resultsCount) / existing.count;
      if (existing.examples.length < PATTERN_EXAMPLES && !existing.examples.includes(query)) {
        existing.examples.push(query);
      }
    } else {
      this.analytics.commonPatterns.push({
        pattern,
        count: 1,
        avgLatencyMs: latencyMs,
        avgResultsCount: resultsCount,
        examples: [query],
      });
    }

    // Sort by count and keep top N
    this.analytics.commonPatterns.sort((a, b) => b.count - a.count);
    if (this.analytics.commonPatterns.length > MAX_PATTERNS) {
      this.analytics.commonPatterns = this.analytics.commonPatterns.slice(0, MAX_PATTERNS);
    }
  }

  /**
   * Extract a pattern from a query for grouping
   */
  private extractPattern(query: string): string {
    // Normalize: lowercase, remove extra whitespace
    let pattern = query.toLowerCase().trim().replace(/\s+/g, ' ');

    // Remove quoted strings (often specific identifiers)
    pattern = pattern.replace(/"[^"]*"/g, '<string>');
    pattern = pattern.replace(/'[^']*'/g, '<string>');

    // Replace numbers with placeholder
    pattern = pattern.replace(/\b\d+\b/g, '<num>');

    // Replace common specific patterns
    pattern = pattern.replace(/\b(function|method|class|interface|type)\s+\w+/g, '$1 <name>');

    // Truncate very long patterns
    if (pattern.length > 50) {
      pattern = pattern.substring(0, 50) + '...';
    }

    return pattern;
  }

  /**
   * Get current analytics
   */
  getAnalytics(): QueryAnalytics {
    this.analytics.recentQueries = this.queryHistory.slice(-MAX_RECENT_QUERIES);
    return this.analytics;
  }

  /**
   * Format analytics for Claude
   */
  formatForClaude(format: 'summary' | 'json' | 'detailed' = 'summary'): string {
    const analytics = this.getAnalytics();

    if (format === 'json') {
      return JSON.stringify(analytics, null, 2);
    }

    if (format === 'detailed') {
      let output = `# Query Analytics\n\n`;

      output += `## Overview\n`;
      output += `- **Total Queries:** ${analytics.totalQueries}\n`;
      output += `- **Cache Hit Rate:** ${(analytics.cacheHitRate * 100).toFixed(1)}%\n`;
      output += `- **Cache Hits:** ${analytics.cacheHits}\n`;
      output += `- **Cache Misses:** ${analytics.cacheMisses}\n\n`;

      output += `## Latency Distribution\n`;
      const h = analytics.latencyHistogram;
      output += `| Metric | Value |\n`;
      output += `|--------|-------|\n`;
      output += `| Min | ${h.min.toFixed(1)}ms |\n`;
      output += `| P50 | ${h.p50.toFixed(1)}ms |\n`;
      output += `| P90 | ${h.p90.toFixed(1)}ms |\n`;
      output += `| P95 | ${h.p95.toFixed(1)}ms |\n`;
      output += `| P99 | ${h.p99.toFixed(1)}ms |\n`;
      output += `| Max | ${h.max.toFixed(1)}ms |\n`;
      output += `| Avg | ${h.avg.toFixed(1)}ms |\n\n`;

      if (analytics.commonPatterns.length > 0) {
        output += `## Common Query Patterns\n`;
        output += `| Pattern | Count | Avg Latency | Avg Results |\n`;
        output += `|---------|-------|-------------|-------------|\n`;
        for (const p of analytics.commonPatterns.slice(0, 10)) {
          output += `| ${p.pattern} | ${p.count} | ${p.avgLatencyMs.toFixed(1)}ms | ${p.avgResultsCount.toFixed(1)} |\n`;
        }
        output += '\n';
      }

      const typeEntries = Object.entries(analytics.filterUsage.byType);
      const langEntries = Object.entries(analytics.filterUsage.byLanguage);

      if (typeEntries.length > 0 || langEntries.length > 0) {
        output += `## Filter Usage\n`;

        if (typeEntries.length > 0) {
          output += `### By Type\n`;
          for (const [type, count] of typeEntries.sort((a, b) => b[1] - a[1])) {
            output += `- ${type}: ${count}\n`;
          }
        }

        if (langEntries.length > 0) {
          output += `### By Language\n`;
          for (const [lang, count] of langEntries.sort((a, b) => b[1] - a[1])) {
            output += `- ${lang}: ${count}\n`;
          }
        }
      }

      return output;
    }

    // Summary format
    let output = `Query Analytics for ${analytics.projectRoot}\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    output += `Total Queries: ${analytics.totalQueries}\n`;
    output += `Cache Hit Rate: ${(analytics.cacheHitRate * 100).toFixed(1)}%\n`;
    output += `Avg Latency: ${analytics.latencyHistogram.avg.toFixed(1)}ms\n`;
    output += `P95 Latency: ${analytics.latencyHistogram.p95.toFixed(1)}ms\n`;

    if (analytics.commonPatterns.length > 0) {
      output += `\nTop Patterns:\n`;
      for (const p of analytics.commonPatterns.slice(0, 5)) {
        output += `  - "${p.pattern}" (${p.count}x)\n`;
      }
    }

    return output;
  }

  /**
   * Reset analytics
   */
  reset(): void {
    this.queryHistory = [];
    this.queryCache.clear();
    this.analytics = this.createEmptyAnalytics();
    logger.info('Query analytics reset');
  }
}
