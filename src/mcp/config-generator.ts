/**
 * MCP Configuration Generator
 *
 * Generates MCP server configurations for multiple agentic tools:
 * - Claude Code / Claude Desktop
 * - GitHub Copilot
 * - OpenAI Codex
 * - Continue.dev
 * - Cursor
 * - Cline
 * - Windsurf
 * - Aider
 * - Custom configurations
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type AgentTool =
  | 'claude'
  | 'copilot'
  | 'codex'
  | 'continue'
  | 'cursor'
  | 'cline'
  | 'windsurf'
  | 'aider'
  | 'generic';

export interface MCPServerConfig {
  type?: 'stdio' | 'sse' | 'http';
  command: string;
  args: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  alwaysAllow?: string[];
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface ConfigOptions {
  projectRoot?: string;
  dataDir?: string;
  useNpx?: boolean;
  useGlobal?: boolean;
  nodePath?: string;
  serverName?: string;
  additionalEnv?: Record<string, string>;
}

/**
 * Configuration templates for different agentic tools
 */
export const CONFIG_TEMPLATES: Record<
  AgentTool,
  {
    filename: string;
    directory: string;
    format: 'json' | 'jsonc';
    wrapKey?: string;
    description: string;
  }
> = {
  claude: {
    filename: 'settings.json',
    directory: '.claude',
    format: 'json',
    wrapKey: 'mcpServers',
    description: 'Claude Code / Claude Desktop',
  },
  copilot: {
    filename: 'mcp.json',
    directory: '.github',
    format: 'json',
    wrapKey: 'servers',
    description: 'GitHub Copilot',
  },
  codex: {
    filename: 'mcp-servers.json',
    directory: '.codex',
    format: 'json',
    wrapKey: 'servers',
    description: 'OpenAI Codex',
  },
  continue: {
    filename: 'config.json',
    directory: '.continue',
    format: 'jsonc',
    wrapKey: 'mcpServers',
    description: 'Continue.dev',
  },
  cursor: {
    filename: 'mcp.json',
    directory: '.cursor',
    format: 'json',
    wrapKey: 'mcpServers',
    description: 'Cursor IDE',
  },
  cline: {
    filename: 'mcp_settings.json',
    directory: '.cline',
    format: 'json',
    wrapKey: 'mcpServers',
    description: 'Cline VS Code Extension',
  },
  windsurf: {
    filename: 'mcp.json',
    directory: '.windsurf',
    format: 'json',
    wrapKey: 'mcpServers',
    description: 'Windsurf IDE',
  },
  aider: {
    filename: '.aider.mcp.json',
    directory: '.',
    format: 'json',
    wrapKey: 'mcpServers',
    description: 'Aider AI Pair Programmer',
  },
  generic: {
    filename: '.mcp.json',
    directory: '.',
    format: 'json',
    wrapKey: 'mcpServers',
    description: 'Generic MCP Configuration',
  },
};

/**
 * Generates MCP server configuration for a specific tool
 */
export function generateServerConfig(options: ConfigOptions = {}): MCPServerConfig {
  const {
    projectRoot,
    dataDir,
    useNpx = true,
    useGlobal = false,
    nodePath,
    additionalEnv = {},
  } = options;

  const env: Record<string, string> = { ...additionalEnv };

  if (projectRoot) {
    env.PROJECT_ROOT = projectRoot;
  }

  if (dataDir) {
    env.DATA_DIR = dataDir;
  }

  let command: string;
  let args: string[];

  if (useNpx) {
    command = 'npx';
    args = ['seu-claude'];
  } else if (useGlobal) {
    command = 'seu-claude';
    args = [];
  } else if (nodePath) {
    command = 'node';
    args = [nodePath];
  } else {
    command = 'npx';
    args = ['seu-claude'];
  }

  return {
    type: 'stdio',
    command,
    args,
    ...(Object.keys(env).length > 0 ? { env } : {}),
  };
}

/**
 * Generates full MCP configuration for a specific agentic tool
 */
export function generateConfig(
  tool: AgentTool,
  options: ConfigOptions = {}
): MCPConfig | Record<string, unknown> {
  const template = CONFIG_TEMPLATES[tool];
  const serverName = options.serverName || 'seu-claude';
  const serverConfig = generateServerConfig(options);

  if (template.wrapKey) {
    return {
      [template.wrapKey]: {
        [serverName]: serverConfig,
      },
    };
  }

  return {
    [serverName]: serverConfig,
  };
}

/**
 * Generates configuration for all supported tools
 */
export function generateAllConfigs(
  options: ConfigOptions = {}
): Record<AgentTool, MCPConfig | Record<string, unknown>> {
  const configs: Partial<Record<AgentTool, MCPConfig | Record<string, unknown>>> = {};

  for (const tool of Object.keys(CONFIG_TEMPLATES) as AgentTool[]) {
    configs[tool] = generateConfig(tool, options);
  }

  return configs as Record<AgentTool, MCPConfig | Record<string, unknown>>;
}

/**
 * Writes configuration file for a specific tool
 */
export function writeConfig(tool: AgentTool, baseDir: string, options: ConfigOptions = {}): string {
  const template = CONFIG_TEMPLATES[tool];
  const config = generateConfig(tool, options);

  const targetDir = join(baseDir, template.directory);
  const targetPath = join(targetDir, template.filename);

  // Create directory if it doesn't exist
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const content = JSON.stringify(config, null, 2);
  writeFileSync(targetPath, content, 'utf-8');

  return targetPath;
}

