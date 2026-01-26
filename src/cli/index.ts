#!/usr/bin/env node
/**
 * Seu-Claude v2 CLI
 *
 * Slash commands for interacting with the v2 infrastructure:
 * - /plan   - Plan and track tasks with TaskManager
 * - /test   - Run tests in sandbox
 * - /nuke   - Reset state (context nuke)
 * - /deps   - Analyze dependencies
 * - /check  - Run pre-flight validation
 */

import { join } from 'path';
import { mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { ToolHandler } from '../mcp/handler.js';

const PROJECT_ROOT = process.cwd();
const DATA_DIR = join(PROJECT_ROOT, '.seu-claude-v2');

interface Command {
  name: string;
  description: string;
  usage: string;
  handler: (args: string[], handler: ToolHandler) => Promise<void>;
}

const COMMANDS: Record<string, Command> = {
  plan: {
    name: '/plan',
    description: 'Plan and track tasks with TaskManager',
    usage: '/plan [create <label> | list | tree | complete <id>]',
    handler: async (args, handler) => {
      const subcommand = args[0] || 'tree';

      switch (subcommand) {
        case 'create': {
          const label = args.slice(1).join(' ') || 'New Task';
          const result = await handler.handleTool('manage_task', {
            action: 'create',
            label,
          });
          console.log('✅ Task created:', JSON.stringify(result, null, 2));
          break;
        }
        case 'list': {
          const result = await handler.handleTool('manage_task', { action: 'list' });
          console.log(JSON.stringify(result, null, 2));
          break;
        }
        case 'tree': {
          const result = (await handler.handleTool('manage_task', { action: 'tree' })) as any;
          printTree(result.tree, 0);
          break;
        }
        case 'complete': {
          const taskId = args[1];
          if (!taskId) {
            console.error('❌ Task ID required');
            return;
          }
          await handler.handleTool('manage_task', {
            action: 'update',
            taskId,
            status: 'completed',
          });
          console.log('✅ Task marked complete');
          break;
        }
        default:
          console.log('Usage:', COMMANDS.plan.usage);
      }
    },
  },

  test: {
    name: '/test',
    description: 'Run tests in sandbox',
    usage: '/test [<test-file> | --all]',
    handler: async (args, handler) => {
      const testFile = args[0];

      if (testFile === '--all' || !testFile) {
        console.log('🧪 Running all tests...\n');
        const result = (await handler.handleTool('execute_sandbox', {
          command: 'npm',
          args: ['test', '--', '--run'],
          timeout: 120000,
        })) as any;

        console.log(result.stdout);
        if (result.stderr) console.error(result.stderr);
        console.log(`\n${result.exitCode === 0 ? '✅' : '❌'} Exit code: ${result.exitCode}`);
      } else {
        console.log(`🧪 Running tests: ${testFile}\n`);
        const result = (await handler.handleTool('execute_sandbox', {
          command: 'npm',
          args: ['test', '--', '--run', testFile],
          timeout: 60000,
        })) as any;

        console.log(result.stdout);
        if (result.stderr) console.error(result.stderr);
      }
    },
  },

  nuke: {
    name: '/nuke',
    description: 'Reset state (context nuke)',
    usage: '/nuke [--confirm]',
    handler: async (args, _handler) => {
      const confirmed = args.includes('--confirm');

      if (!confirmed) {
        console.log('⚠️  This will delete all task state and cached data.');
        console.log('   Run with --confirm to proceed: /nuke --confirm');
        return;
      }

      console.log('💥 Nuking context...');

      if (existsSync(DATA_DIR)) {
        await rm(DATA_DIR, { recursive: true, force: true });
        console.log(`   Deleted: ${DATA_DIR}`);
      }

      await mkdir(DATA_DIR, { recursive: true });
      console.log('✅ Context reset complete');
    },
  },

  deps: {
    name: '/deps',
    description: 'Analyze dependencies',
    usage: '/deps <entry-file> [--depth <n>]',
    handler: async (args, handler) => {
      if (args.length === 0) {
        console.log('Usage:', COMMANDS.deps.usage);
        return;
      }

      const entryFile = args[0];
      const depthIndex = args.indexOf('--depth');
      const maxDepth = depthIndex > -1 ? parseInt(args[depthIndex + 1], 10) : undefined;

      console.log(`🔍 Analyzing dependencies: ${entryFile}\n`);

      const result = (await handler.handleTool('analyze_dependency', {
        entryPoints: [entryFile],
        maxDepth,
      })) as any;

      console.log('📊 Statistics:');
      console.log(`   Files: ${result.stats.totalFiles}`);
      console.log(`   Imports: ${result.stats.totalImports}`);
      console.log(`   Symbols: ${result.stats.totalSymbols}`);
      console.log(`   Avg dependencies: ${result.stats.avgDependencies}`);
      console.log(`   Circular deps: ${result.stats.circularCount}`);

      if (result.circularDeps.length > 0) {
        console.log('\n⚠️  Circular dependencies detected:');
        result.circularDeps.forEach((cycle: string[]) => {
          console.log(`   ${cycle.map(f => f.split('/').pop()).join(' -> ')}`);
        });
      }

      console.log(
        '\n📁 Entry points:',
        result.roots.map((r: string) => r.split('/').pop()).join(', ')
      );
      console.log(
        '🍃 Leaf nodes:',
        result.leaves.map((l: string) => l.split('/').pop()).join(', ')
      );
    },
  },

  check: {
    name: '/check',
    description: 'Run pre-flight validation (lint + type check)',
    usage: '/check <file-or-dir> [--fix]',
    handler: async (args, handler) => {
      if (args.length === 0) {
        console.log('Usage:', COMMANDS.check.usage);
        return;
      }

      const path = args[0];
      const fix = args.includes('--fix');

      console.log(`🔎 Validating: ${path}${fix ? ' (with auto-fix)' : ''}\n`);

      const result = (await handler.handleTool('validate_code', {
        paths: [path],
        fix,
      })) as any;

      if (result.passed) {
        console.log('✅ All checks passed!');
      } else {
        console.log('❌ Validation failed:');
        console.log(`   Errors: ${result.totalErrors}`);
        console.log(`   Warnings: ${result.totalWarnings}`);

        for (const [validator, vResult] of Object.entries(result.validators) as any) {
          if (vResult.errors.length > 0) {
            console.log(`\n   ${validator}:`);
            vResult.errors.slice(0, 10).forEach((e: any) => {
              console.log(`   - ${e.file}:${e.line}: ${e.message}`);
            });
          }
        }
      }

      console.log(`\n⏱️  Duration: ${result.durationMs.toFixed(0)}ms`);
    },
  },

  find: {
    name: '/find',
    description: 'Find symbol definitions and usages',
    usage: '/find <symbol-name> <entry-file>',
    handler: async (args, handler) => {
      if (args.length < 2) {
        console.log('Usage:', COMMANDS.find.usage);
        return;
      }

      const symbolName = args[0];
      const entryFile = args[1];

      console.log(`🔍 Finding symbol: ${symbolName}\n`);

      const result = (await handler.handleTool('find_symbol', {
        symbolName,
        entryPoints: [entryFile],
      })) as any;

      if (result.definitions.length > 0) {
        console.log('📍 Definitions:');
        result.definitions.forEach((d: any) => {
          console.log(`   - ${d.file.split('/').pop()}:${d.line} (${d.type})`);
        });
      } else {
        console.log('   No definitions found');
      }

      if (result.callSites.length > 0) {
        console.log('\n📞 Call sites:');
        result.callSites.slice(0, 10).forEach((c: any) => {
          console.log(`   - ${c.file.split('/').pop()}:${c.line}`);
        });
        if (result.callSites.length > 10) {
          console.log(`   ... and ${result.callSites.length - 10} more`);
        }
      } else {
        console.log('\n   No call sites found');
      }
    },
  },

  help: {
    name: '/help',
    description: 'Show available commands',
    usage: '/help',
    handler: async () => {
      console.log('\n📚 Seu-Claude v2 CLI Commands:\n');
      for (const cmd of Object.values(COMMANDS)) {
        console.log(`  ${cmd.name.padEnd(10)} ${cmd.description}`);
        console.log(`  ${''.padEnd(10)} Usage: ${cmd.usage}\n`);
      }
    },
  },
};

function printTree(nodes: any[], indent: number): void {
  const prefix = '   '.repeat(indent);
  for (const node of nodes) {
    const icon = getStatusIcon(node.status);
    console.log(`${prefix}${icon} ${node.label}`);
    if (node.children && node.children.length > 0) {
      printTree(node.children, indent + 1);
    }
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pending':
      return '⏳';
    case 'running':
      return '🔄';
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    default:
      return '❓';
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    args.push('help');
  }

  let commandName = args[0];
  if (commandName.startsWith('/')) {
    commandName = commandName.slice(1);
  }

  const command = COMMANDS[commandName];
  if (!command) {
    console.error(`❌ Unknown command: ${commandName}`);
    console.log('   Run /help for available commands');
    process.exit(1);
  }

  const handler = new ToolHandler(PROJECT_ROOT, DATA_DIR);

  try {
    await command.handler(args.slice(1), handler);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await handler.close();
  }
}

main();
