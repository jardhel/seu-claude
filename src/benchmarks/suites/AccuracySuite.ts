/**
 * AccuracySuite - Measures accuracy against ground truth datasets
 *
 * Compares seu-claude's code understanding results against verified
 * ground truth to calculate precision, recall, and F1 scores.
 */

import { join, relative } from 'path';

import { RecursiveScout } from '../../core/usecases/RecursiveScout.js';
import { TreeSitterAdapter } from '../../adapters/parsers/TreeSitterAdapter.js';
import { logger } from '../../utils/logger.js';
import { DatasetLoader } from '../datasets/DatasetLoader.js';

import type {
  IBenchmarkSuite,
  BenchmarkTestCase,
  TestCaseResult,
  BenchmarkSuiteResult,
  BenchmarkSuiteConfig,
  MetricMeasurement,
} from '../framework/types.js';
import type {
  SymbolLookupGroundTruth,
  CallGraphGroundTruth,
  ImportResolutionGroundTruth,
} from '../datasets/types.js';
import { MetricsCollector } from '../framework/MetricsCollector.js';

/**
 * Test case for accuracy benchmarks
 */
export interface AccuracyTestCase extends BenchmarkTestCase {
  input: {
    type: 'symbol-lookup' | 'call-graph' | 'import-resolution';
    groundTruth: SymbolLookupGroundTruth | CallGraphGroundTruth | ImportResolutionGroundTruth;
    codebasePath: string;
  };
  expected: {
    minPrecision?: number;
    minRecall?: number;
    minF1?: number;
  };
}

/**
 * AccuracySuite compares seu-claude results against ground truth
 */
export class AccuracySuite implements IBenchmarkSuite {
  readonly name = 'accuracy';
  readonly description = 'Measures precision, recall, and F1 against ground truth datasets';
  readonly supportedLanguages = ['typescript', 'javascript', 'python'];

  private log = logger.child('accuracy-suite');
  private adapter: TreeSitterAdapter;
  private scout: RecursiveScout;
  private datasetLoader: DatasetLoader;

  constructor() {
    this.adapter = new TreeSitterAdapter();
    this.scout = new RecursiveScout(this.adapter);
    this.datasetLoader = new DatasetLoader();
  }

  /**
   * Load test cases from ground truth dataset
   */
  async loadTestCases(datasetPath: string): Promise<AccuracyTestCase[]> {
    const testCases: AccuracyTestCase[] = [];

    // Check if this is a ground truth dataset directory
    const exists = await this.datasetLoader.exists(datasetPath);
    if (!exists) {
      this.log.warn(`Dataset not found at: ${datasetPath}`);
      return testCases;
    }

    const metadata = await this.datasetLoader.getMetadata(datasetPath);
    const codebasePath = metadata.sourceCodebase;

    // Load symbol lookup test cases
    const symbolLookups = await this.datasetLoader.loadSymbolLookups(datasetPath, {
      limit: 100, // Limit for reasonable test time
    });

    for (const lookup of symbolLookups) {
      testCases.push({
        id: `accuracy:${lookup.id}`,
        description: `Verify symbol lookup: ${lookup.symbolName}`,
        input: {
          type: 'symbol-lookup',
          groundTruth: lookup,
          codebasePath,
        },
        expected: {
          minPrecision: 0.8,
          minRecall: 0.8,
        },
        tags: ['accuracy', 'symbol', ...lookup.tags],
        difficulty: lookup.difficulty,
      });
    }

    // Load call graph test cases
    const callGraphs = await this.datasetLoader.loadCallGraphs(datasetPath, {
      limit: 50,
    });

    for (const graph of callGraphs) {
      testCases.push({
        id: `accuracy:${graph.id}`,
        description: `Verify call graph: ${graph.targetSymbol}`,
        input: {
          type: 'call-graph',
          groundTruth: graph,
          codebasePath,
        },
        expected: {
          minPrecision: 0.7,
          minRecall: 0.7,
        },
        tags: ['accuracy', 'callgraph', ...graph.tags],
        difficulty: graph.difficulty,
      });
    }

    // Load import resolution test cases
    const imports = await this.datasetLoader.loadImportResolutions(datasetPath, {
      limit: 50,
    });

    for (const imp of imports) {
      testCases.push({
        id: `accuracy:${imp.id}`,
        description: `Verify import resolution: ${imp.importPath}`,
        input: {
          type: 'import-resolution',
          groundTruth: imp,
          codebasePath,
        },
        expected: {},
        tags: ['accuracy', 'import', ...imp.tags],
        difficulty: imp.difficulty,
      });
    }

    this.log.info(`Loaded ${testCases.length} accuracy test cases from ${datasetPath}`);
    return testCases;
  }

