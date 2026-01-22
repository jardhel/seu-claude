/**
 * Phase 2 Demo: Using TaskManager to track implementation work
 *
 * This script demonstrates the Phase 1 TaskManager by using it to
 * plan and track the Phase 2 implementation tasks.
 *
 * Run: npx ts-node src/demo-phase2.ts
 */

import { SQLiteTaskStore } from './adapters/db/SQLiteTaskStore';
import { TaskManager } from './core/usecases/TaskManager';
import { join } from 'path';

async function main() {
  // Create persistent store for Phase 2 work tracking
  const dbPath = join(__dirname, '..', '.phase2-tasks.db');
  const store = new SQLiteTaskStore(dbPath);
  const manager = new TaskManager(store);

  console.log('🚀 Project Janus - Phase 2: Perception');
  console.log('=' .repeat(50));

  // Check if we're recovering from a previous session
  const existing = await manager.recoverState();
  if (existing.length > 0) {
    console.log(`\n📂 Recovered ${existing.length} tasks from previous session:\n`);
    const tree = await manager.getTaskTree();
    printTree(tree, 0);

    // Show any cached tool outputs
    for (const task of existing) {
      const outputs = Object.keys(task.context.toolOutputs || {});
      if (outputs.length > 0) {
        console.log(`   └─ Cached outputs for "${task.label}": ${outputs.join(', ')}`);
      }
    }

    store.close();
    return;
  }

  // Create fresh Phase 2 task DAG
  console.log('\n📋 Creating Phase 2 Task DAG...\n');

  const phase2 = await manager.createRootGoal('Phase 2: Perception');

  // TreeSitterAdapter tasks
  const treeAdapter = await manager.spawnSubtask(phase2.id, 'Implement TreeSitterAdapter');
  const tsStrategy = await manager.spawnSubtask(treeAdapter.id, 'Complete TypeScript strategy');
  const pyStrategy = await manager.spawnSubtask(treeAdapter.id, 'Complete Python strategy');
  await manager.spawnSubtask(treeAdapter.id, 'Build adapter core with caching');
  await manager.spawnSubtask(treeAdapter.id, 'Write TreeSitterAdapter tests');

  // RecursiveScout tasks
  const scout = await manager.spawnSubtask(phase2.id, 'Implement RecursiveScout');
  await manager.spawnSubtask(scout.id, 'Parse import statements');
  await manager.spawnSubtask(scout.id, 'Build dependency graph');
  await manager.spawnSubtask(scout.id, 'Resolve symbols to file paths');
  await manager.spawnSubtask(scout.id, 'Write RecursiveScout tests');

  // Simulate caching some "expensive" analysis results
  await manager.cacheToolOutput(tsStrategy.id, 'file_analysis', {
    existingFiles: ['src/config/TypeScriptStrategy.ts', 'src/config/LanguageStrategy.ts'],
    status: 'partially_implemented'
  });

  await manager.cacheToolOutput(pyStrategy.id, 'file_analysis', {
    existingFiles: ['src/config/PythonStrategy.ts'],
    status: 'partially_implemented'
  });

  // Print the task tree
  console.log('✅ Task DAG Created:\n');
  const tree = await manager.getTaskTree();
  printTree(tree, 0);

  // Show stats
  const allTasks = await manager.recoverState();
  const pending = allTasks.filter(t => t.status === 'pending').length;

  console.log('\n📊 Stats:');
  console.log(`   Total tasks: ${allTasks.length}`);
  console.log(`   Pending: ${pending}`);
  console.log(`   Database: ${dbPath}`);
  console.log('\n💡 Run this script again to see state recovery in action!');

  store.close();
}

function printTree(nodes: any[], indent: number) {
  const prefix = '   '.repeat(indent);
  for (const node of nodes) {
    const status = getStatusIcon(node.task.status);
    console.log(`${prefix}${status} ${node.task.label}`);
    if (node.children.length > 0) {
      printTree(node.children, indent + 1);
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

main().catch(console.error);
