/**
 * Base Agent Class
 *
 * Implements the core agent lifecycle and message handling.
 * Specialized agents extend this class with domain-specific behavior.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import type {
  AgentIdentity,
  AgentMessage,
  AgentRole,
  AgentState,
  AgentCapability,
  TaskAssignment,
  TaskResult,
  ReviewResult,
  Checkpoint,
} from './types.js';
import {
  AgentMessageSchema,
  TaskAssignmentSchema,
} from './types.js';

export interface AgentConfig {
  name: string;
  role: AgentRole;
  capabilities?: Partial<AgentCapability>;
  parentId?: string;
}

export abstract class Agent extends EventEmitter {
  protected identity: AgentIdentity;
  protected messageQueue: AgentMessage[] = [];
  protected currentTask: TaskAssignment | null = null;
  protected context: Map<string, unknown> = new Map();

  constructor(config: AgentConfig) {
    super();
    const now = new Date().toISOString();

    this.identity = {
      id: randomUUID(),
      name: config.name,
      role: config.role,
      capabilities: {
        role: config.role,
        languages: config.capabilities?.languages ?? [],
        frameworks: config.capabilities?.frameworks ?? [],
        maxConcurrentTasks: config.capabilities?.maxConcurrentTasks ?? 1,
        toolAccess: config.capabilities?.toolAccess ?? [],
      },
      state: 'idle',
      parentId: config.parentId,
      createdAt: now,
      lastActiveAt: now,
    };
  }

  // ============================================================================
  // Identity & State
  // ============================================================================

  get id(): string {
    return this.identity.id;
  }

  get name(): string {
    return this.identity.name;
  }

  get role(): AgentRole {
    return this.identity.role;
  }

  get state(): AgentState {
    return this.identity.state;
  }

  getIdentity(): AgentIdentity {
    return { ...this.identity };
  }

  protected setState(state: AgentState): void {
    const previousState = this.identity.state;
    this.identity.state = state;
    this.identity.lastActiveAt = new Date().toISOString();
    this.emit('stateChange', { agentId: this.id, from: previousState, to: state });
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  async receiveMessage(message: AgentMessage): Promise<void> {
    // Validate message structure
    const validated = AgentMessageSchema.parse(message);

    // Check if message is for this agent
    if (validated.recipientId !== this.id) {
      throw new Error(`Message not addressed to this agent: ${this.id}`);
    }

    this.messageQueue.push(validated);
    this.emit('messageReceived', validated);

    // Process message based on type
    await this.processMessage(validated);
  }

  protected async processMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case 'task_assignment':
        await this.handleTaskAssignment(message);
        break;
      case 'task_rejection':
        await this.handleTaskRejection(message);
        break;
      case 'query':
        await this.handleQuery(message);
        break;
      case 'terminate':
        await this.handleTerminate(message);
        break;
      default:
        this.emit('unhandledMessage', message);
    }
  }

  protected async handleTaskAssignment(message: AgentMessage): Promise<void> {
    if (this.state !== 'idle') {
      // Queue the task or reject
      this.emit('taskQueued', message.payload);
      return;
    }

    const assignment = TaskAssignmentSchema.parse(message.payload);
    this.currentTask = assignment;
    this.setState('busy');

    try {
      const result = await this.executeTask(assignment);
      await this.sendResult(message.senderId, result);
    } catch (error) {
      await this.sendError(message.senderId, assignment.taskId, error);
    } finally {
      this.currentTask = null;
      this.setState('idle');
    }
  }

  protected async handleTaskRejection(message: AgentMessage): Promise<void> {
    const review = message.payload as ReviewResult;
    this.emit('taskRejected', review);

    // Retry logic would go here
    if (review.feedback) {
      this.context.set('lastFeedback', review.feedback);
    }
  }

  protected async handleQuery(message: AgentMessage): Promise<void> {
    const response = await this.respondToQuery(message.payload as Record<string, unknown>);
    await this.sendMessage(message.senderId, 'response', response, message.id);
  }

  protected async handleTerminate(_message: AgentMessage): Promise<void> {
    this.setState('terminated');
    this.emit('terminated');
  }

  async sendMessage(
    recipientId: string,
    type: AgentMessage['type'],
    payload: Record<string, unknown>,
    correlationId?: string
  ): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: randomUUID(),
      type,
      priority: 'normal',
      senderId: this.id,
      recipientId,
      correlationId,
      timestamp: new Date().toISOString(),
      payload,
    };

    this.emit('messageSent', message);
    return message;
  }

  protected async sendResult(recipientId: string, result: TaskResult): Promise<void> {
    await this.sendMessage(recipientId, 'task_result', result as unknown as Record<string, unknown>);
  }

  protected async sendError(recipientId: string, taskId: string, error: unknown): Promise<void> {
    await this.sendMessage(recipientId, 'task_result', {
      taskId,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTimeMs: 0,
    });
  }

  // ============================================================================
  // Abstract Methods - Implemented by Specialized Agents
  // ============================================================================

  /**
   * Execute a task assignment
   */
  protected abstract executeTask(assignment: TaskAssignment): Promise<TaskResult>;

  /**
   * Respond to a query from another agent
   */
  protected abstract respondToQuery(query: Record<string, unknown>): Promise<Record<string, unknown>>;

  /**
   * Create a checkpoint of current state
   */
  abstract createCheckpoint(): Checkpoint;

  /**
   * Restore from a checkpoint
   */
  abstract restoreFromCheckpoint(checkpoint: Checkpoint): Promise<void>;

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async start(): Promise<void> {
    this.setState('idle');
    this.emit('started');
  }

  async stop(): Promise<void> {
    this.setState('terminated');
    this.emit('stopped');
  }

  isAvailable(): boolean {
    return this.state === 'idle';
  }

  canHandle(assignment: TaskAssignment): boolean {
    // Check if agent has required capabilities
    const required = assignment.requiredCapabilities;
    if (!required) return true;

    const caps = this.identity.capabilities;

    if (required.role && caps.role !== required.role) return false;
    if (required.languages?.length) {
      const hasAllLanguages = required.languages.every(
        (lang) => caps.languages?.includes(lang)
      );
      if (!hasAllLanguages) return false;
    }

    return true;
  }
}
