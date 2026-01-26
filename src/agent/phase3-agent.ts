/**
 * Phase 3 Implementation Agent
 *
 * Uses seu-claude v2 infrastructure (TaskManager, RecursiveScout) to
 * plan and track the implementation of Phase 3: The Proving Ground
 *
 * Run: npx ts-node src/agent/phase3-agent.ts
 */

import { join } from 'path';
import { SQLiteTaskStore } from '../adapters/db/SQLiteTaskStore.js';
import { TaskManager, TaskNode } from '../core/usecases/TaskManager.js';
import { RecursiveScout } from '../core/usecases/RecursiveScout.js';
import { TreeSitterAdapter } from '../adapters/parsers/TreeSitterAdapter.js';
import { Task } from '../core/entities/Task.js';

const DB_PATH = join(__dirname, '../../.agent-state.db');

interface AgentContext {
  store: SQLiteTaskStore;
  manager: TaskManager;
  scout: RecursiveScout;
  adapter: TreeSitterAdapter;
}

async function initAgent(): Promise<AgentContext> {
  const store = new SQLiteTaskStore(DB_PATH);
  const manager = new TaskManager(store);
  const adapter = new TreeSitterAdapter();
  const scout = new RecursiveScout(adapter);

  return { store, manager, scout, adapter };
}

async function getOrCreatePhase3Plan(ctx: AgentContext): Promise<Task> {
  // Check if we have existing Phase 3 work
  const existing = await ctx.manager.recoverState();
  const phase3Root = existing.find(t => t.label === 'Phase 3: The Proving Ground');

  if (phase3Root) {
    console.log('📂 Recovered existing Phase 3 plan\n');
    return phase3Root;
  }

  console.log('📋 Creating Phase 3 implementation plan...\n');

  // Create Phase 3 task DAG
  const phase3 = await ctx.manager.createRootGoal('Phase 3: The Proving Ground');

  // Gatekeeper tasks
  const gatekeeper = await ctx.manager.spawnSubtask(phase3.id, 'Implement Gatekeeper');
  await ctx.manager.spawnSubtask(gatekeeper.id, 'Create IGatekeeper interface');
  await ctx.manager.spawnSubtask(gatekeeper.id, 'Implement ESLint validator');
  await ctx.manager.spawnSubtask(gatekeeper.id, 'Implement TypeScript type checker');
  await ctx.manager.spawnSubtask(gatekeeper.id, 'Add Gatekeeper tests');

  // DockerSandbox tasks
  const sandbox = await ctx.manager.spawnSubtask(phase3.id, 'Implement DockerSandbox');
  await ctx.manager.spawnSubtask(sandbox.id, 'Create ISandbox interface');
  await ctx.manager.spawnSubtask(sandbox.id, 'Implement Docker container execution');
  await ctx.manager.spawnSubtask(sandbox.id, 'Add network isolation');
  await ctx.manager.spawnSubtask(sandbox.id, 'Add timeout handling');
  await ctx.manager.spawnSubtask(sandbox.id, 'Add DockerSandbox tests');

  // HypothesisEngine tasks
  const hypothesis = await ctx.manager.spawnSubtask(phase3.id, 'Implement HypothesisEngine');
  await ctx.manager.spawnSubtask(hypothesis.id, 'Create IHypothesisEngine interface');
  await ctx.manager.spawnSubtask(hypothesis.id, 'Implement Red-Green-Refactor loop');
  await ctx.manager.spawnSubtask(hypothesis.id, 'Integrate with Gatekeeper');
  await ctx.manager.spawnSubtask(hypothesis.id, 'Add HypothesisEngine tests');

  return phase3;
}

async function analyzeCodebase(ctx: AgentContext): Promise<void> {
  console.log('🔍 Analyzing existing codebase with RecursiveScout...\n');

  const entryPoints = [
    join(__dirname, '../core/usecases/TaskManager.ts'),
    join(__dirname, '../core/usecases/RecursiveScout.ts'),
    join(__dirname, '../adapters/parsers/TreeSitterAdapter.ts'),
  ];

  const graph = await ctx.scout.buildDependencyGraph(entryPoints);
  const stats = ctx.scout.getGraphStats(graph);

  console.log(`   Files indexed: ${stats.totalFiles}`);
  console.log(`   Symbols found: ${stats.totalSymbols}`);
  console.log(`   Dependencies mapped: ${stats.totalImports}`);
}

function printTaskTree(nodes: TaskNode[], indent = 0): void {
  const prefix = '   '.repeat(indent);
  for (const node of nodes) {
    const icon = getStatusIcon(node.task.status);
    const cached = Object.keys(node.task.context.toolOutputs || {}).length;
    const cacheInfo = cached > 0 ? ` [${cached} cached]` : '';
    console.log(`${prefix}${icon} ${node.task.label}${cacheInfo}`);
    if (node.children.length > 0) {
      printTaskTree(node.children, indent + 1);
    }
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pending': return '⏳';
    case 'running': return '🔄';
    case 'completed': return '✅';
    case 'failed': return '❌';
    default: return '❓';
  }
}

async function getNextTask(ctx: AgentContext): Promise<Task | null> {
  const pending = await ctx.manager.getPendingTasks();
  // Find a leaf task (no pending children)
  for (const task of pending) {
    const children = await ctx.manager.getSubtasks(task.id);
    const pendingChildren = children.filter(c => c.status === 'pending');
    if (pendingChildren.length === 0) {
      return task;
    }
  }
  return pending[0] || null;
}

async function main() {
  console.log('🤖 Seu-Claude v2 Phase 3 Agent\n');
  console.log('='.repeat(60));

  const ctx = await initAgent();

  try {
    // Get or create the Phase 3 plan
    await getOrCreatePhase3Plan(ctx);

    // Analyze codebase
    await analyzeCodebase(ctx);

    // Show current task tree
    console.log('\n📋 Phase 3 Task Tree:\n');
    const tree = await ctx.manager.getTaskTree();
    printTaskTree(tree);

    // Show next task to work on
    const nextTask = await getNextTask(ctx);
    if (nextTask) {
      console.log(`\n🎯 Next task: "${nextTask.label}"`);
      console.log(`   ID: ${nextTask.id}`);
    }

    // Show stats
    const allTasks = await ctx.manager.recoverState();
    const completed = allTasks.filter(t => t.status === 'completed').length;
    const pending = allTasks.filter(t => t.status === 'pending').length;

    console.log(`\n📊 Progress: ${completed}/${allTasks.length} tasks completed (${pending} pending)`);
    console.log(`   Database: ${DB_PATH}`);

  } finally {
    ctx.store.close();
  }
}

main().catch(console.error);
