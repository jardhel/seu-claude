import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm } from 'fs/promises';
import { SQLiteTaskStore } from '../../adapters/db/SQLiteTaskStore.js';
import { TaskManager } from '../usecases/TaskManager.js';

describe('TaskManager', () => {
  let testDir: string;
  let store: SQLiteTaskStore;
  let manager: TaskManager;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `seu-claude-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });
    store = new SQLiteTaskStore(join(testDir, 'tasks.db'));
    manager = new TaskManager(store);
  });

  afterEach(async () => {
    store.close();
    await rm(testDir, { recursive: true, force: true });
  });

  // ==================== Basic CRUD Tests ====================

  describe('Basic CRUD', () => {
    it('creates a root goal', async () => {
      const task = await manager.createRootGoal('Build feature X');

      expect(task.id).toBeDefined();
      expect(task.label).toBe('Build feature X');
      expect(task.status).toBe('pending');
      expect(task.parentId).toBeUndefined();
      expect(task.context.toolOutputs).toEqual({});
    });

    it('retrieves a task by ID', async () => {
      const created = await manager.createRootGoal('Test task');
      const retrieved = await manager.getTask(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.label).toBe('Test task');
    });

    it('returns null for non-existent task', async () => {
      const result = await manager.getTask('non-existent-id');
      expect(result).toBeNull();
    });

    it('updates task status', async () => {
      const task = await manager.createRootGoal('Update me');
      await manager.updateStatus(task.id, 'running');

      const updated = await manager.getTask(task.id);
      expect(updated?.status).toBe('running');
    });

    it('updates task status with additional context', async () => {
      const task = await manager.createRootGoal('Context test');
      await manager.updateStatus(task.id, 'completed', { result: 'success' });

      const updated = await manager.getTask(task.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.context.metadata.result).toBe('success');
    });

    it('throws error when updating non-existent task', async () => {
      await expect(manager.updateStatus('fake-id', 'running')).rejects.toThrow('Task not found');
    });

    it('deletes a task', async () => {
      const task = await manager.createRootGoal('Delete me');
      await manager.deleteTask(task.id);

      const result = await manager.getTask(task.id);
      expect(result).toBeNull();
    });
  });

  // ==================== DAG Structure Tests ====================

  describe('DAG Structure', () => {
    it('creates subtasks under a parent', async () => {
      const root = await manager.createRootGoal('Root task');
      const child1 = await manager.spawnSubtask(root.id, 'Child 1');
      const child2 = await manager.spawnSubtask(root.id, 'Child 2');

      expect(child1.parentId).toBe(root.id);
      expect(child2.parentId).toBe(root.id);
    });

    it('retrieves subtasks of a parent', async () => {
      const root = await manager.createRootGoal('Parent');
      await manager.spawnSubtask(root.id, 'Child A');
      await manager.spawnSubtask(root.id, 'Child B');

      const children = await manager.getSubtasks(root.id);
      expect(children).toHaveLength(2);
      expect(children.map(c => c.label)).toContain('Child A');
      expect(children.map(c => c.label)).toContain('Child B');
    });

    it('throws error when spawning subtask with invalid parent', async () => {
      await expect(manager.spawnSubtask('invalid-id', 'Orphan')).rejects.toThrow(
        'Parent task not found'
      );
    });

    it('creates multi-level hierarchy', async () => {
      const root = await manager.createRootGoal('Level 0');
      const level1 = await manager.spawnSubtask(root.id, 'Level 1');
      const level2 = await manager.spawnSubtask(level1.id, 'Level 2');

      expect(level2.parentId).toBe(level1.id);
      expect(level1.parentId).toBe(root.id);
    });

    it('builds task tree from flat structure', async () => {
      const root = await manager.createRootGoal('Root');
      const child1 = await manager.spawnSubtask(root.id, 'Child 1');
      await manager.spawnSubtask(root.id, 'Child 2');
      await manager.spawnSubtask(child1.id, 'Grandchild 1.1');

      const tree = await manager.getTaskTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].task.label).toBe('Root');
      expect(tree[0].children).toHaveLength(2);
      expect(tree[0].children.find(c => c.task.label === 'Child 1')?.children).toHaveLength(1);
    });

    it('deletes task with cascade', async () => {
      const root = await manager.createRootGoal('Root');
      const child = await manager.spawnSubtask(root.id, 'Child');
      const grandchild = await manager.spawnSubtask(child.id, 'Grandchild');

      await manager.deleteTask(root.id, true);

      expect(await manager.getTask(root.id)).toBeNull();
      expect(await manager.getTask(child.id)).toBeNull();
      expect(await manager.getTask(grandchild.id)).toBeNull();
    });

    it('gets root tasks only', async () => {
      const root1 = await manager.createRootGoal('Root 1');
      await manager.createRootGoal('Root 2');
      await manager.spawnSubtask(root1.id, 'Child of Root 1');

      const roots = await manager.getRootTasks();
      expect(roots).toHaveLength(2);
      expect(roots.map(r => r.label)).toContain('Root 1');
      expect(roots.map(r => r.label)).toContain('Root 2');
    });
  });

  // ==================== Context Caching Tests ====================

  describe('Context Caching (Tool Outputs)', () => {
    it('caches tool output in task context', async () => {
      const task = await manager.createRootGoal('Cache test');
      const grepResult = { matches: ['file1.ts:10', 'file2.ts:20'] };

      await manager.cacheToolOutput(task.id, 'grep', grepResult);

      const cached = await manager.getToolOutput(task.id, 'grep');
      expect(cached).toEqual(grepResult);
    });

    it('returns null for uncached tool output', async () => {
      const task = await manager.createRootGoal('No cache');
      const result = await manager.getToolOutput(task.id, 'uncached-tool');
      expect(result).toBeNull();
    });

    it('caches multiple tool outputs', async () => {
      const task = await manager.createRootGoal('Multi-cache');

      await manager.cacheToolOutput(task.id, 'grep', { results: ['a'] });
      await manager.cacheToolOutput(task.id, 'read', { content: 'file content' });

      expect(await manager.getToolOutput(task.id, 'grep')).toEqual({ results: ['a'] });
      expect(await manager.getToolOutput(task.id, 'read')).toEqual({ content: 'file content' });
    });

    it('overwrites existing cached output', async () => {
      const task = await manager.createRootGoal('Overwrite test');

      await manager.cacheToolOutput(task.id, 'grep', { v1: true });
      await manager.cacheToolOutput(task.id, 'grep', { v2: true });

      const cached = await manager.getToolOutput(task.id, 'grep');
      expect(cached).toEqual({ v2: true });
    });

    it('records cache timestamp', async () => {
      const before = Date.now();
      const task = await manager.createRootGoal('Timestamp test');
      await manager.cacheToolOutput(task.id, 'tool', { data: 1 });
      const after = Date.now();

      const timestamp = await manager.getToolOutputTimestamp(task.id, 'tool');
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('checks if tool output exists synchronously', async () => {
      const task = await manager.createRootGoal('Sync check');
      await manager.cacheToolOutput(task.id, 'cached', { yes: true });

      const fetched = await manager.getTask(task.id);
      expect(manager.hasToolOutput(fetched!, 'cached')).toBe(true);
      expect(manager.hasToolOutput(fetched!, 'not-cached')).toBe(false);
    });

    it('prevents duplicate work by checking cache', async () => {
      const task = await manager.createRootGoal('Expensive operation');
      let executionCount = 0;

      // Simulate expensive operation with caching
      const runExpensiveOp = async () => {
        const cached = await manager.getToolOutput(task.id, 'expensive');
        if (cached) {
          return cached;
        }
        executionCount++;
        const result = { computed: Math.random() };
        await manager.cacheToolOutput(task.id, 'expensive', result);
        return result;
      };

      const result1 = await runExpensiveOp();
      const result2 = await runExpensiveOp();
      const result3 = await runExpensiveOp();

      expect(executionCount).toBe(1);
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });
  });

  // ==================== Crash Recovery Tests ====================

  describe('Crash Recovery', () => {
    it('recovers all tasks after simulated crash', async () => {
      const dbPath = join(testDir, 'recovery-test.db');

      // Phase 1: Create data
      const store1 = new SQLiteTaskStore(dbPath);
      const manager1 = new TaskManager(store1);

      const root = await manager1.createRootGoal('Persistent root');
      const child = await manager1.spawnSubtask(root.id, 'Persistent child');
      await manager1.updateStatus(child.id, 'running');

      // Simulate crash
      store1.close();

      // Phase 2: Recover
      const store2 = new SQLiteTaskStore(dbPath);
      const manager2 = new TaskManager(store2);
      const recovered = await manager2.recoverState();

      expect(recovered).toHaveLength(2);

      const recoveredRoot = recovered.find(t => t.label === 'Persistent root');
      const recoveredChild = recovered.find(t => t.label === 'Persistent child');

      expect(recoveredRoot).toBeDefined();
      expect(recoveredChild).toBeDefined();
      expect(recoveredChild?.parentId).toBe(recoveredRoot?.id);
      expect(recoveredChild?.status).toBe('running');

      store2.close();
    });

    it('recovers cached tool outputs after crash', async () => {
      const dbPath = join(testDir, 'cache-recovery.db');

      // Phase 1: Create and cache
      const store1 = new SQLiteTaskStore(dbPath);
      const manager1 = new TaskManager(store1);

      const task = await manager1.createRootGoal('Cache persistence test');
      await manager1.cacheToolOutput(task.id, 'grep', { files: ['a.ts', 'b.ts'] });
      await manager1.cacheToolOutput(task.id, 'read', { content: 'hello world' });

      store1.close();

      // Phase 2: Recover and verify cache
      const store2 = new SQLiteTaskStore(dbPath);
      const manager2 = new TaskManager(store2);

      const grepOutput = await manager2.getToolOutput(task.id, 'grep');
      const readOutput = await manager2.getToolOutput(task.id, 'read');

      expect(grepOutput).toEqual({ files: ['a.ts', 'b.ts'] });
      expect(readOutput).toEqual({ content: 'hello world' });

      store2.close();
    });

    it('recovers full DAG hierarchy after crash', async () => {
      const dbPath = join(testDir, 'dag-recovery.db');

      // Phase 1: Build complex DAG
      const store1 = new SQLiteTaskStore(dbPath);
      const manager1 = new TaskManager(store1);

      const root = await manager1.createRootGoal('Project');
      const phase1 = await manager1.spawnSubtask(root.id, 'Phase 1');
      await manager1.spawnSubtask(root.id, 'Phase 2');
      const task1a = await manager1.spawnSubtask(phase1.id, 'Task 1.A');
      await manager1.spawnSubtask(phase1.id, 'Task 1.B');

      await manager1.updateStatus(task1a.id, 'completed');
      await manager1.cacheToolOutput(task1a.id, 'result', { success: true });

      store1.close();

      // Phase 2: Recover and verify structure
      const store2 = new SQLiteTaskStore(dbPath);
      const manager2 = new TaskManager(store2);

      const tree = await manager2.getTaskTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].task.label).toBe('Project');
      expect(tree[0].children).toHaveLength(2);

      const recoveredPhase1 = tree[0].children.find(c => c.task.label === 'Phase 1');
      expect(recoveredPhase1?.children).toHaveLength(2);

      const recoveredTask1a = recoveredPhase1?.children.find(c => c.task.label === 'Task 1.A');
      expect(recoveredTask1a?.task.status).toBe('completed');

      const cachedResult = await manager2.getToolOutput(task1a.id, 'result');
      expect(cachedResult).toEqual({ success: true });

      store2.close();
    });

    it('resets running tasks after crash recovery', async () => {
      const dbPath = join(testDir, 'reset-running.db');

      // Phase 1: Leave tasks in running state
      const store1 = new SQLiteTaskStore(dbPath);
      const manager1 = new TaskManager(store1);

      const task1 = await manager1.createRootGoal('Task 1');
      const task2 = await manager1.createRootGoal('Task 2');
      await manager1.updateStatus(task1.id, 'running');
      await manager1.updateStatus(task2.id, 'running');

      store1.close();

      // Phase 2: Recover and reset
      const store2 = new SQLiteTaskStore(dbPath);
      const manager2 = new TaskManager(store2);

      const resetCount = await manager2.resetRunningTasks();
      expect(resetCount).toBe(2);

      const running = await manager2.getRunningTasks();
      expect(running).toHaveLength(0);

      const recovered1 = await manager2.getTask(task1.id);
      expect(recovered1?.status).toBe('failed');
      expect(recovered1?.context.metadata.failReason).toBe('Process interrupted');

      store2.close();
    });
  });

  // ==================== Task Status Queries ====================

  describe('Task Status Queries', () => {
    it('gets pending tasks', async () => {
      await manager.createRootGoal('Pending 1');
      await manager.createRootGoal('Pending 2');
      await manager.createRootGoal('Running');
      await manager.updateStatus((await manager.createRootGoal('Running')).id, 'running');

      const pending = await manager.getPendingTasks();
      expect(pending.length).toBeGreaterThanOrEqual(2);
      expect(pending.map(t => t.label)).toContain('Pending 1');
      expect(pending.map(t => t.label)).toContain('Pending 2');
    });

    it('gets running tasks', async () => {
      const task1 = await manager.createRootGoal('Task 1');
      await manager.createRootGoal('Task 2');
      await manager.updateStatus(task1.id, 'running');

      const running = await manager.getRunningTasks();
      expect(running).toHaveLength(1);
      expect(running[0].id).toBe(task1.id);
    });
  });
});
