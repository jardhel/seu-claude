/**
 * Seu-Claude MCP Client
 *
 * Communicates with the seu-claude MCP server to execute tools
 * and retrieve data for the VSCode extension.
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface Task {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  parentId?: string;
  children?: Task[];
}

export interface DependencyNode {
  file: string;
  imports: string[];
  exports: string[];
  symbols: SymbolInfo[];
}

export interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'variable' | 'interface' | 'type';
  line: number;
  references: SymbolReference[];
}

export interface SymbolReference {
  file: string;
  line: number;
  column: number;
}

export interface TddResult {
  phase: 'red' | 'green' | 'refactor';
  testsPassed: boolean;
  lintPassed: boolean;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  file: string;
  line: number;
  column: number;
  message: string;
  rule: string;
}

export interface ValidationWarning {
  file: string;
  line: number;
  column: number;
  message: string;
  rule: string;
}

export class SeuClaudeClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private connected = false;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  async connect(): Promise<void> {
    const config = vscode.workspace.getConfiguration('seu-claude');
    const serverPath = config.get<string>('mcpServerPath') || 'seu-claude';

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(serverPath, ['--mcp'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        });

        this.process.stdout?.on('data', (data) => {
          this.handleResponse(data.toString());
        });

        this.process.stderr?.on('data', (data) => {
          console.error('[seu-claude]', data.toString());
        });

        this.process.on('close', (code) => {
          this.connected = false;
          this.emit('disconnected', code);
        });

        this.process.on('error', (error) => {
          reject(error);
        });

        // Wait for initialization
        setTimeout(() => {
          this.connected = true;
          this.emit('connected');
          resolve();
        }, 500);
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleResponse(data: string): void {
    try {
      const lines = data.trim().split('\n');
      for (const line of lines) {
        if (!line) continue;
        const response = JSON.parse(line);
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse MCP response:', error);
    }
  }

  private async callTool<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    if (!this.connected || !this.process) {
      throw new Error('Not connected to seu-claude MCP server');
    }

    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: tool,
        arguments: args,
      },
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject
      });
      this.process!.stdin?.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  // Task Management
  async getTaskTree(): Promise<Task[]> {
    const result = await this.callTool<{ tree: Task[] }>('manage_task', { action: 'tree' });
    return result.tree;
  }

  async createTask(label: string, parentId?: string): Promise<Task> {
    const result = await this.callTool<{ task: Task }>('manage_task', {
      action: 'create',
      label,
      parentId,
    });
    return result.task;
  }

  async updateTaskStatus(taskId: string, status: Task['status']): Promise<Task> {
    const result = await this.callTool<{ task: Task }>('manage_task', {
      action: 'update',
      taskId,
      status,
    });
    return result.task;
  }

  // Dependency Analysis
  async analyzeDependencies(entryPoints: string[]): Promise<DependencyNode[]> {
    const result = await this.callTool<{ nodes: DependencyNode[] }>('analyze_dependency', {
      entryPoints,
    });
    return result.nodes;
  }

  // Symbol Resolution
  async findSymbol(symbolName: string, entryPoints: string[]): Promise<SymbolInfo | null> {
    const result = await this.callTool<{ symbol: SymbolInfo | null }>('find_symbol', {
      symbolName,
      entryPoints,
    });
    return result.symbol;
  }

  // Code Validation
  async validateCode(paths: string[], fix = false): Promise<ValidationResult> {
    const result = await this.callTool<ValidationResult>('validate_code', {
      paths,
      fix,
    });
    return result;
  }

  // TDD Workflow
  async runTDD(
    testCode: string,
    implementationCode: string,
    testFilePath: string,
    implementationFilePath: string
  ): Promise<TddResult> {
    const result = await this.callTool<TddResult>('run_tdd', {
      description: 'TDD cycle from VSCode',
      testCode,
      implementationCode,
      testFilePath,
      implementationFilePath,
    });
    return result;
  }

  // Sandbox Execution
  async executeSandbox(command: string, args: string[] = []): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const result = await this.callTool<{ stdout: string; stderr: string; exitCode: number }>('execute_sandbox', {
      command,
      args,
    });
    return result;
  }
}
