/**
 * Reviewer Agent
 *
 * Specializes in code review with hierarchical veto authority.
 * Implements the arxiv pattern of rejections staying local.
 */

import { randomUUID } from 'crypto';
import { Agent, AgentConfig } from '../Agent.js';
import type {
  TaskAssignment,
  TaskResult,
  Checkpoint,
  ReviewResult,
  VetoDecision,
} from '../types.js';

export interface ReviewerAgentConfig extends Omit<AgentConfig, 'role'> {
  strictness?: 'lenient' | 'normal' | 'strict';
  focusAreas?: ('security' | 'performance' | 'style' | 'correctness' | 'testing')[];
}

export class ReviewerAgent extends Agent {
  private strictness: 'lenient' | 'normal' | 'strict';
  private focusAreas: string[];

  constructor(config: ReviewerAgentConfig) {
    super({
      ...config,
      role: 'reviewer',
      capabilities: {
        ...config.capabilities,
        toolAccess: ['file_read', 'validate_code', 'analyze_dependency'],
      },
    });

    this.strictness = config.strictness ?? 'normal';
    this.focusAreas = config.focusAreas ?? ['correctness', 'style'];
  }

  protected async executeTask(assignment: TaskAssignment): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      // The task payload should contain code to review
      const codeToReview = assignment.context?.code as string | undefined;
      const files = assignment.files ?? [];

      const review = await this.reviewCode(codeToReview, files, assignment);

      return {
        taskId: assignment.taskId,
        success: review.decision === 'approved',
        output: review,
        executionTimeMs: Date.now() - startTime,
        artifacts: [
          {
            name: 'review-result',
            type: 'application/json',
            content: JSON.stringify(review, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        taskId: assignment.taskId,
        success: false,
        output: null,
        executionTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Review failed',
      };
    }
  }

  private async reviewCode(
    code: string | undefined,
    _files: string[],
    assignment: TaskAssignment
  ): Promise<ReviewResult> {
    const issues: ReviewResult['issues'] = [];

    // In production, this would use LLM for intelligent code review
    // For now, simulate review with placeholder logic

    // Check for common issues based on focus areas
    if (this.focusAreas.includes('security')) {
      // Simulate security check
      if (code?.includes('eval(') || code?.includes('exec(')) {
        issues.push({
          severity: 'error',
          message: 'Potential security risk: use of eval/exec',
          suggestion: 'Avoid dynamic code execution',
        });
      }
    }

    if (this.focusAreas.includes('style')) {
      // Simulate style check
      if (code && code.length > 500 && !code.includes('//')) {
        issues.push({
          severity: 'warning',
          message: 'Long code block without comments',
          suggestion: 'Add documentation for complex logic',
        });
      }
    }

    // Determine decision based on issues and strictness
    const decision = this.makeDecision(issues);

    return {
      taskId: assignment.taskId,
      reviewerId: this.id,
      decision,
      feedback: this.generateFeedback(issues, decision),
      issues,
      approvedAt: decision === 'approved' ? new Date().toISOString() : undefined,
    };
  }

  private makeDecision(issues: ReviewResult['issues']): VetoDecision {
    if (!issues || issues.length === 0) {
      return 'approved';
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;

    switch (this.strictness) {
      case 'strict':
        if (errorCount > 0 || warningCount > 2) return 'rejected';
        break;
      case 'normal':
        if (errorCount > 0) return 'rejected';
        if (warningCount > 5) return 'escalated';
        break;
      case 'lenient':
        if (errorCount > 2) return 'rejected';
        break;
    }

    return 'approved';
  }

  private generateFeedback(issues: ReviewResult['issues'], decision: VetoDecision): string {
    if (decision === 'approved') {
      return issues?.length
        ? `Approved with ${issues.length} minor suggestions.`
        : 'Code looks good. Approved.';
    }

    if (decision === 'rejected') {
      const errorCount = issues?.filter((i) => i.severity === 'error').length ?? 0;
      return `Rejected: ${errorCount} critical issue(s) must be addressed.`;
    }

    return 'Escalating for human review due to complex issues.';
  }

  protected async respondToQuery(query: Record<string, unknown>): Promise<Record<string, unknown>> {
    const queryType = query.type as string;

    switch (queryType) {
      case 'review_criteria':
        return {
          strictness: this.strictness,
          focusAreas: this.focusAreas,
        };
      case 'status':
        return {
          state: this.state,
          currentTask: this.currentTask?.taskId,
        };
      default:
        return { error: `Unknown query type: ${queryType}` };
    }
  }

  createCheckpoint(): Checkpoint {
    return {
      id: randomUUID(),
      workflowId: randomUUID(),
      phase: 'review',
      timestamp: new Date().toISOString(),
      agentStates: [
        {
          agentId: this.id,
          state: this.state,
          currentTask: this.currentTask?.taskId,
          context: {
            strictness: this.strictness,
            focusAreas: this.focusAreas,
            ...Object.fromEntries(this.context),
          },
        },
      ],
      pendingMessages: [...this.messageQueue],
      completedTasks: [],
    };
  }

  async restoreFromCheckpoint(checkpoint: Checkpoint): Promise<void> {
    const agentState = checkpoint.agentStates.find((s) => s.agentId === this.id);
    if (!agentState) {
      throw new Error(`No state found for agent ${this.id} in checkpoint`);
    }

    this.identity.state = agentState.state;
    if (agentState.context) {
      this.strictness = (agentState.context.strictness as typeof this.strictness) ?? 'normal';
      this.focusAreas = (agentState.context.focusAreas as string[]) ?? ['correctness'];
      this.context = new Map(Object.entries(agentState.context));
    }
    this.messageQueue = [...checkpoint.pendingMessages.filter((m) => m.recipientId === this.id)];
  }
}
