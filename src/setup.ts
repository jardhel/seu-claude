#!/usr/bin/env node

/**
 * Interactive setup script for seu-claude
 * Automatically configures Claude Code and Claude Desktop
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const CLAUDE_CODE_CONFIG = '.claude/settings.json';
const CLAUDE_DESKTOP_CONFIG = {
  darwin: join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json'),
  win32: join(process.env.APPDATA ?? '', 'Claude/claude_desktop_config.json'),
  linux: join(homedir(), '.config/Claude/claude_desktop_config.json'),
};

interface MCPConfig {
  mcpServers?: {
    [key: string]: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    };
  };
}

/* eslint-disable no-console */
function log(message: string, emoji = '🔧'): void {
  console.log(`${emoji} ${message}`);
}

function error(message: string): void {
  console.error(`❌ ${message}`);
}

function success(message: string): void {
  console.log(`✅ ${message}`);
}
/* eslint-enable no-console */

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

async function configureClaudeCode(projectRoot: string): Promise<boolean> {
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

/* eslint-disable no-console */
export async function runSetup(): Promise<void> {
  console.log('\n🧠 seu-claude Setup\n');

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
  claudeCodeSuccess = await configureClaudeCode(projectRoot);

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
/* eslint-enable no-console */

// Direct execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    error(`Setup failed: ${message}`);
    process.exit(1);
  });
}
