/**
 * Seu-Claude Benchmark Framework
 *
 * Industrial-grade benchmarking with PhD-level statistical rigor for evaluating
 * seu-claude's code understanding and retrieval capabilities.
 *
 * Usage:
 *   import { BenchmarkRunner, CodeUnderstandingSuite } from './benchmarks';
 *
 *   const runner = new BenchmarkRunner({ dataDir, projectRoot });
 *   await runner.initialize();
 *
 *   const suite = new CodeUnderstandingSuite();
 *   const result = await runner.runSuite(suite, config, datasetPath);
 *
 * Features:
 * - Integrates with seu-claude's TaskManager for persistent tracking
 * - PhD-level statistical analysis (bootstrap CI, Mann-Whitney U, Cohen's d)
 * - IR metrics (Precision@K, Recall, F1, MRR, MAP, NDCG)
 * - Multiple report formats (JSON, HTML, LaTeX, Markdown)
 * - Baseline comparisons (NaiveGrepBaseline)
 */

// Framework core
export * from './framework/index.js';

// Benchmark suites
export * from './suites/index.js';

// Baselines
export * from './baselines/index.js';
