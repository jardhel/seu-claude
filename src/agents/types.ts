/**
 * Multi-Agent Orchestration Types
 *
 * Based on:
 * - arxiv 2601.14351v1: Structured messages, hierarchical veto, checkpoint persistence
 * - McKinsey ARK: Kubernetes-native, specialized agents, MCP integration
 */

import { z } from 'zod';

// ============================================================================
// Agent Identity & Capabilities
// ============================================================================

export const AgentRoleSchema = z.enum([
  'orchestrator', // Coordinates other agents, manages workflow
  'coder',        // Writes and modifies code
  'reviewer',     // Reviews code for quality and correctness
  'tester',       // Writes and runs tests
  'documenter',   // Writes documentation
  'analyst',      // Analyzes requirements and designs solutions
  'debugger',     // Diagnoses and fixes bugs
]);

export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AgentCapabilitySchema = z.object({
  role: AgentRoleSchema,
  languages: z.array(z.string()).optional(),
  frameworks: z.array(z.string()).optional(),
  maxConcurrentTasks: z.number().default(1),
  toolAccess: z.array(z.string()).default([]),
});

export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export const AgentStateSchema = z.enum([
  'idle',         // Ready to accept work
  'busy',         // Processing a task
  'waiting',      // Waiting for input/approval
  'error',        // In error state
  'terminated',   // Shut down
]);

export type AgentState = z.infer<typeof AgentStateSchema>;

export const AgentIdentitySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: AgentRoleSchema,
  capabilities: AgentCapabilitySchema,
  state: AgentStateSchema.default('idle'),
  parentId: z.string().uuid().optional(), // For hierarchical agents
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
});

export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;

// ============================================================================
// Structured Messages (arxiv pattern: avoid plain text tokens)
// ============================================================================

export const MessageTypeSchema = z.enum([
  'task_assignment',    // Assign work to an agent
  'task_result',        // Result of completed work
  'task_rejection',     // Veto/rejection with reason
  'status_update',      // Progress update
  'escalation',         // Escalate to parent/human
  'query',              // Request for information
  'response',           // Response to query
  'checkpoint',         // State checkpoint notification
  'terminate',          // Shutdown signal
]);

export type MessageType = z.infer<typeof MessageTypeSchema>;

export const MessagePrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);
export type MessagePriority = z.infer<typeof MessagePrioritySchema>;

