/**
 * ScalabilitySuite - Measures performance at scale
 *
 * Evaluates how seu-claude performs as codebase size increases:
 * - Throughput (files/second)
 * - Memory usage (peak RSS)
 * - Latency percentiles (P50, P95, P99)
 * - Scaling factor
 */

import { glob } from 'glob';
import { readFile } from 'fs/promises';

import { RecursiveScout } from '../../core/usecases/RecursiveScout.js';
import { TreeSitterAdapter } from '../../adapters/parsers/TreeSitterAdapter.js';
import { logger } from '../../utils/logger.js';

import type {
  IBenchmarkSuite,
  BenchmarkTestCase,
  TestCaseResult,
  BenchmarkSuiteResult,
  BenchmarkSuiteConfig,
  MetricMeasurement,
} from '../framework/types.js';
import { TimingCollector, MetricsCollector } from '../framework/MetricsCollector.js';

/**
 * Test case for scalability benchmarks
 */
export interface ScalabilityTestCase extends BenchmarkTestCase {
  input: {
    /** Number of files to process */
    fileCount: number;
    /** Entry points for analysis */
    entryPoints: string[];
    /** Operation to benchmark */
    operation: 'parse' | 'build-graph' | 'symbol-lookup' | 'full-index';
  };
  expected: {
    /** Maximum acceptable latency in ms */
    maxLatencyMs?: number;
    /** Minimum throughput (files/second) */
    minThroughput?: number;
    /** Maximum memory usage in MB */
    maxMemoryMB?: number;
  };
}

/**
 * Memory snapshot for tracking usage
 */
interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

/**
 * ScalabilitySuite measures performance characteristics at scale
 */
export class ScalabilitySuite implements IBenchmarkSuite {
  readonly name = 'scalability';
  readonly description = 'Measures throughput, memory usage, and latency at scale';
  readonly supportedLanguages = ['typescript', 'javascript', 'python'];

  private log = logger.child('scalability-suite');
  private adapter: TreeSitterAdapter;
  private scout: RecursiveScout;

  constructor() {
    this.adapter = new TreeSitterAdapter();
    this.scout = new RecursiveScout(this.adapter);
  }

  /**
   * Load test cases based on codebase size tiers
   */
  async loadTestCases(datasetPath: string): Promise<ScalabilityTestCase[]> {
    const testCases: ScalabilityTestCase[] = [];

    // Discover files in the dataset
    const files = await glob('**/*.{ts,js,py}', {
      cwd: datasetPath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.spec.ts'],
    });

    if (files.length === 0) {
      this.log.warn('No source files found in dataset');
      return testCases;
    }

    // Create test cases for different file counts (tiers)
    const tiers = this.calculateTiers(files.length);

    for (const tier of tiers) {
      const tierFiles = files.slice(0, tier.count);
      const entryPoints = tierFiles.slice(0, Math.min(10, tierFiles.length));

      // Parse operation test
      testCases.push({
        id: `scalability:parse:${tier.name}`,
        description: `Parse ${tier.count} files`,
        input: {
          fileCount: tier.count,
          entryPoints: entryPoints,
          operation: 'parse',
        },
        expected: {
          minThroughput: 10, // At least 10 files/second
          maxMemoryMB: tier.count * 2, // ~2MB per file max
        },
        tags: ['scalability', 'parse', tier.name],
        difficulty: tier.difficulty,
      });

      // Build graph operation test
      testCases.push({
        id: `scalability:build-graph:${tier.name}`,
        description: `Build dependency graph for ${tier.count} files`,
        input: {
          fileCount: tier.count,
          entryPoints: entryPoints,
          operation: 'build-graph',
        },
        expected: {
          maxLatencyMs: tier.count * 100, // ~100ms per file max
          maxMemoryMB: tier.count * 5, // ~5MB per file max for graph
        },
        tags: ['scalability', 'graph', tier.name],
        difficulty: tier.difficulty,
      });

      // Symbol lookup operation test
      testCases.push({
        id: `scalability:symbol-lookup:${tier.name}`,
        description: `Symbol lookups in ${tier.count} file graph`,
        input: {
          fileCount: tier.count,
          entryPoints: entryPoints,
          operation: 'symbol-lookup',
        },
        expected: {
          maxLatencyMs: 1000, // Symbol lookup should be fast regardless of size
        },
        tags: ['scalability', 'lookup', tier.name],
        difficulty: tier.difficulty,
      });
    }

    this.log.info(`Generated ${testCases.length} scalability test cases`);
    return testCases;
  }

