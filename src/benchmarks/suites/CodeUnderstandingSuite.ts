/**
 * CodeUnderstandingSuite - Benchmarks symbol resolution and call graph accuracy
 *
 * Tests seu-claude's RecursiveScout capabilities:
 * - Symbol lookup by name
 * - Find all callers of a function
 * - Find all callees of a function
 * - Class hierarchy resolution
 * - Cross-file reference tracking
 *
 * Metrics: Precision@K, Recall, F1, MRR
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
 * Test case for symbol lookup
 */
interface SymbolLookupTestCase extends BenchmarkTestCase {
  input: {
    symbolName: string;
    entryPoints: string[];
  };
  expected: {
    definitions: Array<{ file: string; line: number; type: string }>;
    callSites: Array<{ file: string; line: number }>;
  };
}

/**
 * Test case for caller/callee analysis
 */
interface CallGraphTestCase extends BenchmarkTestCase {
  input: {
    targetSymbol: string;
    entryPoints: string[];
  };
  expected: {
    callers: string[];
    callees: string[];
  };
}

export class CodeUnderstandingSuite implements IBenchmarkSuite {
  readonly name = 'code-understanding';
  readonly description =
    'Benchmarks symbol resolution, call graph accuracy using RecursiveScout';
  readonly supportedLanguages = ['typescript', 'javascript', 'python'];

  private adapter: TreeSitterAdapter;
  private scout: RecursiveScout;
  private log = logger.child('code-understanding-suite');

  constructor() {
    this.adapter = new TreeSitterAdapter();
    this.scout = new RecursiveScout(this.adapter);
  }

