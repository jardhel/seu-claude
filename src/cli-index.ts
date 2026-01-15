#!/usr/bin/env node

/**
 * CLI command to index a codebase directly
 * Run with: seu-claude index [path]
 */

import { resolve } from 'path';
import { existsSync } from 'fs';

/* eslint-disable no-console */

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

    // Run indexing
    console.log('� Indexing codebase...');
    const startTime = Date.now();
    const result = await indexTool.execute(false);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.success) {
      console.log(
        `\n✅ Indexed ${result.filesProcessed} files with ${result.chunksCreated} chunks (${duration}s)`
      );
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

/* eslint-enable no-console */

// Direct execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  runIndex(process.argv[2]).catch((err: unknown) => {
    console.error(`Index failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