export const AgentMessageSchema = z.object({
  id: z.string().uuid(),
  type: MessageTypeSchema,
  priority: MessagePrioritySchema.default('normal'),
  senderId: z.string().uuid(),
  recipientId: z.string().uuid(),
  correlationId: z.string().uuid().optional(), // Links related messages
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()),
  metadata: z.record(z.string()).optional(),
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

// ============================================================================
// Task Assignment & Results
// ============================================================================

export const TaskAssignmentSchema = z.object({
  taskId: z.string().uuid(),
  description: z.string(),
  context: z.record(z.unknown()).optional(),
  files: z.array(z.string()).optional(),
  deadline: z.string().datetime().optional(),
  parentTaskId: z.string().uuid().optional(),
  requiredCapabilities: AgentCapabilitySchema.partial().optional(),
});

export type TaskAssignment = z.infer<typeof TaskAssignmentSchema>;

export const TaskResultSchema = z.object({
  taskId: z.string().uuid(),
  success: z.boolean(),
  output: z.unknown(),
  filesModified: z.array(z.string()).optional(),
  tokensUsed: z.number().optional(),
  executionTimeMs: z.number(),
  error: z.string().optional(),
  artifacts: z.array(z.object({
    name: z.string(),
    type: z.string(),
    content: z.string(),
  })).optional(),
});

export type TaskResult = z.infer<typeof TaskResultSchema>;

// ============================================================================
// Hierarchical Veto Authority (arxiv pattern)
// ============================================================================

export const VetoDecisionSchema = z.enum([
  'approved',     // Work approved, proceed
  'rejected',     // Work rejected, retry locally
  'escalated',    // Cannot decide, escalate to parent
]);

export type VetoDecision = z.infer<typeof VetoDecisionSchema>;

export const ReviewResultSchema = z.object({
  taskId: z.string().uuid(),
  reviewerId: z.string().uuid(),
  decision: VetoDecisionSchema,
  feedback: z.string().optional(),
  issues: z.array(z.object({
    severity: z.enum(['error', 'warning', 'info']),
    file: z.string().optional(),
    line: z.number().optional(),
    message: z.string(),
    suggestion: z.string().optional(),
  })).optional(),
  approvedAt: z.string().datetime().optional(),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

// ============================================================================
// Checkpoint & Recovery (arxiv pattern)
// ============================================================================

export const CheckpointSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  phase: z.string(),
  timestamp: z.string().datetime(),
  agentStates: z.array(z.object({
    agentId: z.string().uuid(),
    state: AgentStateSchema,
    currentTask: z.string().uuid().optional(),
    context: z.record(z.unknown()).optional(),
  })),
  pendingMessages: z.array(AgentMessageSchema),
  completedTasks: z.array(z.string().uuid()),
  metadata: z.record(z.unknown()).optional(),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

// ============================================================================
// Workflow Orchestration
// ============================================================================

export const WorkflowPatternSchema = z.enum([
  'sequential',       // One agent at a time
  'parallel',         // Multiple agents simultaneously
  'pipeline',         // Staged with handoffs
  'council',          // Multi-stage validation (arxiv pattern)
]);

export type WorkflowPattern = z.infer<typeof WorkflowPatternSchema>;

export const WorkflowStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  requiredRoles: z.array(AgentRoleSchema),
  pattern: WorkflowPatternSchema,
  timeout: z.number().optional(), // ms
  retryPolicy: z.object({
    maxRetries: z.number().default(3),
    backoffMs: z.number().default(1000),
  }).optional(),
  vetoRequired: z.boolean().optional().default(false),
  escalationThreshold: z.number().optional(), // Number of retries before escalation
});

export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;

export const WorkflowDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  stages: z.array(WorkflowStageSchema),
  entryPoint: z.string(), // Stage ID
  terminalStages: z.array(z.string()), // Stage IDs that end workflow
  transitions: z.array(z.object({
    from: z.string(),
    to: z.string(),
    condition: z.string().optional(), // Expression to evaluate
  })),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export const WorkflowExecutionSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  currentStage: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  checkpoints: z.array(z.string().uuid()), // Checkpoint IDs
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;

// ============================================================================
// Kubernetes-Native Resource Definitions (ARK pattern)
// ============================================================================

export const K8sMetadataSchema = z.object({
  name: z.string(),
  namespace: z.string().default('default'),
  labels: z.record(z.string()).optional(),
  annotations: z.record(z.string()).optional(),
});

export type K8sMetadata = z.infer<typeof K8sMetadataSchema>;

export const AgentPoolSpecSchema = z.object({
  replicas: z.number().min(0).default(1),
  role: AgentRoleSchema,
  capabilities: AgentCapabilitySchema,
  resources: z.object({
    requests: z.object({
      cpu: z.string().optional(),
      memory: z.string().optional(),
    }).optional(),
    limits: z.object({
      cpu: z.string().optional(),
      memory: z.string().optional(),
    }).optional(),
  }).optional(),
  autoscaling: z.object({
    enabled: z.boolean().default(false),
    minReplicas: z.number().default(1),
    maxReplicas: z.number().default(10),
    targetUtilization: z.number().default(80),
  }).optional(),
});

export type AgentPoolSpec = z.infer<typeof AgentPoolSpecSchema>;

export const AgentPoolCRDSchema = z.object({
  apiVersion: z.literal('seu-claude.io/v1'),
  kind: z.literal('AgentPool'),
  metadata: K8sMetadataSchema,
  spec: AgentPoolSpecSchema,
  status: z.object({
    readyReplicas: z.number(),
    availableReplicas: z.number(),
    conditions: z.array(z.object({
      type: z.string(),
      status: z.enum(['True', 'False', 'Unknown']),
      reason: z.string().optional(),
      message: z.string().optional(),
      lastTransitionTime: z.string().datetime(),
    })).optional(),
  }).optional(),
});

export type AgentPoolCRD = z.infer<typeof AgentPoolCRDSchema>;
