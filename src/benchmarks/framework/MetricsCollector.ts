/**
 * MetricsCollector - Collects and aggregates benchmark metrics
 *
 * Integrates with seu-claude's TaskManager to persist metrics
 * and provide PhD-level statistical analysis.
 */

import type { MetricMeasurement, LatencyPercentiles, IRMetrics, TestCaseResult } from './types.js';

/**
 * Collects timing measurements for latency analysis
 */
export class TimingCollector {
  private measurements: number[] = [];

  /**
   * Record a timing measurement in milliseconds
   */
  record(durationMs: number): void {
    this.measurements.push(durationMs);
  }

  /**
   * Get latency percentiles
   */
  getPercentiles(): LatencyPercentiles {
    if (this.measurements.length === 0) {
      return {
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0,
        mean: 0,
        stdDev: 0,
      };
    }

    const sorted = [...this.measurements].sort((a, b) => a - b);
    const n = sorted.length;

    const percentile = (p: number): number => {
      const index = Math.ceil((p / 100) * n) - 1;
      return sorted[Math.max(0, Math.min(index, n - 1))];
    };

    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    return {
      p50: percentile(50),
      p75: percentile(75),
      p90: percentile(90),
      p95: percentile(95),
      p99: percentile(99),
      min: sorted[0],
      max: sorted[n - 1],
      mean,
      stdDev,
    };
  }

  /**
   * Get raw measurements
   */
  getMeasurements(): number[] {
    return [...this.measurements];
  }

  /**
   * Reset collector
   */
  reset(): void {
    this.measurements = [];
  }
}

/**
 * Collects IR (Information Retrieval) metrics
 */
export class IRMetricsCollector {
  private precisionAtK: Map<number, number[]> = new Map();
  private recalls: number[] = [];
  private reciprocalRanks: number[] = [];
  private averagePrecisions: number[] = [];
  private ndcgScores: number[] = [];

  /**
   * Record precision at K for a single query
   */
  recordPrecisionAtK(k: number, precision: number): void {
    if (!this.precisionAtK.has(k)) {
      this.precisionAtK.set(k, []);
    }
    this.precisionAtK.get(k)!.push(precision);
  }

  /**
   * Record recall for a single query
   */
  recordRecall(recall: number): void {
    this.recalls.push(recall);
  }

  /**
   * Record reciprocal rank (1/rank of first relevant result)
   */
  recordReciprocalRank(rank: number): void {
    this.reciprocalRanks.push(rank > 0 ? 1 / rank : 0);
  }

  /**
   * Record average precision for a single query
   */
  recordAveragePrecision(ap: number): void {
    this.averagePrecisions.push(ap);
  }

  /**
   * Record NDCG for a single query
   */
  recordNDCG(ndcg: number): void {
    this.ndcgScores.push(ndcg);
  }

  /**
   * Calculate metrics for a single query result
   */
  evaluateQuery(
    retrieved: string[],
    relevant: Set<string>,
    relevanceScores?: Map<string, number>
  ): void {
    // Precision@K for various K values
    const kValues = [1, 3, 5, 10, 20];
    for (const k of kValues) {
      const topK = retrieved.slice(0, k);
      const relevantInTopK = topK.filter(item => relevant.has(item)).length;
      this.recordPrecisionAtK(k, relevantInTopK / k);
    }

    // Recall
    const retrievedRelevant = retrieved.filter(item => relevant.has(item)).length;
    const recall = relevant.size > 0 ? retrievedRelevant / relevant.size : 0;
    this.recordRecall(recall);

    // Reciprocal Rank
    const firstRelevantIndex = retrieved.findIndex(item => relevant.has(item));
    this.recordReciprocalRank(firstRelevantIndex >= 0 ? firstRelevantIndex + 1 : 0);

    // Average Precision
    let ap = 0;
    let relevantCount = 0;
    for (let i = 0; i < retrieved.length; i++) {
      if (relevant.has(retrieved[i])) {
        relevantCount++;
        ap += relevantCount / (i + 1);
      }
    }
    this.recordAveragePrecision(relevant.size > 0 ? ap / relevant.size : 0);

    // NDCG (Normalized Discounted Cumulative Gain)
    if (relevanceScores) {
      const dcg = this.calculateDCG(retrieved, relevanceScores);
      const idealOrder = [...relevant].sort(
        (a, b) => (relevanceScores.get(b) ?? 0) - (relevanceScores.get(a) ?? 0)
      );
      const idcg = this.calculateDCG(idealOrder, relevanceScores);
      this.recordNDCG(idcg > 0 ? dcg / idcg : 0);
    } else {
      // Binary relevance NDCG
      const dcg = this.calculateBinaryDCG(retrieved, relevant);
      const idcg = this.calculateBinaryDCG([...relevant], relevant);
      this.recordNDCG(idcg > 0 ? dcg / idcg : 0);
    }
  }

  private calculateDCG(items: string[], relevanceScores: Map<string, number>): number {
    let dcg = 0;
    for (let i = 0; i < items.length; i++) {
      const rel = relevanceScores.get(items[i]) ?? 0;
      dcg += (Math.pow(2, rel) - 1) / Math.log2(i + 2);
    }
    return dcg;
  }

  private calculateBinaryDCG(items: string[], relevant: Set<string>): number {
    let dcg = 0;
    for (let i = 0; i < items.length; i++) {
      const rel = relevant.has(items[i]) ? 1 : 0;
      dcg += rel / Math.log2(i + 2);
    }
    return dcg;
  }