  /**
   * Calculate size tiers based on available files
   */
  private calculateTiers(
    totalFiles: number
  ): Array<{ name: string; count: number; difficulty: 'easy' | 'medium' | 'hard' }> {
    const tiers: Array<{ name: string; count: number; difficulty: 'easy' | 'medium' | 'hard' }> =
      [];

    // Small tier (up to 10 files)
    if (totalFiles >= 5) {
      tiers.push({ name: 'small', count: Math.min(10, totalFiles), difficulty: 'easy' });
    }

    // Medium tier (up to 50 files)
    if (totalFiles >= 20) {
      tiers.push({ name: 'medium', count: Math.min(50, totalFiles), difficulty: 'medium' });
    }

    // Large tier (up to 200 files)
    if (totalFiles >= 100) {
      tiers.push({ name: 'large', count: Math.min(200, totalFiles), difficulty: 'hard' });
    }

    // XLarge tier (all files if > 200)
    if (totalFiles > 200) {
      tiers.push({ name: 'xlarge', count: totalFiles, difficulty: 'hard' });
    }

    // If we have very few files, create at least one tier
    if (tiers.length === 0 && totalFiles > 0) {
      tiers.push({ name: 'tiny', count: totalFiles, difficulty: 'easy' });
    }

    return tiers;
  }

  /**
   * Run a single test case
   */
  async runTestCase(testCase: BenchmarkTestCase): Promise<TestCaseResult> {
    const scalabilityCase = testCase as ScalabilityTestCase;
    const startTime = Date.now();
    const startMemory = this.getMemorySnapshot();

    const metrics: MetricMeasurement[] = [];
    let passed = true;
    let error: string | undefined;
    let actual: Record<string, unknown> = {};

    try {
      switch (scalabilityCase.input.operation) {
        case 'parse':
          actual = await this.benchmarkParse(scalabilityCase, metrics);
          break;
        case 'build-graph':
          actual = await this.benchmarkBuildGraph(scalabilityCase, metrics);
          break;
        case 'symbol-lookup':
          actual = await this.benchmarkSymbolLookup(scalabilityCase, metrics);
          break;
        default:
          throw new Error(`Unknown operation: ${scalabilityCase.input.operation}`);
      }

      // Check expectations
      const validation = this.validateExpectations(scalabilityCase.expected, actual, metrics);
      passed = validation.passed;
      if (!validation.passed) {
        error = validation.reason;
      }
    } catch (e) {
      passed = false;
      error = e instanceof Error ? e.message : String(e);
    }

    const endMemory = this.getMemorySnapshot();
    const executionTimeMs = Date.now() - startTime;

    // Add memory metrics
    metrics.push({
      name: 'peak_memory_mb',
      value: Math.max(endMemory.rss, startMemory.rss) / (1024 * 1024),
      unit: 'MB',
    });

    metrics.push({
      name: 'memory_delta_mb',
      value: (endMemory.heapUsed - startMemory.heapUsed) / (1024 * 1024),
      unit: 'MB',
    });

    return {
      testCaseId: testCase.id,
      passed,
      actual,
      executionTimeMs,
      memoryUsedBytes: endMemory.heapUsed - startMemory.heapUsed,
      metrics,
      error,
    };
  }

  /**
   * Benchmark file parsing
   */
  private async benchmarkParse(
    testCase: ScalabilityTestCase,
    metrics: MetricMeasurement[]
  ): Promise<Record<string, unknown>> {
    const timing = new TimingCollector();
    let filesProcessed = 0;
    let totalLines = 0;

    for (const entryPoint of testCase.input.entryPoints) {
      const opStart = Date.now();

      try {
        await this.adapter.parseFile(entryPoint);
        filesProcessed++;

        // Count lines
        const content = await readFile(entryPoint, 'utf-8');
        totalLines += content.split('\n').length;

        timing.record(Date.now() - opStart);
      } catch {
        // Skip files that fail to parse
      }
    }

    const measurements = timing.getMeasurements();
    const totalTime = measurements.reduce((a, b) => a + b, 0);
    const avgTime = measurements.length > 0 ? totalTime / measurements.length : 0;
    const throughput = totalTime > 0 ? (filesProcessed / totalTime) * 1000 : 0;

    metrics.push({ name: 'files_processed', value: filesProcessed, unit: 'count' });
    metrics.push({ name: 'total_lines', value: totalLines, unit: 'count' });
    metrics.push({ name: 'throughput', value: throughput, unit: 'files/sec' });
    metrics.push({ name: 'avg_parse_time', value: avgTime, unit: 'ms' });

    return {
      filesProcessed,
      totalLines,
      throughput,
      avgParseTimeMs: avgTime,
    };
  }

  /**
   * Benchmark dependency graph building
   */
  private async benchmarkBuildGraph(
    testCase: ScalabilityTestCase,
    metrics: MetricMeasurement[]
  ): Promise<Record<string, unknown>> {
    const startTime = Date.now();

    // Build the dependency graph
    const graph = await this.scout.buildDependencyGraph(testCase.input.entryPoints);
    const stats = this.scout.getGraphStats(graph);

    const totalTime = Date.now() - startTime;
    const throughput = stats.totalFiles > 0 ? (stats.totalFiles / totalTime) * 1000 : 0;

    metrics.push({ name: 'graph_nodes', value: stats.totalFiles, unit: 'count' });
    metrics.push({ name: 'graph_edges', value: stats.totalImports, unit: 'count' });
    metrics.push({ name: 'symbols_extracted', value: stats.totalSymbols, unit: 'count' });
    metrics.push({ name: 'circular_deps', value: stats.circularCount, unit: 'count' });
    metrics.push({ name: 'build_throughput', value: throughput, unit: 'files/sec' });
    metrics.push({ name: 'build_time', value: totalTime, unit: 'ms' });

    return {
      totalFiles: stats.totalFiles,
      totalImports: stats.totalImports,
      totalSymbols: stats.totalSymbols,
      circularDeps: stats.circularCount,
      buildTimeMs: totalTime,
      throughput,
    };
  }

