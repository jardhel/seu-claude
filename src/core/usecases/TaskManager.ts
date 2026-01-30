import { ITaskStore } from '../interfaces/ITaskStore.js';
import { Task, TaskStatus } from '../entities/Task.js';

/**
 * Represents a task node in the hierarchical tree view
 */
export interface TaskNode {
  task: Task;
  children: TaskNode[];
}

/**
 * Structure for cached tool outputs in task context
 */
interface ToolOutputCache {
  output: unknown;
  cachedAt: number;
}

/**
 * TaskManager - Manages a DAG of tasks with SQLite persistence
 *
 * Core responsibilities:
 * - Create and manage task hierarchy (DAG)
 * - Cache expensive tool outputs to prevent duplicate work
 * - Recover full state after process restart
 */
export class TaskManager {
  constructor(private store: ITaskStore) {}

  // ==================== TASK CRUD ====================

  /**
   * Create a new root-level goal (no parent)
   */
  async createRootGoal(label: string): Promise<Task> {
    const task: Task = {
      id: crypto.randomUUID(),
      label,
      status: 'pending',
      context: { toolOutputs: {}, metadata: {} },
    };
    await this.store.save(task);
    return task;
  }

  /**
   * Spawn a subtask under a parent task
   */
  async spawnSubtask(parentId: string, label: string): Promise<Task> {
    const parent = await this.store.get(parentId);
    if (!parent) {
      throw new Error(`Parent task not found: ${parentId}`);
    }

    const task: Task = {
      id: crypto.randomUUID(),
      parentId,
      label,
      status: 'pending',
      context: { toolOutputs: {}, metadata: {} },
    };
    await this.store.save(task);
    return task;
  }

  /**
   * Get a task by ID
   */
  async getTask(id: string): Promise<Task | null> {
    return this.store.get(id);
  }

  /**
   * Get all subtasks of a parent
   */
  async getSubtasks(parentId: string): Promise<Task[]> {
    return this.store.getChildren(parentId);
  }

  /**
   * Update task status and optionally merge additional context
   */
  async updateStatus(
    taskId: string,
    status: TaskStatus,
    context?: Record<string, unknown>
  ): Promise<void> {
    const task = await this.store.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = status;
    if (context) {
      task.context = {
        ...task.context,
        metadata: { ...task.context.metadata, ...context },
      };
    }
    await this.store.save(task);
  }

  /**
   * Delete a task and optionally its subtasks
   */
  async deleteTask(taskId: string, cascade: boolean = false): Promise<void> {
    if (cascade) {
      const children = await this.store.getChildren(taskId);
      for (const child of children) {
        await this.deleteTask(child.id, true);
      }
    }
    await this.store.delete(taskId);
  }

  // ==================== TOOL OUTPUT CACHING ====================

  /**
   * Cache a tool's output to prevent repeating expensive operations
   */
  async cacheToolOutput(taskId: string, toolName: string, output: unknown): Promise<void> {
    const task = await this.store.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const toolOutputs = task.context.toolOutputs || {};
    toolOutputs[toolName] = {
      output,
      cachedAt: Date.now(),
    } as ToolOutputCache;

    task.context = { ...task.context, toolOutputs };
    await this.store.save(task);
  }

  /**
   * Retrieve a cached tool output
   */
  async getToolOutput(taskId: string, toolName: string): Promise<unknown | null> {
    const task = await this.store.get(taskId);
    if (!task) {
      return null;
    }

    const cached = task.context.toolOutputs?.[toolName] as ToolOutputCache | undefined;
    return cached?.output ?? null;
  }

  /**
   * Check if a tool output is cached (sync check against last fetched task)
   */
  hasToolOutput(task: Task, toolName: string): boolean {
    return !!task.context.toolOutputs?.[toolName];
  }

  /**
   * Get cache timestamp for a tool output
   */
  async getToolOutputTimestamp(taskId: string, toolName: string): Promise<number | null> {
    const task = await this.store.get(taskId);
    if (!task) {
      return null;
    }

    const cached = task.context.toolOutputs?.[toolName] as ToolOutputCache | undefined;
    return cached?.cachedAt ?? null;
  }

  // ==================== STATE RECOVERY ====================

  /**
   * Recover all tasks from the database (used after process restart)
   */
  async recoverState(): Promise<Task[]> {
    return this.store.getAll();
  }

  /**
   * Get all root tasks (tasks without parents)
   */
  async getRootTasks(): Promise<Task[]> {
    return this.store.getRoots();
  }

  /**
   * Build hierarchical tree view of all tasks
   */
  async getTaskTree(): Promise<TaskNode[]> {
    const allTasks = await this.store.getAll();
    const taskMap = new Map<string, Task>();
    const childrenMap = new Map<string, Task[]>();

    // Index all tasks
    for (const task of allTasks) {
      taskMap.set(task.id, task);
      if (task.parentId) {
        const siblings = childrenMap.get(task.parentId) || [];
        siblings.push(task);
        childrenMap.set(task.parentId, siblings);
      }
    }

    // Build tree recursively
    const buildNode = (task: Task): TaskNode => {
      const children = childrenMap.get(task.id) || [];
      return {
        task,
        children: children.map(child => buildNode(child)),
      };
    };

    // Start from root tasks
    const roots = allTasks.filter(t => !t.parentId);
    return roots.map(root => buildNode(root));
  }

  /**
   * Get pending tasks that can be executed (no incomplete dependencies)
   */
  async getPendingTasks(): Promise<Task[]> {
    const allTasks = await this.store.getAll();
    return allTasks.filter(task => task.status === 'pending');
  }

  /**
   * Get tasks in running state
   */
  async getRunningTasks(): Promise<Task[]> {
    const allTasks = await this.store.getAll();
    return allTasks.filter(task => task.status === 'running');
  }

  /**
   * Mark all running tasks as failed (useful after crash recovery)
   */
  async resetRunningTasks(): Promise<number> {
    const running = await this.getRunningTasks();
    for (const task of running) {
      await this.updateStatus(task.id, 'failed', { failReason: 'Process interrupted' });
    }
    return running.length;
  }
}
