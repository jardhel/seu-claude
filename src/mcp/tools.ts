/**
 * MCP Tool Definitions for Seu-Claude v2
 *
 * Exposes the v2 infrastructure as MCP tools:
 * - analyze_dependency: Analyze code dependencies using RecursiveScout
 * - validate_code: Run pre-flight checks with Gatekeeper
 * - execute_sandbox: Run code in isolated sandbox
 * - manage_task: Create and track tasks with TaskManager
 * - run_tdd: Execute TDD cycles with HypothesisEngine
 */

import { z } from 'zod';

// Tool Input Schemas
export const AnalyzeDependencyInput = z.object({
  entryPoints: z.array(z.string()).describe('File paths to analyze'),
  maxDepth: z.number().optional().describe('Maximum dependency depth'),
  includeNodeModules: z.boolean().optional().describe('Include node_modules'),
});

export const ValidateCodeInput = z.object({
  paths: z.array(z.string()).describe('Files to validate'),
  fix: z.boolean().optional().describe('Auto-fix issues if possible'),
});

export const ExecuteSandboxInput = z.object({
  command: z.string().describe('Command to execute'),
  args: z.array(z.string()).optional().describe('Command arguments'),
  timeout: z.number().optional().describe('Timeout in milliseconds'),
  workingDir: z.string().optional().describe('Working directory'),
});

export const ManageTaskInput = z.object({
  action: z.enum(['create', 'update', 'get', 'list', 'tree']).describe('Task action'),
  taskId: z.string().optional().describe('Task ID for update/get'),
  label: z.string().optional().describe('Task label for create'),
  parentId: z.string().optional().describe('Parent task ID'),
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
  toolOutput: z.object({
    toolName: z.string(),
    output: z.any(),
  }).optional().describe('Cache tool output'),
});

export const RunTDDInput = z.object({
  description: z.string().describe('What the code should do'),
  testCode: z.string().describe('Test code'),
  implementationCode: z.string().describe('Implementation code'),
  testFilePath: z.string().describe('Path for test file'),
  implementationFilePath: z.string().describe('Path for implementation'),
});

export const FindSymbolInput = z.object({
  symbolName: z.string().describe('Symbol name to find'),
  entryPoints: z.array(z.string()).describe('Entry points for search'),
});

// Tool Definitions
export const TOOL_DEFINITIONS = [
  {
    name: 'analyze_dependency',
    description: 'Analyze code dependencies and build import graph. Returns dependency tree, circular dependencies, and symbol locations.',
    inputSchema: {
      type: 'object',
      properties: {
        entryPoints: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths to start analysis from',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth to traverse (default: 50)',
        },
        includeNodeModules: {
          type: 'boolean',
          description: 'Include node_modules imports (default: false)',
        },
      },
      required: ['entryPoints'],
    },
  },
  {
    name: 'validate_code',
    description: 'Run pre-flight validation checks (ESLint, TypeScript type checking) on code files.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths to validate',
        },
        fix: {
          type: 'boolean',
          description: 'Attempt to auto-fix issues',
        },
      },
      required: ['paths'],
    },
  },
  {
    name: 'execute_sandbox',
    description: 'Execute a command in an isolated sandbox environment with timeout and resource limits.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Command to execute',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Command arguments',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
        workingDir: {
          type: 'string',
          description: 'Working directory for execution',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'manage_task',
    description: 'Create, update, or query tasks in the persistent task DAG. Supports caching tool outputs to prevent duplicate work.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'get', 'list', 'tree'],
          description: 'Action to perform',
        },
        taskId: {
          type: 'string',
          description: 'Task ID (for update/get)',
        },
        label: {
          type: 'string',
          description: 'Task label (for create)',
        },
        parentId: {
          type: 'string',
          description: 'Parent task ID (for create subtask)',
        },
        status: {
          type: 'string',
          enum: ['pending', 'running', 'completed', 'failed'],
          description: 'New status (for update)',
        },
        toolOutput: {
          type: 'object',
          properties: {
            toolName: { type: 'string' },
            output: {},
          },
          description: 'Tool output to cache',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'run_tdd',
    description: 'Execute a TDD cycle: verify test fails (RED), then passes with implementation (GREEN), validate code quality.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Description of the hypothesis',
        },
        testCode: {
          type: 'string',
          description: 'Test code to run',
        },
        implementationCode: {
          type: 'string',
          description: 'Implementation code',
        },
        testFilePath: {
          type: 'string',
          description: 'Path to write test file',
        },
        implementationFilePath: {
          type: 'string',
          description: 'Path to write implementation',
        },
      },
      required: ['description', 'testCode', 'implementationCode', 'testFilePath', 'implementationFilePath'],
    },
  },
  {
    name: 'find_symbol',
    description: 'Find where a symbol (function, class, etc.) is defined and where it is called across the codebase.',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: {
          type: 'string',
          description: 'Name of the symbol to find',
        },
        entryPoints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Entry points for building dependency graph',
        },
      },
      required: ['symbolName', 'entryPoints'],
    },
  },
];

export type ToolName =
  | 'analyze_dependency'
  | 'validate_code'
  | 'execute_sandbox'
  | 'manage_task'
  | 'run_tdd'
  | 'find_symbol';
