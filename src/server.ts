import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { Config, loadConfig } from './utils/config.js';
import { logger } from './utils/logger.js';
import { EmbeddingEngine } from './vector/embed.js';
import { VectorStore } from './vector/store.js';
import { IndexCodebase } from './tools/index-codebase.js';
import { SearchCodebase } from './tools/search-codebase.js';
import { ReadSemanticContext } from './tools/read-context.js';

export class SeuClaudeServer {
  private server: Server;
  private config: Config;
  private embedder: EmbeddingEngine;
  private store: VectorStore;
  private indexTool: IndexCodebase;
  private searchTool: SearchCodebase;
  private contextTool: ReadSemanticContext;
  private log = logger.child('server');
  private initialized = false;

  constructor(config?: Partial<Config>) {
    this.config = loadConfig(config);
    this.embedder = new EmbeddingEngine(this.config);
    this.store = new VectorStore(this.config);
    this.indexTool = new IndexCodebase(this.config, this.embedder, this.store);
    this.searchTool = new SearchCodebase(this.embedder, this.store);
    this.contextTool = new ReadSemanticContext(this.store);

    this.server = new Server(
      {
        name: 'seu-claude',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getToolDefinitions(),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      try {
        await this.ensureInitialized();

        switch (name) {
          case 'index_codebase':
            return await this.handleIndexCodebase(args);
          case 'search_codebase':
            return await this.handleSearchCodebase(args);
          case 'read_semantic_context':
            return await this.handleReadContext(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.log.error(`Tool ${name} failed:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private getToolDefinitions(): Tool[] {
    return [
      {
        name: 'index_codebase',
        description:
          'Index the codebase for semantic search. This scans all source files, parses them into semantic chunks using AST analysis, and stores embeddings in a vector database. Run this when starting work on a new project or after significant code changes.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                'Optional project root path. Defaults to the configured PROJECT_ROOT or current directory.',
            },
            force: {
              type: 'boolean',
              description:
                'Force a full re-index, clearing the existing database. Default: false (incremental).',
            },
          },
        },
      },
      {
        name: 'search_codebase',
        description:
          'Search the indexed codebase using natural language queries. Returns semantically relevant code chunks including functions, classes, methods, and interfaces. Use this to find implementations, understand architecture, or locate specific functionality.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Natural language query describing what you are looking for. Example: "user authentication logic" or "database connection handling"',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return. Default: 10.',
            },
            filter_type: {
              type: 'string',
              enum: ['function', 'method', 'class', 'interface', 'type', 'struct', 'enum'],
              description: 'Filter results by code structure type.',
            },
            filter_language: {
              type: 'string',
              description:
                'Filter results by programming language (e.g., "typescript", "python", "rust").',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'read_semantic_context',
        description:
          'Read a specific code location with semantic context. Unlike raw file reading, this provides information about the structure (what class/function the code belongs to) and lists other definitions in the same file.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the file.',
            },
            symbol: {
              type: 'string',
              description:
                'Optional symbol name (function, class, method) to focus on. If provided, will center the context around this symbol.',
            },
            start_line: {
              type: 'number',
              description: 'Optional start line for the context window.',
            },
            end_line: {
              type: 'number',
              description: 'Optional end line for the context window.',
            },
            context_lines: {
              type: 'number',
              description:
                'Number of lines of context to include before and after. Default: 5.',
            },
          },
          required: ['file_path'],
        },
      },
    ];
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    this.log.info('Initializing seu-claude server...');

    await this.store.initialize();
    await this.embedder.initialize();
    await this.indexTool.initialize();

    this.initialized = true;
    this.log.info('Server initialized successfully');
  }

  private async handleIndexCodebase(
    args: Record<string, unknown> | undefined
  ): Promise<{ content: { type: string; text: string }[] }> {
    const path = args?.path as string | undefined;
    const force = args?.force as boolean | undefined;

    if (path) {
      this.config.projectRoot = path;
    }

    const result = await this.indexTool.execute(force);

    const text = result.success
      ? `Successfully indexed ${result.filesProcessed} files with ${result.chunksCreated} code chunks in ${(result.durationMs / 1000).toFixed(1)}s.\n\nLanguages: ${Object.entries(result.languages).map(([lang, count]) => `${lang}: ${count}`).join(', ')}`
      : `Indexing failed: ${result.error}`;

    return {
      content: [{ type: 'text', text }],
    };
  }

  private async handleSearchCodebase(
    args: Record<string, unknown> | undefined
  ): Promise<{ content: { type: string; text: string }[] }> {
    if (!args?.query) {
      throw new Error('query parameter is required');
    }

    const results = await this.searchTool.execute({
      query: args.query as string,
      limit: args.limit as number | undefined,
      filterType: args.filter_type as string | undefined,
      filterLanguage: args.filter_language as string | undefined,
    });

    const text = this.searchTool.formatForClaude(results);

    return {
      content: [{ type: 'text', text }],
    };
  }

  private async handleReadContext(
    args: Record<string, unknown> | undefined
  ): Promise<{ content: { type: string; text: string }[] }> {
    if (!args?.file_path) {
      throw new Error('file_path parameter is required');
    }

    const result = await this.contextTool.execute({
      filePath: args.file_path as string,
      symbol: args.symbol as string | undefined,
      startLine: args.start_line as number | undefined,
      endLine: args.end_line as number | undefined,
      contextLines: args.context_lines as number | undefined,
    });

    const text = this.contextTool.formatForClaude(result);

    return {
      content: [{ type: 'text', text }],
    };
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.log.info('seu-claude MCP server started');
  }

  async stop(): Promise<void> {
    await this.store.close();
    await this.server.close();
    this.log.info('seu-claude MCP server stopped');
  }
}
