/**
 * BenchmarkRunner - Orchestrates benchmark execution
 *
 * Uses seu-claude's TaskManager to:
 * - Track benchmark tasks persistently
 * - Cache expensive benchmark results
 * - Recover state after interruption
 *
 * Uses seu-claude's tools to benchmark:
 * - RecursiveScout for dependency analysis
 * - SearchCodebase for semantic/hybrid search
 * - CrossReferenceTracker for call graph accuracy
 */

import { join } from 'path';
import { mkdir } from 'fs/promises';
import { TaskManager } from '../../core/usecases/TaskManager.js';
import { SQLiteTaskStore } from '../../adapters/db/SQLiteTaskStore.js';
import { MetricsCollector } from './MetricsCollector.js';
import type {
  BenchmarkSuiteConfig,
  BenchmarkSuiteResult,
  BenchmarkTestCase,
  TestCaseResult,
  IBenchmarkSuite,
} from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * Configuration for the benchmark runner
 */
export interface BenchmarkRunnerConfig {
  /** Data directory for seu-claude */
  dataDir: string;
  /** Project root for seu-claude */
  projectRoot: string;
  /** Whether to use TaskManager for persistent tracking */
  usePersistence?: boolean;
  /** Git commit hash for versioning */
  gitCommit?: string;
  /** System version identifier */
  systemVersion?: string;
}

/**
 * Progress callback for benchmark execution
 */
export type ProgressCallback = (
  current: number,
  total: number,
  testCase: BenchmarkTestCase
) => void;

export class BenchmarkRunner {
  private config: BenchmarkRunnerConfig;
  private taskManager: TaskManager | null = null;
  private store: SQLiteTaskStore | null = null;
  private log = logger.child('benchmark-runner');

  constructor(config: BenchmarkRunnerConfig) {
    this.config = {
      usePersistence: true,
      systemVersion: 'seu-claude-v2',
      ...config,
    };
  }

  /**
   * Initialize the runner, setting up TaskManager if persistence is enabled
   */
  async initialize(): Promise<void> {
    if (this.config.usePersistence) {
      const benchmarkDataDir = join(this.config.dataDir, 'benchmarks');
      await mkdir(benchmarkDataDir, { recursive: true });

      this.store = new SQLiteTaskStore(join(benchmarkDataDir, 'benchmark-tasks.db'));
      this.taskManager = new TaskManager(this.store);

      this.log.info(`Benchmark runner initialized with persistence at ${benchmarkDataDir}`);
    } else {
      this.log.info('Benchmark runner initialized without persistence');
    }
  }

