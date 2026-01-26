/**
 * Seu-Claude v2 MCP Server
 *
 * Exposes the v2 infrastructure as Model Context Protocol tools.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { join } from 'path';

import { TOOL_DEFINITIONS, ToolName } from './tools.js';
import { ToolHandler } from './handler.js';

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const DATA_DIR = process.env.DATA_DIR || join(PROJECT_ROOT, '.seu-claude-v2');

export async function createServer(): Promise<Server> {
  const server = new Server(
    {
      name: 'seu-claude-v2',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const handler = new ToolHandler(PROJECT_ROOT, DATA_DIR);

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOL_DEFINITIONS,
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handler.handleTool(name as ToolName, args || {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: true,
              message: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Seu-Claude v2 MCP Server started');
}

// Run if executed directly (ES module check)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startServer().catch(console.error);
}
