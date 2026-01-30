#!/usr/bin/env node
/**
 * Phase 4 Bootstrap Script
 *
 * Uses the v2 infrastructure (TaskManager, HypothesisEngine, Gatekeeper)
 * to plan and implement Phase 4 using TDD.
 *
 * This demonstrates the system building itself - "self-hosting"
 */

import { join } from 'path';
import { mkdir } from 'fs/promises';
import { SQLiteTaskStore } from '../src/adapters/db/SQLiteTaskStore.js';
import { TaskManager } from '../src/core/usecases/TaskManager.js';
import { RecursiveScout } from '../src/core/usecases/RecursiveScout.js';
import { TreeSitterAdapter } from '../src/adapters/parsers/TreeSitterAdapter.js';
import { Gatekeeper } from '../src/core/usecases/Gatekeeper.js';

const PROJECT_ROOT = join(import.meta.dirname, '..');
const DATA_DIR = join(PROJECT_ROOT, '.seu-claude-v2');
const DB_PATH = join(DATA_DIR, 'phase4-tasks.db');

async function main() {
  console.log('🚀 Phase 4 Bootstrap - Self-Hosting Development\n');
  console.log('Using v2 infrastructure to build Phase 4:\n');
  console.log('  ✓ TaskManager - Plan and track work');
  console.log('  ✓ HypothesisEngine - TDD cycle automation');
  console.log('  ✓ Gatekeeper - Code quality validation');
  console.log('  ✓ RecursiveScout - Dependency analysis');
  console.log('  ✓ ProcessSandbox - Isolated testing\n');

  // Initialize infrastructure
  await mkdir(DATA_DIR, { recursive: true });
  const store = new SQLiteTaskStore(DB_PATH);
  const manager = new TaskManager(store);

  // Step 1: Create Phase 4 Task DAG
  console.log('📋 Step 1: Creating Phase 4 Task Plan\n');

  const phase4 = await manager.createRootGoal('Phase 4: MCP Interface & CLI');
  console.log(`   ✓ Root task created: ${phase4.id}`);

  // Architecture & Planning
  const architecture = await manager.spawnSubtask(phase4.id, '1. Architecture Review');
  await manager.spawnSubtask(architecture.id, '1.1 Analyze existing MCP handler code');
  await manager.spawnSubtask(architecture.id, '1.2 Design CLI integration strategy');
  await manager.spawnSubtask(architecture.id, '1.3 Document data flow');
  await manager.updateStatus(architecture.id, 'completed');

  // CLI Implementation (TDD)
  const cli = await manager.spawnSubtask(phase4.id, '2. CLI Implementation (TDD)');
  await manager.spawnSubtask(cli.id, '2.1 Write CLI test suite (RED)');
  await manager.spawnSubtask(cli.id, '2.2 Implement CLI commands (GREEN)');
  await manager.spawnSubtask(cli.id, '2.3 Validate with Gatekeeper (REFACTOR)');

  // MCP Integration
  const mcp = await manager.spawnSubtask(phase4.id, '3. MCP Integration');
  await manager.spawnSubtask(mcp.id, '3.1 Write MCP integration tests (RED)');
  await manager.spawnSubtask(mcp.id, '3.2 Implement v2 entry point (GREEN)');
  await manager.spawnSubtask(mcp.id, '3.3 Test with real Claude Code (REFACTOR)');

  // Package Configuration
  const pkg = await manager.spawnSubtask(phase4.id, '4. Package Configuration');
  await manager.spawnSubtask(pkg.id, '4.1 Update package.json with bin');
  await manager.spawnSubtask(pkg.id, '4.2 Create v2 CLI wrapper');
  await manager.spawnSubtask(pkg.id, '4.3 Test installation flow');

  // Documentation
  const docs = await manager.spawnSubtask(phase4.id, '5. Documentation');
  await manager.spawnSubtask(docs.id, '5.1 Write MCP tool usage guide');
  await manager.spawnSubtask(docs.id, '5.2 Create CLI examples');
  await manager.spawnSubtask(docs.id, '5.3 Document configuration options');

  // Validation
  const validation = await manager.spawnSubtask(phase4.id, '6. End-to-End Validation');
  await manager.spawnSubtask(validation.id, '6.1 Create example project');
  await manager.spawnSubtask(validation.id, '6.2 Test all 6 MCP tools');
  await manager.spawnSubtask(validation.id, '6.3 Test all CLI commands');
  await manager.spawnSubtask(validation.id, '6.4 Performance benchmarks');

  console.log('   ✓ Task tree created\n');

  // Step 2: Visualize the plan
  console.log('📊 Step 2: Phase 4 Task Tree\n');
  const tree = await manager.getTaskTree();
  printTree(tree, 0);

  // Step 3: Analyze existing codebase
  console.log('\n🔍 Step 3: Analyzing Existing Phase 4 Code\n');

  const adapter = new TreeSitterAdapter();
  const scout = new RecursiveScout(adapter);

  const entryPoints = [
    join(PROJECT_ROOT, 'src/mcp/handler.ts'),
    join(PROJECT_ROOT, 'src/mcp/server.ts'),
    join(PROJECT_ROOT, 'src/cli/index.ts'),
  ];

  const graph = await scout.buildDependencyGraph(entryPoints);
  const stats = scout.getGraphStats(graph);

  console.log('   Analysis Results:');
  console.log(`   - Files analyzed: ${stats.totalFiles}`);
  console.log(`   - Symbols found: ${stats.totalSymbols}`);
  console.log(`   - Dependencies: ${stats.totalImports}`);
  console.log(`   - Circular deps: ${stats.circularCount}`);

  if (stats.circularCount > 0) {
    console.log('\n   ⚠️  Circular dependencies detected:');
    graph.circularDeps.forEach(cycle => {
      console.log(`      ${cycle.map(f => f.split('/').pop()).join(' → ')}`);
    });
  }

  // Step 4: Validate existing code with Gatekeeper
  console.log('\n🔎 Step 4: Pre-flight Validation\n');

  const gatekeeper = new Gatekeeper();
  const validationResult = await gatekeeper.preflightCheck([
    join(PROJECT_ROOT, 'src/mcp/handler.ts'),
    join(PROJECT_ROOT, 'src/mcp/server.ts'),
    join(PROJECT_ROOT, 'src/cli/index.ts'),
  ]);

  console.log(`   Validation: ${validationResult.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`   Errors: ${validationResult.totalErrors}`);
  console.log(`   Warnings: ${validationResult.totalWarnings}`);
  console.log(`   Duration: ${validationResult.durationMs.toFixed(0)}ms`);

  if (validationResult.totalErrors > 0) {
    console.log('\n   Errors found:');
    for (const [validator, result] of validationResult.validatorResults) {
      if (result.errors.length > 0) {
        console.log(`\n   ${validator}:`);
        result.errors.slice(0, 5).forEach(e => {
          console.log(`     - ${e.file.split('/').pop()}:${e.line}: ${e.message}`);
        });
      }
    }
  }

  // Step 5: Get next actionable task
  console.log('\n🎯 Step 5: Next Actionable Task\n');
  const pending = await manager.getPendingTasks();
  const nextTask = findLeafTask(pending, graph.nodes);

  if (nextTask) {
    console.log(`   Task: ${nextTask.label}`);
    console.log(`   ID: ${nextTask.id}`);
    console.log(`   Status: ${nextTask.status}`);
    console.log('\n   To start this task:');
    console.log(`     1. Mark as running: manager.updateStatus('${nextTask.id}', 'running')`);
    console.log(`     2. Write test (RED phase)`);
    console.log(`     3. Implement code (GREEN phase)`);
    console.log(`     4. Validate with Gatekeeper (REFACTOR phase)`);
    console.log(`     5. Mark complete: manager.updateStatus('${nextTask.id}', 'completed')`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✨ Phase 4 Bootstrap Complete!\n');
  console.log('Next Steps:');
  console.log('  1. Review task plan above');
  console.log('  2. Start with first pending task');
  console.log('  3. Use TDD approach (RED-GREEN-REFACTOR)');
  console.log('  4. Use Gatekeeper for validation');
  console.log('  5. Track progress in TaskManager');
  console.log(`\nDatabase: ${DB_PATH}`);
  console.log('='.repeat(60));

  store.close();
}

function printTree(nodes: any[], indent: number): void {
  const prefix = '   '.repeat(indent);
  for (const node of nodes) {
    const icon = getStatusIcon(node.task.status);
    console.log(`${prefix}${icon} ${node.task.label}`);
    if (node.children && node.children.length > 0) {
      printTree(node.children, indent + 1);
    }
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pending':
      return '⏳';
    case 'running':
      return '🔄';
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    default:
      return '❓';
  }
}

function findLeafTask(tasks: any[], _graphNodes: any): any {
  // Find first pending task with no pending children
  return tasks.find(t => t.status === 'pending');
}

main().catch(console.error);
