/**
 * Slash Command Handler for Seu-Claude v2 MCP
 * Supports: /plan, /test, /nuke
 */

import { ToolHandler } from './handler.js';

export type SlashCommand = '/plan' | '/test' | '/nuke';

export interface SlashCommandRequest {
  command: SlashCommand;
  args?: Record<string, unknown>;
}

export class SlashCommandRouter {
  private handler: ToolHandler;

  constructor(handler: ToolHandler) {
    this.handler = handler;
  }

  async route(request: SlashCommandRequest): Promise<unknown> {
    switch (request.command) {
      case '/plan':
        // Example: invoke planning tool or task manager
        return this.handler.handleTool('manage_task', { action: 'tree' });
      case '/test':
        // Example: run TDD/test tool
        return this.handler.handleTool('run_tdd', request.args || {});
      case '/nuke':
        // Example: context nuke, clear task DB or reset state
        return this.handler.handleTool('manage_task', { action: 'clear' });
      default:
        throw new Error(`Unknown slash command: ${request.command}`);
    }
  }
}
