#!/usr/bin/env node

/**
 * CLI command to index a codebase directly
 * Run with: seu-claude index [path]
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import type { IndexProgress } from './tools/index-codebase.js';

 

export async function runIndex(pathArg?: string): Promise<void> {
  console.log('\n🔍 seu-claude Index\n');

  // Determine project root
  const projectRoot = pathArg ? resolve(pathArg) : process.cwd();

  if (!existsSync(projectRoot)) {
    console.error(`❌ Directory not found: ${projectRoot}`);
    process.exit(1);
  }

  console.log(`📁 Project root: ${projectRoot}`);

  // Set environment for the indexer
  process.env.PROJECT_ROOT = projectRoot;

  try {
    // Import config and components
    console.log('⏳ Loading components...');
    const { loadConfig } = await import('./utils/config.js');
    const { EmbeddingEngine } = await import('./vector/embed.js');
    const { VectorStore } = await import('./vector/store.js');
    const { IndexCodebase } = await import('./tools/index-codebase.js');

    // Load config
    const config = loadConfig({ projectRoot });
    console.log(`📊 Data directory: ${config.dataDir}`);
    console.log('');

    // Initialize components
    console.log('⏳ Initializing...');
    const embedder = new EmbeddingEngine(config);
    const store = new VectorStore(config);
    const indexTool = new IndexCodebase(config, embedder, store);

    await embedder.initialize();
    await store.initialize();

    console.log('✅ Components ready\n');

    // Progress callback for CLI
    let lastPhase = '';
    const onProgress = (progress: IndexProgress) => {
      // Only log phase changes to avoid too much output
      if (progress.phase !== lastPhase) {
        const phaseEmoji: Record<string, string> = {
          crawling: '🔍',
          analyzing: '📝',
          embedding: '🧠',
          saving: '💾',
          complete: '✅',
        };
        console.log(`${phaseEmoji[progress.phase] || '📦'} ${progress.message}`);
        lastPhase = progress.phase;
      } else if (progress.current && progress.total && progress.current % 10 === 0) {
        // Log every 10 files during analysis
        process.stdout.write(`\r   ${progress.current}/${progress.total} files processed`);
      }
    };

    // Run indexing
    console.log('📦 Indexing codebase...');
    const startTime = Date.now();
    const result = await indexTool.execute(false, onProgress);
    console.log(''); // Clear progress line
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.success) {
      console.log(
        `\n✅ Indexed ${result.filesProcessed} files with ${result.chunksCreated} chunks (${duration}s)`
      );

      if (result.filesSkipped > 0 || result.filesDeleted > 0) {
        const stats = [];
        if (result.filesSkipped > 0) stats.push(`${result.filesSkipped} unchanged`);
        if (result.filesUpdated > 0) stats.push(`${result.filesUpdated} updated`);
        if (result.filesDeleted > 0) stats.push(`${result.filesDeleted} deleted`);
        console.log(`   (${stats.join(', ')})`);
      }

      console.log('\n📊 Languages:');
      for (const [lang, count] of Object.entries(result.languages)) {
        console.log(`   ${lang}: ${count} files`);
      }
    } else {
      console.error(`\n❌ Indexing failed: ${result.error}`);
      process.exit(1);
    }

    // Cleanup
    store.close();

    console.log('\n🎉 Indexing complete!\n');
    console.log('📚 Next steps:');
    console.log('   1. Open Claude Code or Copilot Chat');
    console.log('   2. Ask: "Search for authentication logic"');
    console.log('   3. Or: "Find where database connections are handled"\n');
  } catch (err) {
    console.error(`\n❌ Indexing failed: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

 

// Direct execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  runIndex(process.argv[2]).catch((err: unknown) => {
    console.error(`Index failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
