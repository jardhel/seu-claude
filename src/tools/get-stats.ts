import { logger } from '../utils/logger.js';
import { Config } from '../utils/config.js';
import { StatsCollector, IndexStats } from '../stats/index.js';

export interface StatsOptions {
  verbose?: boolean;
}

export class GetStats {
  private config: Config;
  private log = logger.child('get-stats');

  constructor(config: Config) {
    this.config = config;
  }

  async execute(_options: StatsOptions = {}): Promise<IndexStats> {
    this.log.debug('Gathering index statistics...');

    try {
      const collector = new StatsCollector(this.config);
      const stats = await collector.collect();

      this.log.debug(`Stats collected: ${stats.totalFiles} files, ${stats.totalChunks} chunks`);

      return stats;
    } catch (err) {
      this.log.error('Failed to gather stats:', err);
      throw err;
    }
  }

  formatForClaude(stats: IndexStats, verbose = false): string {
    const lines: string[] = ['## Index Statistics', ''];

    // Basic info
    lines.push(`**Project Root:** ${stats.projectRoot}`);
    lines.push(`**Last Indexed:** ${stats.indexedAt ? stats.indexedAt.toISOString() : 'Never'}`);
    lines.push('');

    // Summary
    lines.push('### Summary');
    lines.push(`- **Total Files:** ${stats.totalFiles}`);
    lines.push(`- **Total Chunks:** ${stats.totalChunks}`);
    lines.push('');

    // Languages
    if (Object.keys(stats.languages).length > 0) {
      lines.push('### Languages');
      lines.push('| Language | Files | Chunks |');
      lines.push('|----------|-------|--------|');

      const sortedLangs = Object.entries(stats.languages).sort((a, b) => b[1].chunks - a[1].chunks);

      for (const [lang, langStats] of sortedLangs) {
        lines.push(`| ${lang} | ${langStats.files} | ${langStats.chunks} |`);
      }
      lines.push('');
    }

    // Cross-references
    if (stats.xrefs.totalDefinitions > 0 || stats.xrefs.totalCallSites > 0) {
      lines.push('### Cross-References');
      lines.push(`- **Definitions:** ${stats.xrefs.totalDefinitions}`);
      lines.push(`- **Call Sites:** ${stats.xrefs.totalCallSites}`);
      lines.push('');
    }

    // Storage (verbose mode)
    if (verbose && stats.storage.totalSize > 0) {
      lines.push('### Storage');
      lines.push(`- **Total:** ${this.formatBytes(stats.storage.totalSize)}`);

      if (stats.storage.fileIndexSize > 0) {
        lines.push(`- **File Index:** ${this.formatBytes(stats.storage.fileIndexSize)}`);
      }
      if (stats.storage.xrefGraphSize > 0) {
        lines.push(`- **Xref Graph:** ${this.formatBytes(stats.storage.xrefGraphSize)}`);
      }
      if (stats.storage.vectorDbSize > 0) {
        lines.push(`- **Vector DB:** ${this.formatBytes(stats.storage.vectorDbSize)}`);
      }
    }

    return lines.join('\n');
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
  }
}
