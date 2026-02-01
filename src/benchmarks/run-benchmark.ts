#!/usr/bin/env npx ts-node
/**
 * Benchmark Runner Script
 *
 * Runs the full benchmark suite and generates reports in multiple formats.
 *
 * Usage:
 *   npm run benchmark           # Run benchmarks
 *   npm run benchmark:report    # Generate reports from latest results
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  ComparisonRunner,
  SeuClaudeAdapter,
  RawClaudeAdapter,
  MockAdapter,
  ComparisonReportGenerator,
  BadgeGenerator,
  type ComparisonSuiteResult,
} from './comparison-runner.js';
import { BUILTIN_CHALLENGES } from './challenges/index.js';

const OUTPUT_DIR = 'benchmark-results';

async function runBenchmarks(): Promise<ComparisonSuiteResult> {
  console.log('Setting up benchmark runner...');

  // Initialize adapters based on availability
  const adapters = [];

  // Always include seu-claude
  adapters.push(new SeuClaudeAdapter());

  // Check for raw Claude availability
  if (process.env.ANTHROPIC_API_KEY) {
    adapters.push(new RawClaudeAdapter());
    console.log('  - Raw Claude adapter enabled');
  } else {
    console.log('  - Raw Claude adapter disabled (no API key)');
  }

  // In CI, add mock adapters for demonstration
  if (process.env.CI) {
    adapters.push(new MockAdapter('mock-baseline', '1.0', 0.7, 800));
    console.log('  - Mock baseline adapter enabled (CI mode)');
  }

  const runner = new ComparisonRunner(adapters);
  console.log(`Registered ${runner.listAdapters().length} adapters: ${runner.listAdapters().join(', ')}`);

  // Run benchmarks
  console.log(`\nRunning ${BUILTIN_CHALLENGES.length} benchmark cases...\n`);

  const result = await runner.runSuite(BUILTIN_CHALLENGES);

  console.log('\nBenchmark complete!');
  console.log(`  Total cases: ${result.summary.totalCases}`);
  console.log(`  Winner: ${result.summary.overallWinner || 'N/A'}`);

  return result;
}

function generateReports(result: ComparisonSuiteResult): void {
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const generator = new ComparisonReportGenerator();

  // Generate all report formats
  console.log('\nGenerating reports...');

  // JSON (machine-readable)
  const jsonReport = generator.generateJSON(result);
  writeFileSync(join(OUTPUT_DIR, 'latest.json'), jsonReport);
  writeFileSync(join(OUTPUT_DIR, `${result.runId}.json`), jsonReport);
  console.log('  - JSON report generated');

  // Markdown (for GitHub)
  const mdReport = generator.generateMarkdown(result);
  writeFileSync(join(OUTPUT_DIR, 'README.md'), mdReport);
  console.log('  - Markdown report generated');

  // HTML (standalone page with charts)
  const htmlReport = generator.generateHTML(result);
  writeFileSync(join(OUTPUT_DIR, 'index.html'), htmlReport);
  console.log('  - HTML report generated');

  // Badges
  const badges = BadgeGenerator.fromSuiteResult(result);
  writeFileSync(join(OUTPUT_DIR, 'badge.md'), badges.markdown);
  console.log('  - Badge generated');

  // SVG badge (self-hosted)
  const avgSuccessRate =
    Array.from(result.summary.agentStats.values()).reduce((acc, s) => acc + s.successRate, 0) /
    result.summary.agentStats.size;
  const svgBadge = BadgeGenerator.svgBadge(
    'benchmark',
    `${Math.round(avgSuccessRate * 100)}%`,
    avgSuccessRate >= 0.9 ? '#4ade80' : avgSuccessRate >= 0.7 ? '#fbbf24' : '#f87171'
  );
  writeFileSync(join(OUTPUT_DIR, 'badge.svg'), svgBadge);
  console.log('  - SVG badge generated');

  console.log(`\nReports saved to ${OUTPUT_DIR}/`);
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === 'report') {
    // Generate reports from existing results
    const latestPath = join(OUTPUT_DIR, 'latest.json');
    if (!existsSync(latestPath)) {
      console.error('No benchmark results found. Run benchmarks first.');
      process.exit(1);
    }

    const jsonData = readFileSync(latestPath, 'utf-8');
    const result = JSON.parse(jsonData) as ComparisonSuiteResult;

    // Reconstruct Maps from objects
    result.summary.agentStats = new Map(Object.entries(result.summary.agentStats));
    for (const c of result.cases) {
      c.results = new Map(Object.entries(c.results));
    }

    generateReports(result);
  } else {
    // Run benchmarks and generate reports
    const result = await runBenchmarks();
    generateReports(result);
  }
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