  /**
   * Run a benchmark suite
   */
  async runSuite(
    suite: IBenchmarkSuite,
    config: BenchmarkSuiteConfig,
    datasetPath: string,
    onProgress?: ProgressCallback
  ): Promise<BenchmarkSuiteResult> {
    const startTime = Date.now();
    const collector = new MetricsCollector();

    // Create root task for this benchmark run
    let rootTaskId: string | undefined;
    if (this.taskManager) {
      const rootTask = await this.taskManager.createRootGoal(
        `Benchmark: ${config.name} @ ${new Date().toISOString()}`
      );
      rootTaskId = rootTask.id;
      await this.taskManager.updateStatus(rootTaskId, 'running');
    }

    try {
      // Load test cases
      this.log.info(`Loading test cases for ${suite.name} from ${datasetPath}`);
      const testCases = await suite.loadTestCases(datasetPath);

      // Filter by tags and difficulty if specified
      let filteredCases = testCases;
      if (config.tags && config.tags.length > 0) {
        filteredCases = filteredCases.filter(
          tc => tc.tags && tc.tags.some(t => config.tags!.includes(t))
        );
      }
      if (config.difficulty && config.difficulty.length > 0) {
        filteredCases = filteredCases.filter(
          tc => tc.difficulty && config.difficulty!.includes(tc.difficulty)
        );
      }

      this.log.info(`Running ${filteredCases.length} test cases (${config.measurementIterations ?? 1} iterations)`);

      // Warmup iterations
      const warmupIterations = config.warmupIterations ?? 1;
      if (warmupIterations > 0) {
        this.log.info(`Running ${warmupIterations} warmup iteration(s)`);
        for (let i = 0; i < warmupIterations; i++) {
          const warmupCase = filteredCases[0];
          if (warmupCase) {
            await suite.runTestCase(warmupCase);
          }
        }
      }

      // Measurement iterations
      const measurementIterations = config.measurementIterations ?? 1;
      const testResults: TestCaseResult[] = [];

      for (let iter = 0; iter < measurementIterations; iter++) {
        for (let i = 0; i < filteredCases.length; i++) {
          const testCase = filteredCases[i];

          // Check if result is cached in TaskManager
          const cacheKey = `${suite.name}:${testCase.id}:iter${iter}`;
          let result: TestCaseResult;

          if (this.taskManager && rootTaskId) {
            const cached = await this.taskManager.getToolOutput(rootTaskId, cacheKey);
            if (cached) {
              this.log.debug(`Using cached result for ${testCase.id}`);
              result = cached as TestCaseResult;
            } else {
              result = await this.runTestCaseWithTimeout(suite, testCase, config.timeoutMs);
              await this.taskManager.cacheToolOutput(rootTaskId, cacheKey, result);
            }
          } else {
            result = await this.runTestCaseWithTimeout(suite, testCase, config.timeoutMs);
          }

          testResults.push(result);
          collector.recordTestResult(result);

          // Progress callback
          if (onProgress) {
            const current = iter * filteredCases.length + i + 1;
            const total = measurementIterations * filteredCases.length;
            onProgress(current, total, testCase);
          }
        }
      }

      const totalExecutionTimeMs = Date.now() - startTime;

      // Build result
      const suiteResult: BenchmarkSuiteResult = {
        config,
        testResults,
        aggregatedMetrics: collector.getAggregatedMetrics(),
        latencyStats: collector.getLatencyStats(),
        irMetrics: collector.getIRMetrics(),
        totalExecutionTimeMs,
        timestamp: new Date().toISOString(),
        systemVersion: this.config.systemVersion!,
        gitCommit: this.config.gitCommit,
      };

      // Mark task as completed and cache full result
      if (this.taskManager && rootTaskId) {
        await this.taskManager.cacheToolOutput(rootTaskId, 'suite_result', suiteResult);
        await this.taskManager.updateStatus(rootTaskId, 'completed');
      }

      this.log.info(
        `Suite ${config.name} completed: ${testResults.filter(r => r.passed).length}/${testResults.length} passed in ${totalExecutionTimeMs}ms`
      );

      return suiteResult;
    } catch (error) {
      // Mark task as failed
      if (this.taskManager && rootTaskId) {
        await this.taskManager.updateStatus(rootTaskId, 'failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  /**
   * Run a single test case with timeout
   */
  private async runTestCaseWithTimeout(
    suite: IBenchmarkSuite,
    testCase: BenchmarkTestCase,
    timeoutMs = 30000
  ): Promise<TestCaseResult> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          testCaseId: testCase.id,
          passed: false,
          actual: null,
          executionTimeMs: timeoutMs,
          metrics: [],
          error: `Timeout after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      suite
        .runTestCase(testCase)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          resolve({
            testCaseId: testCase.id,
            passed: false,
            actual: null,
            executionTimeMs: 0,
            metrics: [],
            error: error instanceof Error ? error.message : String(error),
          });
        });
    });
  }

  /**
   * Run multiple suites in sequence
   */
  async runSuites(
    suites: Array<{ suite: IBenchmarkSuite; config: BenchmarkSuiteConfig; datasetPath: string }>,
    onProgress?: (suiteName: string, current: number, total: number) => void
  ): Promise<Map<string, BenchmarkSuiteResult>> {
    const results = new Map<string, BenchmarkSuiteResult>();

    for (let i = 0; i < suites.length; i++) {
      const { suite, config, datasetPath } = suites[i];
      if (onProgress) {
        onProgress(config.name, i + 1, suites.length);
      }

      const result = await this.runSuite(suite, config, datasetPath);
      results.set(config.name, result);
    }

    return results;
  }

  /**
   * Get previously cached benchmark results
   */
  async getCachedResults(suiteName: string): Promise<BenchmarkSuiteResult[]> {
    if (!this.taskManager) {
      return [];
    }

    const allTasks = await this.taskManager.recoverState();
    const results: BenchmarkSuiteResult[] = [];

    for (const task of allTasks) {
      if (task.label.startsWith(`Benchmark: ${suiteName}`) && task.status === 'completed') {
        const cached = await this.taskManager.getToolOutput(task.id, 'suite_result');
        if (cached) {
          results.push(cached as BenchmarkSuiteResult);
        }
      }
    }

    return results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Compare two benchmark results
   */
  compareSuiteResults(
    baseline: BenchmarkSuiteResult,
    current: BenchmarkSuiteResult
  ): {
    metricName: string;
    baseline: number;
    current: number;
    percentChange: number;
    improved: boolean;
  }[] {
    const comparisons: {
      metricName: string;
      baseline: number;
      current: number;
      percentChange: number;
      improved: boolean;
    }[] = [];

    // Compare aggregated metrics
    const baselineMetrics = new Map(baseline.aggregatedMetrics.map(m => [m.name, m.value]));
    const currentMetrics = new Map(current.aggregatedMetrics.map(m => [m.name, m.value]));

    for (const [name, baselineValue] of baselineMetrics) {
      const currentValue = currentMetrics.get(name);
      if (currentValue !== undefined) {
        const percentChange =
          baselineValue !== 0 ? ((currentValue - baselineValue) / baselineValue) * 100 : 0;

        // Determine if improvement (higher is better for most metrics, lower for latency)
        const isLatency = name.includes('latency');
        const improved = isLatency ? currentValue < baselineValue : currentValue > baselineValue;

        comparisons.push({
          metricName: name,
          baseline: baselineValue,
          current: currentValue,
          percentChange,
          improved,
        });
      }
    }

    return comparisons;
  }

  /**
   * Get memory usage statistics
   */
  getMemoryUsage(): { heapUsed: number; heapTotal: number; rss: number } {
    const mem = process.memoryUsage();
    return {
      heapUsed: mem.heapUsed / (1024 * 1024),
      heapTotal: mem.heapTotal / (1024 * 1024),
      rss: mem.rss / (1024 * 1024),
    };
  }

  /**
   * Close the runner and clean up resources
   */
  async close(): Promise<void> {
    if (this.store) {
      this.store.close();
      this.store = null;
      this.taskManager = null;
    }
  }
}
