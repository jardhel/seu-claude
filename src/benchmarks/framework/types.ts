/**
 * Benchmark Framework Types
 *
 * PhD-level benchmarking types with statistical rigor for evaluating
 * seu-claude's code understanding and retrieval systems.
 *
 * Integrates with seu-claude infrastructure:
 * - TaskManager for persistent benchmark task tracking
 * - RecursiveScout for dependency analysis benchmarks
 * - SearchCodebase for retrieval benchmarks
 * - CrossReferenceTracker for call graph benchmarks
 * - Gatekeeper for validation benchmarks
 */

/**
 * A single metric measurement with statistical metadata
 */
export interface MetricMeasurement {
  /** Metric name (e.g., "precision@5", "recall", "latency_p95") */
  name: string;
  /** Raw value */
  value: number;
  /** Unit of measurement */
  unit: string;
  /** Standard deviation (if applicable) */
  stdDev?: number;
  /** 95% confidence interval */
  ci95?: [number, number];
  /** Number of samples */
  sampleCount?: number;
}

/**
 * Latency percentiles for performance measurement
 */
export interface LatencyPercentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
  stdDev: number;
}

/**
 * Information retrieval metrics (precision, recall, F1)
 */
export interface IRMetrics {
  /** Precision at various K values */
  precisionAtK: Record<number, number>;
  /** Recall score (0-1) */
  recall: number;
  /** F1 score (harmonic mean of precision and recall) */
  f1: number;
  /** Mean Reciprocal Rank */
  mrr: number;
  /** Mean Average Precision */
  map: number;
  /** Normalized Discounted Cumulative Gain */
  ndcg: number;
}

/**
 * A single test case for benchmarking
 */
export interface BenchmarkTestCase {
  /** Unique identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** Input query or parameters */
  input: unknown;
  /** Expected output (ground truth) */
  expected: unknown;
  /** Optional tags for filtering */
  tags?: string[];
  /** Difficulty level */
  difficulty?: 'easy' | 'medium' | 'hard';
}

/**
 * Result from running a single test case
 */
export interface TestCaseResult {
  /** Test case ID */
  testCaseId: string;
  /** Whether the test passed */
  passed: boolean;
  /** Actual output from the system under test */
  actual: unknown;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Memory used in bytes (if measurable) */
  memoryUsedBytes?: number;
  /** Specific metrics for this test case */
  metrics: MetricMeasurement[];
  /** Error message if failed */
  error?: string;
}

/**
 * Configuration for a benchmark suite
 */
export interface BenchmarkSuiteConfig {
  /** Suite name */
  name: string;
  /** Suite description */
  description: string;
  /** Number of warmup iterations */
  warmupIterations?: number;
  /** Number of measurement iterations */
  measurementIterations?: number;
  /** Timeout per test case in milliseconds */
  timeoutMs?: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Tags to filter test cases */
  tags?: string[];
  /** Difficulty filter */
  difficulty?: ('easy' | 'medium' | 'hard')[];
}

/**
 * Result from running a benchmark suite
 */
export interface BenchmarkSuiteResult {
  /** Suite configuration */
  config: BenchmarkSuiteConfig;
  /** Individual test case results */
  testResults: TestCaseResult[];
  /** Aggregated metrics */
  aggregatedMetrics: MetricMeasurement[];
  /** Latency statistics */
  latencyStats: LatencyPercentiles;
  /** IR metrics (if applicable) */
  irMetrics?: IRMetrics;
  /** Total execution time in milliseconds */
  totalExecutionTimeMs: number;
  /** Timestamp when the suite was run */
  timestamp: string;
  /** System under test version/identifier */
  systemVersion: string;
  /** Git commit hash (if available) */
  gitCommit?: string;
}

/**
 * Comparison between two benchmark results
 */
export interface BenchmarkComparison {
  /** Baseline result */
  baseline: BenchmarkSuiteResult;
  /** Current result */
  current: BenchmarkSuiteResult;
  /** Metric-by-metric comparison */
  metricComparisons: MetricComparison[];
  /** Overall assessment */
  assessment: 'improved' | 'regressed' | 'unchanged';
  /** Statistical significance of the difference */
  significanceLevel: number;
}

/**
 * Comparison of a single metric between two runs
 */
export interface MetricComparison {
  metricName: string;
  baselineValue: number;
  currentValue: number;
  /** Percentage change (positive = improvement for most metrics) */
  percentChange: number;
  /** Cohen's d effect size */
  effectSize: number;
  /** p-value from Mann-Whitney U test */
  pValue: number;
  /** Whether the change is statistically significant (p < 0.05) */
  isSignificant: boolean;
}

/**
 * Dataset metadata for benchmarking
 */
export interface BenchmarkDataset {
  /** Dataset identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Dataset description */
  description: string;
  /** Path to the dataset */
  path: string;
  /** Programming languages included */
  languages: string[];
  /** Total number of files */
  fileCount: number;
  /** Total lines of code */
  linesOfCode: number;
  /** Number of test cases */
  testCaseCount: number;
  /** Version of the dataset */
  version: string;
}

/**
 * Ground truth for accuracy benchmarks
 */
export interface GroundTruth {
  /** Query or input */
  query: string;
  /** Expected results (ordered by relevance) */
  relevantItems: string[];
  /** Relevance scores (optional, for graded relevance) */
  relevanceScores?: Record<string, number>;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Interface for benchmark suites to implement
 */
export interface IBenchmarkSuite {
  /** Suite name */
  readonly name: string;
  /** Suite description */
  readonly description: string;
  /** Supported languages */
  readonly supportedLanguages: string[];

  /**
   * Load test cases for this suite
   */
  loadTestCases(datasetPath: string): Promise<BenchmarkTestCase[]>;

  /**
   * Run a single test case
   */
  runTestCase(testCase: BenchmarkTestCase): Promise<TestCaseResult>;

  /**
   * Run all test cases with the given configuration
   */
  run(config: BenchmarkSuiteConfig, datasetPath: string): Promise<BenchmarkSuiteResult>;
}

/**
 * Interface for baseline implementations
 */
export interface IBaseline {
  /** Baseline name */
  readonly name: string;
  /** Baseline description */
  readonly description: string;

  /**
   * Search for symbols or code
   */
  search(query: string, options?: Record<string, unknown>): Promise<unknown[]>;

  /**
   * Analyze dependencies
   */
  analyzeDependencies(filePath: string): Promise<unknown>;
}
