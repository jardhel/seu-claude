/**
 * Multi-Agent Orchestration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { AgentPool } from './AgentPool.js';
import { Orchestrator, WORKFLOW_TEMPLATES } from './Orchestrator.js';
import { CoderAgent } from './specialized/CoderAgent.js';
import { ReviewerAgent } from './specialized/ReviewerAgent.js';
import type { TaskAssignment, AgentPoolSpec } from './types.js';

describe('CoderAgent', () => {
  let agent: CoderAgent;

  beforeEach(async () => {
    agent = new CoderAgent({
      name: 'test-coder',
      languages: ['typescript', 'python'],
    });
    await agent.start();
  });

  afterEach(async () => {
    await agent.stop();
  });

  it('should have correct role and capabilities', () => {
    const identity = agent.getIdentity();
    expect(identity.role).toBe('coder');
    expect(identity.capabilities.languages).toContain('typescript');
    expect(identity.capabilities.languages).toContain('python');
  });

  it('should be available after start', () => {
    expect(agent.isAvailable()).toBe(true);
    expect(agent.state).toBe('idle');
  });

  it('should handle task assignments', async () => {
    const task: TaskAssignment = {
      taskId: randomUUID(),
      description: 'Write a hello world function',
      files: ['src/hello.ts'],
    };

    // Simulate task assignment via message
    const message = {
      id: randomUUID(),
      type: 'task_assignment' as const,
      priority: 'normal' as const,
      senderId: randomUUID(),
      recipientId: agent.id,
      timestamp: new Date().toISOString(),
      payload: task as unknown as Record<string, unknown>,
    };

    // Agent should process the message
    await agent.receiveMessage(message);

    // Should return to idle after processing
    expect(agent.state).toBe('idle');
  });

  it('should create checkpoints', () => {
    const checkpoint = agent.createCheckpoint();

    expect(checkpoint.id).toBeDefined();
    expect(checkpoint.phase).toBe('coding');
    expect(checkpoint.agentStates).toHaveLength(1);
    expect(checkpoint.agentStates[0].agentId).toBe(agent.id);
  });
});

describe('ReviewerAgent', () => {
  let agent: ReviewerAgent;

  beforeEach(async () => {
    agent = new ReviewerAgent({
      name: 'test-reviewer',
      strictness: 'normal',
      focusAreas: ['security', 'correctness'],
    });
    await agent.start();
  });

  afterEach(async () => {
    await agent.stop();
  });

  it('should have correct role', () => {
    expect(agent.role).toBe('reviewer');
  });

  it('should respond to review criteria query', async () => {
    const queryMessage = {
      id: randomUUID(),
      type: 'query' as const,
      priority: 'normal' as const,
      senderId: randomUUID(),
      recipientId: agent.id,
      timestamp: new Date().toISOString(),
      payload: { type: 'review_criteria' },
    };

    // Set up listener for response
    let response: Record<string, unknown> | null = null;
    agent.on('messageSent', (msg) => {
      if (msg.type === 'response') {
        response = msg.payload;
      }
    });

    await agent.receiveMessage(queryMessage);

    expect(response).not.toBeNull();
    const typedResponse = response as { strictness: string; focusAreas: string[] } | null;
    expect(typedResponse?.strictness).toBe('normal');
    expect(typedResponse?.focusAreas).toContain('security');
  });
});

describe('AgentPool', () => {
  let pool: AgentPool;

  const spec: AgentPoolSpec = {
    replicas: 2,
    role: 'coder',
    capabilities: {
      role: 'coder',
      languages: ['typescript'],
      maxConcurrentTasks: 1,
      toolAccess: ['file_read', 'file_write'],
    },
  };

  beforeEach(async () => {
    pool = new AgentPool(spec);
    await pool.start();
  });

  afterEach(async () => {
    await pool.stop();
  });

  it('should spawn correct number of replicas', () => {
    const metrics = pool.getMetrics();
    expect(metrics.totalAgents).toBe(2);
  });

  it('should have all agents available initially', () => {
    const metrics = pool.getMetrics();
    expect(metrics.availableAgents).toBe(2);
    expect(metrics.busyAgents).toBe(0);
  });

  it('should submit tasks to pool', async () => {
    const task: TaskAssignment = {
      taskId: randomUUID(),
      description: 'Test task',
    };

    const taskId = await pool.submitTask(task);
    expect(taskId).toBe(task.taskId);
  });

  it('should list agents', () => {
    const agents = pool.getAgents();
    expect(agents).toHaveLength(2);
    expect(agents[0].role).toBe('coder');
  });

  it('should generate Kubernetes CRD', () => {
    const crd = pool.toCRD('test-pool', 'seu-claude');

    expect(crd.apiVersion).toBe('seu-claude.io/v1');
    expect(crd.kind).toBe('AgentPool');
    expect(crd.metadata.name).toBe('test-pool');
    expect(crd.metadata.namespace).toBe('seu-claude');
    expect(crd.spec.role).toBe('coder');
    expect(crd.status?.readyReplicas).toBe(2);
  });

  it('should update spec and scale', async () => {
    await pool.updateSpec({ replicas: 3 });

    const metrics = pool.getMetrics();
    expect(metrics.totalAgents).toBe(3);
  });
});

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator({
      checkpointInterval: 10000,
      maxRetries: 2,
    });
  });

  afterEach(async () => {
    await orchestrator.shutdown();
  });

  it('should create agent pools', async () => {
    const pool = await orchestrator.createPool('coder', { replicas: 1 });

    expect(pool).toBeDefined();
    expect(orchestrator.getPool('coder')).toBe(pool);
  });

  it('should remove agent pools', async () => {
    await orchestrator.createPool('coder', { replicas: 1 });

    const removed = await orchestrator.removePool('coder');
    expect(removed).toBe(true);
    expect(orchestrator.getPool('coder')).toBeUndefined();
  });

  it('should get status with all pools', async () => {
    await orchestrator.createPool('coder', { replicas: 2 });
    await orchestrator.createPool('reviewer', { replicas: 1 });

    const status = orchestrator.getStatus();

    expect(status.pools).toHaveLength(2);
    expect(status.pools.find((p) => p.role === 'coder')?.metrics.totalAgents).toBe(2);
    expect(status.pools.find((p) => p.role === 'reviewer')?.metrics.totalAgents).toBe(1);
  });

  it('should register workflows', () => {
    const workflow = WORKFLOW_TEMPLATES.codeReview();
    orchestrator.registerWorkflow(workflow);

    // Event should be emitted
    let registered = false;
    orchestrator.on('workflowRegistered', () => {
      registered = true;
    });
    orchestrator.registerWorkflow(WORKFLOW_TEMPLATES.tddCycle());

    expect(registered).toBe(true);
  });
});

describe('Workflow Templates', () => {
  it('should create code review workflow', () => {
    const workflow = WORKFLOW_TEMPLATES.codeReview();

    expect(workflow.name).toBe('Code Review Pipeline');
    expect(workflow.stages).toHaveLength(2);
    expect(workflow.stages[0].requiredRoles).toContain('coder');
    expect(workflow.stages[1].requiredRoles).toContain('reviewer');
    expect(workflow.stages[1].vetoRequired).toBe(true);
  });

  it('should create TDD cycle workflow', () => {
    const workflow = WORKFLOW_TEMPLATES.tddCycle();

    expect(workflow.name).toBe('TDD Cycle');
    expect(workflow.stages).toHaveLength(3);
    expect(workflow.stages[0].name).toBe('Write Failing Test');
    expect(workflow.stages[1].name).toBe('Make Test Pass');
    expect(workflow.stages[2].name).toBe('Refactor');
    expect(workflow.stages[2].pattern).toBe('council');
  });

  it('should create parallel analysis workflow', () => {
    const workflow = WORKFLOW_TEMPLATES.parallelAnalysis();

    expect(workflow.name).toBe('Parallel Analysis');
    expect(workflow.stages[0].pattern).toBe('parallel');
    expect(workflow.stages[0].requiredRoles).toHaveLength(3);
  });
});

describe('Type Validation', () => {
  it('should validate agent message structure', async () => {
    const { AgentMessageSchema } = await import('./types.js');

    const validMessage = {
      id: randomUUID(),
      type: 'task_assignment',
      priority: 'normal',
      senderId: randomUUID(),
      recipientId: randomUUID(),
      timestamp: new Date().toISOString(),
      payload: { test: true },
    };

    expect(() => AgentMessageSchema.parse(validMessage)).not.toThrow();
  });

  it('should reject invalid message types', async () => {
    const { AgentMessageSchema } = await import('./types.js');

    const invalidMessage = {
      id: randomUUID(),
      type: 'invalid_type',
      priority: 'normal',
      senderId: randomUUID(),
      recipientId: randomUUID(),
      timestamp: new Date().toISOString(),
      payload: {},
    };

    expect(() => AgentMessageSchema.parse(invalidMessage)).toThrow();
  });

  it('should validate checkpoint structure', async () => {
    const { CheckpointSchema } = await import('./types.js');

    const checkpoint = {
      id: randomUUID(),
      workflowId: randomUUID(),
      phase: 'coding',
      timestamp: new Date().toISOString(),
      agentStates: [
        {
          agentId: randomUUID(),
          state: 'idle',
        },
      ],
      pendingMessages: [],
      completedTasks: [],
    };

    expect(() => CheckpointSchema.parse(checkpoint)).not.toThrow();
  });

  it('should validate K8s CRD structure', async () => {
    const { AgentPoolCRDSchema } = await import('./types.js');

    const crd = {
      apiVersion: 'seu-claude.io/v1',
      kind: 'AgentPool',
      metadata: {
        name: 'test-pool',
        namespace: 'default',
      },
      spec: {
        replicas: 2,
        role: 'coder',
        capabilities: {
          role: 'coder',
          maxConcurrentTasks: 1,
          toolAccess: [],
        },
      },
    };

    expect(() => AgentPoolCRDSchema.parse(crd)).not.toThrow();
  });
});
