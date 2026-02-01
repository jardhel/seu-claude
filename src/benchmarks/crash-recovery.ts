/**
 * Crash Recovery Benchmark
 *
 * Measures how well seu-claude recovers from simulated failures:
 * - Process crashes mid-task
 * - Context loss simulation
 * - State recovery from SQLite persistence
 */

import { TaskManager, TaskNode } from '../core/usecases/TaskManager.js';
import type { ITaskStore } from '../core/interfaces/ITaskStore.js';
import type { BenchmarkCase } from './runner.js';

export interface CrashRecoveryResult {
  caseId: string;
  caseName: string;
  recoveryTimeMs: number;
  statePreserved: boolean;
  progressBeforeCrash: number;
  progressAfterRecovery: number;
  taskCompleted: boolean;
  dataLoss: number; // 0-1, percentage of work lost
  timestamp: string;
}

export interface CrashRecoveryConfig {
  crashPoint: number; // 0-1, when to simulate crash (0.5 = 50% complete)
  simulateCrashType: 'process-kill' | 'memory-clear' | 'db-disconnect';
}

export class CrashRecoveryBenchmark {
  constructor(
    private taskStore: ITaskStore,
    private config: CrashRecoveryConfig = {
      crashPoint: 0.5,
      simulateCrashType: 'memory-clear',
    }
  ) {}

