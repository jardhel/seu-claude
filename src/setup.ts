#!/usr/bin/env node

/**
 * Interactive setup script for seu-claude
 * Automatically configures Claude Code and Claude Desktop
 */

import { readFile, writeFile, mkdir, copyFile, readdir } from 'fs/promises';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const CLAUDE_CODE_CONFIG = '.claude/settings.json';
const CLAUDE_CODE_AGENTS_DIR = '.claude/agents';
const CLAUDE_DESKTOP_CONFIG = {
  darwin: join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json'),
  win32: join(process.env.APPDATA ?? '', 'Claude/claude_desktop_config.json'),
  linux: join(homedir(), '.config/Claude/claude_desktop_config.json'),
};

interface SetupOptions {
  installSubagents?: boolean;
}

interface MCPConfig {
  mcpServers?: {
    [key: string]: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    };
  };
}

function log(message: string, emoji = '🔧'): void {
  console.log(`${emoji} ${message}`);
}

function error(message: string): void {
  console.error(`❌ ${message}`);
}

function success(message: string): void {
  console.log(`✅ ${message}`);
}

function detectProjectRoot(): string | null {
  try {
    const cwd = process.cwd();
    // Check if we're in a git repo
    execSync('git rev-parse --show-toplevel', {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return cwd;
  } catch {
    return null;
  }
}

function parseSetupOptions(argv: string[]): SetupOptions {
  return {
    installSubagents:
      argv.includes('--subagents') ||
      argv.includes('--with-subagents') ||
      argv.includes('--install-subagents'),
  };
}

function getBundledAgentsDir(): string {
  // Works both from `src/` (dev) and `dist/` (published package).
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, '..', 'agents');
}

async function installClaudeCodeAgents(projectRoot: string): Promise<void> {
  const sourceDir = getBundledAgentsDir();
  const targetDir = join(projectRoot, CLAUDE_CODE_AGENTS_DIR);

  if (!existsSync(sourceDir)) {
    log('No bundled Claude Code subagents found (skipping)');
    return;
  }

  await mkdir(targetDir, { recursive: true });

  const entries = await readdir(sourceDir, { withFileTypes: true });
  const agentFiles = entries
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b));

  if (agentFiles.length === 0) {
    log('No bundled Claude Code subagents found (skipping)');
    return;
  }

  let installed = 0;
  let skipped = 0;

  for (const fileName of agentFiles) {
    const from = join(sourceDir, fileName);
    const to = join(targetDir, fileName);

    if (existsSync(to)) {
      skipped += 1;
      continue;
    }

    await copyFile(from, to);
    installed += 1;
  }

  if (installed > 0) {
    success(`Installed ${installed} Claude Code subagent${installed === 1 ? '' : 's'}.`);
    log(`Agents directory: ${targetDir}`);
  }

  if (skipped > 0) {
    log(`Skipped ${skipped} existing subagent file${skipped === 1 ? '' : 's'}.`);
  }
}

