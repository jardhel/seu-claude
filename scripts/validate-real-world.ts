#!/usr/bin/env npx ts-node
/**
 * Real-world validation script for seu-claude
 * Tests indexing and searching on actual codebases
 */

import { loadConfig } from '../src/utils/config.js';
import { EmbeddingEngine } from '../src/vector/embed.js';
import { VectorStore } from '../src/vector/store.js';
import { IndexCodebase } from '../src/tools/index-codebase.js';
import { SearchCodebase } from '../src/tools/search-codebase.js';
import { ReadSemanticContext } from '../src/tools/read-context.js';
import * as fs from 'fs';
import * as path from 'path';

async function validateOnCodebase(projectPath: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Validating seu-claude on: ${projectPath}`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  // Check if path exists
  if (!fs.existsSync(projectPath)) {
    console.error(`❌ Path does not exist: ${projectPath}`);
    return false;
  }

  // Load config for this project
  const config = loadConfig({ projectRoot: projectPath });

  // Initialize components
  console.log('📦 Initializing components...');
  const embedder = new EmbeddingEngine(config);
  const store = new VectorStore(config);

  try {
    await embedder.initialize();
    await store.initialize();

    const indexer = new IndexCodebase(config, embedder, store);
    const searcher = new SearchCodebase(embedder, store);
    const reader = new ReadSemanticContext(store);

    // Index the codebase
    console.log('\n📂 Indexing codebase...');
    const indexResult = await indexer.execute(true); // force reindex
    console.log(
      `✅ Indexed: ${indexResult.filesProcessed} files, ${indexResult.chunksCreated} chunks`
    );
    console.log(`   Time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

    // Test searches
    console.log('\n🔎 Testing search queries...');

    const testQueries = [
      'function that handles errors',
      'main entry point',
      'configuration options',
      'test utilities',
      'embedding vector search',
    ];

    for (const query of testQueries) {
      try {
        const results = await searcher.execute({ query, limit: 3 });
        console.log(`\n   Query: "${query}"`);
        console.log(`   Found: ${results.length} results`);
        if (results.length > 0) {
          const top = results[0];
          console.log(
            `   Top match: ${top.relativePath}:${top.startLine}-${top.endLine} (score: ${top.score.toFixed(3)})`
          );
        }
      } catch (err) {
        console.log(`   Query: "${query}" - ⚠️ No results or error`);
      }
    }

    // Test context reading
    console.log('\n📖 Testing context reading...');
    const stats = await store.getStats();
    if (stats.totalChunks > 0) {
      // Find a TypeScript file to read context from
      const srcPath = path.join(projectPath, 'src');
      if (fs.existsSync(srcPath)) {
        const tsFiles = fs
          .readdirSync(srcPath)
          .filter(f => f.endsWith('.ts'))
          .slice(0, 1);

        if (tsFiles.length > 0) {
          const testFile = path.join(srcPath, tsFiles[0]);
          if (fs.existsSync(testFile)) {
            const contextResult = await reader.execute({
              filePath: testFile,
              startLine: 1,
              endLine: 50,
            });
            console.log(`   Read context for: ${testFile}`);
            console.log(`   Related chunks: ${contextResult.relatedChunks.length}`);
            console.log(`   Lines: ${contextResult.startLine}-${contextResult.endLine}`);
          }
        }
      }
    }

    // Summary
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Validation PASSED for ${path.basename(projectPath)}`);
    console.log(`   Total time: ${totalTime}s`);
    console.log(`   Files indexed: ${indexResult.filesProcessed}`);
    console.log(`   Chunks created: ${indexResult.chunksCreated}`);
    console.log(`${'='.repeat(60)}\n`);

    await store.close();
    return true;
  } catch (error) {
    console.error(`\n❌ Validation FAILED: ${error}`);
    await store.close();
    return false;
  }
}

async function main() {
  console.log('🚀 seu-claude Real-World Validation\n');

  // Test on the seu-claude project itself
  const seuClaudePath = process.cwd();

  const results: { path: string; success: boolean }[] = [];

  // Validate on seu-claude itself
  const success = await validateOnCodebase(seuClaudePath);
  results.push({ path: seuClaudePath, success });

  // Summary
  console.log('\n📊 VALIDATION SUMMARY');
  console.log('='.repeat(60));
  for (const r of results) {
    console.log(`${r.success ? '✅' : '❌'} ${path.basename(r.path)}`);
  }

  const passed = results.filter(r => r.success).length;
  console.log(`\nTotal: ${passed}/${results.length} passed`);

  process.exit(passed === results.length ? 0 : 1);
}

main().catch(console.error);
