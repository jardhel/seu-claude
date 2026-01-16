/**
 * Get Query Analytics Tool - Retrieve search query performance metrics
 *
 * Provides latency histograms, cache hit rates, and common query patterns.
 */

import { QueryAnalyticsCollector } from '../stats/query-analytics.js';
import type { Config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export interface GetQueryAnalyticsArgs {
  format?: 'summary' | 'json' | 'detailed';
}

export class GetQueryAnalytics {
  name = 'get_query_analytics';
  description =
    'Get search query performance analytics including latency percentiles (p50/p90/p99), cache hit rates, and common query patterns.';

  inputSchema = {
    type: 'object' as const,
    properties: {
      format: {
        type: 'string',
        enum: ['summary', 'json', 'detailed'],
        description:
          "Output format: 'summary' for quick overview, 'detailed' for full markdown report, 'json' for raw data",
        default: 'summary',
      },
    },
    required: [],
  };

  constructor(
    private collector: QueryAnalyticsCollector,
    _config: Config
  ) {}

  execute(args: GetQueryAnalyticsArgs): Promise<string> {
    const format = args.format || 'summary';

    logger.debug('Retrieving query analytics', { format });

    try {
      const result = this.collector.formatForClaude(format);

      const analytics = this.collector.getAnalytics();
      logger.info('Query analytics retrieved', {
        format,
        totalQueries: analytics.totalQueries,
        cacheHitRate: analytics.cacheHitRate,
      });

      return Promise.resolve(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to retrieve query analytics', { error: message });
      return Promise.resolve(`Error retrieving query analytics: ${message}`);
    }
  }
}
