/**
 * StatisticalAnalysis - PhD-level statistical rigor for benchmarks
 *
 * Provides:
 * - Bootstrap sampling for confidence intervals
 * - Mann-Whitney U test for significance testing
 * - Cohen's d for effect size
 * - Cross-validation for accuracy metrics
 */

import type { BenchmarkSuiteResult, MetricComparison, BenchmarkComparison } from './types.js';

/**
 * Bootstrap sampling configuration
 */
export interface BootstrapConfig {
  /** Number of bootstrap iterations (default: 1000) */
  iterations: number;
  /** Confidence level for intervals (default: 0.95) */
  confidenceLevel: number;
  /** Random seed for reproducibility */
  seed?: number;
}

/**
 * Result of statistical significance test
 */
export interface SignificanceTestResult {
  /** Test statistic */
  statistic: number;
  /** p-value */
  pValue: number;
  /** Whether the result is significant at the given alpha */
  isSignificant: boolean;
  /** Alpha level used */
  alpha: number;
  /** Effect size (Cohen's d) */
  effectSize: number;
  /** Effect size interpretation */
  effectInterpretation: 'negligible' | 'small' | 'medium' | 'large';
}

/**
 * Seeded random number generator for reproducibility
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    // Mulberry32 algorithm
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

export class StatisticalAnalysis {
  private rng: SeededRandom;
  private defaultConfig: BootstrapConfig = {
    iterations: 1000,
    confidenceLevel: 0.95,
  };

  constructor(seed?: number) {
    this.rng = new SeededRandom(seed ?? Date.now());
  }

  /**
   * Bootstrap confidence interval for a metric
   */
  bootstrapCI(
    values: number[],
    config: Partial<BootstrapConfig> = {}
  ): { mean: number; ci95: [number, number]; stdError: number } {
    const { iterations, confidenceLevel } = { ...this.defaultConfig, ...config };

    if (values.length === 0) {
      return { mean: 0, ci95: [0, 0], stdError: 0 };
    }

    if (values.length === 1) {
      return { mean: values[0], ci95: [values[0], values[0]], stdError: 0 };
    }

    const bootstrapMeans: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const sample = this.resample(values);
      const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
      bootstrapMeans.push(mean);
    }

    bootstrapMeans.sort((a, b) => a - b);

    const alpha = 1 - confidenceLevel;
    const lowerIndex = Math.floor((alpha / 2) * iterations);
    const upperIndex = Math.floor((1 - alpha / 2) * iterations);

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdError = this.standardDeviation(bootstrapMeans);

    return {
      mean,
      ci95: [bootstrapMeans[lowerIndex], bootstrapMeans[upperIndex]],
      stdError,
    };
  }

  /**
   * Mann-Whitney U test (non-parametric significance test)
   *
   * Tests whether two samples come from the same distribution.
   * Better than t-test when normality cannot be assumed.
   */
  mannWhitneyU(sample1: number[], sample2: number[], alpha = 0.05): SignificanceTestResult {
    if (sample1.length === 0 || sample2.length === 0) {
      return {
        statistic: 0,
        pValue: 1,
        isSignificant: false,
        alpha,
        effectSize: 0,
        effectInterpretation: 'negligible',
      };
    }

    const n1 = sample1.length;
    const n2 = sample2.length;

    // Combine and rank all values
    const combined = [
      ...sample1.map((v, i) => ({ value: v, group: 1, originalIndex: i })),
      ...sample2.map((v, i) => ({ value: v, group: 2, originalIndex: i })),
    ].sort((a, b) => a.value - b.value);

    // Assign ranks (handling ties)
    const ranks = this.assignRanks(combined.map(c => c.value));
    const rankedCombined = combined.map((c, i) => ({ ...c, rank: ranks[i] }));

    // Calculate U statistics
    const R1 = rankedCombined.filter(c => c.group === 1).reduce((sum, c) => sum + c.rank, 0);
    const U1 = n1 * n2 + (n1 * (n1 + 1)) / 2 - R1;
    const U2 = n1 * n2 - U1;
    const U = Math.min(U1, U2);

    // Calculate z-score for large samples
    const meanU = (n1 * n2) / 2;
    const stdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
    const z = stdU > 0 ? (U - meanU) / stdU : 0;

    // Approximate p-value using normal distribution
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    // Calculate effect size using Cohen's d
    const effectSize = this.cohensD(sample1, sample2);

    return {
      statistic: U,
      pValue,
      isSignificant: pValue < alpha,
      alpha,
      effectSize,
      effectInterpretation: this.interpretEffectSize(effectSize),
    };
  }

  /**
   * Cohen's d effect size
   *
   * Measures the standardized difference between two means.
   */
  cohensD(sample1: number[], sample2: number[]): number {
    if (sample1.length === 0 || sample2.length === 0) return 0;

    const mean1 = sample1.reduce((a, b) => a + b, 0) / sample1.length;
    const mean2 = sample2.reduce((a, b) => a + b, 0) / sample2.length;

    const var1 = this.variance(sample1);
    const var2 = this.variance(sample2);

    // Pooled standard deviation
    const n1 = sample1.length;
    const n2 = sample2.length;
    const pooledStd = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));

    return pooledStd > 0 ? (mean1 - mean2) / pooledStd : 0;
  }

  /**
   * K-fold cross-validation
   */
  kFoldCV<T, R>(
    data: T[],
    k: number,
    trainAndEvaluate: (train: T[], test: T[]) => R
  ): { foldResults: R[]; mean: number; stdDev: number } {
    const shuffled = this.rng.shuffle(data);
    const foldSize = Math.floor(data.length / k);
    const foldResults: R[] = [];
    const scores: number[] = [];

    for (let i = 0; i < k; i++) {
      const testStart = i * foldSize;
      const testEnd = i === k - 1 ? data.length : (i + 1) * foldSize;

      const test = shuffled.slice(testStart, testEnd);
      const train = [...shuffled.slice(0, testStart), ...shuffled.slice(testEnd)];

      const result = trainAndEvaluate(train, test);
      foldResults.push(result);

      // If result has a score property, use it
      if (typeof result === 'number') {
        scores.push(result);
      } else if (typeof result === 'object' && result !== null && 'score' in result) {
        scores.push((result as { score: number }).score);
      }
    }

    const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const stdDev = scores.length > 0 ? this.standardDeviation(scores) : 0;

    return { foldResults, mean, stdDev };
  }

  /**
   * Compare two benchmark results with full statistical analysis
   */
  compareBenchmarks(
    baseline: BenchmarkSuiteResult,
    current: BenchmarkSuiteResult
  ): BenchmarkComparison {
    const metricComparisons: MetricComparison[] = [];

    // Compare execution times
    const baselineTimes = baseline.testResults.map(r => r.executionTimeMs);
    const currentTimes = current.testResults.map(r => r.executionTimeMs);

    if (baselineTimes.length > 0 && currentTimes.length > 0) {
      const timeTest = this.mannWhitneyU(baselineTimes, currentTimes);
      const baselineMean = baselineTimes.reduce((a, b) => a + b, 0) / baselineTimes.length;
      const currentMean = currentTimes.reduce((a, b) => a + b, 0) / currentTimes.length;
      const percentChange =
        baselineMean !== 0 ? ((currentMean - baselineMean) / baselineMean) * 100 : 0;

      metricComparisons.push({
        metricName: 'execution_time',
        baselineValue: baselineMean,
        currentValue: currentMean,
        percentChange,
        effectSize: timeTest.effectSize,
        pValue: timeTest.pValue,
        isSignificant: timeTest.isSignificant,
      });
    }

    // Compare aggregated metrics
    const baselineMetrics = new Map(baseline.aggregatedMetrics.map(m => [m.name, m]));
    const currentMetrics = new Map(current.aggregatedMetrics.map(m => [m.name, m]));

    for (const [name, baselineMetric] of baselineMetrics) {
      const currentMetric = currentMetrics.get(name);
      if (currentMetric) {
        const percentChange =
          baselineMetric.value !== 0
            ? ((currentMetric.value - baselineMetric.value) / baselineMetric.value) * 100
            : 0;

        // Simple effect size approximation when we don't have raw samples
        const effectSize =
          baselineMetric.stdDev && baselineMetric.stdDev > 0
            ? (currentMetric.value - baselineMetric.value) / baselineMetric.stdDev
            : 0;

        metricComparisons.push({
          metricName: name,
          baselineValue: baselineMetric.value,
          currentValue: currentMetric.value,
          percentChange,
          effectSize,
          pValue: 1, // Would need raw samples for proper test
          isSignificant: Math.abs(percentChange) > 10, // Simple threshold
        });
      }
    }

    // Determine overall assessment
    const significantImprovements = metricComparisons.filter(
      c => c.isSignificant && c.percentChange > 0 && !c.metricName.includes('latency')
    ).length;
    const significantRegressions = metricComparisons.filter(
      c => c.isSignificant && c.percentChange < 0 && !c.metricName.includes('latency')
    ).length;

    let assessment: 'improved' | 'regressed' | 'unchanged';
    if (significantImprovements > significantRegressions) {
      assessment = 'improved';
    } else if (significantRegressions > significantImprovements) {
      assessment = 'regressed';
    } else {
      assessment = 'unchanged';
    }

    // Calculate overall significance level
    const significanceLevel =
      metricComparisons.length > 0
        ? metricComparisons.filter(c => c.isSignificant).length / metricComparisons.length
        : 0;

    return {
      baseline,
      current,
      metricComparisons,
      assessment,
      significanceLevel,
    };
  }

  // === Helper methods ===

  private resample(values: number[]): number[] {
    const n = values.length;
    const sample: number[] = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(this.rng.next() * n);
      sample.push(values[idx]);
    }
    return sample;
  }

  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private variance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  private assignRanks(sortedValues: number[]): number[] {
    const ranks: number[] = new Array(sortedValues.length);
    let i = 0;

    while (i < sortedValues.length) {
      let j = i;
      while (j < sortedValues.length && sortedValues[j] === sortedValues[i]) {
        j++;
      }
      // Average rank for ties
      const avgRank = (i + j + 1) / 2;
      for (let k = i; k < j; k++) {
        ranks[k] = avgRank;
      }
      i = j;
    }

    return ranks;
  }

  private normalCDF(z: number): number {
    // Approximation of normal CDF
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1.0 + sign * y);
  }

  private interpretEffectSize(d: number): 'negligible' | 'small' | 'medium' | 'large' {
    const absD = Math.abs(d);
    if (absD < 0.2) return 'negligible';
    if (absD < 0.5) return 'small';
    if (absD < 0.8) return 'medium';
    return 'large';
  }
}
