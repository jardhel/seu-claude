import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  generateServerConfig,
  generateConfig,
  generateAllConfigs,
  writeConfig,
  listSupportedTools,
  detectExistingTools,
  CONFIG_TEMPLATES,
  type AgentTool,
} from './config-generator.js';

describe('MCP Config Generator', () => {
  const testDir = join(process.cwd(), '.test-mcp-config');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('generateServerConfig', () => {
    it('generates default npx config', () => {
      const config = generateServerConfig();
      expect(config.type).toBe('stdio');
      expect(config.command).toBe('npx');
      expect(config.args).toEqual(['seu-claude']);
    });

    it('generates config with project root', () => {
      const config = generateServerConfig({ projectRoot: '/my/project' });
      expect(config.env?.PROJECT_ROOT).toBe('/my/project');
    });

    it('generates global install config', () => {
      const config = generateServerConfig({ useGlobal: true, useNpx: false });
      expect(config.command).toBe('seu-claude');
      expect(config.args).toEqual([]);
    });

    it('generates node path config', () => {
      const config = generateServerConfig({
        nodePath: '/path/to/dist/v2.js',
        useNpx: false,
      });
      expect(config.command).toBe('node');
      expect(config.args).toEqual(['/path/to/dist/v2.js']);
    });

    it('includes additional env vars', () => {
      const config = generateServerConfig({
        additionalEnv: { CUSTOM_VAR: 'value' },
      });
      expect(config.env?.CUSTOM_VAR).toBe('value');
    });
  });

  describe('generateConfig', () => {
    it('generates Claude config with correct wrapper', () => {
      const config = generateConfig('claude');
      expect(config).toHaveProperty('mcpServers');
      expect((config as any).mcpServers['seu-claude']).toBeDefined();
    });

    it('generates Copilot config with correct wrapper', () => {
      const config = generateConfig('copilot');
      expect(config).toHaveProperty('servers');
      expect((config as any).servers['seu-claude']).toBeDefined();
    });

    it('uses custom server name', () => {
      const config = generateConfig('claude', { serverName: 'my-server' });
      expect((config as any).mcpServers['my-server']).toBeDefined();
    });
  });

  describe('generateAllConfigs', () => {
    it('generates configs for all tools', () => {
      const configs = generateAllConfigs();
      const tools = Object.keys(CONFIG_TEMPLATES) as AgentTool[];
      for (const tool of tools) {
        expect(configs[tool]).toBeDefined();
      }
    });
  });

  describe('writeConfig', () => {
    it('writes Claude config to correct location', () => {
      const path = writeConfig('claude', testDir);
      expect(existsSync(path)).toBe(true);
      expect(path).toContain('.claude/settings.json');

      const content = JSON.parse(readFileSync(path, 'utf-8'));
      expect(content.mcpServers).toBeDefined();
    });

    it('writes Copilot config to correct location', () => {
      const path = writeConfig('copilot', testDir);
      expect(existsSync(path)).toBe(true);
      expect(path).toContain('.github/mcp.json');

      const content = JSON.parse(readFileSync(path, 'utf-8'));
      expect(content.servers).toBeDefined();
    });

    it('creates directories if needed', () => {
      const path = writeConfig('cursor', testDir);
      expect(existsSync(join(testDir, '.cursor'))).toBe(true);
      expect(existsSync(path)).toBe(true);
    });
  });

  describe('listSupportedTools', () => {
    it('returns all supported tools', () => {
      const tools = listSupportedTools();
      expect(tools.length).toBe(Object.keys(CONFIG_TEMPLATES).length);
      for (const { tool, description, configPath } of tools) {
        expect(typeof tool).toBe('string');
        expect(typeof description).toBe('string');
        expect(typeof configPath).toBe('string');
      }
    });
  });

  describe('detectExistingTools', () => {
    it('detects no configs in empty directory', () => {
      const detected = detectExistingTools(testDir);
      expect(detected).toEqual([]);
    });

    it('detects existing Claude config', () => {
      writeConfig('claude', testDir);
      const detected = detectExistingTools(testDir);
      expect(detected).toContain('claude');
    });

    it('detects multiple configs', () => {
      writeConfig('claude', testDir);
      writeConfig('cursor', testDir);
      const detected = detectExistingTools(testDir);
      expect(detected).toContain('claude');
      expect(detected).toContain('cursor');
    });
  });

  describe('CONFIG_TEMPLATES', () => {
    it('has correct structure for all tools', () => {
      for (const [_tool, template] of Object.entries(CONFIG_TEMPLATES)) {
        expect(typeof template.filename).toBe('string');
        expect(typeof template.directory).toBe('string');
        expect(['json', 'jsonc']).toContain(template.format);
        expect(typeof template.description).toBe('string');
      }
    });
  });
});
