/**
 * Agent Pool Manager
 *
 * Manages a pool of agents with Kubernetes-inspired semantics:
 * - Declarative desired state (replicas, capabilities)
 * - Automatic scaling and load balancing
 * - Health monitoring and recovery
 *
 * Based on McKinsey ARK patterns.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { Agent } from './Agent.js';
import { CoderAgent } from './specialized/CoderAgent.js';
import { ReviewerAgent } from './specialized/ReviewerAgent.js';
import type {
  AgentRole,
  AgentPoolSpec,
  AgentPoolCRD,
  TaskAssignment,
  AgentMessage,
  AgentIdentity,
} from './types.js';

export interface PoolMetrics {
  totalAgents: number;
  availableAgents: number;
  busyAgents: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageTaskTimeMs: number;
}

export interface LoadBalancingStrategy {
  type: 'round-robin' | 'least-busy' | 'capability-match' | 'random';
}

export class AgentPool extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private taskQueue: TaskAssignment[] = [];
  private taskHistory: Map<string, { success: boolean; timeMs: number }> = new Map();
  private spec: AgentPoolSpec;
  private readonly poolId: string;
  private loadBalancingStrategy: LoadBalancingStrategy = { type: 'capability-match' };
  private isRunning = false;

  constructor(spec: AgentPoolSpec) {
    super();
    this.poolId = randomUUID();
    this.spec = spec;
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // Spawn initial replicas
    for (let i = 0; i < this.spec.replicas; i++) {
      await this.spawnAgent();
    }

    // Start task processing loop
    this.processTaskQueue();

    this.emit('started', { poolId: this.poolId, replicas: this.spec.replicas });
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    // Gracefully terminate all agents
    const terminationPromises = Array.from(this.agents.values()).map((agent) =>
      agent.stop()
    );
    await Promise.all(terminationPromises);

    this.agents.clear();
    this.emit('stopped', { poolId: this.poolId });
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  private async spawnAgent(): Promise<Agent> {
    const agent = this.createAgentForRole(this.spec.role);
    await agent.start();

    this.agents.set(agent.id, agent);

    // Set up event handlers
    agent.on('stateChange', (event) => {
      this.emit('agentStateChange', { poolId: this.poolId, ...event });
      this.checkAutoscaling();
    });

    agent.on('messageSent', (message: AgentMessage) => {
      this.routeMessage(message);
    });

    this.emit('agentSpawned', { poolId: this.poolId, agentId: agent.id });
    return agent;
  }

  private createAgentForRole(role: AgentRole): Agent {
    const baseName = `${role}-${this.agents.size + 1}`;

    switch (role) {
      case 'coder':
        return new CoderAgent({
          name: baseName,
          languages: this.spec.capabilities.languages,
          frameworks: this.spec.capabilities.frameworks,
        });
      case 'reviewer':
        return new ReviewerAgent({
          name: baseName,
          strictness: 'normal',
        });
      // Add other specialized agents as they're implemented
      default:
        // Fallback to coder for unimplemented roles
        return new CoderAgent({ name: baseName });
    }
  }

  async terminateAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    await agent.stop();
    this.agents.delete(agentId);

    this.emit('agentTerminated', { poolId: this.poolId, agentId });
    return true;
  }

  // ============================================================================
  // Task Distribution
  // ============================================================================

  async submitTask(assignment: TaskAssignment): Promise<string> {
    this.taskQueue.push(assignment);
    this.emit('taskQueued', { poolId: this.poolId, taskId: assignment.taskId });

    // Trigger immediate processing
    setImmediate(() => this.processTaskQueue());

    return assignment.taskId;
  }

  private async processTaskQueue(): Promise<void> {
    if (!this.isRunning) return;

    while (this.taskQueue.length > 0) {
      const task = this.taskQueue[0];
      const agent = this.selectAgent(task);

      if (!agent) {
        // No available agent, wait and retry
        await this.waitForAvailableAgent();
        continue;
      }

      // Remove from queue and assign
      this.taskQueue.shift();
      await this.assignTaskToAgent(agent, task);
    }
  }

  private selectAgent(task: TaskAssignment): Agent | null {
    const availableAgents = Array.from(this.agents.values()).filter(
      (agent) => agent.isAvailable() && agent.canHandle(task)
    );

    if (availableAgents.length === 0) return null;

    switch (this.loadBalancingStrategy.type) {
      case 'round-robin':
        return availableAgents[0];

      case 'random':
        return availableAgents[Math.floor(Math.random() * availableAgents.length)];

      case 'capability-match':
        // Prefer agents with exact capability match
        const exactMatch = availableAgents.find((agent) => {
          const caps = agent.getIdentity().capabilities;
          const required = task.requiredCapabilities;
          if (!required) return true;

          return (
            required.languages?.every((l) => caps.languages?.includes(l)) ?? true
          );
        });
        return exactMatch ?? availableAgents[0];

      case 'least-busy':
      default:
        return availableAgents[0];
    }
  }

  private async assignTaskToAgent(agent: Agent, task: TaskAssignment): Promise<void> {
    const message: AgentMessage = {
      id: randomUUID(),
      type: 'task_assignment',
      priority: 'normal',
      senderId: this.poolId,
      recipientId: agent.id,
      timestamp: new Date().toISOString(),
      payload: task as unknown as Record<string, unknown>,
    };

    const startTime = Date.now();

    agent.once('messageSent', (resultMessage: AgentMessage) => {
      if (resultMessage.type === 'task_result') {
        const timeMs = Date.now() - startTime;
        const result = resultMessage.payload as { success: boolean };

        this.taskHistory.set(task.taskId, { success: result.success, timeMs });

        this.emit('taskCompleted', {
          poolId: this.poolId,
          taskId: task.taskId,
          success: result.success,
          timeMs,
        });
      }
    });

    await agent.receiveMessage(message);
  }

  private async waitForAvailableAgent(): Promise<void> {
    return new Promise((resolve) => {
      const checkAvailability = () => {
        const hasAvailable = Array.from(this.agents.values()).some((a) =>
          a.isAvailable()
        );
        if (hasAvailable) {
          resolve();
        } else {
          setTimeout(checkAvailability, 100);
        }
      };
      checkAvailability();
    });
  }

  // ============================================================================
  // Message Routing
  // ============================================================================

  private routeMessage(message: AgentMessage): void {
    // Route to specific agent if recipient is in pool
    const recipient = this.agents.get(message.recipientId);
    if (recipient) {
      recipient.receiveMessage(message).catch((err) => {
        this.emit('routingError', { message, error: err });
      });
      return;
    }

    // Otherwise emit for external handling
    this.emit('externalMessage', message);
  }

  // ============================================================================
  // Autoscaling (ARK pattern)
  // ============================================================================

  private checkAutoscaling(): void {
    if (!this.spec.autoscaling?.enabled) return;

    const metrics = this.getMetrics();
    const utilization =
      metrics.busyAgents / Math.max(metrics.totalAgents, 1) * 100;

    if (
      utilization > this.spec.autoscaling.targetUtilization &&
      metrics.totalAgents < this.spec.autoscaling.maxReplicas
    ) {
      // Scale up
      this.spawnAgent().then(() => {
        this.emit('scaledUp', { poolId: this.poolId, newSize: this.agents.size });
      });
    } else if (
      utilization < this.spec.autoscaling.targetUtilization / 2 &&
      metrics.totalAgents > this.spec.autoscaling.minReplicas
    ) {
      // Scale down - terminate an idle agent
      const idleAgent = Array.from(this.agents.values()).find((a) =>
        a.isAvailable()
      );
      if (idleAgent) {
        this.terminateAgent(idleAgent.id).then(() => {
          this.emit('scaledDown', { poolId: this.poolId, newSize: this.agents.size });
        });
      }
    }
  }

  // ============================================================================
  // Metrics & Status
  // ============================================================================

  getMetrics(): PoolMetrics {
    const agents = Array.from(this.agents.values());
    const history = Array.from(this.taskHistory.values());

    const successfulTasks = history.filter((t) => t.success);
    const avgTime =
      successfulTasks.length > 0
        ? successfulTasks.reduce((sum, t) => sum + t.timeMs, 0) / successfulTasks.length
        : 0;

    return {
      totalAgents: agents.length,
      availableAgents: agents.filter((a) => a.isAvailable()).length,
      busyAgents: agents.filter((a) => a.state === 'busy').length,
      queuedTasks: this.taskQueue.length,
      completedTasks: history.filter((t) => t.success).length,
      failedTasks: history.filter((t) => !t.success).length,
      averageTaskTimeMs: avgTime,
    };
  }

  getAgents(): AgentIdentity[] {
    return Array.from(this.agents.values()).map((a) => a.getIdentity());
  }

  getSpec(): AgentPoolSpec {
    return { ...this.spec };
  }

  // ============================================================================
  // Kubernetes CRD Generation
  // ============================================================================

  toCRD(name: string, namespace = 'default'): AgentPoolCRD {
    const metrics = this.getMetrics();

    return {
      apiVersion: 'seu-claude.io/v1',
      kind: 'AgentPool',
      metadata: {
        name,
        namespace,
        labels: {
          'app.kubernetes.io/name': 'seu-claude',
          'app.kubernetes.io/component': 'agent-pool',
          'seu-claude.io/role': this.spec.role,
        },
      },
      spec: this.spec,
      status: {
        readyReplicas: metrics.availableAgents,
        availableReplicas: metrics.totalAgents,
        conditions: [
          {
            type: 'Ready',
            status: metrics.availableAgents > 0 ? 'True' : 'False',
            reason: metrics.availableAgents > 0 ? 'AgentsAvailable' : 'NoAgentsAvailable',
            lastTransitionTime: new Date().toISOString(),
          },
        ],
      },
    };
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  setLoadBalancingStrategy(strategy: LoadBalancingStrategy): void {
    this.loadBalancingStrategy = strategy;
  }

  async updateSpec(newSpec: Partial<AgentPoolSpec>): Promise<void> {
    const oldReplicas = this.spec.replicas;
    this.spec = { ...this.spec, ...newSpec };

    // Adjust replicas if changed
    if (newSpec.replicas !== undefined && newSpec.replicas !== oldReplicas) {
      const diff = newSpec.replicas - oldReplicas;
      if (diff > 0) {
        // Scale up
        for (let i = 0; i < diff; i++) {
          await this.spawnAgent();
        }
      } else {
        // Scale down
        const toRemove = Math.abs(diff);
        const idleAgents = Array.from(this.agents.values())
          .filter((a) => a.isAvailable())
          .slice(0, toRemove);
        for (const agent of idleAgents) {
          await this.terminateAgent(agent.id);
        }
      }
    }

    this.emit('specUpdated', { poolId: this.poolId, spec: this.spec });
  }
}
