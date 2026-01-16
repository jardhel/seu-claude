/**
 * Token Analytics - Track token consumption for queries and indexing
 *
 * This module tracks:
 * - Tokens used per query
 * - Tokens saved vs naive file reading
 * - Session statistics
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import type { Config } from '../utils/config.js';

// Approximate tokens per character (Claude's tokenization is ~4 chars per token)
const CHARS_PER_TOKEN = 4;

export interface QueryRecord {
  timestamp: number;
  query: string;
  queryTokens: number;
  resultsTokens: number;
  resultsCount: number;
  naiveTokens: number; // What it would cost to read whole files
  tokensSaved: number;
}

export interface SessionStats {
  sessionId: string;
  startedAt: number;
  queries: QueryRecord[];
  totalQueryTokens: number;
  totalResultsTokens: number;
  totalNaiveTokens: number;
  totalTokensSaved: number;
}

export interface TokenAnalytics {
  projectRoot: string;
  createdAt: number;
  updatedAt: number;
  sessions: SessionStats[];
  // Aggregate stats
  totalQueries: number;
  totalTokensUsed: number;
  totalTokensSaved: number;
  avgTokensPerQuery: number;
  savingsPercentage: number;
}

export class TokenAnalyticsCollector {
  private config: Config;
  private log = logger.child('token-analytics');
  private analytics: TokenAnalytics | null = null;
  private currentSession: SessionStats | null = null;
  private analyticsPath: string;

  constructor(config: Config) {
    this.config = config;
    this.analyticsPath = join(config.dataDir, 'token-analytics.json');
  }

  /**
   * Initialize analytics - loads existing data or creates new
   */
  async initialize(): Promise<void> {
    if (existsSync(this.analyticsPath)) {
      try {
        const content = await readFile(this.analyticsPath, 'utf-8');
        this.analytics = JSON.parse(content) as TokenAnalytics;
        this.log.debug(`Loaded analytics with ${this.analytics.totalQueries} queries`);
      } catch (err) {
        this.log.warn('Failed to load analytics, starting fresh:', err);
        this.analytics = this.createEmptyAnalytics();
      }
    } else {
      this.analytics = this.createEmptyAnalytics();
    }

    // Start a new session
    this.currentSession = {
      sessionId: this.generateSessionId(),
      startedAt: Date.now(),
      queries: [],
      totalQueryTokens: 0,
      totalResultsTokens: 0,
      totalNaiveTokens: 0,
      totalTokensSaved: 0,
    };
  }

  /**
   * Record a query and its token consumption
   */
  recordQuery(
    query: string,
    resultsText: string,
    resultsCount: number,
    naiveContent?: string
  ): QueryRecord {
    if (!this.currentSession || !this.analytics) {
      throw new Error('Analytics not initialized');
    }

    const queryTokens = this.estimateTokens(query);
    const resultsTokens = this.estimateTokens(resultsText);
    const naiveTokens = naiveContent ? this.estimateTokens(naiveContent) : resultsTokens * 3; // Estimate 3x if not provided
    const tokensSaved = Math.max(0, naiveTokens - resultsTokens);

    const record: QueryRecord = {
      timestamp: Date.now(),
      query,
      queryTokens,
      resultsTokens,
      resultsCount,
      naiveTokens,
      tokensSaved,
    };

    // Update session
    this.currentSession.queries.push(record);
    this.currentSession.totalQueryTokens += queryTokens;
    this.currentSession.totalResultsTokens += resultsTokens;
    this.currentSession.totalNaiveTokens += naiveTokens;
    this.currentSession.totalTokensSaved += tokensSaved;

    // Update aggregate
    this.analytics.totalQueries++;
    this.analytics.totalTokensUsed += queryTokens + resultsTokens;
    this.analytics.totalTokensSaved += tokensSaved;
    this.analytics.updatedAt = Date.now();

    // Recalculate averages
    this.analytics.avgTokensPerQuery = this.analytics.totalTokensUsed / this.analytics.totalQueries;

    const totalNaive = this.analytics.totalTokensUsed + this.analytics.totalTokensSaved;
    this.analytics.savingsPercentage =
      totalNaive > 0 ? (this.analytics.totalTokensSaved / totalNaive) * 100 : 0;

    this.log.debug(`Query recorded: ${resultsTokens} tokens (saved ${tokensSaved} vs naive)`);

    return record;
  }

  /**
   * Get current session statistics
   */
  getSessionStats(): SessionStats | null {
    return this.currentSession;
  }

  /**
   * Get aggregate analytics
   */
  getAnalytics(): TokenAnalytics | null {
    return this.analytics;
  }

  /**
   * Save analytics to disk
   */
  async save(): Promise<void> {
    if (!this.analytics || !this.currentSession) return;

    // Add current session if it has queries
    if (this.currentSession.queries.length > 0) {
      // Find and update existing session or add new one
      const existingIdx = this.analytics.sessions.findIndex(
        s => s.sessionId === this.currentSession!.sessionId
      );

      if (existingIdx >= 0) {
        this.analytics.sessions[existingIdx] = this.currentSession;
      } else {
        // Keep only last 100 sessions
        if (this.analytics.sessions.length >= 100) {
          this.analytics.sessions.shift();
        }
        this.analytics.sessions.push(this.currentSession);
      }
    }

    try {
      await writeFile(this.analyticsPath, JSON.stringify(this.analytics, null, 2));
      this.log.debug('Analytics saved');
    } catch (err) {
      this.log.error('Failed to save analytics:', err);
    }
  }

  /**
   * Format analytics for Claude response
   */
  formatForClaude(): string {
    if (!this.analytics) return 'No analytics data available.';

    const lines: string[] = ['## Token Analytics', ''];

    // Summary
    lines.push('### Summary');
    lines.push(`- **Total Queries:** ${this.analytics.totalQueries}`);
    lines.push(`- **Tokens Used:** ${this.formatNumber(this.analytics.totalTokensUsed)}`);
    lines.push(`- **Tokens Saved:** ${this.formatNumber(this.analytics.totalTokensSaved)}`);
    lines.push(`- **Savings:** ${this.analytics.savingsPercentage.toFixed(1)}%`);
    lines.push(`- **Avg Tokens/Query:** ${Math.round(this.analytics.avgTokensPerQuery)}`);
    lines.push('');

    // Current session
    if (this.currentSession && this.currentSession.queries.length > 0) {
      lines.push('### Current Session');
      lines.push(`- **Queries:** ${this.currentSession.queries.length}`);
      lines.push(
        `- **Tokens Used:** ${this.formatNumber(
          this.currentSession.totalQueryTokens + this.currentSession.totalResultsTokens
        )}`
      );
      lines.push(`- **Tokens Saved:** ${this.formatNumber(this.currentSession.totalTokensSaved)}`);
      lines.push('');
    }

    // Cost estimation (Claude pricing rough estimate)
    const costPer1M = 3.0; // ~$3 per 1M input tokens (Claude 3.5 Sonnet estimate)
    const savedCost = (this.analytics.totalTokensSaved / 1_000_000) * costPer1M;
    if (savedCost > 0.01) {
      lines.push('### Cost Savings (Estimated)');
      lines.push(`- **Estimated Savings:** $${savedCost.toFixed(2)}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export analytics to JSON format
   */
  exportToJson(): string {
    return JSON.stringify(this.analytics, null, 2);
  }

  /**
   * Export analytics to CSV format
   */
  exportToCsv(): string {
    if (!this.analytics) return '';

    const lines: string[] = [
      'session_id,timestamp,query,query_tokens,results_tokens,naive_tokens,tokens_saved',
    ];

    for (const session of this.analytics.sessions) {
      for (const query of session.queries) {
        const escapedQuery = `"${query.query.replace(/"/g, '""')}"`;
        lines.push(
          [
            session.sessionId,
            new Date(query.timestamp).toISOString(),
            escapedQuery,
            query.queryTokens,
            query.resultsTokens,
            query.naiveTokens,
            query.tokensSaved,
          ].join(',')
        );
      }
    }

    return lines.join('\n');
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  private createEmptyAnalytics(): TokenAnalytics {
    return {
      projectRoot: this.config.projectRoot,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sessions: [],
      totalQueries: 0,
      totalTokensUsed: 0,
      totalTokensSaved: 0,
      avgTokensPerQuery: 0,
      savingsPercentage: 0,
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }
}
