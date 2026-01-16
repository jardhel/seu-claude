#!/usr/bin/env node

/**
 * Stats command - displays index statistics
 * Run with: seu-claude stats
 */

import { loadConfig } from './utils/config.js';
import { StatsCollector, type IndexStats } from './stats/index.js';

/* eslint-disable no-console */

function formatDate(date: Date | null): string {
  if (!date) return 'Never';
  return date.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

function printStats(stats: IndexStats): void {
  const line = '─'.repeat(50);

  console.log(line);
  console.log(`📁 Project: ${stats.projectRoot}`);
  console.log(`📂 Data Directory: ${stats.dataDir}`);
  console.log(`🕐 Last Indexed: ${formatDate(stats.indexedAt)}`);
  console.log(line);

  // Index overview
  console.log('\n📈 Index Overview');
  console.log(`   Files:  ${stats.totalFiles}`);
  console.log(`   Chunks: ${stats.totalChunks}`);

  // Languages breakdown
  if (Object.keys(stats.languages).length > 0) {
    console.log('\n📝 Languages');
    const sortedLangs = Object.entries(stats.languages).sort((a, b) => b[1].chunks - a[1].chunks);

    for (const [lang, langStats] of sortedLangs) {
      const langDisplay = lang.padEnd(12);
      console.log(`   ${langDisplay} ${langStats.files} files, ${langStats.chunks} chunks`);
    }
  }

  // Cross-references
  if (stats.xrefs.totalDefinitions > 0 || stats.xrefs.totalCallSites > 0) {
    console.log('\n🔗 Cross-References');
    console.log(`   Definitions: ${stats.xrefs.totalDefinitions}`);
    console.log(`   Call Sites:  ${stats.xrefs.totalCallSites}`);
  }

  // Storage
  console.log('\n💾 Storage');
  if (stats.storage.fileIndexSize > 0) {
    console.log(`   File Index: ${formatBytes(stats.storage.fileIndexSize)}`);
  }
  if (stats.storage.xrefGraphSize > 0) {
    console.log(`   Xref Graph: ${formatBytes(stats.storage.xrefGraphSize)}`);
  }
  if (stats.storage.vectorDbSize > 0) {
    console.log(`   Vector DB:  ${formatBytes(stats.storage.vectorDbSize)}`);
  }
  console.log(`   Total:      ${formatBytes(stats.storage.totalSize)}`);

  console.log(line);
}

export async function runStats(): Promise<void> {
  console.log('\n📊 seu-claude Stats\n');

  const config = loadConfig();
  const collector = new StatsCollector(config);
  const stats = await collector.collect();

  if (stats.totalFiles === 0) {
    console.log('⚠️  No index found. Run indexing first:');
    console.log('   In Claude: "Index this codebase for semantic search"');
    console.log('   Or CLI:    seu-claude index\n');
    return;
  }

  printStats(stats);
  console.log('\n');
}

/* eslint-enable no-console */

// Direct execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  runStats().catch((err: unknown) => {
    console.error(`Stats failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
