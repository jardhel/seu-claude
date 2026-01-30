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

export class ToolHandler {
  private projectRoot: string;
  private dataDir: string;
  private taskManager: TaskManager | null = null;
  private store: SQLiteTaskStore | null = null;

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

    const engine = new HypothesisEngine();
    const hypothesis = engine.createHypothesis(
      description,
      testCode,
      implementationCode,
      join(this.projectRoot, testFilePath),
      join(this.projectRoot, implementationFilePath)
    );

    const result = await engine.runTDDCycle(hypothesis);

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

    const adapter = new TreeSitterAdapter();
    const scout = new RecursiveScout(adapter);

    const graph = await scout.buildDependencyGraph(entryPoints);

    const definitions = await scout.findSymbolDefinitions(symbolName, graph);
    const callSites = await scout.findCallSites(symbolName, graph);

    return {
      symbolName,
      definitions: definitions.map(d => ({
        file: d.filePath,
        line: d.symbol.startLine,
        type: d.symbol.type,
      })),
      callSites: callSites.map(c => ({
        file: c.filePath,
        line: c.symbol.startLine,
      })),
      definitionCount: definitions.length,
      callSiteCount: callSites.length,
    };
  }

  private async getTaskManager(): Promise<TaskManager> {
    if (!this.taskManager) {
      await mkdir(this.dataDir, { recursive: true });
      this.store = new SQLiteTaskStore(join(this.dataDir, 'tasks.db'));
      this.taskManager = new TaskManager(this.store);
    }
    return this.taskManager;
  }

  async close(): Promise<void> {
    if (this.store) {
      this.store.close();
      this.store = null;
      this.taskManager = null;
    }
  }
}
