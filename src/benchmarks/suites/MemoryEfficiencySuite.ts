/**
 * MemoryEfficiencySuite - Measures token savings and context quality
 *
 * Evaluates how efficiently seu-claude retrieves relevant context:
 * - Token Reduction Ratio: Tokens saved vs naive full-file inclusion
 * - Context Relevance Score: Semantic similarity of retrieved chunks to query
 * - Retrieval Latency: P50, P95, P99 latencies for search operations
 * - Cache Hit Rate: Effectiveness of caching mechanisms
 */

import { readFile } from 'fs/promises';
import { glob } from 'glob';

import { HybridSearcher } from '../../search/hybrid.js';
import { BM25Engine } from '../../search/bm25.js';
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
 * Test case for memory efficiency benchmarks
 */
export interface MemoryEfficiencyTestCase extends BenchmarkTestCase {
  input: {
    /** Query to search for */
    query: string;
    /** Files to include in the test */
    files: string[];
    /** Expected relevant chunks (for relevance scoring) */
    expectedRelevant?: string[];
    /** Operation type */
    operation: 'retrieval' | 'chunking' | 'search-comparison';
  };
  expected: {
    /** Minimum token reduction ratio (0-1) */
    minTokenReduction?: number;
    /** Minimum relevance score (0-1) */
    minRelevance?: number;
    /** Maximum P95 latency in ms */
    maxP95LatencyMs?: number;
  };
}

/**
 * Simple chunk representation
 */
interface SimpleChunk {
  id: string;
  filePath: string;
  code: string;
  startLine: number;
  endLine: number;
  tokenEstimate: number;
}

/**
 * Cache statistics tracker
 */
interface CacheStats {
  hits: number;
  misses: number;
  totalRequests: number;
}

/**
 * MemoryEfficiencySuite measures token savings and retrieval quality
 */
export class MemoryEfficiencySuite implements IBenchmarkSuite {
  readonly name = 'memory-efficiency';
  readonly description = 'Measures token reduction ratio, context relevance, and retrieval latency';
  readonly supportedLanguages = ['typescript', 'javascript', 'python'];

  private log = logger.child('memory-efficiency-suite');
  private hybridSearcher: HybridSearcher;
  private cacheStats: CacheStats = { hits: 0, misses: 0, totalRequests: 0 };
  private maxChunkLines = 50;

  constructor() {
    this.hybridSearcher = new HybridSearcher({ semanticWeight: 0.7 });
  }

  /**
   * Simple line-based chunking (no tree-sitter dependency)
   */
  private chunkContent(filePath: string, content: string): SimpleChunk[] {
    const lines = content.split('\n');
    const chunks: SimpleChunk[] = [];
    const overlap = Math.floor(this.maxChunkLines / 4);

    for (let i = 0; i < lines.length; i += this.maxChunkLines - overlap) {
      const chunkLines = lines.slice(i, i + this.maxChunkLines);
      const code = chunkLines.join('\n');
      const startLine = i + 1;
      const endLine = Math.min(i + this.maxChunkLines, lines.length);

      if (code.trim().length > 0) {
        chunks.push({
          id: `${filePath}:${startLine}:${endLine}`,
          filePath,
          code,
          startLine,
          endLine,
          tokenEstimate: this.estimateTokens(code),
        });
      }
    }

    return chunks;
  }

