/**
 * GroundTruthGenerator - Generates verified ground truth datasets using seu-claude capabilities
 *
 * Uses RecursiveScout for symbol resolution and dependency analysis,
 * and XRefTracker for call graph relationships.
 */

import { mkdir, writeFile, readFile } from 'fs/promises';
import { join, relative, basename } from 'path';
import { glob } from 'glob';

import { RecursiveScout, DependencyGraph } from '../../core/usecases/RecursiveScout.js';
import { CrossReferenceTracker, SymbolDefinition } from '../../indexer/xref-tracker.js';
import { TreeSitterAdapter } from '../../adapters/parsers/TreeSitterAdapter.js';
import { logger } from '../../utils/logger.js';

import type {
  DatasetGenerationOptions,
  DatasetMetadata,
  GroundTruthDataset,
  SymbolLookupGroundTruth,
  CallGraphGroundTruth,
  ImportResolutionGroundTruth,
  CircularDependencyGroundTruth,
  SymbolLocation,
  CallSiteLocation,
} from './types.js';

const GENERATOR_VERSION = '1.0.0';

/**
 * GroundTruthGenerator leverages seu-claude's own code analysis capabilities
 * to generate verified ground truth datasets for benchmarking.
 */
export class GroundTruthGenerator {
  private log = logger.child('ground-truth-generator');
  private scout: RecursiveScout;
  private xrefTracker: CrossReferenceTracker;
  private adapter: TreeSitterAdapter;

  constructor() {
    this.adapter = new TreeSitterAdapter();
    this.scout = new RecursiveScout(this.adapter);
    this.xrefTracker = new CrossReferenceTracker();
  }

  /**
   * Generate a complete ground truth dataset for a codebase
   */
  async generate(
    codebasePath: string,
    options: DatasetGenerationOptions
  ): Promise<GroundTruthDataset> {
    this.log.info(`Generating ground truth for: ${codebasePath}`);

    // Step 1: Find all entry points
    const entryPoints = await this.findEntryPoints(codebasePath, options);
    this.log.info(`Found ${entryPoints.length} entry points`);

    // Step 2: Build dependency graph using RecursiveScout
    const graph = await this.scout.buildDependencyGraph(entryPoints);
    const stats = this.scout.getGraphStats(graph);
    this.log.info(
      `Built dependency graph: ${stats.totalFiles} files, ${stats.totalSymbols} symbols`
    );

    // Step 3: Build cross-reference graph using XRefTracker
    await this.buildXRefGraph(graph);

    // Step 4: Generate ground truth data
    const symbolLookups = this.generateSymbolLookups(graph, codebasePath, options);
    const callGraphs = this.generateCallGraphs(codebasePath, options);
    const importResolutions = this.generateImportResolutions(graph, codebasePath);
    const circularDependencies = this.generateCircularDependencies(graph, codebasePath);

    // Step 5: Create metadata
    const metadata = await this.createMetadata(codebasePath, graph, options);

    const dataset: GroundTruthDataset = {
      metadata,
      symbolLookups,
      callGraphs,
      importResolutions,
      circularDependencies,
    };

    // Step 6: Save to output directory
    await this.saveDataset(dataset, options.outputDir);

    this.log.info(
      `Generated dataset: ${symbolLookups.length} symbol lookups, ` +
        `${callGraphs.length} call graphs, ${importResolutions.length} import resolutions`
    );

    return dataset;
  }