  /**
   * Get aggregated IR metrics
   */
  getMetrics(): IRMetrics {
    const mean = (arr: number[]): number =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const precisionAtKAggregated: Record<number, number> = {};
    for (const [k, values] of this.precisionAtK) {
      precisionAtKAggregated[k] = mean(values);
    }

    const recall = mean(this.recalls);
    const precision = precisionAtKAggregated[10] ?? 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      precisionAtK: precisionAtKAggregated,
      recall,
      f1,
      mrr: mean(this.reciprocalRanks),
      map: mean(this.averagePrecisions),
      ndcg: mean(this.ndcgScores),
    };
  }

  /**
   * Reset collector
   */
  reset(): void {
    this.precisionAtK.clear();
    this.recalls = [];
    this.reciprocalRanks = [];
    this.averagePrecisions = [];
    this.ndcgScores = [];
  }
}

/**
 * Main metrics collector that aggregates all measurements
 */
export class MetricsCollector {
  private timing: TimingCollector = new TimingCollector();
  private ir: IRMetricsCollector = new IRMetricsCollector();
  private testResults: TestCaseResult[] = [];
  private customMetrics: Map<string, number[]> = new Map();
  private memoryUsage: number[] = [];

  /**
   * Record a test case result
   */
  recordTestResult(result: TestCaseResult): void {
    this.testResults.push(result);
    this.timing.record(result.executionTimeMs);
    if (result.memoryUsedBytes) {
      this.memoryUsage.push(result.memoryUsedBytes);
    }
  }

  /**
   * Record a custom metric value
   */
  recordCustomMetric(name: string, value: number): void {
    if (!this.customMetrics.has(name)) {
      this.customMetrics.set(name, []);
    }
    this.customMetrics.get(name)!.push(value);
  }

  /**
   * Get the IR metrics collector
   */
  getIRCollector(): IRMetricsCollector {
    return this.ir;
  }

  /**
   * Get the timing collector
   */
  getTimingCollector(): TimingCollector {
    return this.timing;
  }

  /**
   * Get all test results
   */
  getTestResults(): TestCaseResult[] {
    return [...this.testResults];
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(): MetricMeasurement[] {
    const metrics: MetricMeasurement[] = [];
    const latency = this.timing.getPercentiles();

    // Latency metrics
    metrics.push({ name: 'latency_p50', value: latency.p50, unit: 'ms' });
    metrics.push({ name: 'latency_p95', value: latency.p95, unit: 'ms' });
    metrics.push({ name: 'latency_p99', value: latency.p99, unit: 'ms' });
    metrics.push({ name: 'latency_mean', value: latency.mean, unit: 'ms', stdDev: latency.stdDev });

    // Pass rate
    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    metrics.push({
      name: 'pass_rate',
      value: total > 0 ? passed / total : 0,
      unit: 'ratio',
      sampleCount: total,
    });

    // Memory usage
    if (this.memoryUsage.length > 0) {
      const mean =
        this.memoryUsage.reduce((a, b) => a + b, 0) / this.memoryUsage.length / (1024 * 1024);
      metrics.push({ name: 'memory_mean', value: mean, unit: 'MB' });
    }

    // IR metrics
    const irMetrics = this.ir.getMetrics();
    for (const [k, v] of Object.entries(irMetrics.precisionAtK)) {
      metrics.push({ name: `precision@${k}`, value: v, unit: 'ratio' });
    }
    metrics.push({ name: 'recall', value: irMetrics.recall, unit: 'ratio' });
    metrics.push({ name: 'f1', value: irMetrics.f1, unit: 'ratio' });
    metrics.push({ name: 'mrr', value: irMetrics.mrr, unit: 'ratio' });
    metrics.push({ name: 'map', value: irMetrics.map, unit: 'ratio' });
    metrics.push({ name: 'ndcg', value: irMetrics.ndcg, unit: 'ratio' });

    // Custom metrics
    for (const [name, values] of this.customMetrics) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      metrics.push({
        name,
        value: mean,
        unit: 'custom',
        stdDev: Math.sqrt(variance),
        sampleCount: values.length,
      });
    }

    return metrics;
  }

  /**
   * Get latency statistics
   */
  getLatencyStats(): LatencyPercentiles {
    return this.timing.getPercentiles();
  }

  /**
   * Get IR metrics
   */
  getIRMetrics(): IRMetrics {
    return this.ir.getMetrics();
  }

  /**
   * Reset all collectors
   */
  reset(): void {
    this.timing.reset();
    this.ir.reset();
    this.testResults = [];
    this.customMetrics.clear();
    this.memoryUsage = [];
  }

  /**
   * Serialize metrics for caching in TaskManager
   */
  serialize(): string {
    return JSON.stringify({
      testResults: this.testResults,
      timing: this.timing.getMeasurements(),
      customMetrics: Object.fromEntries(this.customMetrics),
      memoryUsage: this.memoryUsage,
    });
  }

  /**
   * Deserialize metrics from TaskManager cache
   */
  deserialize(data: string): void {
    const parsed = JSON.parse(data) as {
      testResults: TestCaseResult[];
      timing: number[];
      customMetrics: Record<string, number[]>;
      memoryUsage: number[];
    };

    this.testResults = parsed.testResults;
    for (const t of parsed.timing) {
      this.timing.record(t);
    }
    this.customMetrics = new Map(Object.entries(parsed.customMetrics));
    this.memoryUsage = parsed.memoryUsage;
  }
}