async function configureClaudeCode(projectRoot: string, options: SetupOptions): Promise<boolean> {
  const configPath = join(projectRoot, CLAUDE_CODE_CONFIG);
  const configDir = dirname(configPath);

  try {
    // Create .claude directory if it doesn't exist
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true });
      log('Created .claude directory');
    }

    let config: MCPConfig = {};

    // Read existing config if it exists
    if (existsSync(configPath)) {
      const content = await readFile(configPath, 'utf-8');
      config = JSON.parse(content) as MCPConfig;
      log('Found existing Claude Code config');
    }

    // Add or update seu-claude configuration
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    config.mcpServers['seu-claude'] = {
      command: 'npx',
      args: ['seu-claude'],
      env: {
        PROJECT_ROOT: '.',
      },
    };

    // Write updated config
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    success('Claude Code configured!');
    log(`Config file: ${configPath}`);

    if (options.installSubagents) {
      await installClaudeCodeAgents(projectRoot);
    }

    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to configure Claude Code: ${message}`);
    return false;
  }
}

async function configureClaudeDesktop(projectRoot: string): Promise<boolean> {
  const platform = process.platform as keyof typeof CLAUDE_DESKTOP_CONFIG;
  const configPath = CLAUDE_DESKTOP_CONFIG[platform];

  if (!configPath) {
    error(`Unsupported platform: ${platform}`);
    return false;
  }

  try {
    const configDir = dirname(configPath);

    // Create config directory if it doesn't exist
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true });
      log('Created Claude config directory');
    }

    let config: MCPConfig = {};

    // Read existing config if it exists
    if (existsSync(configPath)) {
      const content = await readFile(configPath, 'utf-8');
      config = JSON.parse(content) as MCPConfig;
      log('Found existing Claude Desktop config');
    }

    // Add or update seu-claude configuration
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    config.mcpServers['seu-claude'] = {
      command: 'npx',
      args: ['seu-claude'],
      env: {
        PROJECT_ROOT: projectRoot,
      },
    };

    // Write updated config
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    success('Claude Desktop configured!');
    log(`Config file: ${configPath}`);
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to configure Claude Desktop: ${message}`);
    return false;
  }
}

export async function runSetup(options?: SetupOptions): Promise<void> {
  console.log('\n🧠 seu-claude Setup\n');

  const parsedOptions = parseSetupOptions(process.argv);
  const resolvedOptions: SetupOptions = {
    installSubagents: options?.installSubagents ?? parsedOptions.installSubagents ?? false,
  };

  // Detect project root
  log('Detecting project...');
  const projectRoot = detectProjectRoot();

  if (!projectRoot) {
    error('Not in a git repository. Run this from your project root.');
    process.exit(1);
  }

  success(`Project root: ${projectRoot}`);

  // Ask user what to configure
  console.log('\nWhat would you like to configure?');
  console.log('1. Claude Code (project-specific)');
  console.log('2. Claude Desktop (global)');
  console.log('3. Both');

  // For non-interactive, configure both
  log('Configuring both Claude Code and Claude Desktop...\n');

  let claudeCodeSuccess = false;
  let claudeDesktopSuccess = false;

  // Configure Claude Code
  log('Configuring Claude Code...');
  claudeCodeSuccess = await configureClaudeCode(projectRoot, resolvedOptions);

  // Configure Claude Desktop
  log('\nConfiguring Claude Desktop...');
  claudeDesktopSuccess = await configureClaudeDesktop(projectRoot);

  // Summary
  console.log('\n📊 Setup Summary:');
  console.log(`   Claude Code: ${claudeCodeSuccess ? '✅' : '❌'}`);
  console.log(`   Claude Desktop: ${claudeDesktopSuccess ? '✅' : '❌'}`);

  if (claudeCodeSuccess || claudeDesktopSuccess) {
    console.log('\n🎉 Setup complete!');
    console.log('\nNext steps:');
    console.log('1. Restart Claude Code or Claude Desktop');
    console.log('2. Ask Claude: "Index this codebase for semantic search"');
    console.log('3. Start searching: "Where is the authentication logic?"');
    if (claudeCodeSuccess) {
      if (resolvedOptions.installSubagents) {
        console.log('4. (Claude Code) Try: "Use the seu-researcher subagent to locate X"');
      } else {
        console.log(
          '4. (Claude Code) Optional: re-run with `setup --subagents` to install helpers'
        );
      }
    }
    console.log('\n📚 Docs: https://github.com/jardhel/seu-claude#readme');
  } else {
    error('\nSetup failed. Please configure manually.');
    console.log('\nManual setup:');
    console.log('1. For Claude Code: Create .claude/settings.json in your project');
    console.log(
      '2. For Claude Desktop: Edit ~/Library/Application Support/Claude/claude_desktop_config.json'
    );
    console.log('3. Add the MCP server config - see README.md');
    process.exit(1);
  }
}

// Direct execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    error(`Setup failed: ${message}`);
    process.exit(1);
  });
}
