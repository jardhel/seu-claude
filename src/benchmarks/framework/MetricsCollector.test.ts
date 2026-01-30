/**
 * Tests for MetricsCollector
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector, TimingCollector, IRMetricsCollector } from './MetricsCollector.js';

describe('TimingCollector', () => {
  let collector: TimingCollector;

  beforeEach(() => {
    collector = new TimingCollector();
  });

  it('should return zeros for empty collector', () => {
    const percentiles = collector.getPercentiles();
    expect(percentiles.p50).toBe(0);
    expect(percentiles.mean).toBe(0);
  });

  it('should calculate correct percentiles', () => {
    // Add 100 measurements: 1, 2, 3, ..., 100
    for (let i = 1; i <= 100; i++) {
      collector.record(i);
    }

    const percentiles = collector.getPercentiles();
    expect(percentiles.p50).toBe(50);
    expect(percentiles.p95).toBe(95);
    expect(percentiles.p99).toBe(99);
    expect(percentiles.min).toBe(1);
    expect(percentiles.max).toBe(100);
    expect(percentiles.mean).toBe(50.5);
  });

  it('should handle single measurement', () => {
    collector.record(42);
    const percentiles = collector.getPercentiles();
    expect(percentiles.p50).toBe(42);
    expect(percentiles.mean).toBe(42);
    expect(percentiles.stdDev).toBe(0);
  });

  it('should reset correctly', () => {
    collector.record(10);
    collector.record(20);
    collector.reset();
    expect(collector.getMeasurements()).toHaveLength(0);
  });
});

describe('IRMetricsCollector', () => {
  let collector: IRMetricsCollector;

  beforeEach(() => {
    collector = new IRMetricsCollector();
  });

  it('should calculate precision@K correctly', () => {
    // Query: retrieved 5 items, 3 are relevant
    const retrieved = ['a', 'b', 'c', 'd', 'e'];
    const relevant = new Set(['a', 'c', 'e']);

    collector.evaluateQuery(retrieved, relevant);
    const metrics = collector.getMetrics();

    // P@1 = 1/1 = 1.0 (first item is relevant)
    expect(metrics.precisionAtK[1]).toBe(1.0);
    // P@3 = 2/3 ≈ 0.667 (items a, c are relevant in top 3)
    expect(metrics.precisionAtK[3]).toBeCloseTo(0.667, 2);
    // P@5 = 3/5 = 0.6 (all 3 relevant items in top 5)
    expect(metrics.precisionAtK[5]).toBe(0.6);
  });

  it('should calculate recall correctly', () => {
    const retrieved = ['a', 'b', 'c'];
    const relevant = new Set(['a', 'c', 'x', 'y']); // 4 relevant, 2 retrieved

    collector.evaluateQuery(retrieved, relevant);
    const metrics = collector.getMetrics();

    // Recall = 2/4 = 0.5
    expect(metrics.recall).toBe(0.5);
  });

  it('should calculate MRR correctly', () => {
    // First relevant item at position 3
    const retrieved = ['x', 'y', 'a', 'b'];
    const relevant = new Set(['a', 'b']);

    collector.evaluateQuery(retrieved, relevant);
    const metrics = collector.getMetrics();

    // MRR = 1/3 ≈ 0.333
    expect(metrics.mrr).toBeCloseTo(0.333, 2);
  });

  it('should calculate NDCG correctly for binary relevance', () => {
    // Perfect ranking: all relevant items first
    const retrieved = ['a', 'b', 'x', 'y'];
    const relevant = new Set(['a', 'b']);

    collector.evaluateQuery(retrieved, relevant);
    const metrics = collector.getMetrics();

    // With perfect ranking, NDCG should be 1.0
    expect(metrics.ndcg).toBe(1.0);
  });

  it('should handle empty results', () => {
    collector.evaluateQuery([], new Set(['a', 'b']));
    const metrics = collector.getMetrics();

    expect(metrics.precisionAtK[1]).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.mrr).toBe(0);
  });
});

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  it('should record test results', () => {
    collector.recordTestResult({
      testCaseId: 'test1',
      passed: true,
      actual: {},
      executionTimeMs: 100,
      metrics: [],
    });

    collector.recordTestResult({
      testCaseId: 'test2',
      passed: false,
      actual: {},
      executionTimeMs: 200,
      metrics: [],
      error: 'Failed',
    });

    const results = collector.getTestResults();
    expect(results).toHaveLength(2);
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
  });

  it('should calculate pass rate', () => {
    collector.recordTestResult({
      testCaseId: 'test1',
      passed: true,
      actual: {},
      executionTimeMs: 100,
      metrics: [],
    });

    collector.recordTestResult({
      testCaseId: 'test2',
      passed: true,
      actual: {},
      executionTimeMs: 100,
      metrics: [],
    });

    collector.recordTestResult({
      testCaseId: 'test3',
      passed: false,
      actual: {},
      executionTimeMs: 100,
      metrics: [],
    });

    const metrics = collector.getAggregatedMetrics();
    const passRate = metrics.find(m => m.name === 'pass_rate');

    expect(passRate).toBeDefined();
    expect(passRate!.value).toBeCloseTo(0.667, 2);
  });

  it('should record custom metrics', () => {
    collector.recordCustomMetric('accuracy', 0.95);
    collector.recordCustomMetric('accuracy', 0.93);
    collector.recordCustomMetric('accuracy', 0.97);

    const metrics = collector.getAggregatedMetrics();
    const accuracy = metrics.find(m => m.name === 'accuracy');

    expect(accuracy).toBeDefined();
    expect(accuracy!.value).toBeCloseTo(0.95, 2);
    expect(accuracy!.sampleCount).toBe(3);
  });

  it('should serialize and deserialize', () => {
    collector.recordTestResult({
      testCaseId: 'test1',
      passed: true,
      actual: { data: 'test' },
      executionTimeMs: 150,
      metrics: [],
    });

    const serialized = collector.serialize();
    const newCollector = new MetricsCollector();
    newCollector.deserialize(serialized);

    const results = newCollector.getTestResults();
    expect(results).toHaveLength(1);
    expect(results[0].testCaseId).toBe('test1');
  });

  it('should reset all data', () => {
    collector.recordTestResult({
      testCaseId: 'test1',
      passed: true,
      actual: {},
      executionTimeMs: 100,
      metrics: [],
    });
    collector.recordCustomMetric('test', 1.0);

    collector.reset();

    expect(collector.getTestResults()).toHaveLength(0);
    expect(collector.getAggregatedMetrics().find(m => m.name === 'test')).toBeUndefined();
  });
});
