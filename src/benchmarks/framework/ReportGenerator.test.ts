/**
 * Tests for ReportGenerator
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReportGenerator } from './ReportGenerator.js';
import type { BenchmarkSuiteResult } from './types.js';
import { rm, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ReportGenerator', () => {
  let generator: ReportGenerator;
  let testDir: string;
  let mockResult: BenchmarkSuiteResult;

  beforeEach(() => {
    generator = new ReportGenerator();
    testDir = join(tmpdir(), `benchmark-report-test-${Date.now()}`);

    mockResult = {
      config: {
        name: 'test-suite',
        description: 'A test benchmark suite',
      },
      testResults: [
        {
          testCaseId: 'test-1',
          passed: true,
          actual: { value: 42 },
          executionTimeMs: 100,
          metrics: [{ name: 'custom', value: 0.9, unit: 'ratio' }],
        },
        {
          testCaseId: 'test-2',
          passed: false,
          actual: null,
          executionTimeMs: 200,
          metrics: [],
          error: 'Test failed',
        },
        {
          testCaseId: 'test-3',
          passed: true,
          actual: { value: 123 },
          executionTimeMs: 150,
          metrics: [],
        },
      ],
      aggregatedMetrics: [
        { name: 'pass_rate', value: 0.667, unit: 'ratio' },
        { name: 'latency_mean', value: 150, unit: 'ms', stdDev: 40 },
      ],
      latencyStats: {
        p50: 150,
        p75: 175,
        p90: 190,
        p95: 195,
        p99: 199,
        min: 100,
        max: 200,
        mean: 150,
        stdDev: 40,
      },
      irMetrics: {
        precisionAtK: { 1: 1.0, 3: 0.8, 5: 0.7, 10: 0.6, 20: 0.5 },
        recall: 0.85,
        f1: 0.75,
        mrr: 0.9,
        map: 0.8,
        ndcg: 0.85,
      },
      totalExecutionTimeMs: 5000,
      timestamp: '2024-01-27T12:00:00.000Z',
      systemVersion: 'seu-claude-v2-test',
      gitCommit: 'abc123',
    };
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('generateSuiteReport', () => {
    it('should generate JSON report', async () => {
      const paths = await generator.generateSuiteReport(mockResult, {
        outputDir: testDir,
        formats: ['json'],
      });

      expect(paths).toHaveLength(1);
      expect(paths[0]).toContain('.json');

      const content = await readFile(paths[0], 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.metadata.systemVersion).toBe('seu-claude-v2-test');
      expect(parsed.summary.totalTests).toBe(3);
      expect(parsed.summary.passed).toBe(2);
      expect(parsed.summary.failed).toBe(1);
    });

    it('should generate Markdown report', async () => {
      const paths = await generator.generateSuiteReport(mockResult, {
        outputDir: testDir,
        formats: ['markdown'],
        title: 'Test Report',
      });

      expect(paths).toHaveLength(1);
      expect(paths[0]).toContain('.md');

      const content = await readFile(paths[0], 'utf-8');

      // Check Markdown content
      expect(content).toContain('# Test Report');
      expect(content).toContain('seu-claude-v2-test');
      expect(content).toContain('abc123');
      expect(content).toContain('P50');
      expect(content).toContain('Precision@');
      expect(content).toContain('test-2'); // Failed test should be listed
    });

    it('should generate HTML report', async () => {
      const paths = await generator.generateSuiteReport(mockResult, {
        outputDir: testDir,
        formats: ['html'],
      });

      expect(paths).toHaveLength(1);
      expect(paths[0]).toContain('.html');

      const content = await readFile(paths[0], 'utf-8');

      // Check HTML structure
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('<title>');
      expect(content).toContain('test-suite');
      expect(content).toContain('66.7%'); // Pass rate
    });

    it('should generate LaTeX report', async () => {
      const paths = await generator.generateSuiteReport(mockResult, {
        outputDir: testDir,
        formats: ['latex'],
      });

      expect(paths).toHaveLength(1);
      expect(paths[0]).toContain('.tex');

      const content = await readFile(paths[0], 'utf-8');

      // Check LaTeX structure
      expect(content).toContain('\\documentclass');
      expect(content).toContain('\\begin{document}');
      expect(content).toContain('\\end{document}');
      expect(content).toContain('\\begin{table}');
    });

    it('should generate multiple formats at once', async () => {
      const paths = await generator.generateSuiteReport(mockResult, {
        outputDir: testDir,
        formats: ['json', 'markdown', 'html'],
      });

      expect(paths).toHaveLength(3);

      const extensions = paths.map(p => p.split('.').pop());
      expect(extensions).toContain('json');
      expect(extensions).toContain('md');
      expect(extensions).toContain('html');
    });

    it('should create output directory if it does not exist', async () => {
      const nestedDir = join(testDir, 'nested', 'deep', 'dir');

      const paths = await generator.generateSuiteReport(mockResult, {
        outputDir: nestedDir,
        formats: ['json'],
      });

      expect(paths).toHaveLength(1);

      // Verify file exists
      const stats = await stat(paths[0]);
      expect(stats.isFile()).toBe(true);
    });
  });

  describe('generateComparisonReport', () => {
    it('should generate comparison report', async () => {
      const comparison = {
        baseline: mockResult,
        current: {
          ...mockResult,
          timestamp: '2024-01-28T12:00:00.000Z',
          aggregatedMetrics: [
            { name: 'pass_rate', value: 0.8, unit: 'ratio' },
            { name: 'latency_mean', value: 120, unit: 'ms', stdDev: 30 },
          ],
        },
        metricComparisons: [
          {
            metricName: 'pass_rate',
            baselineValue: 0.667,
            currentValue: 0.8,
            percentChange: 19.9,
            effectSize: 0.5,
            pValue: 0.03,
            isSignificant: true,
          },
        ],
        assessment: 'improved' as const,
        significanceLevel: 0.5,
      };

      const paths = await generator.generateComparisonReport(comparison, {
        outputDir: testDir,
        formats: ['markdown'],
      });

      expect(paths).toHaveLength(1);

      const content = await readFile(paths[0], 'utf-8');
      expect(content).toContain('Comparison');
      expect(content).toContain('IMPROVED');
      expect(content).toContain('pass_rate');
    });
  });

  describe('edge cases', () => {
    it('should handle result with no IR metrics', async () => {
      const resultNoIR = { ...mockResult, irMetrics: undefined };

      const paths = await generator.generateSuiteReport(resultNoIR, {
        outputDir: testDir,
        formats: ['markdown'],
      });

      const content = await readFile(paths[0], 'utf-8');

      // Should not crash and should not include IR section
      expect(content).not.toContain('Information Retrieval Metrics');
    });

    it('should handle result with no failed tests', async () => {
      const resultAllPass = {
        ...mockResult,
        testResults: mockResult.testResults.filter(r => r.passed),
      };

      const paths = await generator.generateSuiteReport(resultAllPass, {
        outputDir: testDir,
        formats: ['markdown'],
      });

      const content = await readFile(paths[0], 'utf-8');

      // Should not include Failed Tests section
      expect(content).not.toContain('## Failed Tests');
    });

    it('should escape special characters in LaTeX', async () => {
      const resultSpecialChars = {
        ...mockResult,
        config: {
          ...mockResult.config,
          name: 'test_suite & more % special $ chars',
        },
      };

      const paths = await generator.generateSuiteReport(resultSpecialChars, {
        outputDir: testDir,
        formats: ['latex'],
      });

      const content = await readFile(paths[0], 'utf-8');

      // Special chars should be escaped
      expect(content).toContain('\\&');
      expect(content).toContain('\\%');
      expect(content).toContain('\\$');
    });
  });
});
