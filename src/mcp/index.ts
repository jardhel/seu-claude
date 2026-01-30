/**
 * Seu-Claude MCP Module
 *
 * Provides MCP (Model Context Protocol) server functionality and configuration
 * utilities for integration with various agentic AI tools.
 */

// Server exports
export { createServer, startServer } from './server.js';
export { ToolHandler } from './handler.js';
export { TOOL_DEFINITIONS, type ToolName } from './tools.js';

// Configuration generator exports
export {
  generateServerConfig,
  generateConfig,
  generateAllConfigs,
  writeConfig,
  writeConfigs,
  getInstallInstructions,
  listSupportedTools,
  detectExistingTools,
  CONFIG_TEMPLATES,
  type AgentTool,
  type MCPServerConfig,
  type MCPConfig,
  type ConfigOptions,
} from './config-generator.js';
