#!/usr/bin/env node

/**
 * Doctor command - validates seu-claude installation and configuration
 * Run with: seu-claude doctor
 */

import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fix?: string;
}

const CLAUDE_CODE_CONFIG = '.claude/settings.json';
const CLAUDE_DESKTOP_CONFIG = {
  darwin: join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json'),
  win32: join(process.env.APPDATA ?? '', 'Claude/claude_desktop_config.json'),
  linux: join(homedir(), '.config/Claude/claude_desktop_config.json'),
};

function printCheck(result: CheckResult): void {
  const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
  console.log(`${icon} ${result.name}: ${result.message}`);
  if (result.fix && result.status !== 'pass') {
    console.log(`   💡 Fix: ${result.fix}`);
  }
}

function checkNodeVersion(): CheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);

  if (major >= 20) {
    return {
      name: 'Node.js Version',
      status: 'pass',
      message: `${version} (>= 20 required)`,
    };
  }

  return {
    name: 'Node.js Version',
    status: 'fail',
    message: `${version} (>= 20 required)`,
    fix: 'Install Node.js 20 or later: https://nodejs.org/',
  };
}

function checkGitRepo(): CheckResult {
  try {
    execSync('git rev-parse --show-toplevel', {
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return {
      name: 'Git Repository',
      status: 'pass',
      message: 'Current directory is a git repository',
    };
  } catch {
    return {
      name: 'Git Repository',
      status: 'warn',
      message: 'Not in a git repository',
      fix: 'Run from your project root or initialize: git init',
    };
  }
}

async function checkClaudeCodeConfig(): Promise<CheckResult> {
  const cwd = process.cwd();
  const configPath = join(cwd, CLAUDE_CODE_CONFIG);

  if (!existsSync(configPath)) {
    return {
      name: 'Claude Code Config',
      status: 'warn',
      message: `.claude/settings.json not found in ${cwd}`,
      fix: 'Run: seu-claude setup',
    };
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as { mcpServers?: Record<string, unknown> };

    if (config.mcpServers?.['seu-claude']) {
      return {
        name: 'Claude Code Config',
        status: 'pass',
        message: 'seu-claude MCP server configured',
      };
    }

    return {
      name: 'Claude Code Config',
      status: 'warn',
      message: 'seu-claude not found in mcpServers',
      fix: 'Run: seu-claude setup',
    };
  } catch (err) {
    return {
      name: 'Claude Code Config',
      status: 'fail',
      message: `Error reading config: ${err instanceof Error ? err.message : String(err)}`,
      fix: 'Check .claude/settings.json syntax',
    };
  }
}

async function checkClaudeDesktopConfig(): Promise<CheckResult> {
  const platform = process.platform as keyof typeof CLAUDE_DESKTOP_CONFIG;
  const configPath = CLAUDE_DESKTOP_CONFIG[platform];

  if (!configPath) {
    return {
      name: 'Claude Desktop Config',
      status: 'warn',
      message: `Unsupported platform: ${platform}`,
    };
  }

  if (!existsSync(configPath)) {
    return {
      name: 'Claude Desktop Config',
      status: 'warn',
      message: 'Config file not found',
      fix: 'Run: seu-claude setup (or install Claude Desktop first)',
    };
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as { mcpServers?: Record<string, unknown> };

    if (config.mcpServers?.['seu-claude']) {
      return {
        name: 'Claude Desktop Config',
        status: 'pass',
        message: 'seu-claude MCP server configured',
      };
    }

    return {
      name: 'Claude Desktop Config',
      status: 'warn',
      message: 'seu-claude not found in mcpServers',
      fix: 'Run: seu-claude setup',
    };
  } catch (err) {
    return {
      name: 'Claude Desktop Config',
      status: 'fail',
      message: `Error reading config: ${err instanceof Error ? err.message : String(err)}`,
      fix: `Check ${configPath} syntax`,
    };
  }
}

function checkDataDirectory(): CheckResult {
  const dataDir = process.env.DATA_DIR ?? join(homedir(), '.seu-claude');

  if (existsSync(dataDir)) {
    const indexPath = join(dataDir, 'index.lance');
    if (existsSync(indexPath)) {
      return {
        name: 'Data Directory',
        status: 'pass',
        message: `Index exists at ${dataDir}`,
      };
    }
    return {
      name: 'Data Directory',
      status: 'warn',
      message: `Directory exists but no index found at ${dataDir}`,
      fix: 'Run: "Index this codebase" in Claude',
    };
  }

  return {
    name: 'Data Directory',
    status: 'warn',
    message: `Data directory not created yet: ${dataDir}`,
    fix: 'Will be created on first index',
  };
}

function checkProjectRoot(): CheckResult {
  const projectRoot = process.env.PROJECT_ROOT;

  if (!projectRoot) {
    return {
      name: 'PROJECT_ROOT',
      status: 'warn',
      message: 'Not set (will use current directory)',
    };
  }

  if (existsSync(projectRoot)) {
    return {
      name: 'PROJECT_ROOT',
      status: 'pass',
      message: projectRoot,
    };
  }

  return {
    name: 'PROJECT_ROOT',
    status: 'fail',
    message: `Directory not found: ${projectRoot}`,
    fix: 'Update PROJECT_ROOT in your config',
  };
}

function checkEmbeddingModel(): CheckResult {
  const model = process.env.EMBEDDING_MODEL ?? 'Xenova/all-MiniLM-L6-v2';
  const cacheDir = join(homedir(), '.cache', 'huggingface');

  // Check if model might be cached
  if (existsSync(cacheDir)) {
    return {
      name: 'Embedding Model',
      status: 'pass',
      message: `${model} (HuggingFace cache exists)`,
    };
  }

  return {
    name: 'Embedding Model',
    status: 'warn',
    message: `${model} (will download on first use)`,
    fix: 'Model downloads automatically (~30MB)',
  };
}

function checkTreeSitterGrammars(): CheckResult {
  const languagesDir = join(dirname(new URL(import.meta.url).pathname), '..', 'languages');

  if (existsSync(languagesDir)) {
    const files = readdirSync(languagesDir);
    const wasmFiles = files.filter((f: string) => f.endsWith('.wasm'));

    if (wasmFiles.length > 0) {
      return {
        name: 'Tree-sitter Grammars',
        status: 'pass',
        message: `${wasmFiles.length} language grammars available`,
      };
    }
  }

  return {
    name: 'Tree-sitter Grammars',
    status: 'warn',
    message: 'Language grammars not found',
    fix: 'Run: npm run download-grammars',
  };
}

export async function runDoctor(): Promise<void> {
  console.log('\n🩺 seu-claude Doctor\n');
  console.log('Checking installation and configuration...\n');

  const checks = [
    checkNodeVersion(),
    checkGitRepo(),
    checkProjectRoot(),
    await checkClaudeCodeConfig(),
    await checkClaudeDesktopConfig(),
    checkDataDirectory(),
    checkEmbeddingModel(),
    checkTreeSitterGrammars(),
  ];

  console.log('─'.repeat(50));

  for (const check of checks) {
    printCheck(check);
  }

  console.log('─'.repeat(50));

  const passed = checks.filter(c => c.status === 'pass').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;

  console.log(`\n📊 Summary: ${passed} passed, ${warnings} warnings, ${failed} failed`);

  if (failed > 0) {
    console.log('\n❌ Some checks failed. Please fix the issues above.');
    process.exit(1);
  } else if (warnings > 0) {
    console.log('\n⚠️ Some checks have warnings. Everything should still work.');
    console.log('   Run "seu-claude setup" to configure missing items.');
  } else {
    console.log('\n✅ All checks passed! seu-claude is ready to use.');
  }

  console.log('\n📚 Next steps:');
  console.log('   1. In Claude: "Index this codebase for semantic search"');
  console.log('   2. Then ask: "Where is the authentication logic?"');
  console.log('\n');
}

// Direct execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  runDoctor().catch((err: unknown) => {
    console.error(`Doctor failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
