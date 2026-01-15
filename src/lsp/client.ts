/**
 * LSP Client for enhanced symbol resolution
 * Communicates with TypeScript/JavaScript language server for accurate type info
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import { logger } from '../utils/logger.js';
import { join } from 'path';
import { existsSync } from 'fs';

interface LSPMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

interface Position {
  line: number;
  character: number;
}

interface Location {
  uri: string;
  range: {
    start: Position;
    end: Position;
  };
}

interface SymbolInformation {
  name: string;
  kind: number;
  location: Location;
  containerName?: string;
}

interface HoverResult {
  contents: { kind: string; value: string } | string;
  range?: { start: Position; end: Position };
}

interface DefinitionResult {
  uri: string;
  range: { start: Position; end: Position };
}

// LSP Symbol kinds
export const SymbolKind = {
  File: 1,
  Module: 2,
  Namespace: 3,
  Package: 4,
  Class: 5,
  Method: 6,
  Property: 7,
  Field: 8,
  Constructor: 9,
  Enum: 10,
  Interface: 11,
  Function: 12,
  Variable: 13,
  Constant: 14,
  String: 15,
  Number: 16,
  Boolean: 17,
  Array: 18,
  Object: 19,
  Key: 20,
  Null: 21,
  EnumMember: 22,
  Struct: 23,
  Event: 24,
  Operator: 25,
  TypeParameter: 26,
} as const;

export class LSPClient {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests: Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  > = new Map();
  private log = logger.child('lsp-client');
  private initialized = false;
  private projectRoot: string;
  private readline: Interface | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Start the TypeScript language server
   */
  async start(): Promise<boolean> {
    if (this.process) {
      return true;
    }

    // Find tsserver
    const tsserverPaths = [
      join(this.projectRoot, 'node_modules', 'typescript', 'lib', 'tsserver.js'),
      join(this.projectRoot, 'node_modules', '.bin', 'tsserver'),
      'tsserver', // global
    ];

    let tsserverPath: string | null = null;
    for (const path of tsserverPaths) {
      if (path === 'tsserver' || existsSync(path)) {
        tsserverPath = path;
        break;
      }
    }

    if (!tsserverPath) {
      this.log.warn('TypeScript server not found. LSP features disabled.');
      return false;
    }

    try {
      this.process = spawn('node', [tsserverPath, '--stdio'], {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!this.process.stdout || !this.process.stdin) {
        throw new Error('Failed to create stdio pipes');
      }

      // Handle stdout for responses
      this.readline = createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      this.readline.on('line', line => {
        this.handleMessage(line);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        this.log.debug('TSServer stderr:', data.toString());
      });

      this.process.on('error', err => {
        this.log.error('TSServer error:', err);
        this.process = null;
      });

      this.process.on('exit', code => {
        this.log.info(`TSServer exited with code ${code}`);
        this.process = null;
        this.initialized = false;
      });

      // Initialize the server
      await this.initialize();
      this.initialized = true;
      this.log.info('LSP client connected to TypeScript server');
      return true;
    } catch (err) {
      this.log.error('Failed to start TypeScript server:', err);
      return false;
    }
  }

  /**
   * Initialize LSP connection
   */
  private async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: `file://${this.projectRoot}`,
      capabilities: {
        textDocument: {
          hover: { dynamicRegistration: false },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          documentSymbol: { dynamicRegistration: false },
        },
        workspace: {
          symbol: { dynamicRegistration: false },
        },
      },
    });

    await this.sendNotification('initialized', {});
  }

  /**
   * Open a file in the language server
   */
  async openFile(filePath: string, content: string, languageId = 'typescript'): Promise<void> {
    if (!this.initialized) return;

    await this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: `file://${filePath}`,
        languageId,
        version: 1,
        text: content,
      },
    });
  }

  /**
   * Close a file in the language server
   */
  async closeFile(filePath: string): Promise<void> {
    if (!this.initialized) return;

    await this.sendNotification('textDocument/didClose', {
      textDocument: {
        uri: `file://${filePath}`,
      },
    });
  }

  /**
   * Get hover information at a position
   */
  async getHover(filePath: string, line: number, character: number): Promise<string | null> {
    if (!this.initialized) return null;

    try {
      const result = (await this.sendRequest('textDocument/hover', {
        textDocument: { uri: `file://${filePath}` },
        position: { line, character },
      })) as HoverResult | null;

      if (!result?.contents) return null;

      if (typeof result.contents === 'string') {
        return result.contents;
      }
      return result.contents.value;
    } catch {
      return null;
    }
  }

  /**
   * Get definition location for a symbol
   */
  async getDefinition(
    filePath: string,
    line: number,
    character: number
  ): Promise<DefinitionResult[] | null> {
    if (!this.initialized) return null;

    try {
      const result = await this.sendRequest('textDocument/definition', {
        textDocument: { uri: `file://${filePath}` },
        position: { line, character },
      });

      if (!result) return null;

      // Result can be a single Location or Location[]
      const locations = Array.isArray(result) ? result : [result];
      return locations as DefinitionResult[];
    } catch {
      return null;
    }
  }

  /**
   * Get all references to a symbol
   */
  async getReferences(
    filePath: string,
    line: number,
    character: number,
    includeDeclaration = true
  ): Promise<Location[] | null> {
    if (!this.initialized) return null;

    try {
      const result = await this.sendRequest('textDocument/references', {
        textDocument: { uri: `file://${filePath}` },
        position: { line, character },
        context: { includeDeclaration },
      });

      return (result as Location[]) || null;
    } catch {
      return null;
    }
  }

  /**
   * Get document symbols (outline)
   */
  async getDocumentSymbols(filePath: string): Promise<SymbolInformation[] | null> {
    if (!this.initialized) return null;

    try {
      const result = await this.sendRequest('textDocument/documentSymbol', {
        textDocument: { uri: `file://${filePath}` },
      });

      return (result as SymbolInformation[]) || null;
    } catch {
      return null;
    }
  }

  /**
   * Search workspace for symbols
   */
  async searchWorkspaceSymbols(query: string): Promise<SymbolInformation[] | null> {
    if (!this.initialized) return null;

    try {
      const result = await this.sendRequest('workspace/symbol', { query });
      return (result as SymbolInformation[]) || null;
    } catch {
      return null;
    }
  }

  /**
   * Get type definition
   */
  async getTypeDefinition(
    filePath: string,
    line: number,
    character: number
  ): Promise<Location[] | null> {
    if (!this.initialized) return null;

    try {
      const result = await this.sendRequest('textDocument/typeDefinition', {
        textDocument: { uri: `file://${filePath}` },
        position: { line, character },
      });

      if (!result) return null;
      const locations = Array.isArray(result) ? result : [result];
      return locations as Location[];
    } catch {
      return null;
    }
  }

  /**
   * Send a request and wait for response
   */
  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('LSP server not running'));
        return;
      }

      const id = ++this.messageId;
      const message: LSPMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });

      const content = JSON.stringify(message);
      const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;

      this.process.stdin.write(header + content);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`LSP request ${method} timed out`));
        }
      }, 10000);
    });
  }

  /**
   * Send a notification (no response expected)
   */
  private sendNotification(method: string, params: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('LSP server not running'));
        return;
      }

      const message: LSPMessage = {
        jsonrpc: '2.0',
        method,
        params,
      };

      const content = JSON.stringify(message);
      const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;

      this.process.stdin.write(header + content, err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Handle incoming messages from the server
   */
  private handleMessage(line: string): void {
    // Skip header lines
    if (line.startsWith('Content-Length:') || line.trim() === '') {
      return;
    }

    try {
      const message = JSON.parse(line) as LSPMessage;

      if (message.id !== undefined && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } catch {
      // Not a JSON message, ignore
    }
  }

  /**
   * Check if LSP is available
   */
  isAvailable(): boolean {
    return this.initialized && this.process !== null;
  }

  /**
   * Stop the language server
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    try {
      await this.sendRequest('shutdown', null);
      await this.sendNotification('exit', null);
    } catch {
      // Ignore errors during shutdown
    }

    this.readline?.close();
    this.process.kill();
    this.process = null;
    this.initialized = false;
    this.log.info('LSP client stopped');
  }
}

/**
 * Create and start an LSP client
 */
export async function createLSPClient(projectRoot: string): Promise<LSPClient | null> {
  const client = new LSPClient(projectRoot);
  const started = await client.start();
  return started ? client : null;
}
