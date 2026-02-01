/**
 * MCP Tool Handler
 *
 * Implements the logic for each MCP tool using v2 infrastructure.
 */

import { join } from 'path';
import { mkdir } from 'fs/promises';
import { ToolName } from './tools.js';
import { SQLiteTaskStore } from '../adapters/db/SQLiteTaskStore.js';
import { TaskManager, TaskNode } from '../core/usecases/TaskManager.js';
import { RecursiveScout } from '../core/usecases/RecursiveScout.js';
import { TreeSitterAdapter } from '../adapters/parsers/TreeSitterAdapter.js';
import { Gatekeeper } from '../core/usecases/Gatekeeper.js';
import { HypothesisEngine } from '../core/usecases/HypothesisEngine.js';
import { ProcessSandbox } from '../adapters/sandbox/ProcessSandbox.js';
import { SymbolResolver } from '../lsp/symbol-resolver.js';
import { GitAwareIndexer } from '../indexer/git-aware-indexer.js';
import { loadConfig } from '../utils/config.js';

export class ToolHandler {
  private projectRoot: string;
  private dataDir: string;
  private taskManager: TaskManager | null = null;
  private store: SQLiteTaskStore | null = null;
  private symbolResolver: SymbolResolver | null = null;

  constructor(projectRoot: string, dataDir: string) {
    this.projectRoot = projectRoot;
    this.dataDir = dataDir;
  }