  /**
   * Run a single test case
   */
  async runTestCase(testCase: BenchmarkTestCase): Promise<TestCaseResult> {
    const accuracyCase = testCase as AccuracyTestCase;
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    const metrics: MetricMeasurement[] = [];
    let passed = true;
    let error: string | undefined;
    let actual: Record<string, unknown> = {};

    try {
      switch (accuracyCase.input.type) {
        case 'symbol-lookup':
          actual = await this.evaluateSymbolLookup(
            accuracyCase.input.groundTruth as SymbolLookupGroundTruth,
            accuracyCase.input.codebasePath,
            metrics
          );
          break;
        case 'call-graph':
          actual = await this.evaluateCallGraph(
            accuracyCase.input.groundTruth as CallGraphGroundTruth,
            accuracyCase.input.codebasePath,
            metrics
          );
          break;
        case 'import-resolution':
          actual = await this.evaluateImportResolution(
            accuracyCase.input.groundTruth as ImportResolutionGroundTruth,
            accuracyCase.input.codebasePath,
            metrics
          );
          break;
      }

      // Validate expectations
      const validation = this.validateExpectations(accuracyCase.expected, metrics);
      passed = validation.passed;
      if (!validation.passed) {
        error = validation.reason;
      }
    } catch (e) {
      passed = false;
      error = e instanceof Error ? e.message : String(e);
    }

    const executionTimeMs = Date.now() - startTime;
    const memoryUsed = process.memoryUsage().heapUsed - startMemory;

    return {
      testCaseId: testCase.id,
      passed,
      actual,
      executionTimeMs,
      memoryUsedBytes: memoryUsed,
      metrics,
      error,
    };
  }