  /**
   * Find entry points for analysis
   */
  private async findEntryPoints(
    codebasePath: string,
    options: DatasetGenerationOptions
  ): Promise<string[]> {
    if (options.entryPoints.length > 0) {
      return options.entryPoints.map(ep => join(codebasePath, ep));
    }

    // Auto-discover entry points based on common patterns
    const patterns = ['src/**/*.ts', 'src/**/*.js', 'lib/**/*.ts', 'lib/**/*.js', '**/*.py'];

    const excludePatterns = options.excludePatterns || [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/__tests__/**',
    ];

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: codebasePath,
        absolute: true,
        ignore: excludePatterns,
      });
      files.push(...matches);
    }

    // Filter by language if specified
    if (options.languages && options.languages.length > 0) {
      const langExtMap: Record<string, string[]> = {
        typescript: ['.ts', '.tsx'],
        javascript: ['.js', '.jsx'],
        python: ['.py'],
      };

      const allowedExts = options.languages.flatMap(lang => langExtMap[lang] || []);
      return files.filter(f => allowedExts.some(ext => f.endsWith(ext)));
    }

    return files;
  }

  /**
   * Build cross-reference graph from dependency graph
   */
  private async buildXRefGraph(graph: DependencyGraph): Promise<void> {
    this.xrefTracker.clear();

    for (const [filePath, node] of graph.nodes) {
      // Build definitions from the dependency node's symbols
      // RecursiveScout already parsed the files and extracted symbols
      const definitions: SymbolDefinition[] = node.symbols
        .filter(s => s.type !== 'call')
        .map(s => ({
          name: s.name,
          type: s.type,
          filePath,
          startLine: s.startLine,
          endLine: s.endLine,
          scope: s.parentClass ? [s.parentClass, s.name] : [s.name],
          calls: [],
          calledBy: [],
        }));

      // Extract call info from symbols
      const calls = node.symbols
        .filter(s => s.type === 'call' && s.callee)
        .map(s => ({
          name: s.callee!,
          line: s.startLine,
          column: s.startColumn,
          callExpression: s.name,
          isMethodCall: false,
        }));

      this.xrefTracker.addToGraph(filePath, definitions, calls);
    }

    this.xrefTracker.buildReverseReferences();
  }

  /**
   * Generate symbol lookup ground truth
   */
  private generateSymbolLookups(
    graph: DependencyGraph,
    codebasePath: string,
    options: DatasetGenerationOptions
  ): SymbolLookupGroundTruth[] {
    const lookups: SymbolLookupGroundTruth[] = [];
    const symbolMap = new Map<string, SymbolLocation[]>();
    const callSiteMap = new Map<string, CallSiteLocation[]>();

    // Collect all symbol definitions and call sites
    for (const [filePath, node] of graph.nodes) {
      const relPath = relative(codebasePath, filePath);

      for (const symbol of node.symbols) {
        if (symbol.type === 'call') {
          // Track call sites
          if (symbol.callee) {
            if (!callSiteMap.has(symbol.callee)) {
              callSiteMap.set(symbol.callee, []);
            }
            callSiteMap.get(symbol.callee)!.push({
              file: relPath,
              line: symbol.startLine,
              caller: symbol.parentClass ? `${symbol.parentClass}.${symbol.name}` : 'module',
            });
          }
        } else {
          // Track definitions
          if (!symbolMap.has(symbol.name)) {
            symbolMap.set(symbol.name, []);
          }
          symbolMap.get(symbol.name)!.push({
            file: relPath,
            line: symbol.startLine,
            type: symbol.type as SymbolLocation['type'],
            scope: symbol.parentClass,
          });
        }
      }
    }

    // Generate test cases for each unique symbol
    let id = 1;
    const maxSymbols = options.maxSymbols || 500;

    for (const [symbolName, definitions] of symbolMap) {
      if (lookups.length >= maxSymbols) break;

      // Skip common/generic names
      if (this.isGenericName(symbolName)) continue;

      const callSites = callSiteMap.get(symbolName) || [];
      const difficulty = this.calculateDifficulty(definitions, callSites);
      const tags = this.generateTags(definitions, callSites);

      lookups.push({
        id: `symbol:${id++}`,
        symbolName,
        definitions,
        callSites,
        difficulty,
        tags,
      });
    }

    return lookups;
  }

  /**
   * Generate call graph ground truth
   */
  private generateCallGraphs(
    codebasePath: string,
    options: DatasetGenerationOptions
  ): CallGraphGroundTruth[] {
    const callGraphs: CallGraphGroundTruth[] = [];
    const xrefGraph = this.xrefTracker.getGraph();

    let id = 1;
    const maxGraphs = options.maxSymbols || 200;

    for (const [_fqn, def] of xrefGraph.definitions) {
      if (callGraphs.length >= maxGraphs) break;

      // Skip trivial functions with no calls
      if (def.calls.length === 0 && def.calledBy.length === 0) continue;

      const relFile = relative(codebasePath, def.filePath);
      const callers = this.xrefTracker.getCallers(def.name);
      const callees = def.calls;

      const difficulty = this.calculateCallGraphDifficulty(callers.length, callees.length);
      const tags = this.generateCallGraphTags(def, callers.length, callees.length);

      callGraphs.push({
        id: `callgraph:${id++}`,
        targetSymbol: def.name,
        targetFile: relFile,
        callers: callers.map(c => ({
          name: c.caller,
          file: relative(codebasePath, c.file),
          callLine: c.line,
        })),
        callees: callees.map((name, idx) => ({
          name,
          callLine: def.startLine + idx, // Approximate
        })),
        difficulty,
        tags,
      });
    }

    return callGraphs;
  }

  /**
   * Generate import resolution ground truth
   */
  private generateImportResolutions(
    graph: DependencyGraph,
    codebasePath: string
  ): ImportResolutionGroundTruth[] {
    const resolutions: ImportResolutionGroundTruth[] = [];
    let id = 1;

    for (const [filePath, node] of graph.nodes) {
      const relSourceFile = relative(codebasePath, filePath);

      for (const imp of node.imports) {
        // Try to resolve the import
        const resolved = this.scout.resolveImport(imp.modulePath, filePath);
        const relResolved = resolved ? relative(codebasePath, resolved) : null;

        const importType = this.classifyImportType(imp.modulePath);
        const difficulty = this.calculateImportDifficulty(imp.modulePath, importType);
        const tags = [importType, imp.isDefault ? 'default' : 'named'];
        if (imp.isNamespace) tags.push('namespace');

        resolutions.push({
          id: `import:${id++}`,
          sourceFile: relSourceFile,
          importPath: imp.modulePath,
          resolvedPath: relResolved,
          importedSymbols: imp.importedSymbols,
          importType,
          difficulty,
          tags,
        });
      }
    }

    return resolutions;
  }

  /**
   * Generate circular dependency ground truth
   */
  private generateCircularDependencies(
    graph: DependencyGraph,
    codebasePath: string
  ): CircularDependencyGroundTruth[] {
    return graph.circularDeps.map((cycle, idx) => ({
      id: `circular:${idx + 1}`,
      cycle: cycle.map(f => relative(codebasePath, f)),
      isCircular: true,
      tags: [`cycle-length-${cycle.length}`],
    }));
  }

  /**
   * Create dataset metadata
   */
  private async createMetadata(
    codebasePath: string,
    graph: DependencyGraph,
    _options: DatasetGenerationOptions
  ): Promise<DatasetMetadata> {
    const stats = this.scout.getGraphStats(graph);

    // Try to get git commit
    let sourceCommit: string | undefined;
    try {
      const { execSync } = await import('child_process');
      sourceCommit = execSync('git rev-parse HEAD', { cwd: codebasePath })
        .toString()
        .trim();
    } catch {
      // Not a git repo or git not available
    }

    // Detect languages
    const languages = new Set<string>();
    for (const filePath of graph.nodes.keys()) {
      const ext = filePath.split('.').pop();
      if (ext === 'ts' || ext === 'tsx') languages.add('typescript');
      else if (ext === 'js' || ext === 'jsx') languages.add('javascript');
      else if (ext === 'py') languages.add('python');
    }

    // Estimate lines of code
    let totalLinesOfCode = 0;
    for (const [filePath] of graph.nodes) {
      try {
        const content = await readFile(filePath, 'utf-8');
        totalLinesOfCode += content.split('\n').length;
      } catch {
        // Skip unreadable files
      }
    }

    return {
      name: basename(codebasePath),
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      sourceCodebase: codebasePath,
      sourceCommit,
      totalFiles: stats.totalFiles,
      totalLinesOfCode,
      languages: Array.from(languages),
      generatorVersion: GENERATOR_VERSION,
    };
  }

  /**
   * Save dataset to output directory
   */
  private async saveDataset(dataset: GroundTruthDataset, outputDir: string): Promise<void> {
    await mkdir(outputDir, { recursive: true });

    // Save individual files for easier loading
    await writeFile(
      join(outputDir, 'metadata.json'),
      JSON.stringify(dataset.metadata, null, 2)
    );

    await writeFile(
      join(outputDir, 'symbol-lookups.json'),
      JSON.stringify(dataset.symbolLookups, null, 2)
    );

    await writeFile(
      join(outputDir, 'call-graphs.json'),
      JSON.stringify(dataset.callGraphs, null, 2)
    );

    await writeFile(
      join(outputDir, 'import-resolutions.json'),
      JSON.stringify(dataset.importResolutions, null, 2)
    );

    await writeFile(
      join(outputDir, 'circular-dependencies.json'),
      JSON.stringify(dataset.circularDependencies, null, 2)
    );

    // Also save complete dataset
    await writeFile(join(outputDir, 'dataset.json'), JSON.stringify(dataset, null, 2));

    this.log.info(`Saved dataset to: ${outputDir}`);
  }

  /**
   * Check if a symbol name is too generic to be useful
   */
  private isGenericName(name: string): boolean {
    const genericNames = new Set([
      'constructor',
      'toString',
      'valueOf',
      'init',
      'setup',
      'teardown',
      'get',
      'set',
      'run',
      'start',
      'stop',
      'handle',
      'process',
      'data',
      'value',
      'result',
      'error',
      'options',
      'config',
      'params',
      'args',
      'props',
      'state',
      'context',
      'callback',
      'handler',
      'listener',
      'observer',
      'subscriber',
    ]);

    return genericNames.has(name) || name.length <= 2;
  }

  /**
   * Calculate difficulty based on symbol complexity
   */
  private calculateDifficulty(
    definitions: SymbolLocation[],
    callSites: CallSiteLocation[]
  ): 'easy' | 'medium' | 'hard' {
    const defCount = definitions.length;
    const callCount = callSites.length;

    // Easy: single definition, few call sites
    if (defCount === 1 && callCount <= 3) return 'easy';

    // Hard: multiple definitions or many call sites
    if (defCount > 2 || callCount > 10) return 'hard';

    return 'medium';
  }

  /**
   * Generate tags for symbol lookup
   */
  private generateTags(
    definitions: SymbolLocation[],
    callSites: CallSiteLocation[]
  ): string[] {
    const tags: string[] = [];

    // Type tags
    const types = new Set(definitions.map(d => d.type));
    tags.push(...types);

    // Scope tags
    if (definitions.some(d => d.scope)) tags.push('scoped');

    // Usage tags
    if (callSites.length === 0) tags.push('unused');
    else if (callSites.length > 5) tags.push('frequently-used');

    // Multi-definition
    if (definitions.length > 1) tags.push('multi-definition');

    return tags;
  }

  /**
   * Calculate call graph difficulty
   */
  private calculateCallGraphDifficulty(
    callerCount: number,
    calleeCount: number
  ): 'easy' | 'medium' | 'hard' {
    const total = callerCount + calleeCount;

    if (total <= 3) return 'easy';
    if (total > 10) return 'hard';
    return 'medium';
  }

  /**
   * Generate tags for call graph
   */
  private generateCallGraphTags(
    def: SymbolDefinition,
    callerCount: number,
    calleeCount: number
  ): string[] {
    const tags: string[] = [def.type];

    if (callerCount === 0) tags.push('entry-point');
    if (calleeCount === 0) tags.push('leaf');
    if (callerCount > 5) tags.push('high-fan-in');
    if (calleeCount > 5) tags.push('high-fan-out');

    return tags;
  }

  /**
   * Classify import type
   */
  private classifyImportType(
    importPath: string
  ): 'relative' | 'absolute' | 'package' | 'builtin' {
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      return 'relative';
    }
    if (importPath.startsWith('/')) {
      return 'absolute';
    }
    if (importPath.startsWith('@') || !importPath.includes('/')) {
      return 'package';
    }
    return 'package';
  }

  /**
   * Calculate import difficulty
   */
  private calculateImportDifficulty(
    importPath: string,
    importType: string
  ): 'easy' | 'medium' | 'hard' {
    // Relative imports to same directory are easy
    if (importPath === './' || importPath.match(/^\.\/[^/]+$/)) return 'easy';

    // Deep relative paths are hard
    if ((importPath.match(/\.\.\//g) || []).length > 2) return 'hard';

    // Package imports are medium
    if (importType === 'package') return 'medium';

    return 'medium';
  }

  /**
   * Clear internal caches
   */
  clearCache(): void {
    this.scout.clearCache();
    this.xrefTracker.clear();
  }
}