/**
 * Writes configurations for multiple tools
 */
export function writeConfigs(
  tools: AgentTool[],
  baseDir: string,
  options: ConfigOptions = {}
): string[] {
  return tools.map(tool => writeConfig(tool, baseDir, options));
}

/**
 * Gets installation instructions for a specific tool
 */
export function getInstallInstructions(tool: AgentTool): string {
  const template = CONFIG_TEMPLATES[tool];
  const configPath = join(template.directory, template.filename);

  const instructions: Record<AgentTool, string> = {
    claude: `
# Claude Code / Claude Desktop Setup

1. Create the configuration file:
   mkdir -p .claude
   npx seu-claude /setup claude

2. Or manually create ${configPath}:
   {
     "mcpServers": {
       "seu-claude": {
         "command": "npx",
         "args": ["seu-claude"],
         "env": { "PROJECT_ROOT": "." }
       }
     }
   }

3. Restart Claude Code or Claude Desktop
`,
    copilot: `
# GitHub Copilot Setup

1. Create the configuration file:
   mkdir -p .github
   npx seu-claude /setup copilot

2. Or manually create ${configPath}:
   {
     "servers": {
       "seu-claude": {
         "type": "stdio",
         "command": "npx",
         "args": ["seu-claude"]
       }
     }
   }

3. Copilot will automatically detect the MCP server
`,
    codex: `
# OpenAI Codex Setup

1. Create the configuration file:
   mkdir -p .codex
   npx seu-claude /setup codex

2. Or manually create ${configPath}:
   {
     "servers": {
       "seu-claude": {
         "type": "stdio",
         "command": "npx",
         "args": ["seu-claude"]
       }
     }
   }

3. Configure Codex to use MCP servers from ${configPath}
`,
    continue: `
# Continue.dev Setup

1. Create the configuration file:
   npx seu-claude /setup continue

2. Or add to your existing ~/.continue/config.json:
   {
     "mcpServers": {
       "seu-claude": {
         "command": "npx",
         "args": ["seu-claude"]
       }
     }
   }

3. Restart Continue or reload the configuration
`,
    cursor: `
# Cursor IDE Setup

1. Create the configuration file:
   mkdir -p .cursor
   npx seu-claude /setup cursor

2. Or manually create ${configPath}:
   {
     "mcpServers": {
       "seu-claude": {
         "type": "stdio",
         "command": "npx",
         "args": ["seu-claude"]
       }
     }
   }

3. Restart Cursor to load the MCP server
`,
    cline: `
# Cline VS Code Extension Setup

1. Create the configuration file:
   mkdir -p .cline
   npx seu-claude /setup cline

2. Or manually create ${configPath}:
   {
     "mcpServers": {
       "seu-claude": {
         "command": "npx",
         "args": ["seu-claude"]
       }
     }
   }

3. Reload VS Code window (Cmd/Ctrl+Shift+P -> "Reload Window")
`,
    windsurf: `
# Windsurf IDE Setup

1. Create the configuration file:
   mkdir -p .windsurf
   npx seu-claude /setup windsurf

2. Or manually create ${configPath}:
   {
     "mcpServers": {
       "seu-claude": {
         "type": "stdio",
         "command": "npx",
         "args": ["seu-claude"]
       }
     }
   }

3. Restart Windsurf to enable the MCP server
`,
    aider: `
# Aider Setup

1. Create the configuration file:
   npx seu-claude /setup aider

2. Or manually create ${configPath}:
   {
     "mcpServers": {
       "seu-claude": {
         "command": "npx",
         "args": ["seu-claude"]
       }
     }
   }

3. Run aider with MCP support enabled
`,
    generic: `
# Generic MCP Configuration

1. Create the configuration file:
   npx seu-claude /setup generic

2. Or manually create ${configPath}:
   {
     "mcpServers": {
       "seu-claude": {
         "type": "stdio",
         "command": "npx",
         "args": ["seu-claude"],
         "env": {
           "PROJECT_ROOT": "."
         }
       }
     }
   }

3. Point your MCP-compatible tool to this configuration file
`,
  };

  return instructions[tool];
}

/**
 * Lists all supported tools with descriptions
 */
export function listSupportedTools(): Array<{
  tool: AgentTool;
  description: string;
  configPath: string;
}> {
  return Object.entries(CONFIG_TEMPLATES).map(([tool, template]) => ({
    tool: tool as AgentTool,
    description: template.description,
    configPath: join(template.directory, template.filename),
  }));
}

/**
 * Detects which agentic tools might be in use based on existing config files
 */
export function detectExistingTools(baseDir: string): AgentTool[] {
  const detected: AgentTool[] = [];

  for (const [tool, template] of Object.entries(CONFIG_TEMPLATES)) {
    const configPath = join(baseDir, template.directory, template.filename);
    if (existsSync(configPath)) {
      detected.push(tool as AgentTool);
    }
  }

  return detected;
}

export default {
  generateServerConfig,
  generateConfig,
  generateAllConfigs,
  writeConfig,
  writeConfigs,
  getInstallInstructions,
  listSupportedTools,
  detectExistingTools,
  CONFIG_TEMPLATES,
};