  /**
   * Benchmark symbol lookups
   */
  private async benchmarkSymbolLookup(
    testCase: ScalabilityTestCase,
    metrics: MetricMeasurement[]
  ): Promise<Record<string, unknown>> {
    // First build the graph
    const graph = await this.scout.buildDependencyGraph(testCase.input.entryPoints);
    const stats = this.scout.getGraphStats(graph);

    // Collect some symbol names to search for
    const symbolNames: string[] = [];
    for (const [, node] of graph.nodes) {
      for (const symbol of node.symbols) {
        if (symbol.type !== 'call' && symbolNames.length < 20) {
          symbolNames.push(symbol.name);
        }
      }
    }

    // Benchmark lookups
    const timing = new TimingCollector();
    let totalFound = 0;

    for (const symbolName of symbolNames) {
      const opStart = Date.now();
      const results = await this.scout.findSymbolDefinitions(symbolName, graph);
      timing.record(Date.now() - opStart);
      totalFound += results.length;
    }

    const percentiles = timing.getPercentiles();

    metrics.push({ name: 'lookups_performed', value: symbolNames.length, unit: 'count' });
    metrics.push({ name: 'total_results', value: totalFound, unit: 'count' });
    metrics.push({ name: 'lookup_p50', value: percentiles.p50, unit: 'ms' });
    metrics.push({ name: 'lookup_p95', value: percentiles.p95, unit: 'ms' });
    metrics.push({ name: 'lookup_p99', value: percentiles.p99, unit: 'ms' });
    metrics.push({ name: 'lookup_mean', value: percentiles.mean, unit: 'ms' });

    return {
      graphSize: stats.totalFiles,
      lookupsPerformed: symbolNames.length,
      totalResults: totalFound,
      latencyP50: percentiles.p50,
      latencyP95: percentiles.p95,
      latencyP99: percentiles.p99,
      latencyMean: percentiles.mean,
    };
  }

  /**
   * Validate results against expectations
   */
  private validateExpectations(
    expected: ScalabilityTestCase['expected'],
    actual: Record<string, unknown>,
    metrics: MetricMeasurement[]
  ): { passed: boolean; reason?: string } {
    // Check throughput
    if (expected.minThroughput !== undefined) {
      const throughput = metrics.find(m => m.name.includes('throughput'))?.value || 0;
      if (throughput < expected.minThroughput) {
        return {
          passed: false,
          reason: `Throughput ${throughput.toFixed(2)} below minimum ${expected.minThroughput}`,
        };
      }
    }

    // Check latency
    if (expected.maxLatencyMs !== undefined) {
      const buildTime = (actual.buildTimeMs as number) || 0;
      if (buildTime > expected.maxLatencyMs) {
        return {
          passed: false,
          reason: `Latency ${buildTime}ms exceeds maximum ${expected.maxLatencyMs}ms`,
        };
      }
    }

    // Check memory
    if (expected.maxMemoryMB !== undefined) {
      const memoryMB = metrics.find(m => m.name === 'peak_memory_mb')?.value || 0;
      if (memoryMB > expected.maxMemoryMB) {
        return {
          passed: false,
          reason: `Memory ${memoryMB.toFixed(2)}MB exceeds maximum ${expected.maxMemoryMB}MB`,
        };
      }
    }

    return { passed: true };
  }

  /**
   * Get current memory snapshot
   */
  private getMemorySnapshot(): MemorySnapshot {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
    };
  }

  /**
   * Run the complete suite
   */
  async run(_config: BenchmarkSuiteConfig, datasetPath: string): Promise<BenchmarkSuiteResult> {
    const startTime = Date.now();
    const testCases = await this.loadTestCases(datasetPath);
    const testResults: TestCaseResult[] = [];
    const collector = new MetricsCollector();

    for (const testCase of testCases) {
      const result = await this.runTestCase(testCase);
      testResults.push(result);
      collector.recordTestResult(result);

      // Clear caches between tests for accurate measurements
      this.scout.clearCache();

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }

    const totalExecutionTimeMs = Date.now() - startTime;

    return {
      config: {
        name: this.name,
        description: this.description,
      },
      testResults,
      aggregatedMetrics: collector.getAggregatedMetrics(),
      latencyStats: collector.getLatencyStats(),
      totalExecutionTimeMs,
      timestamp: new Date().toISOString(),
      systemVersion: 'seu-claude-v2',
    };
  }
}