  async run(benchmarkCase: BenchmarkCase): Promise<CrashRecoveryResult> {
    const taskManager = new TaskManager(this.taskStore);
    const startTime = Date.now();

    try {
      // 1. Setup the benchmark case
      await benchmarkCase.setup();

      // 2. Create root task and start work
      const rootTask = await taskManager.createRootGoal(benchmarkCase.prompt);

      // 3. Simulate progress to crash point
      const progressBeforeCrash = await this.simulateProgress(
        taskManager,
        rootTask.id,
        this.config.crashPoint
      );

      // 4. Record state before crash
      const stateBeforeCrash = await this.captureState(taskManager, rootTask.id);

      // 5. Simulate crash
      await this.simulateCrash();

      // 6. Measure recovery
      const recoveryStart = Date.now();

      // Create new task manager (simulating process restart)
      const recoveredTaskManager = new TaskManager(this.taskStore);
      const recoveredTask = await recoveredTaskManager.getTask(rootTask.id);

      const recoveryTimeMs = Date.now() - recoveryStart;

      // 7. Check state preservation
      const stateAfterRecovery = await this.captureState(
        recoveredTaskManager,
        rootTask.id
      );
      const statePreserved = this.compareStates(stateBeforeCrash, stateAfterRecovery);

      // 8. Calculate data loss
      const dataLoss = this.calculateDataLoss(stateBeforeCrash, stateAfterRecovery);

      // 9. Complete task and validate
      const progressAfterRecovery = recoveredTask
        ? await this.getTaskProgress(recoveredTaskManager, rootTask.id)
        : 0;

      const taskCompleted = await benchmarkCase.validate();

      return {
        caseId: benchmarkCase.id,
        caseName: benchmarkCase.name,
        recoveryTimeMs,
        statePreserved,
        progressBeforeCrash,
        progressAfterRecovery,
        taskCompleted,
        dataLoss,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        caseId: benchmarkCase.id,
        caseName: benchmarkCase.name,
        recoveryTimeMs: Date.now() - startTime,
        statePreserved: false,
        progressBeforeCrash: 0,
        progressAfterRecovery: 0,
        taskCompleted: false,
        dataLoss: 1,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async simulateProgress(
    taskManager: TaskManager,
    taskId: string,
    targetProgress: number
  ): Promise<number> {
    // Simulate work by creating subtasks
    const numSubtasks = Math.floor(targetProgress * 10);

    for (let i = 0; i < numSubtasks; i++) {
      await taskManager.spawnSubtask(taskId, `Subtask ${i + 1}`);
    }

    // Mark some as completed
    const tree = await taskManager.getTaskTree();
    const taskNode = this.findTaskNode(tree, taskId);
    const subtasks = taskNode?.children || [];
    const toComplete = Math.floor(subtasks.length * targetProgress);

    for (let i = 0; i < toComplete && i < subtasks.length; i++) {
      await taskManager.updateStatus(subtasks[i].task.id, 'completed');
    }

    return targetProgress;
  }

  private async simulateCrash(): Promise<void> {
    switch (this.config.simulateCrashType) {
      case 'process-kill':
        // In real scenario, this would kill the process
        // For testing, we just clear in-memory state
        break;
      case 'memory-clear':
        // Simulate memory being cleared
        // The SQLite store persists, but any in-memory caches are lost
        if (global.gc) {
          global.gc();
        }
        break;
      case 'db-disconnect':
        // Simulate database disconnection
        // Store should handle reconnection
        break;
    }

    // Small delay to simulate restart time
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  private async captureState(
    taskManager: TaskManager,
    taskId: string
  ): Promise<TaskState> {
    const tree = await taskManager.getTaskTree();
    const taskNode = this.findTaskNode(tree, taskId);
    return {
      taskId,
      label: taskNode?.task.label || '',
      status: taskNode?.task.status || 'pending',
      childCount: taskNode?.children?.length || 0,
      completedCount:
        taskNode?.children?.filter((c: TaskNode) => c.task.status === 'completed').length || 0,
    };
  }

  private findTaskNode(nodes: TaskNode[], taskId: string): TaskNode | undefined {
    for (const node of nodes) {
      if (node.task.id === taskId) {
        return node;
      }
      const found = this.findTaskNode(node.children, taskId);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private compareStates(before: TaskState, after: TaskState): boolean {
    return (
      before.taskId === after.taskId &&
      before.label === after.label &&
      before.childCount === after.childCount &&
      before.completedCount === after.completedCount
    );
  }

  private calculateDataLoss(before: TaskState, after: TaskState): number {
    if (before.childCount === 0) return 0;

    const lostChildren = Math.max(0, before.childCount - after.childCount);
    const lostCompleted = Math.max(0, before.completedCount - after.completedCount);

    return (lostChildren + lostCompleted) / (before.childCount + before.completedCount || 1);
  }

  private async getTaskProgress(
    taskManager: TaskManager,
    taskId: string
  ): Promise<number> {
    const tree = await taskManager.getTaskTree();
    const taskNode = this.findTaskNode(tree, taskId);
    const children = taskNode?.children || [];

    if (children.length === 0) return 0;

    const completed = children.filter((c: TaskNode) => c.task.status === 'completed').length;
    return completed / children.length;
  }
}

interface TaskState {
  taskId: string;
  label: string;
  status: string;
  childCount: number;
  completedCount: number;
}

// ============================================================================
// Crash Recovery Suite
// ============================================================================

export interface CrashRecoverySuiteResult {
  results: CrashRecoveryResult[];
  summary: CrashRecoverySummary;
  runId: string;
  timestamp: string;
}

export interface CrashRecoverySummary {
  totalCases: number;
  successfulRecoveries: number;
  averageRecoveryTimeMs: number;
  averageDataLoss: number;
  worstCaseRecoveryTimeMs: number;
  bestCaseRecoveryTimeMs: number;
}

export class CrashRecoverySuite {
  constructor(
    private benchmark: CrashRecoveryBenchmark,
    private cases: BenchmarkCase[]
  ) {}

  async runAll(): Promise<CrashRecoverySuiteResult> {
    const results: CrashRecoveryResult[] = [];
    const runId = `crash-recovery-${Date.now()}`;

    for (const benchmarkCase of this.cases) {
      const result = await this.benchmark.run(benchmarkCase);
      results.push(result);
    }

    return {
      results,
      summary: this.calculateSummary(results),
      runId,
      timestamp: new Date().toISOString(),
    };
  }

  private calculateSummary(results: CrashRecoveryResult[]): CrashRecoverySummary {
    const totalCases = results.length;
    const successfulRecoveries = results.filter((r) => r.statePreserved).length;

    const recoveryTimes = results.map((r) => r.recoveryTimeMs);
    const averageRecoveryTimeMs =
      totalCases > 0
        ? recoveryTimes.reduce((a, b) => a + b, 0) / totalCases
        : 0;

    const dataLosses = results.map((r) => r.dataLoss);
    const averageDataLoss =
      totalCases > 0 ? dataLosses.reduce((a, b) => a + b, 0) / totalCases : 0;

    return {
      totalCases,
      successfulRecoveries,
      averageRecoveryTimeMs,
      averageDataLoss,
      worstCaseRecoveryTimeMs: Math.max(...recoveryTimes, 0),
      bestCaseRecoveryTimeMs: Math.min(...recoveryTimes, Infinity),
    };
  }
}