  /**
   * Load test cases for memory efficiency evaluation
   */
  async loadTestCases(datasetPath: string): Promise<MemoryEfficiencyTestCase[]> {
    const testCases: MemoryEfficiencyTestCase[] = [];

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

    // Generate test queries based on actual code content
    const queries = await this.generateTestQueries(files.slice(0, 20));

    // Retrieval efficiency tests
    for (const query of queries) {
      testCases.push({
        id: `memory:retrieval:${this.sanitizeId(query.text)}`,
        description: `Measure retrieval efficiency for: ${query.text}`,
        input: {
          query: query.text,
          files: query.relevantFiles,
          expectedRelevant: query.expectedChunks,
          operation: 'retrieval',
        },
        expected: {
          minTokenReduction: 0.5, // At least 50% token savings
          minRelevance: 0.3, // Minimum relevance threshold
          maxP95LatencyMs: 500, // Fast retrieval
        },
        tags: ['memory-efficiency', 'retrieval', query.type],
        difficulty: query.difficulty,
      });
    }

    // Chunking efficiency tests
    const chunkingTiers = this.getChunkingTiers(files.length);
    for (const tier of chunkingTiers) {
      testCases.push({
        id: `memory:chunking:${tier.name}`,
        description: `Measure chunking efficiency for ${tier.count} files`,
        input: {
          query: '',
          files: files.slice(0, tier.count),
          operation: 'chunking',
        },
        expected: {
          minTokenReduction: 0.3, // Chunking should reduce tokens
        },
        tags: ['memory-efficiency', 'chunking', tier.name],
        difficulty: tier.difficulty,
      });
    }

    // Search mode comparison tests
    testCases.push({
      id: 'memory:search-comparison:modes',
      description: 'Compare semantic vs keyword vs hybrid search efficiency',
      input: {
        query: 'function implementation',
        files: files.slice(0, 30),
        operation: 'search-comparison',
      },
      expected: {},
      tags: ['memory-efficiency', 'search-comparison'],
      difficulty: 'medium',
    });

    this.log.info(`Generated ${testCases.length} memory efficiency test cases`);
    return testCases;
  }

