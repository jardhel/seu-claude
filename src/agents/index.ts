/**
 * Multi-Agent Orchestration Module
 *
 * Exports all agent-related types, classes, and utilities.
 */

// Types
export * from './types.js';

// Base Agent
export { Agent, type AgentConfig } from './Agent.js';

// Specialized Agents
export { CoderAgent, type CoderAgentConfig } from './specialized/CoderAgent.js';
export { ReviewerAgent, type ReviewerAgentConfig } from './specialized/ReviewerAgent.js';

// Pool Management
export { AgentPool, type PoolMetrics, type LoadBalancingStrategy } from './AgentPool.js';

// Orchestration
export {
  Orchestrator,
  type OrchestratorConfig,
  WORKFLOW_TEMPLATES,
} from './Orchestrator.js';
