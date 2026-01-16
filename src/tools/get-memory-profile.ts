/**
 * Get Memory Profile Tool - Retrieve memory usage statistics
 *
 * Provides real-time and historical memory profiling data.
 */

import { MemoryProfiler } from '../stats/memory-profiler.js';
import type { Config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export interface GetMemoryProfileArgs {
  format?: 'summary' | 'json' | 'detailed';
}

export class GetMemoryProfile {
  name = 'get_memory_profile';
  description =
    'Get memory usage statistics for the MCP server, including current heap usage, peak memory during indexing, and memory breakdown by language.';

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
    private profiler: MemoryProfiler,
    _config: Config
  ) {}

  execute(args: GetMemoryProfileArgs): Promise<string> {
    const format = args.format || 'summary';

    logger.debug('Retrieving memory profile', { format });

    try {
      // Take a fresh sample before reporting
      this.profiler.sample();

      const result = this.profiler.formatForClaude(format);

      logger.info('Memory profile retrieved', {
        format,
        stats: this.profiler.getStats(),
      });

      return Promise.resolve(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to retrieve memory profile', { error: message });
      return Promise.resolve(`Error retrieving memory profile: ${message}`);
    }
  }
}