  /**
   * Load test cases from a dataset directory
   *
   * Expected dataset structure:
   * dataset/
   *   ground-truth/
   *     symbol-lookups.json
   *     call-graphs.json
   *   source/
   *     ...source files to analyze...
   */
  async loadTestCases(datasetPath: string): Promise<BenchmarkTestCase[]> {
    const testCases: BenchmarkTestCase[] = [];

    // Load ground truth files
    const groundTruthDir = join(datasetPath, 'ground-truth');

    try {
      // Symbol lookup test cases
      const symbolLookupPath = join(groundTruthDir, 'symbol-lookups.json');
      const symbolLookups = JSON.parse(await readFile(symbolLookupPath, 'utf-8')) as Array<{
        id: string;
        description: string;
        symbolName: string;
        entryPoints: string[];
        definitions: Array<{ file: string; line: number; type: string }>;
        callSites: Array<{ file: string; line: number }>;
        difficulty?: 'easy' | 'medium' | 'hard';
        tags?: string[];
      }>;

      for (const lookup of symbolLookups) {
        testCases.push({
          id: `symbol:${lookup.id}`,
          description: lookup.description,
          input: {
            symbolName: lookup.symbolName,
            entryPoints: lookup.entryPoints.map(p => join(datasetPath, 'source', p)),
          },
          expected: {
            definitions: lookup.definitions,
            callSites: lookup.callSites,
          },
          difficulty: lookup.difficulty,
          tags: [...(lookup.tags ?? []), 'symbol-lookup'],
        } as SymbolLookupTestCase);
      }
    } catch {
      this.log.warn('No symbol-lookups.json found, generating from source');
      const generated = await this.generateSymbolLookupCases(datasetPath);
      testCases.push(...generated);
    }

    try {
      // Call graph test cases
      const callGraphPath = join(groundTruthDir, 'call-graphs.json');
      const callGraphs = JSON.parse(await readFile(callGraphPath, 'utf-8')) as Array<{
        id: string;
        description: string;
        targetSymbol: string;
        entryPoints: string[];
        callers: string[];
        callees: string[];
        difficulty?: 'easy' | 'medium' | 'hard';
        tags?: string[];
      }>;

      for (const cg of callGraphs) {
        testCases.push({
          id: `callgraph:${cg.id}`,
          description: cg.description,
          input: {
            targetSymbol: cg.targetSymbol,
            entryPoints: cg.entryPoints.map(p => join(datasetPath, 'source', p)),
          },
          expected: {
            callers: cg.callers,
            callees: cg.callees,
          },
          difficulty: cg.difficulty,
          tags: [...(cg.tags ?? []), 'call-graph'],
        } as CallGraphTestCase);
      }
    } catch {
      this.log.warn('No call-graphs.json found, generating from source');
      const generated = await this.generateCallGraphCases(datasetPath);
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
      if (testCase.id.startsWith('symbol:')) {
        return await this.runSymbolLookup(testCase as SymbolLookupTestCase, startTime, memBefore);
      } else if (testCase.id.startsWith('callgraph:')) {
        return await this.runCallGraphTest(testCase as CallGraphTestCase, startTime, memBefore);
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
   * Run symbol lookup test
   */
  private async runSymbolLookup(
    testCase: SymbolLookupTestCase,
    startTime: number,
    memBefore: number
  ): Promise<TestCaseResult> {
    const { symbolName, entryPoints } = testCase.input;
    const expected = testCase.expected;

    // Build dependency graph
    const graph = await this.scout.buildDependencyGraph(entryPoints);

    // Find symbol definitions
    const definitions = await this.scout.findSymbolDefinitions(symbolName, graph);
    const callSites = await this.scout.findCallSites(symbolName, graph);

    const executionTimeMs = performance.now() - startTime;
    const memoryUsedBytes = process.memoryUsage().heapUsed - memBefore;

    // Calculate metrics
    const definitionPrecision = this.calculatePrecision(
      definitions.map(d => `${d.filePath}:${d.symbol.startLine}`),
      expected.definitions.map(d => `${d.file}:${d.line}`)
    );
    const definitionRecall = this.calculateRecall(
      definitions.map(d => `${d.filePath}:${d.symbol.startLine}`),
      expected.definitions.map(d => `${d.file}:${d.line}`)
    );
    const callSitePrecision = this.calculatePrecision(
      callSites.map(c => `${c.filePath}:${c.symbol.startLine}`),
      expected.callSites.map(c => `${c.file}:${c.line}`)
    );
    const callSiteRecall = this.calculateRecall(
      callSites.map(c => `${c.filePath}:${c.symbol.startLine}`),
      expected.callSites.map(c => `${c.file}:${c.line}`)
    );

    const passed =
      definitionRecall >= 0.8 && // At least 80% of expected definitions found
      callSiteRecall >= 0.7; // At least 70% of expected call sites found

    return {
      testCaseId: testCase.id,
      passed,
      actual: {
        definitions: definitions.map(d => ({
          file: d.filePath,
          line: d.symbol.startLine,
          type: d.symbol.type,
        })),
        callSites: callSites.map(c => ({
          file: c.filePath,
          line: c.symbol.startLine,
        })),
      },
      executionTimeMs,
      memoryUsedBytes,
      metrics: [
        { name: 'definition_precision', value: definitionPrecision, unit: 'ratio' },
        { name: 'definition_recall', value: definitionRecall, unit: 'ratio' },
        { name: 'callsite_precision', value: callSitePrecision, unit: 'ratio' },
        { name: 'callsite_recall', value: callSiteRecall, unit: 'ratio' },
        { name: 'definitions_found', value: definitions.length, unit: 'count' },
        { name: 'callsites_found', value: callSites.length, unit: 'count' },
      ],
    };
  }

  /**
   * Run call graph test
   */
  private async runCallGraphTest(
    testCase: CallGraphTestCase,
    startTime: number,
    memBefore: number
  ): Promise<TestCaseResult> {
    const { targetSymbol, entryPoints } = testCase.input;
    const expected = testCase.expected;

    // Build dependency graph
    const graph = await this.scout.buildDependencyGraph(entryPoints);

    // Find callers and callees
    const definitions = await this.scout.findSymbolDefinitions(targetSymbol, graph);
    const callers = await this.scout.findCallSites(targetSymbol, graph);

    // For callees, we need to look at what the target symbol calls
    // This requires looking at the symbol's definition and its internal calls
    const callees: string[] = [];
    for (const def of definitions) {
      const node = graph.nodes.get(def.filePath);
      if (node) {
        // Find symbols that are called within the target's definition
        for (const symbol of node.symbols) {
          if (symbol.name === targetSymbol && symbol.type === 'function') {
            // This is simplified - real implementation would track calls within the function
            // Extract module paths from ImportStatement objects
            const importPaths = (node.imports || []).map(imp => imp.modulePath);
            callees.push(...importPaths);
          }
        }
      }
    }

    const executionTimeMs = performance.now() - startTime;
    const memoryUsedBytes = process.memoryUsage().heapUsed - memBefore;

    // Calculate metrics
    const callerPrecision = this.calculatePrecision(
      callers.map(c => c.symbol.name),
      expected.callers
    );
    const callerRecall = this.calculateRecall(
      callers.map(c => c.symbol.name),
      expected.callers
    );

    const passed = callerRecall >= 0.6; // At least 60% of expected callers found

    return {
      testCaseId: testCase.id,
      passed,
      actual: {
        callers: callers.map(c => c.symbol.name),
        callees,
      },
      executionTimeMs,
      memoryUsedBytes,
      metrics: [
        { name: 'caller_precision', value: callerPrecision, unit: 'ratio' },
        { name: 'caller_recall', value: callerRecall, unit: 'ratio' },
        { name: 'callers_found', value: callers.length, unit: 'count' },
        { name: 'callees_found', value: callees.length, unit: 'count' },
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

      // Evaluate for IR metrics
      if (testCase.id.startsWith('symbol:')) {
        const tc = testCase as SymbolLookupTestCase;
        const actual = result.actual as { definitions: Array<{ file: string; line: number }> };
        if (actual?.definitions) {
          const retrieved = actual.definitions.map(d => `${d.file}:${d.line}`);
          const relevant = new Set(tc.expected.definitions.map(d => `${d.file}:${d.line}`));
          collector.getIRCollector().evaluateQuery(retrieved, relevant);
        }
      }
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

  /**
   * Calculate precision
   */
  private calculatePrecision(retrieved: string[], relevant: string[]): number {
    if (retrieved.length === 0) return 0;
    const relevantSet = new Set(relevant);
    const hits = retrieved.filter(r => relevantSet.has(r)).length;
    return hits / retrieved.length;
  }

  /**
   * Calculate recall
   */
  private calculateRecall(retrieved: string[], relevant: string[]): number {
    if (relevant.length === 0) return 1; // All expected items found (vacuously true)
    const retrievedSet = new Set(retrieved);
    const hits = relevant.filter(r => retrievedSet.has(r)).length;
    return hits / relevant.length;
  }

  /**
   * Generate symbol lookup test cases from source code
   */
  private async generateSymbolLookupCases(datasetPath: string): Promise<BenchmarkTestCase[]> {
    const sourcePath = join(datasetPath, 'source');
    const testCases: BenchmarkTestCase[] = [];

    try {
      const files = await this.findSourceFiles(sourcePath);
      if (files.length === 0) return testCases;

      // Build graph once
      const graph = await this.scout.buildDependencyGraph(files.slice(0, 10));

      // Generate test cases for discovered symbols
      let caseId = 0;
      for (const [, node] of graph.nodes) {
        for (const symbol of node.symbols.slice(0, 5)) {
          // Limit per file
          if (symbol.type === 'function' || symbol.type === 'class') {
            testCases.push({
              id: `symbol:auto_${caseId++}`,
              description: `Find ${symbol.type} "${symbol.name}"`,
              input: {
                symbolName: symbol.name,
                entryPoints: files.slice(0, 10),
              },
              expected: {
                definitions: [
                  { file: node.filePath, line: symbol.startLine, type: symbol.type },
                ],
                callSites: [],
              },
              difficulty: 'easy',
              tags: ['auto-generated', 'symbol-lookup'],
            } as SymbolLookupTestCase);

            if (testCases.length >= 50) break; // Limit total test cases
          }
        }
        if (testCases.length >= 50) break;
      }
    } catch (error) {
      this.log.warn(`Failed to generate symbol lookup cases: ${error}`);
    }

    return testCases;
  }

  /**
   * Generate call graph test cases from source code
   */
  private async generateCallGraphCases(datasetPath: string): Promise<BenchmarkTestCase[]> {
    const sourcePath = join(datasetPath, 'source');
    const testCases: BenchmarkTestCase[] = [];

    try {
      const files = await this.findSourceFiles(sourcePath);
      if (files.length === 0) return testCases;

      // Build graph once
      const graph = await this.scout.buildDependencyGraph(files.slice(0, 10));

      // Generate test cases for functions with dependencies
      let caseId = 0;
      for (const [, node] of graph.nodes) {
        if (node.dependencies.length > 0) {
          for (const symbol of node.symbols.slice(0, 3)) {
            if (symbol.type === 'function') {
              testCases.push({
                id: `callgraph:auto_${caseId++}`,
                description: `Call graph for "${symbol.name}"`,
                input: {
                  targetSymbol: symbol.name,
                  entryPoints: files.slice(0, 10),
                },
                expected: {
                  callers: [],
                  callees: node.dependencies.slice(0, 5),
                },
                difficulty: 'medium',
                tags: ['auto-generated', 'call-graph'],
              } as CallGraphTestCase);

              if (testCases.length >= 20) break;
            }
          }
        }
        if (testCases.length >= 20) break;
      }
    } catch (error) {
      this.log.warn(`Failed to generate call graph cases: ${error}`);
    }

    return testCases;
  }

  /**
   * Find source files in a directory
   */
  private async findSourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const validExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py'];

    const walk = async (currentDir: string): Promise<void> => {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath);
        } else if (entry.isFile() && validExtensions.includes(extname(entry.name))) {
          files.push(fullPath);
        }
      }
    };

    try {
      await walk(dir);
    } catch {
      // Directory doesn't exist
    }

    return files;
  }
}