  async handleTool(name: ToolName, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'analyze_dependency':
        return this.analyzeDependency(args);
      case 'validate_code':
        return this.validateCode(args);
      case 'execute_sandbox':
        return this.executeSandbox(args);
      case 'manage_task':
        return this.manageTask(args);
      case 'run_tdd':
        return this.runTDD(args);
      case 'find_symbol':
        return this.findSymbol(args);
      case 'index_codebase':
        return this.indexCodebase(args);
      case 'summarize_codebase':
        return this.summarizeCodebase(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async analyzeDependency(args: Record<string, unknown>): Promise<unknown> {
    const entryPoints = (args.entryPoints as string[]).map(p =>
      p.startsWith('/') ? p : join(this.projectRoot, p)
    );
    const maxDepth = args.maxDepth as number | undefined;
    const includeNodeModules = args.includeNodeModules as boolean | undefined;

    const adapter = new TreeSitterAdapter();
    const scout = new RecursiveScout(adapter, { maxDepth, includeNodeModules });

    const graph = await scout.buildDependencyGraph(entryPoints);
    const stats = scout.getGraphStats(graph);

    // Convert Map to serializable object
    const nodes: Record<string, unknown> = {};
    for (const [path, node] of graph.nodes) {
      nodes[path] = {
        imports: node.imports,
        dependencies: node.dependencies,
        dependents: node.dependents,
        symbolCount: node.symbols.length,
        symbols: node.symbols.slice(0, 20).map(s => ({
          name: s.name,
          type: s.type,
          line: s.startLine,
        })),
      };
    }

    return {
      stats,
      roots: graph.roots,
      leaves: graph.leaves,
      circularDeps: graph.circularDeps,
      nodes,
    };
  }

  private async validateCode(args: Record<string, unknown>): Promise<unknown> {
    const paths = (args.paths as string[]).map(p =>
      p.startsWith('/') ? p : join(this.projectRoot, p)
    );
    const fix = args.fix as boolean | undefined;

    const gatekeeper = new Gatekeeper();
    const result = await gatekeeper.preflightCheck(paths, { fix });

    // Convert Map to object
    const validatorResults: Record<string, unknown> = {};
    for (const [id, vResult] of result.validatorResults) {
      validatorResults[id] = vResult;
    }

    return {
      passed: result.passed,
      totalErrors: result.totalErrors,
      totalWarnings: result.totalWarnings,
      durationMs: result.durationMs,
      validators: validatorResults,
    };
  }

  private async executeSandbox(args: Record<string, unknown>): Promise<unknown> {
    const command = args.command as string;
    const cmdArgs = args.args as string[] | undefined;
    const timeout = args.timeout as number | undefined;
    const workingDir = args.workingDir as string | undefined;

    const sandbox = new ProcessSandbox();
    await sandbox.initialize();

    try {
      const result = await sandbox.execute({
        command,
        args: cmdArgs,
        timeout,
        workingDir: workingDir ? join(this.projectRoot, workingDir) : this.projectRoot,
      });

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
      };
    } finally {
      await sandbox.destroy();
    }
  }

  private async manageTask(args: Record<string, unknown>): Promise<unknown> {
    const action = args.action as string;
    const manager = await this.getTaskManager();

    switch (action) {
      case 'create': {
        const label = args.label as string;
        const parentId = args.parentId as string | undefined;

        if (parentId) {
          const task = await manager.spawnSubtask(parentId, label);
          return { created: true, task };
        } else {
          const task = await manager.createRootGoal(label);
          return { created: true, task };
        }
      }

      case 'update': {
        const taskId = args.taskId as string;
        const status = args.status as 'pending' | 'running' | 'completed' | 'failed' | undefined;
        const toolOutput = args.toolOutput as { toolName: string; output: unknown } | undefined;

        if (status) {
          await manager.updateStatus(taskId, status);
        }

        if (toolOutput) {
          await manager.cacheToolOutput(taskId, toolOutput.toolName, toolOutput.output);
        }

        const task = await manager.getTask(taskId);
        return { updated: true, task };
      }

      case 'get': {
        const taskId = args.taskId as string;
        const task = await manager.getTask(taskId);
        return { task };
      }

      case 'list': {
        const tasks = await manager.recoverState();
        return {
          total: tasks.length,
          pending: tasks.filter(t => t.status === 'pending').length,
          running: tasks.filter(t => t.status === 'running').length,
          completed: tasks.filter(t => t.status === 'completed').length,
          failed: tasks.filter(t => t.status === 'failed').length,
          tasks,
        };
      }

      case 'tree': {
        const tree = await manager.getTaskTree();
        return { tree: this.serializeTree(tree) };
      }

      case 'clear': {
        const deletedCount = await manager.clearAll();
        return { cleared: true, deletedCount };
      }

      default:
        throw new Error(`Unknown task action: ${action}`);
    }
  }

  private serializeTree(nodes: TaskNode[]): unknown[] {
    return nodes.map(node => ({
      id: node.task.id,
      label: node.task.label,
      status: node.task.status,
      children: this.serializeTree(node.children),
    }));
  }

  private async runTDD(args: Record<string, unknown>): Promise<unknown> {
    const description = args.description as string;
    const testCode = args.testCode as string;
    const implementationCode = args.implementationCode as string;
    const testFilePath = args.testFilePath as string;
    const implementationFilePath = args.implementationFilePath as string;
    const testTimeout = args.testTimeout as number | undefined;
    const autoFix = args.autoFix as boolean | undefined;

    const engine = new HypothesisEngine();
    const hypothesis = engine.createHypothesis(
      description,
      testCode,
      implementationCode,
      join(this.projectRoot, testFilePath),
      join(this.projectRoot, implementationFilePath)
    );

    const options = {
      ...(testTimeout !== undefined && { testTimeout }),
      ...(autoFix !== undefined && { autoFix }),
    };

    const result = await engine.runTDDCycle(hypothesis, options);

    return {
      phase: result.phase,
      passed: result.phase === 'complete',
      suggestions: result.suggestions,
      error: result.error,
      testResult: result.testResult
        ? {
            exitCode: result.testResult.exitCode,
            stdout: result.testResult.stdout.slice(0, 2000),
            stderr: result.testResult.stderr.slice(0, 2000),
          }
        : undefined,
    };
  }

  private async findSymbol(args: Record<string, unknown>): Promise<unknown> {
    const symbolName = args.symbolName as string;
    const entryPoints = (args.entryPoints as string[]).map(p =>
      p.startsWith('/') ? p : join(this.projectRoot, p)
    );

    // Use LSP-enhanced symbol resolver (falls back to TreeSitter if LSP unavailable)
    const resolver = await this.getSymbolResolver();
    const result = await resolver.findSymbol(symbolName, entryPoints);

    return {
      symbolName: result.symbolName,
      definitions: result.definitions.map(d => ({
        file: d.file,
        line: d.line,
        type: d.type,
        name: d.name,
        source: d.source,
      })),
      callSites: result.references.map(r => ({
        file: r.file,
        line: r.line,
        source: r.source,
      })),
      definitionCount: result.definitionCount,
      callSiteCount: result.referenceCount,
      source: result.source,
      lspAvailable: resolver.isLSPAvailable(),
    };
  }

  private async getSymbolResolver(): Promise<SymbolResolver> {
    if (!this.symbolResolver) {
      this.symbolResolver = new SymbolResolver(this.projectRoot);
      await this.symbolResolver.initialize();
    }
    return this.symbolResolver;
  }

  private async getTaskManager(): Promise<TaskManager> {
    if (!this.taskManager) {
      await mkdir(this.dataDir, { recursive: true });
      this.store = new SQLiteTaskStore(join(this.dataDir, 'tasks.db'));
      this.taskManager = new TaskManager(this.store);
    }
    return this.taskManager;
  }

  private async indexCodebase(args: Record<string, unknown>): Promise<unknown> {
    const mode = (args.mode as string) || 'incremental';
    const includeUncommitted = args.includeUncommitted !== false;

    const config = loadConfig({
      projectRoot: this.projectRoot,
      dataDir: this.dataDir,
    });

    const indexer = new GitAwareIndexer(config);
    await indexer.initialize();

    if (mode === 'full') {
      // Force full re-index by clearing state
      await indexer.saveState({
        lastIndexedCommit: null,
        lastIndexedAt: 0,
        branch: '',
        totalFiles: 0,
        includesUncommitted: false,
      });
    }

    const plan = await indexer.planIncrementalIndex(includeUncommitted);

    // Return the plan (actual indexing would be done by a separate process)
    return {
      mode,
      isFullReindex: plan.isFullReindex,
      reason: plan.reason,
      stats: plan.stats,
      filesToIndex: plan.filesToIndex.map(f => f.relativePath),
      filesToRemove: plan.filesToRemove,
      gitAvailable: !!plan.gitDiff,
      currentState: indexer.getState(),
    };
  }

  private async summarizeCodebase(args: Record<string, unknown>): Promise<unknown> {
    const scope = (args.scope as string) || '';
    const depth = (args.depth as string) || 'overview';
    const focus = (args.focus as string[]) || ['architecture', 'entry-points'];
    const maxTokens = (args.maxTokens as number) || 2000;

    const scopePath = scope ? join(this.projectRoot, scope) : this.projectRoot;

    // Use RecursiveScout to analyze the codebase
    const adapter = new TreeSitterAdapter();
    const scout = new RecursiveScout(adapter, { maxDepth: 10 });

    // Find entry points (index files, main files)
    const entryPatterns = ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js'];
    const { globSync } = await import('fast-glob');
    const entryPoints = globSync(entryPatterns.map(p => join(scopePath, '**', p)), {
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    }).slice(0, 5); // Limit to 5 entry points

    if (entryPoints.length === 0) {
      // Fallback: find any TypeScript/JavaScript files
      const fallbackFiles = globSync([join(scopePath, 'src/**/*.ts'), join(scopePath, '*.ts')], {
        ignore: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'],
      }).slice(0, 3);
      entryPoints.push(...fallbackFiles);
    }

    const summary: Record<string, unknown> = {
      scope: scope || '/',
      depth,
      focus,
    };

    if (entryPoints.length > 0) {
      const graph = await scout.buildDependencyGraph(entryPoints);
      const stats = scout.getGraphStats(graph);

      summary.architecture = {
        totalFiles: stats.totalFiles,
        totalSymbols: stats.totalSymbols,
        totalImports: stats.totalImports,
        circularDependencies: graph.circularDeps.length,
        entryPoints: graph.roots,
        leafFiles: graph.leaves.slice(0, 10),
      };

      if (depth === 'detailed') {
        // Add top-level exports from entry points
        const exports: Array<{ file: string; symbols: string[] }> = [];
        for (const entryPoint of entryPoints.slice(0, 3)) {
          const node = graph.nodes.get(entryPoint);
          if (node) {
            exports.push({
              file: entryPoint.replace(this.projectRoot, ''),
              symbols: node.symbols
                .filter(s => s.type === 'function' || s.type === 'class')
                .slice(0, 10)
                .map(s => `${s.type}:${s.name}`),
            });
          }
        }
        summary.exports = exports;
      }

      // Estimate token usage
      const summaryJson = JSON.stringify(summary);
      const estimatedTokens = Math.ceil(summaryJson.length / 4);
      summary.estimatedTokens = estimatedTokens;
      summary.withinBudget = estimatedTokens <= maxTokens;
    } else {
      summary.error = 'No source files found in scope';
    }

    return summary;
  }

  async close(): Promise<void> {
    if (this.store) {
      this.store.close();
      this.store = null;
      this.taskManager = null;
    }
    if (this.symbolResolver) {
      await this.symbolResolver.stop();
      this.symbolResolver = null;
    }
  }
}
