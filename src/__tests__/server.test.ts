import { SeuClaudeServer } from '../server.js';
import { Config } from '../utils/config.js';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SeuClaudeServer', () => {
  let testDir: string;
  let config: Partial<Config>;

  beforeEach(async () => {
    testDir = join(tmpdir(), `seu-claude-server-test-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });

    config = {
      projectRoot: testDir,
      dataDir: join(testDir, '.seu-claude'),
    };
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create a SeuClaudeServer instance with default config', () => {
      const server = new SeuClaudeServer();
      expect(server).toBeInstanceOf(SeuClaudeServer);
    });

    it('should create a SeuClaudeServer instance with custom config', () => {
      const server = new SeuClaudeServer(config);
      expect(server).toBeInstanceOf(SeuClaudeServer);
    });

    it('should accept partial config', () => {
      const server = new SeuClaudeServer({
        projectRoot: testDir,
        embeddingDimensions: 128,
      });
      expect(server).toBeInstanceOf(SeuClaudeServer);
    });
  });

  describe('stop', () => {
    it('should stop without error', async () => {
      const server = new SeuClaudeServer(config);
      // stop closes the store and server - should not throw
      await expect(server.stop()).resolves.toBeUndefined();
    });
  });
});

describe('SeuClaudeServer - Tool Definitions', () => {
  it('should define index_codebase tool', () => {
    const server = new SeuClaudeServer();

    // Access private method via prototype - not ideal but necessary for testing
    const tools = (
      server as unknown as { getToolDefinitions: () => unknown[] }
    ).getToolDefinitions();

    const indexTool = tools.find((t: unknown) => (t as { name: string }).name === 'index_codebase');
    expect(indexTool).toBeDefined();
    expect((indexTool as { description: string }).description).toContain('Index the codebase');
  });

  it('should define search_codebase tool', () => {
    const server = new SeuClaudeServer();
    const tools = (
      server as unknown as { getToolDefinitions: () => unknown[] }
    ).getToolDefinitions();

    const searchTool = tools.find(
      (t: unknown) => (t as { name: string }).name === 'search_codebase'
    );
    expect(searchTool).toBeDefined();
    expect((searchTool as { description: string }).description).toContain(
      'Search the indexed codebase'
    );
  });

  it('should define read_semantic_context tool', () => {
    const server = new SeuClaudeServer();
    const tools = (
      server as unknown as { getToolDefinitions: () => unknown[] }
    ).getToolDefinitions();

    const contextTool = tools.find(
      (t: unknown) => (t as { name: string }).name === 'read_semantic_context'
    );
    expect(contextTool).toBeDefined();
    expect((contextTool as { description: string }).description).toContain('semantic context');
  });

  it('should have correct input schemas', () => {
    const server = new SeuClaudeServer();
    const tools = (
      server as unknown as { getToolDefinitions: () => unknown[] }
    ).getToolDefinitions();

    // index_codebase should have path and force properties
    const indexTool = tools.find((t: unknown) => (t as { name: string }).name === 'index_codebase');
    const indexSchema = (indexTool as { inputSchema: { properties: Record<string, unknown> } })
      .inputSchema;
    expect(indexSchema.properties).toHaveProperty('path');
    expect(indexSchema.properties).toHaveProperty('force');

    // search_codebase should require query
    const searchTool = tools.find(
      (t: unknown) => (t as { name: string }).name === 'search_codebase'
    );
    const searchSchema = (searchTool as { inputSchema: { required: string[] } }).inputSchema;
    expect(searchSchema.required).toContain('query');

    // read_semantic_context should require file_path
    const contextTool = tools.find(
      (t: unknown) => (t as { name: string }).name === 'read_semantic_context'
    );
    const contextSchema = (contextTool as { inputSchema: { required: string[] } }).inputSchema;
    expect(contextSchema.required).toContain('file_path');
  });
});

describe('SeuClaudeServer - Configuration', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `seu-claude-config-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should use provided config values', () => {
    const customConfig = {
      projectRoot: testDir,
      embeddingDimensions: 128,
      maxChunkTokens: 256,
    };

    const server = new SeuClaudeServer(customConfig);
    expect(server).toBeInstanceOf(SeuClaudeServer);
  });

  it('should merge partial config with defaults', () => {
    const partialConfig = {
      projectRoot: testDir,
    };

    const server = new SeuClaudeServer(partialConfig);
    expect(server).toBeInstanceOf(SeuClaudeServer);
  });

  it('should handle empty config', () => {
    const server = new SeuClaudeServer({});
    expect(server).toBeInstanceOf(SeuClaudeServer);
  });
});