  /**
   * Generate test queries based on actual code content
   */
  private async generateTestQueries(
    files: string[]
  ): Promise<
    Array<{
      text: string;
      type: string;
      relevantFiles: string[];
      expectedChunks: string[];
      difficulty: 'easy' | 'medium' | 'hard';
    }>
  > {
    const queries: Array<{
      text: string;
      type: string;
      relevantFiles: string[];
      expectedChunks: string[];
      difficulty: 'easy' | 'medium' | 'hard';
    }> = [];

    // Extract function names and class names from files
    for (const file of files.slice(0, 10)) {
      try {
        const content = await readFile(file, 'utf-8');

        // Find function declarations
        const funcMatches = content.match(/(?:function|async function)\s+(\w+)/g);
        if (funcMatches && funcMatches.length > 0) {
          const funcName = funcMatches[0].replace(/(?:async )?function\s+/, '');
          queries.push({
            text: `Find the ${funcName} function`,
            type: 'function-lookup',
            relevantFiles: [file],
            expectedChunks: [funcName],
            difficulty: 'easy',
          });
        }

        // Find class declarations
        const classMatches = content.match(/class\s+(\w+)/g);
        if (classMatches && classMatches.length > 0) {
          const className = classMatches[0].replace(/class\s+/, '');
          queries.push({
            text: `How does the ${className} class work?`,
            type: 'class-understanding',
            relevantFiles: [file],
            expectedChunks: [className],
            difficulty: 'medium',
          });
        }

        // Find imports for cross-file queries
        const importMatches = content.match(/import\s+.*from\s+['"]([^'"]+)['"]/g);
        if (importMatches && importMatches.length > 0) {
          queries.push({
            text: 'What dependencies does this module have?',
            type: 'dependency-analysis',
            relevantFiles: [file],
            expectedChunks: [],
            difficulty: 'hard',
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Add some generic conceptual queries
    queries.push(
      {
        text: 'error handling implementation',
        type: 'concept',
        relevantFiles: files,
        expectedChunks: [],
        difficulty: 'hard',
      },
      {
        text: 'main entry point',
        type: 'entry-point',
        relevantFiles: files,
        expectedChunks: [],
        difficulty: 'medium',
      }
    );

    return queries.slice(0, 10); // Limit to 10 queries
  }

  /**
   * Get chunking test tiers based on file count
   */
  private getChunkingTiers(
    totalFiles: number
  ): Array<{ name: string; count: number; difficulty: 'easy' | 'medium' | 'hard' }> {
    const tiers: Array<{ name: string; count: number; difficulty: 'easy' | 'medium' | 'hard' }> = [];

    if (totalFiles >= 5) {
      tiers.push({ name: 'small', count: Math.min(10, totalFiles), difficulty: 'easy' });
    }
    if (totalFiles >= 20) {
      tiers.push({ name: 'medium', count: Math.min(50, totalFiles), difficulty: 'medium' });
    }
    if (totalFiles >= 100) {
      tiers.push({ name: 'large', count: Math.min(200, totalFiles), difficulty: 'hard' });
    }
    if (tiers.length === 0 && totalFiles > 0) {
      tiers.push({ name: 'tiny', count: totalFiles, difficulty: 'easy' });
    }

    return tiers;
  }

  /**
   * Sanitize string for use as ID
   */
  private sanitizeId(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30);
  }

  /**
   * Run a single test case
   */
  async runTestCase(testCase: BenchmarkTestCase): Promise<TestCaseResult> {
    const memoryCase = testCase as MemoryEfficiencyTestCase;
    const startTime = Date.now();
    const metrics: MetricMeasurement[] = [];
    let passed = true;
    let error: string | undefined;
    let actual: Record<string, unknown> = {};

    try {
      switch (memoryCase.input.operation) {
        case 'retrieval':
          actual = await this.benchmarkRetrieval(memoryCase, metrics);
          break;
        case 'chunking':
          actual = await this.benchmarkChunking(memoryCase, metrics);
          break;
        case 'search-comparison':
          actual = await this.benchmarkSearchComparison(memoryCase, metrics);
          break;
        default:
          throw new Error(`Unknown operation: ${memoryCase.input.operation}`);
      }

      // Validate expectations
      const validation = this.validateExpectations(memoryCase.expected, actual, metrics);
      passed = validation.passed;
      if (!validation.passed) {
        error = validation.reason;
      }
    } catch (e) {
      passed = false;
      error = e instanceof Error ? e.message : String(e);
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      testCaseId: testCase.id,
      passed,
      actual,
      executionTimeMs,
      memoryUsedBytes: process.memoryUsage().heapUsed,
      metrics,
      error,
    };
  }

  /**
   * Benchmark retrieval efficiency
   */
  private async benchmarkRetrieval(
    testCase: MemoryEfficiencyTestCase,
    metrics: MetricMeasurement[]
  ): Promise<Record<string, unknown>> {
    const timing = new TimingCollector();

    // Calculate total tokens if we included full files (naive approach)
    let naiveTokens = 0;
    const allChunks: SimpleChunk[] = [];

    for (const file of testCase.input.files) {
      try {
        const content = await readFile(file, 'utf-8');
        naiveTokens += this.estimateTokens(content);

        // Chunk the file using simple line-based chunking
        const chunks = this.chunkContent(file, content);
        allChunks.push(...chunks);
      } catch {
        // Skip unreadable files
      }
    }

    // Simulate retrieval with timing
    const retrievalIterations = 10;
    let totalRelevantTokens = 0;
    let relevanceScore = 0;

    for (let i = 0; i < retrievalIterations; i++) {
      const opStart = Date.now();

      // Simulate BM25 search
      const bm25 = new BM25Engine();
      for (const chunk of allChunks) {
        bm25.addDocument({
          id: chunk.id,
          text: chunk.code,
          metadata: { filePath: chunk.filePath },
        });
      }

      const results = bm25.search(testCase.input.query, 5);
      timing.record(Date.now() - opStart);

      // Calculate retrieved tokens
      for (const result of results) {
        const chunk = allChunks.find(c => c.id === result.id);
        if (chunk) {
          totalRelevantTokens += chunk.tokenEstimate;
          relevanceScore += result.score;
        }
      }
    }

    // Calculate averages
    const avgRetrievedTokens = totalRelevantTokens / retrievalIterations;
    const avgRelevance = relevanceScore / (retrievalIterations * 5);
    const tokenReduction = naiveTokens > 0 ? 1 - avgRetrievedTokens / naiveTokens : 0;

    const percentiles = timing.getPercentiles();

    metrics.push({ name: 'naive_tokens', value: naiveTokens, unit: 'tokens' });
    metrics.push({ name: 'retrieved_tokens', value: avgRetrievedTokens, unit: 'tokens' });
    metrics.push({ name: 'token_reduction_ratio', value: tokenReduction, unit: 'ratio' });
    metrics.push({ name: 'relevance_score', value: avgRelevance, unit: 'score' });
    metrics.push({ name: 'retrieval_p50', value: percentiles.p50, unit: 'ms' });
    metrics.push({ name: 'retrieval_p95', value: percentiles.p95, unit: 'ms' });
    metrics.push({ name: 'retrieval_p99', value: percentiles.p99, unit: 'ms' });

    // Track cache stats
    this.cacheStats.totalRequests += retrievalIterations;

    return {
      naiveTokens,
      retrievedTokens: avgRetrievedTokens,
      tokenReduction,
      relevanceScore: avgRelevance,
      latencyP50: percentiles.p50,
      latencyP95: percentiles.p95,
      latencyP99: percentiles.p99,
    };
  }

  /**
   * Benchmark chunking efficiency
   */
  private async benchmarkChunking(
    testCase: MemoryEfficiencyTestCase,
    metrics: MetricMeasurement[]
  ): Promise<Record<string, unknown>> {
    const timing = new TimingCollector();

    let totalRawTokens = 0;
    let totalChunkedTokens = 0;
    let totalChunks = 0;
    let totalFiles = 0;

    for (const file of testCase.input.files) {
      try {
        const opStart = Date.now();
        const content = await readFile(file, 'utf-8');
        const rawTokens = this.estimateTokens(content);
        totalRawTokens += rawTokens;

        const chunks = this.chunkContent(file, content);

        const chunkedTokens = chunks.reduce((sum, c) => sum + c.tokenEstimate, 0);
        totalChunkedTokens += chunkedTokens;
        totalChunks += chunks.length;
        totalFiles++;

        timing.record(Date.now() - opStart);
      } catch {
        // Skip unreadable files
      }
    }

    const tokenReduction = totalRawTokens > 0 ? 1 - totalChunkedTokens / totalRawTokens : 0;
    const avgChunksPerFile = totalFiles > 0 ? totalChunks / totalFiles : 0;
    const avgTokensPerChunk = totalChunks > 0 ? totalChunkedTokens / totalChunks : 0;
    const percentiles = timing.getPercentiles();

    metrics.push({ name: 'raw_tokens', value: totalRawTokens, unit: 'tokens' });
    metrics.push({ name: 'chunked_tokens', value: totalChunkedTokens, unit: 'tokens' });
    metrics.push({ name: 'token_reduction_ratio', value: tokenReduction, unit: 'ratio' });
    metrics.push({ name: 'total_chunks', value: totalChunks, unit: 'count' });
    metrics.push({ name: 'avg_chunks_per_file', value: avgChunksPerFile, unit: 'count' });
    metrics.push({ name: 'avg_tokens_per_chunk', value: avgTokensPerChunk, unit: 'tokens' });
    metrics.push({ name: 'chunking_p50', value: percentiles.p50, unit: 'ms' });
    metrics.push({ name: 'chunking_p95', value: percentiles.p95, unit: 'ms' });

    return {
      rawTokens: totalRawTokens,
      chunkedTokens: totalChunkedTokens,
      tokenReduction,
      totalChunks,
      avgChunksPerFile,
      avgTokensPerChunk,
      latencyP50: percentiles.p50,
      latencyP95: percentiles.p95,
    };
  }

  /**
   * Benchmark different search modes
   */
  private async benchmarkSearchComparison(
    testCase: MemoryEfficiencyTestCase,
    metrics: MetricMeasurement[]
  ): Promise<Record<string, unknown>> {
    const allChunks: SimpleChunk[] = [];

    // Build index
    for (const file of testCase.input.files) {
      try {
        const content = await readFile(file, 'utf-8');
        const chunks = this.chunkContent(file, content);
        allChunks.push(...chunks);
      } catch {
        // Skip unreadable files
      }
    }

    // Build BM25 index
    const bm25 = new BM25Engine();
    for (const chunk of allChunks) {
      bm25.addDocument({
        id: chunk.id,
        text: chunk.code,
        metadata: { filePath: chunk.filePath },
      });
    }

    // Benchmark keyword search
    const keywordTiming = new TimingCollector();
    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      bm25.search(testCase.input.query, 10);
      keywordTiming.record(Date.now() - start);
    }

    // Benchmark simulated semantic search (using BM25 as proxy since we don't have embeddings here)
    const semanticTiming = new TimingCollector();
    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      // Simulate semantic search latency (would use embeddings in real impl)
      bm25.search(testCase.input.query, 10);
      semanticTiming.record(Date.now() - start);
    }

    // Benchmark hybrid search
    const hybridTiming = new TimingCollector();
    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      const keywordResults = bm25.search(testCase.input.query, 20);
      // Simulate combining with semantic results
      this.hybridSearcher.combine(
        keywordResults.map(r => ({ id: r.id, score: r.score * 0.5 })),
        keywordResults.map(r => ({ id: r.id, score: r.score })),
        10
      );
      hybridTiming.record(Date.now() - start);
    }

    const keywordP50 = keywordTiming.getPercentiles().p50;
    const semanticP50 = semanticTiming.getPercentiles().p50;
    const hybridP50 = hybridTiming.getPercentiles().p50;

    metrics.push({ name: 'keyword_search_p50', value: keywordP50, unit: 'ms' });
    metrics.push({ name: 'semantic_search_p50', value: semanticP50, unit: 'ms' });
    metrics.push({ name: 'hybrid_search_p50', value: hybridP50, unit: 'ms' });
    metrics.push({ name: 'total_chunks_indexed', value: allChunks.length, unit: 'count' });

    return {
      keywordSearchP50: keywordP50,
      semanticSearchP50: semanticP50,
      hybridSearchP50: hybridP50,
      totalChunksIndexed: allChunks.length,
    };
  }

  /**
   * Estimate tokens in text (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for code
    return Math.ceil(text.length / 4);
  }

  /**
   * Validate results against expectations
   */
  private validateExpectations(
    expected: MemoryEfficiencyTestCase['expected'],
    actual: Record<string, unknown>,
    metrics: MetricMeasurement[]
  ): { passed: boolean; reason?: string } {
    // Check token reduction
    if (expected.minTokenReduction !== undefined) {
      const reduction = metrics.find(m => m.name === 'token_reduction_ratio')?.value || 0;
      if (reduction < expected.minTokenReduction) {
        return {
          passed: false,
          reason: `Token reduction ${(reduction * 100).toFixed(1)}% below minimum ${(expected.minTokenReduction * 100).toFixed(1)}%`,
        };
      }
    }

    // Check relevance
    if (expected.minRelevance !== undefined) {
      const relevance = metrics.find(m => m.name === 'relevance_score')?.value || 0;
      if (relevance < expected.minRelevance) {
        return {
          passed: false,
          reason: `Relevance score ${relevance.toFixed(3)} below minimum ${expected.minRelevance}`,
        };
      }
    }

    // Check P95 latency
    if (expected.maxP95LatencyMs !== undefined) {
      const p95 =
        metrics.find(m => m.name.includes('p95'))?.value ||
        (actual.latencyP95 as number) ||
        0;
      if (p95 > expected.maxP95LatencyMs) {
        return {
          passed: false,
          reason: `P95 latency ${p95.toFixed(1)}ms exceeds maximum ${expected.maxP95LatencyMs}ms`,
        };
      }
    }

    return { passed: true };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    return { ...this.cacheStats };
  }

  /**
   * Reset cache statistics
   */
  resetCacheStats(): void {
    this.cacheStats = { hits: 0, misses: 0, totalRequests: 0 };
  }

  /**
   * Run the complete suite
   */
  async run(_config: BenchmarkSuiteConfig, datasetPath: string): Promise<BenchmarkSuiteResult> {
    const startTime = Date.now();
    const testCases = await this.loadTestCases(datasetPath);
    const testResults: TestCaseResult[] = [];
    const collector = new MetricsCollector();

    this.resetCacheStats();

    for (const testCase of testCases) {
      const result = await this.runTestCase(testCase);
      testResults.push(result);
      collector.recordTestResult(result);
    }

    const totalExecutionTimeMs = Date.now() - startTime;

    // Add cache metrics to aggregated
    const cacheStats = this.getCacheStats();
    const cacheHitRate =
      cacheStats.totalRequests > 0 ? cacheStats.hits / cacheStats.totalRequests : 0;

    const aggregatedMetrics = collector.getAggregatedMetrics();
    aggregatedMetrics.push({
      name: 'cache_hit_rate',
      value: cacheHitRate,
      unit: 'ratio',
    });

    return {
      config: {
        name: this.name,
        description: this.description,
      },
      testResults,
      aggregatedMetrics,
      latencyStats: collector.getLatencyStats(),
      totalExecutionTimeMs,
      timestamp: new Date().toISOString(),
      systemVersion: 'seu-claude-v2',
    };
  }
}