  /**
   * Evaluate symbol lookup accuracy
   */
  private async evaluateSymbolLookup(
    groundTruth: SymbolLookupGroundTruth,
    codebasePath: string,
    metrics: MetricMeasurement[]
  ): Promise<Record<string, unknown>> {
    // Build graph from entry points derived from ground truth
    const entryFiles = [
      ...groundTruth.definitions.map(d => join(codebasePath, d.file)),
      ...groundTruth.callSites.map(c => join(codebasePath, c.file)),
    ];
    const uniqueEntries = [...new Set(entryFiles)];

    const graph = await this.scout.buildDependencyGraph(uniqueEntries);

    // Find symbol definitions
    const foundDefinitions = await this.scout.findSymbolDefinitions(groundTruth.symbolName, graph);

    // Calculate precision and recall for definitions
    const expectedDefFiles = new Set(groundTruth.definitions.map(d => d.file));
    const foundDefFiles = new Set(foundDefinitions.map(d => relative(codebasePath, d.filePath)));

    const defTruePositives = [...foundDefFiles].filter(f => expectedDefFiles.has(f)).length;
    const defPrecision =
      foundDefFiles.size > 0
        ? defTruePositives / foundDefFiles.size
        : groundTruth.definitions.length === 0
          ? 1
          : 0;
    const defRecall = expectedDefFiles.size > 0 ? defTruePositives / expectedDefFiles.size : 1;
    const defF1 =
      defPrecision + defRecall > 0
        ? (2 * defPrecision * defRecall) / (defPrecision + defRecall)
        : 0;

    // Find call sites
    const foundCallSites = await this.scout.findCallSites(groundTruth.symbolName, graph);

    // Calculate precision and recall for call sites
    const expectedCallFiles = new Set(groundTruth.callSites.map(c => c.file));
    const foundCallFiles = new Set(foundCallSites.map(c => relative(codebasePath, c.filePath)));

    const callTruePositives = [...foundCallFiles].filter(f => expectedCallFiles.has(f)).length;
    const callPrecision =
      foundCallFiles.size > 0
        ? callTruePositives / foundCallFiles.size
        : groundTruth.callSites.length === 0
          ? 1
          : 0;
    const callRecall = expectedCallFiles.size > 0 ? callTruePositives / expectedCallFiles.size : 1;
    const callF1 =
      callPrecision + callRecall > 0
        ? (2 * callPrecision * callRecall) / (callPrecision + callRecall)
        : 0;

    // Combined metrics
    const avgPrecision = (defPrecision + callPrecision) / 2;
    const avgRecall = (defRecall + callRecall) / 2;
    const avgF1 = (defF1 + callF1) / 2;
    const retrievedItems = this.uniqueInOrder([
      ...foundDefinitions.map(
        d => `def:${relative(codebasePath, d.filePath)}:${d.symbol.startLine}`
      ),
      ...foundCallSites.map(c => `call:${relative(codebasePath, c.filePath)}:${c.symbol.startLine}`),
    ]);
    const relevantItems = this.uniqueInOrder([
      ...groundTruth.definitions.map(d => `def:${d.file}:${d.line}`),
      ...groundTruth.callSites.map(c => `call:${c.file}:${c.line}`),
    ]);

    metrics.push({ name: 'definition_precision', value: defPrecision, unit: 'ratio' });
    metrics.push({ name: 'definition_recall', value: defRecall, unit: 'ratio' });
    metrics.push({ name: 'definition_f1', value: defF1, unit: 'ratio' });
    metrics.push({ name: 'callsite_precision', value: callPrecision, unit: 'ratio' });
    metrics.push({ name: 'callsite_recall', value: callRecall, unit: 'ratio' });
    metrics.push({ name: 'callsite_f1', value: callF1, unit: 'ratio' });
    metrics.push({ name: 'precision', value: avgPrecision, unit: 'ratio' });
    metrics.push({ name: 'recall', value: avgRecall, unit: 'ratio' });
    metrics.push({ name: 'f1', value: avgF1, unit: 'ratio' });

    return {
      symbolName: groundTruth.symbolName,
      expectedDefinitions: groundTruth.definitions.length,
      foundDefinitions: foundDefinitions.length,
      expectedCallSites: groundTruth.callSites.length,
      foundCallSites: foundCallSites.length,
      precision: avgPrecision,
      recall: avgRecall,
      f1: avgF1,
      retrievedItems,
      relevantItems,
    };
  }