describe('SeuClaudeServer - Error Handling', () => {
  it('should be instantiable', () => {
    // Just verify the server can be created
    const server = new SeuClaudeServer();
    expect(server).toBeDefined();
  });
});

describe('SeuClaudeServer - Lifecycle', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `seu-claude-lifecycle-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should allow multiple stop calls', async () => {
    const server = new SeuClaudeServer({
      projectRoot: testDir,
      dataDir: join(testDir, '.seu-claude'),
    });

    await server.stop();
    // Second stop should not throw
    await expect(server.stop()).resolves.toBeUndefined();
  });
});

describe('SeuClaudeServer - search_xrefs Tool', () => {
  it('should define search_xrefs tool', () => {
    const server = new SeuClaudeServer();
    const tools = (
      server as unknown as { getToolDefinitions: () => unknown[] }
    ).getToolDefinitions();

    const xrefsTool = tools.find((t: unknown) => (t as { name: string }).name === 'search_xrefs');
    expect(xrefsTool).toBeDefined();
    expect((xrefsTool as { description: string }).description).toContain('cross-references');
  });

  it('should have correct input schema for search_xrefs', () => {
    const server = new SeuClaudeServer();
    const tools = (
      server as unknown as { getToolDefinitions: () => unknown[] }
    ).getToolDefinitions();

    const xrefsTool = tools.find((t: unknown) => (t as { name: string }).name === 'search_xrefs');
    const schema = (
      xrefsTool as { inputSchema: { properties: Record<string, unknown>; required: string[] } }
    ).inputSchema;

    expect(schema.properties).toHaveProperty('symbol');
    expect(schema.properties).toHaveProperty('direction');
    expect(schema.properties).toHaveProperty('max_results');
    expect(schema.required).toContain('symbol');
  });

  it('should have direction enum with correct values', () => {
    const server = new SeuClaudeServer();
    const tools = (
      server as unknown as { getToolDefinitions: () => unknown[] }
    ).getToolDefinitions();

    const xrefsTool = tools.find((t: unknown) => (t as { name: string }).name === 'search_xrefs');
    const directionProp = (
      xrefsTool as { inputSchema: { properties: { direction: { enum: string[] } } } }
    ).inputSchema.properties.direction;

    expect(directionProp.enum).toContain('callers');
    expect(directionProp.enum).toContain('callees');
    expect(directionProp.enum).toContain('both');
  });
});

describe('SeuClaudeServer - Tool Schema Completeness', () => {
  it('should define all nine tools', () => {
    const server = new SeuClaudeServer();
    const tools = (
      server as unknown as { getToolDefinitions: () => unknown[] }
    ).getToolDefinitions();

    expect(tools).toHaveLength(9);

    const toolNames = tools.map((t: unknown) => (t as { name: string }).name);
    expect(toolNames).toContain('index_codebase');
    expect(toolNames).toContain('search_codebase');
    expect(toolNames).toContain('read_semantic_context');
    expect(toolNames).toContain('search_xrefs');
    expect(toolNames).toContain('get_stats');
    expect(toolNames).toContain('get_token_analytics');
    expect(toolNames).toContain('get_memory_profile');
    expect(toolNames).toContain('get_query_analytics');
    expect(toolNames).toContain('search_symbols');
  });

  it('should have descriptions for all tools', () => {
    const server = new SeuClaudeServer();
    const tools = (
      server as unknown as { getToolDefinitions: () => unknown[] }
    ).getToolDefinitions();

    for (const tool of tools) {
      const t = tool as { name: string; description: string };
      expect(t.description).toBeDefined();
      expect(t.description.length).toBeGreaterThan(10);
    }
  });

  it('should have input schemas for all tools', () => {
    const server = new SeuClaudeServer();
    const tools = (
      server as unknown as { getToolDefinitions: () => unknown[] }
    ).getToolDefinitions();

    for (const tool of tools) {
      const t = tool as { name: string; inputSchema: { type: string } };
      expect(t.inputSchema).toBeDefined();
      expect(t.inputSchema.type).toBe('object');
    }
  });
});
