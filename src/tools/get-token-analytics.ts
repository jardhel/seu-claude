/**
 * Get Token Analytics Tool
 *
 * Returns token consumption analytics including:
 * - Tokens used per query
 * - Tokens saved vs naive file reading
 * - Cost estimation
 */

import { logger } from '../utils/logger.js';
import { Config } from '../utils/config.js';
import { TokenAnalyticsCollector, TokenAnalytics } from '../stats/index.js';

export interface TokenAnalyticsOptions {
  format?: 'summary' | 'json' | 'csv';
}

export class GetTokenAnalytics {
  private config: Config;
  private log = logger.child('get-token-analytics');

  constructor(config: Config) {
    this.config = config;
  }

  async execute(options: TokenAnalyticsOptions = {}): Promise<{
    analytics: TokenAnalytics | null;
    formatted: string;
  }> {
    const { format = 'summary' } = options;

    this.log.debug('Gathering token analytics...');

    try {
      const collector = new TokenAnalyticsCollector(this.config);
      await collector.initialize();

      const analytics = collector.getAnalytics();

      let formatted: string;
      switch (format) {
        case 'json':
          formatted = collector.exportToJson();
          break;
        case 'csv':
          formatted = collector.exportToCsv();
          break;
        case 'summary':
        default:
          formatted = collector.formatForClaude();
      }

      this.log.debug(`Analytics retrieved: ${analytics?.totalQueries ?? 0} queries recorded`);

      return { analytics, formatted };
    } catch (err) {
      this.log.error('Failed to gather token analytics:', err);
      throw err;
    }
  }
}