  /**
   * Evaluate call graph accuracy
   */
  private async evaluateCallGraph(
    groundTruth: CallGraphGroundTruth,
    codebasePath: string,
    metrics: MetricMeasurement[]
  ): Promise<Record<string, unknown>> {
    // Build graph
    const targetFile = join(codebasePath, groundTruth.targetFile);
    const callerFiles = groundTruth.callers.map(c => join(codebasePath, c.file));
    const entryPoints = [targetFile, ...callerFiles];

    const graph = await this.scout.buildDependencyGraph(entryPoints);

    // Find the target symbol
    const definitions = await this.scout.findSymbolDefinitions(groundTruth.targetSymbol, graph);

    // Get callers from our analysis
    const foundCallers = await this.scout.findCallSites(groundTruth.targetSymbol, graph);

    // Calculate caller accuracy
    const expectedCallerNames = new Set(groundTruth.callers.map(c => c.name));
    const foundCallerNames = new Set<string>();

    for (const site of foundCallers) {
      // Try to identify the calling function
      const node = graph.nodes.get(site.filePath);
      if (node) {
        const enclosing = this.findMostSpecificEnclosingSymbol(site.symbol.startLine, node.symbols);
        if (enclosing) {
          foundCallerNames.add(this.formatSymbolName(enclosing));
        } else {
          foundCallerNames.add('module');
        }
      } else {
        foundCallerNames.add('module');
      }
    }

    const callerTruePositives = [...foundCallerNames].filter(n =>
      expectedCallerNames.has(n)
    ).length;
    const callerPrecision =
      foundCallerNames.size > 0
        ? callerTruePositives / foundCallerNames.size
        : groundTruth.callers.length === 0
          ? 1
          : 0;
    const callerRecall =
      expectedCallerNames.size > 0 ? callerTruePositives / expectedCallerNames.size : 1;
    const callerF1 =
      callerPrecision + callerRecall > 0
        ? (2 * callerPrecision * callerRecall) / (callerPrecision + callerRecall)
        : 0;

    // Get callees from our analysis (what the target symbol calls)
    let foundCallees: string[] = [];
    for (const def of definitions) {
      const node = graph.nodes.get(def.filePath);
      if (node) {
        const callsInTarget = node.symbols.filter(
          symbol =>
            symbol.type === 'call' &&
            symbol.callee &&
            symbol.startLine >= def.symbol.startLine &&
            symbol.endLine <= def.symbol.endLine
        );
        foundCallees.push(...callsInTarget.map(symbol => symbol.callee!));
      }
    }
    foundCallees = this.uniqueInOrder(foundCallees);

    const expectedCalleeNames = new Set(groundTruth.callees.map(c => c.name));
    const calleeTruePositives = foundCallees.filter(n => expectedCalleeNames.has(n)).length;
    const calleePrecision =
      foundCallees.length > 0
        ? calleeTruePositives / foundCallees.length
        : groundTruth.callees.length === 0
          ? 1
          : 0;
    const calleeRecall =
      expectedCalleeNames.size > 0 ? calleeTruePositives / expectedCalleeNames.size : 1;
    const calleeF1 =
      calleePrecision + calleeRecall > 0
        ? (2 * calleePrecision * calleeRecall) / (calleePrecision + calleeRecall)
        : 0;

    // Combined metrics
    const avgPrecision = (callerPrecision + calleePrecision) / 2;
    const avgRecall = (callerRecall + calleeRecall) / 2;
    const avgF1 = (callerF1 + calleeF1) / 2;
    const retrievedItems = this.uniqueInOrder([
      ...[...foundCallerNames].map(name => `caller:${name}`),
      ...foundCallees.map(name => `callee:${name}`),
    ]);
    const relevantItems = this.uniqueInOrder([
      ...[...expectedCallerNames].map(name => `caller:${name}`),
      ...[...expectedCalleeNames].map(name => `callee:${name}`),
    ]);

    metrics.push({ name: 'caller_precision', value: callerPrecision, unit: 'ratio' });
    metrics.push({ name: 'caller_recall', value: callerRecall, unit: 'ratio' });
    metrics.push({ name: 'caller_f1', value: callerF1, unit: 'ratio' });
    metrics.push({ name: 'callee_precision', value: calleePrecision, unit: 'ratio' });
    metrics.push({ name: 'callee_recall', value: calleeRecall, unit: 'ratio' });
    metrics.push({ name: 'callee_f1', value: calleeF1, unit: 'ratio' });
    metrics.push({ name: 'precision', value: avgPrecision, unit: 'ratio' });
    metrics.push({ name: 'recall', value: avgRecall, unit: 'ratio' });
    metrics.push({ name: 'f1', value: avgF1, unit: 'ratio' });

    return {
      targetSymbol: groundTruth.targetSymbol,
      expectedCallers: groundTruth.callers.length,
      foundCallers: foundCallerNames.size,
      expectedCallees: groundTruth.callees.length,
      foundCallees: foundCallees.length,
      precision: avgPrecision,
      recall: avgRecall,
      f1: avgF1,
      retrievedItems,
      relevantItems,
    };
  }

  /**
   * Evaluate import resolution accuracy
   */
  private async evaluateImportResolution(
    groundTruth: ImportResolutionGroundTruth,
    codebasePath: string,
    metrics: MetricMeasurement[]
  ): Promise<Record<string, unknown>> {
    const sourceFile = join(codebasePath, groundTruth.sourceFile);

    // Resolve the import using RecursiveScout
    const resolved = this.scout.resolveImport(groundTruth.importPath, sourceFile);
    const resolvedRelative = resolved ? relative(codebasePath, resolved) : null;

    // Check if resolution matches ground truth
    const correct = resolvedRelative === groundTruth.resolvedPath;
    const retrievedItems = resolvedRelative ? [`import:${resolvedRelative}`] : [];
    const relevantItems = groundTruth.resolvedPath ? [`import:${groundTruth.resolvedPath}`] : [];

    metrics.push({ name: 'resolution_correct', value: correct ? 1 : 0, unit: 'boolean' });
    metrics.push({ name: 'precision', value: correct ? 1 : 0, unit: 'ratio' });
    metrics.push({ name: 'recall', value: correct ? 1 : 0, unit: 'ratio' });
    metrics.push({ name: 'f1', value: correct ? 1 : 0, unit: 'ratio' });

    return {
      importPath: groundTruth.importPath,
      expectedResolution: groundTruth.resolvedPath,
      actualResolution: resolvedRelative,
      correct,
      retrievedItems,
      relevantItems,
    };
  }

