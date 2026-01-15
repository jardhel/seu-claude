#!/usr/bin/env node

/**
 * Benchmark: Token Savings & Context Retention
 * 
 * Compares raw file reading vs seu-claude semantic search
 * to measure token efficiency and context quality.
 * 
 * Run with: npx tsx scripts/benchmark-tokens.ts
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from '../src/utils/config.js';
import { EmbeddingEngine } from '../src/vector/embed.js';
import { VectorStore } from '../src/vector/store.js';
import { SearchCodebase } from '../src/tools/search-codebase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Approximate tokens per character (GPT/Claude average)
const CHARS_PER_TOKEN = 4;

interface BenchmarkResult {
  query: string;
  scenario: string;
  
  // Token metrics
  rawTokens: number;
  seuClaudeTokens: number;
  tokenSavings: number;
  savingsPercent: number;
  
  // Context metrics
  filesScanned: number;
  chunksReturned: number;
  relevantCodeFound: boolean;
  
  // Timing
  rawTimeMs: number;
  seuClaudeTimeMs: number;
}

interface OverallResults {
  benchmarks: BenchmarkResult[];
  summary: {
    avgTokenSavings: number;
    avgSavingsPercent: number;
    totalRawTokens: number;
    totalSeuClaudeTokens: number;
    contextRetentionRate: number;
    avgSpeedup: number;
  };
}

// Test queries that a developer might ask
const TEST_QUERIES = [
  {
    query: 'How does the embedding engine work?',
    expectedFiles: ['embed.ts'],
    expectedSymbols: ['EmbeddingEngine', 'embed', 'initialize'],
  },
  {
    query: 'Where is the vector store implementation?',
    expectedFiles: ['store.ts'],
    expectedSymbols: ['VectorStore', 'search', 'upsert'],
  },
  {
    query: 'How does the AST parser extract code structure?',
    expectedFiles: ['parser.ts'],
    expectedSymbols: ['ASTParser', 'parse', 'extractNodes'],
  },
  {
    query: 'What MCP tools are available?',
    expectedFiles: ['server.ts', 'index-codebase.ts', 'search-codebase.ts'],
    expectedSymbols: ['index_codebase', 'search_codebase', 'read_semantic_context'],
  },
  {
    query: 'How does the crawler find files?',
    expectedFiles: ['crawler.ts'],
    expectedSymbols: ['Crawler', 'crawl', 'ignorer'],
  },
  {
    query: 'How is logging implemented?',
    expectedFiles: ['logger.ts'],
    expectedSymbols: ['Logger', 'logger', 'info', 'error'],
  },
  {
    query: 'How does semantic chunking work?',
    expectedFiles: ['chunker.ts'],
    expectedSymbols: ['SemanticChunker', 'chunkFile', 'CodeChunk'],
  },
  {
    query: 'What configuration options are available?',
    expectedFiles: ['config.ts'],
    expectedSymbols: ['Config', 'loadConfig', 'DEFAULT_CONFIG'],
  },
];

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

async function getAllSourceFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', 'coverage', '.git', 'languages', 'models'].includes(entry.name)) {
        files.push(...await getAllSourceFiles(fullPath));
      }
    } else if (['.ts', '.js'].includes(extname(entry.name)) && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

async function simulateRawFileReading(files: string[], query: string): Promise<{ tokens: number; timeMs: number; content: string }> {
  const start = Date.now();
  let totalContent = '';
  
  // Simulate what an AI would do: read all potentially relevant files
  // In practice, without semantic search, you'd need to read many files
  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    totalContent += `\n// File: ${file}\n${content}\n`;
  }
  
  return {
    tokens: estimateTokens(totalContent),
    timeMs: Date.now() - start,
    content: totalContent,
  };
}

async function runBenchmark(): Promise<OverallResults> {
  console.log('🔬 seu-claude Token Savings Benchmark\n');
  console.log('='.repeat(60));
  
  // Initialize seu-claude
  console.log('\n⏳ Initializing seu-claude...');
  const config = loadConfig({ projectRoot: PROJECT_ROOT });
  const embedder = new EmbeddingEngine(config);
  const store = new VectorStore(config);
  const searchTool = new SearchCodebase(embedder, store);
  
  await embedder.initialize();
  await store.initialize();
  
  // Get all source files
  const srcDir = join(PROJECT_ROOT, 'src');
  const allSourceFiles = await getAllSourceFiles(srcDir);
  console.log(`📁 Found ${allSourceFiles.length} source files\n`);
  
  // Read all files once for raw comparison
  let allSourceContent = '';
  for (const file of allSourceFiles) {
    const content = await readFile(file, 'utf-8');
    allSourceContent += content + '\n';
  }
  const totalProjectTokens = estimateTokens(allSourceContent);
  console.log(`📊 Total project size: ~${totalProjectTokens.toLocaleString()} tokens\n`);
  
  const results: BenchmarkResult[] = [];
  
  console.log('Running benchmarks...\n');
  console.log('-'.repeat(60));
  
  for (const testCase of TEST_QUERIES) {
    process.stdout.write(`\n🔍 "${testCase.query.substring(0, 40)}..."\n`);
    
    // Scenario 1: Raw file reading (worst case - read all files)
    const rawStart = Date.now();
    const rawResult = await simulateRawFileReading(allSourceFiles, testCase.query);
    const rawTimeMs = Date.now() - rawStart;
    
    // Scenario 2: seu-claude semantic search
    const seuStart = Date.now();
    const searchResults = await searchTool.execute({ query: testCase.query, limit: 5 });
    const seuTimeMs = Date.now() - seuStart;
    
    // Calculate seu-claude tokens (the chunks returned)
    const seuClaudeContent = searchResults
      .map(r => `// ${r.relativePath}:${r.startLine}-${r.endLine}\n${r.code}`)
      .join('\n\n');
    const seuClaudeTokens = estimateTokens(seuClaudeContent);
    
    // Check context retention - did we find the expected code?
    const foundExpectedFiles = testCase.expectedFiles.some(expected =>
      searchResults.some(r => r.relativePath.includes(expected))
    );
    const foundExpectedSymbols = testCase.expectedSymbols.some(symbol =>
      searchResults.some(r => 
        r.code.includes(symbol) || 
        (r.name && r.name.includes(symbol))
      )
    );
    
    const tokenSavings = rawResult.tokens - seuClaudeTokens;
    const savingsPercent = (tokenSavings / rawResult.tokens) * 100;
    
    const result: BenchmarkResult = {
      query: testCase.query,
      scenario: 'semantic-search',
      rawTokens: rawResult.tokens,
      seuClaudeTokens,
      tokenSavings,
      savingsPercent,
      filesScanned: allSourceFiles.length,
      chunksReturned: searchResults.length,
      relevantCodeFound: foundExpectedFiles && foundExpectedSymbols,
      rawTimeMs,
      seuClaudeTimeMs: seuTimeMs,
    };
    
    results.push(result);
    
    // Print result
    console.log(`   Raw reading: ~${rawResult.tokens.toLocaleString()} tokens (${rawTimeMs}ms)`);
    console.log(`   seu-claude:  ~${seuClaudeTokens.toLocaleString()} tokens (${seuTimeMs}ms)`);
    console.log(`   💰 Savings:  ${savingsPercent.toFixed(1)}% (${tokenSavings.toLocaleString()} tokens)`);
    console.log(`   🎯 Context:  ${result.relevantCodeFound ? '✅ Found relevant code' : '⚠️ May need refinement'}`);
  }
  
  // Calculate summary
  const avgSavingsPercent = results.reduce((sum, r) => sum + r.savingsPercent, 0) / results.length;
  const avgTokenSavings = results.reduce((sum, r) => sum + r.tokenSavings, 0) / results.length;
  const totalRawTokens = results.reduce((sum, r) => sum + r.rawTokens, 0);
  const totalSeuClaudeTokens = results.reduce((sum, r) => sum + r.seuClaudeTokens, 0);
  const contextRetentionRate = results.filter(r => r.relevantCodeFound).length / results.length * 100;
  const avgSpeedup = results.reduce((sum, r) => sum + (r.rawTimeMs / r.seuClaudeTimeMs), 0) / results.length;
  
  // Cleanup
  await store.close();
  
  return {
    benchmarks: results,
    summary: {
      avgTokenSavings,
      avgSavingsPercent,
      totalRawTokens,
      totalSeuClaudeTokens,
      contextRetentionRate,
      avgSpeedup,
    },
  };
}

function printSummary(results: OverallResults): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 BENCHMARK SUMMARY');
  console.log('='.repeat(60));
  
  const { summary } = results;
  
  console.log('\n💰 TOKEN SAVINGS:');
  console.log(`   Average savings per query: ${summary.avgSavingsPercent.toFixed(1)}%`);
  console.log(`   Average tokens saved: ~${Math.round(summary.avgTokenSavings).toLocaleString()}`);
  console.log(`   Total raw tokens (all queries): ~${summary.totalRawTokens.toLocaleString()}`);
  console.log(`   Total seu-claude tokens: ~${summary.totalSeuClaudeTokens.toLocaleString()}`);
  
  console.log('\n🎯 CONTEXT RETENTION:');
  console.log(`   Relevant code found: ${summary.contextRetentionRate.toFixed(0)}% of queries`);
  console.log(`   (Found expected files AND symbols)`);
  
  console.log('\n⚡ PERFORMANCE:');
  console.log(`   Average speedup: ${summary.avgSpeedup.toFixed(1)}x faster`);
  
  // Cost estimation (rough Claude API pricing)
  const inputCostPer1k = 0.003; // $3 per 1M input tokens
  const rawCost = (summary.totalRawTokens / 1000) * inputCostPer1k;
  const seuCost = (summary.totalSeuClaudeTokens / 1000) * inputCostPer1k;
  const costSavings = rawCost - seuCost;
  
  console.log('\n💵 ESTIMATED COST SAVINGS (Claude API):');
  console.log(`   Without seu-claude: $${rawCost.toFixed(4)} per session`);
  console.log(`   With seu-claude:    $${seuCost.toFixed(4)} per session`);
  console.log(`   Savings:            $${costSavings.toFixed(4)} (${((costSavings/rawCost)*100).toFixed(1)}%)`);
  
  console.log('\n📈 KEY METRICS:');
  console.log('   ┌─────────────────────────────────────────┐');
  console.log(`   │  Token Reduction:     ${summary.avgSavingsPercent.toFixed(0)}%`.padEnd(43) + '│');
  console.log(`   │  Context Accuracy:    ${summary.contextRetentionRate.toFixed(0)}%`.padEnd(43) + '│');
  console.log(`   │  Speed Improvement:   ${summary.avgSpeedup.toFixed(1)}x`.padEnd(43) + '│');
  console.log('   └─────────────────────────────────────────┘');
  
  // Detailed results table
  console.log('\n📋 DETAILED RESULTS:');
  console.log('─'.repeat(100));
  console.log('Query'.padEnd(45) + 'Raw'.padStart(10) + 'seu-claude'.padStart(12) + 'Savings'.padStart(10) + 'Context'.padStart(10));
  console.log('─'.repeat(100));
  
  for (const r of results.benchmarks) {
    const queryShort = r.query.length > 42 ? r.query.substring(0, 42) + '...' : r.query;
    console.log(
      queryShort.padEnd(45) +
      `~${Math.round(r.rawTokens/1000)}k`.padStart(10) +
      `~${Math.round(r.seuClaudeTokens/1000)}k`.padStart(12) +
      `${r.savingsPercent.toFixed(0)}%`.padStart(10) +
      (r.relevantCodeFound ? '✅' : '⚠️').padStart(10)
    );
  }
  console.log('─'.repeat(100));
}

async function main(): Promise<void> {
  try {
    const results = await runBenchmark();
    printSummary(results);
    
    // Save results to file
    const resultsJson = JSON.stringify(results, null, 2);
    const { writeFile } = await import('fs/promises');
    await writeFile(join(PROJECT_ROOT, 'benchmark-results.json'), resultsJson);
    console.log('\n✅ Results saved to benchmark-results.json\n');
    
  } catch (err) {
    console.error('Benchmark failed:', err);
    process.exit(1);
  }
}

main();
