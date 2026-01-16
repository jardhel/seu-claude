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
import { SearchXrefs } from './tools/search-xrefs.js';
import { GetStats } from './tools/get-stats.js';
import { GetTokenAnalytics } from './tools/get-token-analytics.js';
import { TokenAnalyticsCollector } from './stats/index.js';

export class SeuClaudeServer {
  private server: Server;
  private config: Config;
  private embedder: EmbeddingEngine;
  private store: VectorStore;
  private indexTool: IndexCodebase;
  private searchTool: SearchCodebase;
  private contextTool: ReadSemanticContext;
  private xrefsTool: SearchXrefs;
  private statsTool: GetStats;
  private tokenAnalyticsTool: GetTokenAnalytics;
  private tokenAnalytics: TokenAnalyticsCollector;
  private log = logger.child('server');
  private initialized = false;

  constructor(config?: Partial<Config>) {
    this.config = loadConfig(config);
    this.embedder = new EmbeddingEngine(this.config);
    this.store = new VectorStore(this.config);
    this.indexTool = new IndexCodebase(this.config, this.embedder, this.store);
    this.searchTool = new SearchCodebase(this.embedder, this.store);
    this.contextTool = new ReadSemanticContext(this.store);
    this.xrefsTool = new SearchXrefs(this.config);
    this.statsTool = new GetStats(this.config);
    this.tokenAnalyticsTool = new GetTokenAnalytics(this.config);
    this.tokenAnalytics = new TokenAnalyticsCollector(this.config);

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
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
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
          case 'search_xrefs':
            return await this.handleSearchXrefs(args);
          case 'get_stats':
            return await this.handleGetStats(args);
          case 'get_token_analytics':
            return await this.handleGetTokenAnalytics(args);
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
              description: 'Number of lines of context to include before and after. Default: 5.',
            },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'search_xrefs',
        description:
          'Search cross-references to find callers and callees of a function or method. Use this to understand how functions are connected, who calls what, and the dependency graph of the codebase.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description:
                'The function or method name to search for. Example: "handleRequest" or "processPayment"',
            },
            direction: {
              type: 'string',
              enum: ['callers', 'callees', 'both'],
              description:
                'Direction to search: "callers" (who calls this), "callees" (what this calls), or "both". Default: "both"',
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of results to return. Default: 20.',
            },
          },
          required: ['symbol'],
        },
      },
      {
        name: 'get_stats',
        description:
          'Get comprehensive statistics about the indexed codebase including file counts, chunk counts, language breakdown, cross-reference counts, and storage usage. Use this to understand the current state of the index.',
        inputSchema: {
          type: 'object',
          properties: {
            verbose: {
              type: 'boolean',
              description: 'Include detailed storage breakdown. Default: false.',
            },
          },
        },
      },
      {
        name: 'get_token_analytics',
        description:
          'Get token consumption analytics showing how many tokens were used vs saved by using semantic search. Includes cost estimation and session statistics. Use this to understand the ROI of using seu-claude.',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['summary', 'json', 'csv'],
              description: 'Output format. summary (default), json, or csv for export.',
            },
          },
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

    let text: string;
    if (result.success) {
      const parts = [
        `Successfully indexed ${result.filesProcessed} files with ${result.chunksCreated} code chunks in ${(result.durationMs / 1000).toFixed(1)}s.`,
      ];

      if (result.filesSkipped > 0 || result.filesDeleted > 0) {
        const stats = [];
        if (result.filesSkipped > 0) stats.push(`${result.filesSkipped} unchanged`);
        if (result.filesUpdated > 0) stats.push(`${result.filesUpdated} updated`);
        if (result.filesDeleted > 0) stats.push(`${result.filesDeleted} deleted`);
        parts.push(`\n(${stats.join(', ')})`);
      }

      if (Object.keys(result.languages).length > 0) {
        parts.push(
          `\n\nLanguages: ${Object.entries(result.languages)
            .map(([lang, count]) => `${lang}: ${count}`)
            .join(', ')}`
        );
      }

      text = parts.join('');
    } else {
      text = `Indexing failed: ${result.error}`;
    }

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

    const query = args.query as string;
    const results = await this.searchTool.execute({
      query,
      limit: args.limit as number | undefined,
      filterType: args.filter_type as string | undefined,
      filterLanguage: args.filter_language as string | undefined,
    });

    const text = this.searchTool.formatForClaude(results);

    // Track token analytics for this query
    try {
      this.tokenAnalytics.recordQuery(query, text, results.length);
    } catch {
      // Don't fail the search if analytics fails
      this.log.debug('Failed to record token analytics');
    }

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

  private async handleSearchXrefs(
    args: Record<string, unknown> | undefined
  ): Promise<{ content: { type: string; text: string }[] }> {
    if (!args?.symbol) {
      throw new Error('symbol parameter is required');
    }

    await this.xrefsTool.initialize();

    const result = await this.xrefsTool.execute({
      symbol: args.symbol as string,
      direction: (args.direction as 'callers' | 'callees' | 'both') ?? 'both',
      maxResults: (args.max_results as number) ?? 20,
    });

    return {
      content: [{ type: 'text', text: result }],
    };
  }

  private async handleGetStats(
    args: Record<string, unknown> | undefined
  ): Promise<{ content: { type: string; text: string }[] }> {
    const verbose = (args?.verbose as boolean) ?? false;

    const stats = await this.statsTool.execute({ verbose });
    const text = this.statsTool.formatForClaude(stats, verbose);

    return {
      content: [{ type: 'text', text }],
    };
  }

  private async handleGetTokenAnalytics(
    args: Record<string, unknown> | undefined
  ): Promise<{ content: { type: string; text: string }[] }> {
    const format = (args?.format as 'summary' | 'json' | 'csv') ?? 'summary';

    const { formatted } = await this.tokenAnalyticsTool.execute({ format });

    return {
      content: [{ type: 'text', text: formatted }],
    };
  }

  async start(): Promise<void> {
    // Initialize token analytics
    await this.tokenAnalytics.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.log.info('seu-claude MCP server started');
  }

  async stop(): Promise<void> {
    // Save token analytics before stopping
    await this.tokenAnalytics.save();

    this.store.close();
    await this.server.close();
    this.log.info('seu-claude MCP server stopped');
  }
}