  /**
   * Validate results against expectations
   */
  private validateExpectations(
    expected: AccuracyTestCase['expected'],
    metrics: MetricMeasurement[]
  ): { passed: boolean; reason?: string } {
    const precision = metrics.find(m => m.name === 'precision')?.value || 0;
    const recall = metrics.find(m => m.name === 'recall')?.value || 0;
    const f1 = metrics.find(m => m.name === 'f1')?.value || 0;

    if (expected.minPrecision !== undefined && precision < expected.minPrecision) {
      return {
        passed: false,
        reason: `Precision ${precision.toFixed(3)} below minimum ${expected.minPrecision}`,
      };
    }

    if (expected.minRecall !== undefined && recall < expected.minRecall) {
      return {
        passed: false,
        reason: `Recall ${recall.toFixed(3)} below minimum ${expected.minRecall}`,
      };
    }

    if (expected.minF1 !== undefined && f1 < expected.minF1) {
      return {
        passed: false,
        reason: `F1 ${f1.toFixed(3)} below minimum ${expected.minF1}`,
      };
    }

    return { passed: true };
  }

  private findMostSpecificEnclosingSymbol(
    line: number,
    symbols: Array<{
      name: string;
      type: 'function' | 'method' | 'class' | 'call';
      startLine: number;
      endLine: number;
      parentClass?: string;
    }>
  ): { name: string; parentClass?: string } | null {
    const candidates = symbols.filter(
      symbol => symbol.type !== 'call' && line >= symbol.startLine && line <= symbol.endLine
    );

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => {
      const aSpan = a.endLine - a.startLine;
      const bSpan = b.endLine - b.startLine;
      if (aSpan !== bSpan) {
        return aSpan - bSpan;
      }

      const aPriority = a.type === 'method' || a.type === 'function' ? 0 : 1;
      const bPriority = b.type === 'method' || b.type === 'function' ? 0 : 1;
      return aPriority - bPriority;
    });

    const best = candidates[0];
    return { name: best.name, parentClass: best.parentClass };
  }

  private formatSymbolName(symbol: { name: string; parentClass?: string }): string {
    return symbol.parentClass ? `${symbol.parentClass}.${symbol.name}` : symbol.name;
  }

  private uniqueInOrder(items: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const item of items) {
      if (!seen.has(item)) {
        seen.add(item);
        unique.push(item);
      }
    }

    return unique;
  }

  /**
   * Run the complete suite
   */
  async run(_config: BenchmarkSuiteConfig, datasetPath: string): Promise<BenchmarkSuiteResult> {
    const startTime = Date.now();
    const testCases = await this.loadTestCases(datasetPath);
    const testResults: TestCaseResult[] = [];
    const collector = new MetricsCollector();
    const irCollector = collector.getIRCollector();

    for (const testCase of testCases) {
      const result = await this.runTestCase(testCase);
      testResults.push(result);
      collector.recordTestResult(result);

      // Track IR metrics from retrieved/relevant items when available
      const actual = result.actual as Record<string, unknown>;
      const retrievedItems = actual.retrievedItems;
      const relevantItems = actual.relevantItems;
      if (
        Array.isArray(retrievedItems) &&
        Array.isArray(relevantItems) &&
        relevantItems.length > 0
      ) {
        irCollector.evaluateQuery(
          retrievedItems.filter((item): item is string => typeof item === 'string'),
          new Set(relevantItems.filter((item): item is string => typeof item === 'string'))
        );
      }

      // Clear caches between tests
      this.scout.clearCache();
    }

    const totalExecutionTimeMs = Date.now() - startTime;

    return {
      config: {
        name: this.name,
        description: this.description,
      },
      testResults,
      aggregatedMetrics: collector.getAggregatedMetrics(),
      latencyStats: collector.getTimingCollector().getPercentiles(),
      irMetrics: irCollector.getMetrics(),
      totalExecutionTimeMs,
      timestamp: new Date().toISOString(),
      systemVersion: 'seu-claude-v2',
    };
  }
}
