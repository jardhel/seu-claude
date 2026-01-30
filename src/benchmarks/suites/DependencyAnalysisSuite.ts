/**
 * DependencyAnalysisSuite - Benchmarks import resolution and dependency analysis
 *
 * Tests seu-claude's RecursiveScout capabilities:
 * - Relative imports (`./`, `../`)
 * - Absolute imports (`@org/package`)
 * - Dynamic imports
 * - Conditional imports
 * - Re-exports and barrel files
 * - Circular dependency detection
 *
 * Metrics: Resolution accuracy, circular detection rate, graph completeness
 */

import { readFile, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { RecursiveScout } from '../../core/usecases/RecursiveScout.js';
import { TreeSitterAdapter } from '../../adapters/parsers/TreeSitterAdapter.js';
import type {
  IBenchmarkSuite,
  BenchmarkSuiteConfig,
  BenchmarkSuiteResult,
  BenchmarkTestCase,
  TestCaseResult,
} from '../framework/types.js';
import { MetricsCollector } from '../framework/MetricsCollector.js';
import { logger } from '../../utils/logger.js';

/**
 * Test case for import resolution
 */
interface ImportResolutionTestCase extends BenchmarkTestCase {
  input: {
    sourcePath: string;
    entryPoints: string[];
  };
  expected: {
    resolvedImports: Array<{ from: string; to: string; type: string }>;
    unresolvedImports: string[];
  };
}

/**
 * Test case for circular dependency detection
 */
interface CircularDependencyTestCase extends BenchmarkTestCase {
  input: {
    entryPoints: string[];
  };
  expected: {
    circularDeps: string[][];
    hasCircular: boolean;
  };
}

/**
 * Test case for graph completeness
 */
interface GraphCompletenessTestCase extends BenchmarkTestCase {
  input: {
    entryPoints: string[];
  };
  expected: {
    totalNodes: number;
    totalEdges: number;
    roots: string[];
    leaves: string[];
  };
}

export class DependencyAnalysisSuite implements IBenchmarkSuite {
  readonly name = 'dependency-analysis';
  readonly description =
    'Benchmarks import resolution, circular detection, and graph completeness using RecursiveScout';
  readonly supportedLanguages = ['typescript', 'javascript', 'python'];

  private adapter: TreeSitterAdapter;
  private log = logger.child('dependency-analysis-suite');

  constructor() {
    this.adapter = new TreeSitterAdapter();
  }

  /**
   * Load test cases from a dataset directory
   *
   * Expected dataset structure:
   * dataset/
   *   ground-truth/
   *     import-resolution.json
   *     circular-deps.json
   *     graph-completeness.json
   *   source/
   *     ...source files to analyze...
   */
  async loadTestCases(datasetPath: string): Promise<BenchmarkTestCase[]> {
    const testCases: BenchmarkTestCase[] = [];
    const groundTruthDir = join(datasetPath, 'ground-truth');

    // Load import resolution test cases
    try {
      const importResPath = join(groundTruthDir, 'import-resolution.json');
      const importTests = JSON.parse(await readFile(importResPath, 'utf-8')) as Array<{
        id: string;
        description: string;
        sourcePath: string;
        entryPoints: string[];
        resolvedImports: Array<{ from: string; to: string; type: string }>;
        unresolvedImports: string[];
        difficulty?: 'easy' | 'medium' | 'hard';
        tags?: string[];
      }>;

      for (const test of importTests) {
        testCases.push({
          id: `import:${test.id}`,
          description: test.description,
          input: {
            sourcePath: join(datasetPath, 'source', test.sourcePath),
            entryPoints: test.entryPoints.map(p => join(datasetPath, 'source', p)),
          },
          expected: {
            resolvedImports: test.resolvedImports,
            unresolvedImports: test.unresolvedImports,
          },
          difficulty: test.difficulty,
          tags: [...(test.tags ?? []), 'import-resolution'],
        } as ImportResolutionTestCase);
      }
    } catch {
      this.log.warn('No import-resolution.json found, generating from source');
      const generated = await this.generateImportResolutionCases(datasetPath);
      testCases.push(...generated);
    }

    // Load circular dependency test cases
    try {
      const circularPath = join(groundTruthDir, 'circular-deps.json');
      const circularTests = JSON.parse(await readFile(circularPath, 'utf-8')) as Array<{
        id: string;
        description: string;
        entryPoints: string[];
        circularDeps: string[][];
        hasCircular: boolean;
        difficulty?: 'easy' | 'medium' | 'hard';
        tags?: string[];
      }>;

      for (const test of circularTests) {
        testCases.push({
          id: `circular:${test.id}`,
          description: test.description,
          input: {
            entryPoints: test.entryPoints.map(p => join(datasetPath, 'source', p)),
          },
          expected: {
            circularDeps: test.circularDeps,
            hasCircular: test.hasCircular,
          },
          difficulty: test.difficulty,
          tags: [...(test.tags ?? []), 'circular-detection'],
        } as CircularDependencyTestCase);
      }
    } catch {
      this.log.warn('No circular-deps.json found, generating from source');
      const generated = await this.generateCircularDepCases(datasetPath);
      testCases.push(...generated);
    }

    // Load graph completeness test cases
    try {
      const graphPath = join(groundTruthDir, 'graph-completeness.json');
      const graphTests = JSON.parse(await readFile(graphPath, 'utf-8')) as Array<{
        id: string;
        description: string;
        entryPoints: string[];
        totalNodes: number;
        totalEdges: number;
        roots: string[];
        leaves: string[];
        difficulty?: 'easy' | 'medium' | 'hard';
        tags?: string[];
      }>;

      for (const test of graphTests) {
        testCases.push({
          id: `graph:${test.id}`,
          description: test.description,
          input: {
            entryPoints: test.entryPoints.map(p => join(datasetPath, 'source', p)),
          },
          expected: {
            totalNodes: test.totalNodes,
            totalEdges: test.totalEdges,
            roots: test.roots,
            leaves: test.leaves,
          },
          difficulty: test.difficulty,
          tags: [...(test.tags ?? []), 'graph-completeness'],
        } as GraphCompletenessTestCase);
      }
    } catch {
      this.log.warn('No graph-completeness.json found, generating from source');
      const generated = await this.generateGraphCompletenessCases(datasetPath);
      testCases.push(...generated);
    }

    this.log.info(`Loaded ${testCases.length} test cases from ${datasetPath}`);
    return testCases;
  }

  /**
   * Run a single test case
   */
  async runTestCase(testCase: BenchmarkTestCase): Promise<TestCaseResult> {
    const startTime = performance.now();
    const memBefore = process.memoryUsage().heapUsed;

    try {
      if (testCase.id.startsWith('import:')) {
        return await this.runImportResolution(
          testCase as ImportResolutionTestCase,
          startTime,
          memBefore
        );
      } else if (testCase.id.startsWith('circular:')) {
        return await this.runCircularDetection(
          testCase as CircularDependencyTestCase,
          startTime,
          memBefore
        );
      } else if (testCase.id.startsWith('graph:')) {
        return await this.runGraphCompleteness(
          testCase as GraphCompletenessTestCase,
          startTime,
          memBefore
        );
      } else {
        throw new Error(`Unknown test case type: ${testCase.id}`);
      }
    } catch (error) {
      return {
        testCaseId: testCase.id,
        passed: false,
        actual: null,
        executionTimeMs: performance.now() - startTime,
        memoryUsedBytes: process.memoryUsage().heapUsed - memBefore,
        metrics: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run import resolution test
   */
  private async runImportResolution(
    testCase: ImportResolutionTestCase,
    startTime: number,
    memBefore: number
  ): Promise<TestCaseResult> {
    const { entryPoints } = testCase.input;
    const expected = testCase.expected;

    const scout = new RecursiveScout(this.adapter);
    const graph = await scout.buildDependencyGraph(entryPoints);

    const executionTimeMs = performance.now() - startTime;
    const memoryUsedBytes = process.memoryUsage().heapUsed - memBefore;

    // Extract resolved imports from graph
    const resolvedImports: Array<{ from: string; to: string }> = [];
    for (const [path, node] of graph.nodes) {
      for (const dep of node.dependencies) {
        resolvedImports.push({ from: path, to: dep });
      }
    }

    // Calculate metrics
    const expectedResolved = new Set(expected.resolvedImports.map(i => `${i.from}->${i.to}`));
    const actualResolved = new Set(resolvedImports.map(i => `${i.from}->${i.to}`));

    const correctlyResolved = [...actualResolved].filter(r => expectedResolved.has(r)).length;
    const precision = actualResolved.size > 0 ? correctlyResolved / actualResolved.size : 0;
    const recall = expectedResolved.size > 0 ? correctlyResolved / expectedResolved.size : 1;

    const passed = recall >= 0.7; // At least 70% of expected imports resolved

    return {
      testCaseId: testCase.id,
      passed,
      actual: {
        resolvedCount: resolvedImports.length,
        resolvedImports: resolvedImports.slice(0, 20),
      },
      executionTimeMs,
      memoryUsedBytes,
      metrics: [
        { name: 'resolution_precision', value: precision, unit: 'ratio' },
        { name: 'resolution_recall', value: recall, unit: 'ratio' },
        { name: 'resolved_imports', value: resolvedImports.length, unit: 'count' },
        { name: 'graph_nodes', value: graph.nodes.size, unit: 'count' },
      ],
    };
  }

  /**
   * Run circular dependency detection test
   */
  private async runCircularDetection(
    testCase: CircularDependencyTestCase,
    startTime: number,
    memBefore: number
  ): Promise<TestCaseResult> {
    const { entryPoints } = testCase.input;
    const expected = testCase.expected;

    const scout = new RecursiveScout(this.adapter);
    const graph = await scout.buildDependencyGraph(entryPoints);

    const executionTimeMs = performance.now() - startTime;
    const memoryUsedBytes = process.memoryUsage().heapUsed - memBefore;

    // Check circular dependency detection
    const hasCircular = graph.circularDeps.length > 0;
    const circularDetected = hasCircular === expected.hasCircular;

    // Compare specific cycles if expected
    let cycleAccuracy = 1.0;
    if (expected.circularDeps.length > 0) {
      const expectedCycles = new Set(expected.circularDeps.map(c => c.sort().join('->')));
      const actualCycles = new Set(graph.circularDeps.map(c => c.sort().join('->')));
      const matches = [...actualCycles].filter(c => expectedCycles.has(c)).length;
      cycleAccuracy = expectedCycles.size > 0 ? matches / expectedCycles.size : 1;
    }

    const passed = circularDetected && cycleAccuracy >= 0.5;

    return {
      testCaseId: testCase.id,
      passed,
      actual: {
        hasCircular,
        circularDeps: graph.circularDeps,
      },
      executionTimeMs,
      memoryUsedBytes,
      metrics: [
        { name: 'circular_detected', value: circularDetected ? 1 : 0, unit: 'boolean' },
        { name: 'cycle_accuracy', value: cycleAccuracy, unit: 'ratio' },
        { name: 'cycles_found', value: graph.circularDeps.length, unit: 'count' },
      ],
    };
  }

  /**
   * Run graph completeness test
   */
  private async runGraphCompleteness(
    testCase: GraphCompletenessTestCase,
    startTime: number,
    memBefore: number
  ): Promise<TestCaseResult> {
    const { entryPoints } = testCase.input;
    const expected = testCase.expected;

    const scout = new RecursiveScout(this.adapter);
    const graph = await scout.buildDependencyGraph(entryPoints);

    const executionTimeMs = performance.now() - startTime;
    const memoryUsedBytes = process.memoryUsage().heapUsed - memBefore;

    // Count edges
    let totalEdges = 0;
    for (const [, node] of graph.nodes) {
      totalEdges += node.dependencies.length;
    }

    // Calculate completeness
    const nodeCompleteness =
      expected.totalNodes > 0 ? Math.min(1, graph.nodes.size / expected.totalNodes) : 1;
    const edgeCompleteness =
      expected.totalEdges > 0 ? Math.min(1, totalEdges / expected.totalEdges) : 1;

    // Check roots and leaves
    const expectedRoots = new Set(expected.roots);
    const expectedLeaves = new Set(expected.leaves);
    const actualRoots = new Set(graph.roots);
    const actualLeaves = new Set(graph.leaves);

    const rootAccuracy =
      expectedRoots.size > 0
        ? [...actualRoots].filter(r => expectedRoots.has(r)).length / expectedRoots.size
        : 1;
    const leafAccuracy =
      expectedLeaves.size > 0
        ? [...actualLeaves].filter(l => expectedLeaves.has(l)).length / expectedLeaves.size
        : 1;

    const passed = nodeCompleteness >= 0.8 && edgeCompleteness >= 0.7;

    return {
      testCaseId: testCase.id,
      passed,
      actual: {
        totalNodes: graph.nodes.size,
        totalEdges,
        roots: graph.roots,
        leaves: graph.leaves,
      },
      executionTimeMs,
      memoryUsedBytes,
      metrics: [
        { name: 'node_completeness', value: nodeCompleteness, unit: 'ratio' },
        { name: 'edge_completeness', value: edgeCompleteness, unit: 'ratio' },
        { name: 'root_accuracy', value: rootAccuracy, unit: 'ratio' },
        { name: 'leaf_accuracy', value: leafAccuracy, unit: 'ratio' },
        { name: 'total_nodes', value: graph.nodes.size, unit: 'count' },
        { name: 'total_edges', value: totalEdges, unit: 'count' },
      ],
    };
  }

  /**
   * Run the complete suite
   */
  async run(config: BenchmarkSuiteConfig, datasetPath: string): Promise<BenchmarkSuiteResult> {
    const startTime = Date.now();
    const collector = new MetricsCollector();

    const testCases = await this.loadTestCases(datasetPath);
    const testResults: TestCaseResult[] = [];

    for (const testCase of testCases) {
      const result = await this.runTestCase(testCase);
      testResults.push(result);
      collector.recordTestResult(result);
    }

    return {
      config: { ...config, name: this.name, description: this.description },
      testResults,
      aggregatedMetrics: collector.getAggregatedMetrics(),
      latencyStats: collector.getLatencyStats(),
      irMetrics: collector.getIRMetrics(),
      totalExecutionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      systemVersion: 'seu-claude-v2',
    };
  }

  // === Auto-generation methods ===

  private async generateImportResolutionCases(datasetPath: string): Promise<BenchmarkTestCase[]> {
    const sourcePath = join(datasetPath, 'source');
    const testCases: BenchmarkTestCase[] = [];

    try {
      const files = await this.findSourceFiles(sourcePath);
      if (files.length === 0) return testCases;

      // Create a simple test case for each entry point
      let caseId = 0;
      for (const file of files.slice(0, 10)) {
        testCases.push({
          id: `import:auto_${caseId++}`,
          description: `Resolve imports in ${file}`,
          input: {
            sourcePath: file,
            entryPoints: [file],
          },
          expected: {
            resolvedImports: [],
            unresolvedImports: [],
          },
          difficulty: 'easy',
          tags: ['auto-generated', 'import-resolution'],
        } as ImportResolutionTestCase);
      }
    } catch (error) {
      this.log.warn(`Failed to generate import resolution cases: ${error}`);
    }

    return testCases;
  }

  private async generateCircularDepCases(datasetPath: string): Promise<BenchmarkTestCase[]> {
    const sourcePath = join(datasetPath, 'source');
    const testCases: BenchmarkTestCase[] = [];

    try {
      const files = await this.findSourceFiles(sourcePath);
      if (files.length === 0) return testCases;

      testCases.push({
        id: 'circular:auto_full',
        description: 'Check for circular dependencies in entire source',
        input: {
          entryPoints: files.slice(0, 20),
        },
        expected: {
          circularDeps: [],
          hasCircular: false,
        },
        difficulty: 'medium',
        tags: ['auto-generated', 'circular-detection'],
      } as CircularDependencyTestCase);
    } catch (error) {
      this.log.warn(`Failed to generate circular dep cases: ${error}`);
    }

    return testCases;
  }

  private async generateGraphCompletenessCases(datasetPath: string): Promise<BenchmarkTestCase[]> {
    const sourcePath = join(datasetPath, 'source');
    const testCases: BenchmarkTestCase[] = [];

    try {
      const files = await this.findSourceFiles(sourcePath);
      if (files.length === 0) return testCases;

      testCases.push({
        id: 'graph:auto_full',
        description: 'Build complete dependency graph',
        input: {
          entryPoints: files.slice(0, 20),
        },
        expected: {
          totalNodes: files.length,
          totalEdges: 0,
          roots: [],
          leaves: [],
        },
        difficulty: 'medium',
        tags: ['auto-generated', 'graph-completeness'],
      } as GraphCompletenessTestCase);
    } catch (error) {
      this.log.warn(`Failed to generate graph completeness cases: ${error}`);
    }

    return testCases;
  }

  private async findSourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const validExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py'];

    const walk = async (currentDir: string): Promise<void> => {
      try {
        const entries = await readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(currentDir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          } else if (entry.isFile() && validExtensions.includes(extname(entry.name))) {
            files.push(fullPath);
          }
        }
      } catch {
        // Directory doesn't exist or permission denied
      }
    };

    await walk(dir);
    return files;
  }
}
