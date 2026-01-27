/**
 * Tests for StatisticalAnalysis
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StatisticalAnalysis } from './StatisticalAnalysis.js';

describe('StatisticalAnalysis', () => {
  let stats: StatisticalAnalysis;

  beforeEach(() => {
    // Use fixed seed for reproducibility
    stats = new StatisticalAnalysis(42);
  });

  describe('bootstrapCI', () => {
    it('should return zeros for empty array', () => {
      const result = stats.bootstrapCI([]);
      expect(result.mean).toBe(0);
      expect(result.ci95).toEqual([0, 0]);
      expect(result.stdError).toBe(0);
    });

    it('should handle single value', () => {
      const result = stats.bootstrapCI([42]);
      expect(result.mean).toBe(42);
      expect(result.ci95).toEqual([42, 42]);
      expect(result.stdError).toBe(0);
    });

    it('should compute valid confidence intervals', () => {
      // Generate sample data with known properties
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = stats.bootstrapCI(values, { iterations: 1000 });

      // Mean should be 5.5
      expect(result.mean).toBe(5.5);

      // CI should contain the mean
      expect(result.ci95[0]).toBeLessThanOrEqual(result.mean);
      expect(result.ci95[1]).toBeGreaterThanOrEqual(result.mean);

      // CI should be reasonable (not too wide, not too narrow)
      const ciWidth = result.ci95[1] - result.ci95[0];
      expect(ciWidth).toBeGreaterThan(0);
      expect(ciWidth).toBeLessThan(10);
    });

    it('should produce narrower CIs with larger samples', () => {
      const smallSample = [1, 2, 3, 4, 5];
      const largeSample = Array.from({ length: 100 }, (_, i) => (i % 5) + 1);

      const smallResult = stats.bootstrapCI(smallSample, { iterations: 500 });
      const largeResult = stats.bootstrapCI(largeSample, { iterations: 500 });

      const smallWidth = smallResult.ci95[1] - smallResult.ci95[0];
      const largeWidth = largeResult.ci95[1] - largeResult.ci95[0];

      // Larger sample should have narrower CI
      expect(largeWidth).toBeLessThan(smallWidth);
    });
  });

  describe('mannWhitneyU', () => {
    it('should return non-significant for identical distributions', () => {
      const sample1 = [1, 2, 3, 4, 5];
      const sample2 = [1, 2, 3, 4, 5];

      const result = stats.mannWhitneyU(sample1, sample2);

      expect(result.isSignificant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('should return significant for very different distributions', () => {
      const sample1 = [1, 2, 3, 4, 5];
      const sample2 = [100, 101, 102, 103, 104];

      const result = stats.mannWhitneyU(sample1, sample2);

      expect(result.isSignificant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
    });

    it('should handle empty samples', () => {
      const result = stats.mannWhitneyU([], [1, 2, 3]);

      expect(result.isSignificant).toBe(false);
      expect(result.pValue).toBe(1);
    });

    it('should include effect size interpretation', () => {
      const sample1 = [1, 2, 3, 4, 5];
      const sample2 = [6, 7, 8, 9, 10];

      const result = stats.mannWhitneyU(sample1, sample2);

      expect(['negligible', 'small', 'medium', 'large']).toContain(result.effectInterpretation);
    });
  });

  describe('cohensD', () => {
    it('should return 0 for identical samples', () => {
      const sample = [1, 2, 3, 4, 5];
      const d = stats.cohensD(sample, sample);
      expect(d).toBe(0);
    });

    it('should return large effect size for very different means', () => {
      // Samples with variance to avoid division by zero in pooled std
      const sample1 = [1, 2, 3, 4, 5];
      const sample2 = [11, 12, 13, 14, 15];

      const d = stats.cohensD(sample1, sample2);

      // Effect size should be large (> 0.8)
      // Mean diff = 10, pooled std ≈ 1.58, so d ≈ 6.3
      expect(Math.abs(d)).toBeGreaterThan(0.8);
    });

    it('should return small effect size for overlapping distributions', () => {
      // Overlapping distributions with similar means
      const sample1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const sample2 = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

      const d = stats.cohensD(sample1, sample2);

      // Effect size should be small (means differ by 1, std ≈ 3)
      expect(Math.abs(d)).toBeLessThan(0.5);
    });

    it('should handle empty samples', () => {
      expect(stats.cohensD([], [1, 2, 3])).toBe(0);
      expect(stats.cohensD([1, 2, 3], [])).toBe(0);
    });
  });

  describe('kFoldCV', () => {
    it('should split data into k folds', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const k = 5;

      const result = stats.kFoldCV(data, k, (train, test) => {
        // Each test fold should be 2 items (10/5)
        expect(test.length).toBe(2);
        // Training should have remaining items
        expect(train.length).toBe(8);
        return test.reduce((a, b) => a + b, 0) / test.length;
      });

      expect(result.foldResults).toHaveLength(k);
    });

    it('should compute mean and stdDev of fold results', () => {
      const data = Array.from({ length: 20 }, (_, i) => i + 1);

      const result = stats.kFoldCV(data, 4, (_train, test) => {
        return test.reduce((a, b) => a + b, 0) / test.length;
      });

      // Mean should be reasonable
      expect(result.mean).toBeGreaterThan(0);
      // StdDev should be defined
      expect(result.stdDev).toBeGreaterThanOrEqual(0);
    });
  });

  describe('compareBenchmarks', () => {
    it('should compare two benchmark results', () => {
      const baseline = {
        config: { name: 'test', description: 'Test suite' },
        testResults: [
          { testCaseId: '1', passed: true, actual: {}, executionTimeMs: 100, metrics: [] },
          { testCaseId: '2', passed: true, actual: {}, executionTimeMs: 150, metrics: [] },
        ],
        aggregatedMetrics: [
          { name: 'accuracy', value: 0.8, unit: 'ratio' },
        ],
        latencyStats: { p50: 100, p75: 120, p90: 140, p95: 150, p99: 160, min: 80, max: 170, mean: 125, stdDev: 20 },
        totalExecutionTimeMs: 1000,
        timestamp: '2024-01-01',
        systemVersion: 'v1',
      };

      const current = {
        config: { name: 'test', description: 'Test suite' },
        testResults: [
          { testCaseId: '1', passed: true, actual: {}, executionTimeMs: 90, metrics: [] },
          { testCaseId: '2', passed: true, actual: {}, executionTimeMs: 110, metrics: [] },
        ],
        aggregatedMetrics: [
          { name: 'accuracy', value: 0.85, unit: 'ratio' },
        ],
        latencyStats: { p50: 90, p75: 100, p90: 110, p95: 115, p99: 120, min: 70, max: 130, mean: 100, stdDev: 15 },
        totalExecutionTimeMs: 800,
        timestamp: '2024-01-02',
        systemVersion: 'v2',
      };

      const comparison = stats.compareBenchmarks(baseline, current);

      // Should have metric comparisons
      expect(comparison.metricComparisons.length).toBeGreaterThan(0);

      // Should have an assessment
      expect(['improved', 'regressed', 'unchanged']).toContain(comparison.assessment);

      // Should have significance level
      expect(comparison.significanceLevel).toBeGreaterThanOrEqual(0);
      expect(comparison.significanceLevel).toBeLessThanOrEqual(1);
    });
  });
});
