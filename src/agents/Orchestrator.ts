/**
 * Multi-Agent Orchestrator
 *
 * Coordinates multiple agent pools to execute complex workflows.
 * Implements:
 * - Workflow definition and execution
 * - Inter-pool message routing
 * - Checkpoint-based recovery
 * - Hierarchical escalation
 *
 * Based on arxiv 2601.14351v1 patterns.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { AgentPool } from './AgentPool.js';
import type {
  AgentRole,
  AgentPoolSpec,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowStage,
  TaskAssignment,
  Checkpoint,
  AgentMessage,
  ReviewResult,
} from './types.js';

export interface OrchestratorConfig {
  checkpointInterval?: number; // ms between auto-checkpoints
  maxRetries?: number;
  escalationCallback?: (message: AgentMessage) => Promise<ReviewResult>;
}

export class Orchestrator extends EventEmitter {
  private pools: Map<AgentRole, AgentPool> = new Map();
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private checkpoints: Map<string, Checkpoint[]> = new Map();
  private config: OrchestratorConfig;
  private checkpointTimer: NodeJS.Timeout | null = null;

  constructor(config: OrchestratorConfig = {}) {
    super();
    this.config = {
      checkpointInterval: config.checkpointInterval ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      escalationCallback: config.escalationCallback,
    };
  }

  // ============================================================================
  // Pool Management
  // ============================================================================

  async createPool(role: AgentRole, spec: Partial<AgentPoolSpec> = {}): Promise<AgentPool> {
    const fullSpec: AgentPoolSpec = {
      replicas: spec.replicas ?? 1,
      role,
      capabilities: spec.capabilities ?? {
        role,
        maxConcurrentTasks: 1,
        toolAccess: [],
      },
      autoscaling: spec.autoscaling,
    };

    const pool = new AgentPool(fullSpec);

    // Set up event handlers
    pool.on('externalMessage', (message: AgentMessage) => {
      this.routeMessage(message);
    });

    pool.on('taskCompleted', (event) => {
      this.handleTaskCompletion(event);
    });

    await pool.start();
    this.pools.set(role, pool);

    this.emit('poolCreated', { role, spec: fullSpec });
    return pool;
  }

  getPool(role: AgentRole): AgentPool | undefined {
    return this.pools.get(role);
  }

  async removePool(role: AgentRole): Promise<boolean> {
    const pool = this.pools.get(role);
    if (!pool) return false;

    await pool.stop();
    this.pools.delete(role);

    this.emit('poolRemoved', { role });
    return true;
  }

  // ============================================================================
  // Workflow Management
  // ============================================================================

  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
    this.emit('workflowRegistered', { workflowId: workflow.id, name: workflow.name });
  }

  async executeWorkflow(
    workflowId: string,
    input: Record<string, unknown>
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const executionId = randomUUID();
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'running',
      currentStage: workflow.entryPoint,
      startedAt: new Date().toISOString(),
      checkpoints: [],
    };

    this.executions.set(executionId, execution);
    this.checkpoints.set(executionId, []);

    // Start checkpoint timer
    this.startCheckpointTimer(executionId);

    try {
      // Execute workflow stages
      await this.executeStage(workflow, execution, input);

      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      execution.completedAt = new Date().toISOString();
    }

    this.stopCheckpointTimer();
    this.emit('workflowCompleted', { executionId, status: execution.status });

    return execution;
  }

  private async executeStage(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    input: Record<string, unknown>
  ): Promise<void> {
    const stage = workflow.stages.find((s) => s.id === execution.currentStage);
    if (!stage) {
      throw new Error(`Stage not found: ${execution.currentStage}`);
    }

    this.emit('stageStarted', { executionId: execution.id, stageId: stage.id });

    // Get pools for required roles
    const pools = stage.requiredRoles
      .map((role) => this.pools.get(role))
      .filter((p): p is AgentPool => p !== undefined);

    if (pools.length < stage.requiredRoles.length) {
      throw new Error(`Missing pools for roles: ${stage.requiredRoles.join(', ')}`);
    }

    // Execute based on pattern
    let result: unknown;
    switch (stage.pattern) {
      case 'sequential':
        result = await this.executeSequential(pools, input, stage);
        break;
      case 'parallel':
        result = await this.executeParallel(pools, input, stage);
        break;
      case 'pipeline':
        result = await this.executePipeline(pools, input, stage);
        break;
      case 'council':
        result = await this.executeCouncil(pools, input, stage);
        break;
    }

    // Check for veto if required
    if (stage.vetoRequired) {
      const vetoResult = await this.checkVeto(result, stage);
      if (vetoResult.decision === 'rejected') {
        // Retry logic
        const retries = (input._retryCount as number) ?? 0;
        if (retries < (stage.retryPolicy?.maxRetries ?? 3)) {
          await this.delay(stage.retryPolicy?.backoffMs ?? 1000);
          await this.executeStage(workflow, execution, {
            ...input,
            _retryCount: retries + 1,
            _feedback: vetoResult.feedback,
          });
          return;
        } else if (stage.escalationThreshold && retries >= stage.escalationThreshold) {
          await this.escalate(execution, stage, result);
        }
      }
    }

    // Find next stage
    const transition = workflow.transitions.find((t) => t.from === stage.id);
    if (transition && !workflow.terminalStages.includes(stage.id)) {
      execution.currentStage = transition.to;
      await this.executeStage(workflow, execution, { ...input, _previousResult: result });
    } else {
      execution.result = result;
    }
  }

  private async executeSequential(
    pools: AgentPool[],
    input: Record<string, unknown>,
    stage: WorkflowStage
  ): Promise<unknown[]> {
    const results: unknown[] = [];
    let currentInput = input;

    for (const pool of pools) {
      const task: TaskAssignment = {
        taskId: randomUUID(),
        description: `Stage: ${stage.name}`,
        context: currentInput,
      };

      await pool.submitTask(task);
      // Wait for completion (simplified - in production use proper event handling)
      await this.delay(100);

      const metrics = pool.getMetrics();
      results.push({ completed: metrics.completedTasks > 0 });
      currentInput = { ...currentInput, _previousResult: results[results.length - 1] };
    }

    return results;
  }

  private async executeParallel(
    pools: AgentPool[],
    input: Record<string, unknown>,
    stage: WorkflowStage
  ): Promise<unknown[]> {
    const tasks = pools.map((pool) => {
      const task: TaskAssignment = {
        taskId: randomUUID(),
        description: `Stage: ${stage.name} (parallel)`,
        context: input,
      };
      return pool.submitTask(task);
    });

    const taskIds = await Promise.all(tasks);
    return taskIds.map((id) => ({ taskId: id, submitted: true }));
  }

  private async executePipeline(
    pools: AgentPool[],
    input: Record<string, unknown>,
    stage: WorkflowStage
  ): Promise<unknown> {
    // Pipeline is sequential with explicit handoffs
    return this.executeSequential(pools, input, stage);
  }

  private async executeCouncil(
    pools: AgentPool[],
    input: Record<string, unknown>,
    stage: WorkflowStage
  ): Promise<unknown> {
    // Council pattern: execute in parallel, then aggregate with veto check
    const results = await this.executeParallel(pools, input, stage);

    // In a real implementation, this would aggregate results
    // and check for consensus or veto conditions
    return {
      pattern: 'council',
      results,
      consensus: true,
    };
  }

  private async checkVeto(
    result: unknown,
    stage: WorkflowStage
  ): Promise<ReviewResult> {
    // Get reviewer pool
    const reviewerPool = this.pools.get('reviewer');
    if (!reviewerPool) {
      // No reviewer available, auto-approve
      return {
        taskId: randomUUID(),
        reviewerId: 'auto',
        decision: 'approved',
      };
    }

    const reviewTask: TaskAssignment = {
      taskId: randomUUID(),
      description: `Review output from stage: ${stage.name}`,
      context: { result },
    };

    await reviewerPool.submitTask(reviewTask);
    await this.delay(100); // Wait for review

    // Simplified - in production, properly wait for result
    return {
      taskId: reviewTask.taskId,
      reviewerId: 'reviewer',
      decision: 'approved',
    };
  }

  private async escalate(
    execution: WorkflowExecution,
    stage: WorkflowStage,
    result: unknown
  ): Promise<void> {
    const message: AgentMessage = {
      id: randomUUID(),
      type: 'escalation',
      priority: 'high',
      senderId: 'orchestrator',
      recipientId: 'human',
      timestamp: new Date().toISOString(),
      payload: {
        executionId: execution.id,
        stage: stage.name,
        result,
        reason: 'Max retries exceeded',
      },
    };

    this.emit('escalation', message);

    if (this.config.escalationCallback) {
      await this.config.escalationCallback(message);
    }
  }

  // ============================================================================
  // Message Routing
  // ============================================================================

  private routeMessage(message: AgentMessage): void {
    // Try to route to appropriate pool based on recipient
    for (const pool of this.pools.values()) {
      const agents = pool.getAgents();
      if (agents.some((a) => a.id === message.recipientId)) {
        // Found the pool, let it handle routing
        return;
      }
    }

    // External message - emit for handling
    this.emit('externalMessage', message);
  }

  private handleTaskCompletion(event: {
    poolId: string;
    taskId: string;
    success: boolean;
    timeMs: number;
  }): void {
    this.emit('taskCompleted', event);
  }

  // ============================================================================
  // Checkpointing (arxiv pattern)
  // ============================================================================

  private startCheckpointTimer(executionId: string): void {
    this.checkpointTimer = setInterval(() => {
      this.createCheckpoint(executionId);
    }, this.config.checkpointInterval);
  }

  private stopCheckpointTimer(): void {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }
  }

  createCheckpoint(executionId: string): Checkpoint {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const checkpoint: Checkpoint = {
      id: randomUUID(),
      workflowId: execution.workflowId,
      phase: execution.currentStage,
      timestamp: new Date().toISOString(),
      agentStates: [],
      pendingMessages: [],
      completedTasks: [],
    };

    // Collect agent states from all pools
    for (const pool of this.pools.values()) {
      const agents = pool.getAgents();
      for (const agent of agents) {
        checkpoint.agentStates.push({
          agentId: agent.id,
          state: agent.state,
          currentTask: undefined, // Would need agent method to get this
        });
      }
    }

    // Store checkpoint
    const checkpoints = this.checkpoints.get(executionId) ?? [];
    checkpoints.push(checkpoint);
    this.checkpoints.set(executionId, checkpoints);

    execution.checkpoints.push(checkpoint.id);

    this.emit('checkpointCreated', { executionId, checkpointId: checkpoint.id });
    return checkpoint;
  }

  async restoreFromCheckpoint(
    executionId: string,
    checkpointId: string
  ): Promise<void> {
    const checkpoints = this.checkpoints.get(executionId);
    if (!checkpoints) {
      throw new Error(`No checkpoints for execution: ${executionId}`);
    }

    const checkpoint = checkpoints.find((c) => c.id === checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    // Restore execution state
    execution.currentStage = checkpoint.phase;
    execution.status = 'running';

    this.emit('restoredFromCheckpoint', { executionId, checkpointId });
  }

  // ============================================================================
  // Status & Metrics
  // ============================================================================

  getStatus(): {
    pools: Array<{ role: AgentRole; metrics: ReturnType<AgentPool['getMetrics']> }>;
    activeExecutions: number;
    totalCheckpoints: number;
  } {
    const pools = Array.from(this.pools.entries()).map(([role, pool]) => ({
      role,
      metrics: pool.getMetrics(),
    }));

    let totalCheckpoints = 0;
    for (const checkpoints of this.checkpoints.values()) {
      totalCheckpoints += checkpoints.length;
    }

    return {
      pools,
      activeExecutions: Array.from(this.executions.values()).filter(
        (e) => e.status === 'running'
      ).length,
      totalCheckpoints,
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async shutdown(): Promise<void> {
    this.stopCheckpointTimer();

    for (const pool of this.pools.values()) {
      await pool.stop();
    }

    this.pools.clear();
    this.executions.clear();
    this.checkpoints.clear();

    this.emit('shutdown');
  }
}

// ============================================================================
// Pre-built Workflow Templates
// ============================================================================

export const WORKFLOW_TEMPLATES = {
  codeReview: (): WorkflowDefinition => ({
    id: randomUUID(),
    name: 'Code Review Pipeline',
    description: 'Standard code review with coder -> reviewer flow',
    stages: [
      {
        id: 'implement',
        name: 'Implementation',
        requiredRoles: ['coder'],
        pattern: 'sequential',
        timeout: 300000,
        vetoRequired: false,
      },
      {
        id: 'review',
        name: 'Code Review',
        requiredRoles: ['reviewer'],
        pattern: 'sequential',
        vetoRequired: true,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        escalationThreshold: 2,
      },
    ],
    entryPoint: 'implement',
    terminalStages: ['review'],
    transitions: [{ from: 'implement', to: 'review' }],
  }),

  tddCycle: (): WorkflowDefinition => ({
    id: randomUUID(),
    name: 'TDD Cycle',
    description: 'Red-Green-Refactor with test-first development',
    stages: [
      {
        id: 'write-test',
        name: 'Write Failing Test',
        requiredRoles: ['tester'],
        pattern: 'sequential',
        vetoRequired: false,
      },
      {
        id: 'implement',
        name: 'Make Test Pass',
        requiredRoles: ['coder'],
        pattern: 'sequential',
        vetoRequired: false,
      },
      {
        id: 'refactor',
        name: 'Refactor',
        requiredRoles: ['coder', 'reviewer'],
        pattern: 'council',
        vetoRequired: true,
      },
    ],
    entryPoint: 'write-test',
    terminalStages: ['refactor'],
    transitions: [
      { from: 'write-test', to: 'implement' },
      { from: 'implement', to: 'refactor' },
    ],
  }),

  parallelAnalysis: (): WorkflowDefinition => ({
    id: randomUUID(),
    name: 'Parallel Analysis',
    description: 'Multiple agents analyze in parallel, then aggregate',
    stages: [
      {
        id: 'analyze',
        name: 'Parallel Analysis',
        requiredRoles: ['analyst', 'coder', 'reviewer'],
        pattern: 'parallel',
        vetoRequired: false,
      },
      {
        id: 'synthesize',
        name: 'Synthesize Results',
        requiredRoles: ['analyst'],
        pattern: 'sequential',
        vetoRequired: false,
      },
    ],
    entryPoint: 'analyze',
    terminalStages: ['synthesize'],
    transitions: [{ from: 'analyze', to: 'synthesize' }],
  }),
};
