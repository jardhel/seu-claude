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
import { mkdir, rm, readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { ToolHandler } from '../mcp/handler.js';
import {
  CodeUnderstandingSuite,
  DependencyAnalysisSuite,
  ScalabilitySuite,
  AccuracySuite,
  MemoryEfficiencySuite,
  ReportGenerator,
} from '../benchmarks/index.js';
import type { IBenchmarkSuite, BenchmarkSuiteResult } from '../benchmarks/framework/types.js';
import type { ReportFormat } from '../benchmarks/framework/ReportGenerator.js';
import {
  writeConfig,
  writeConfigs,
  getInstallInstructions,
  listSupportedTools,
  detectExistingTools,
  CONFIG_TEMPLATES,
  type AgentTool,
} from '../mcp/config-generator.js';

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

  bench: {
    name: '/bench',
    description: 'Run benchmark suites',
    usage: '/bench run [suite] | /bench report [format]',
    handler: async (args, _handler) => {
      const subcommand = args[0] || 'help';

      switch (subcommand) {
        case 'run': {
          const suiteName = args[1] || 'all';
          await runBenchmarks(suiteName);
          break;
        }
        case 'report': {
          const format = (args[1] || 'markdown') as 'json' | 'markdown' | 'html' | 'latex';
          await generateReportFromStored(format);
          break;
        }
        case 'list': {
          console.log('\n📋 Available Benchmark Suites:\n');
          console.log('   code-understanding  - Symbol resolution and call graph accuracy');
          console.log('   dependency          - Import resolution and circular detection');
          console.log('   scalability         - Throughput, memory, and latency at scale');
          console.log('   accuracy            - Precision/recall against ground truth');
          console.log('   memory-efficiency   - Token savings, retrieval latency, cache hit rate');
          console.log('   all                 - Run all suites');
          break;
        }
        default:
          console.log('Usage:', COMMANDS.bench.usage);
          console.log('\nSubcommands:');
          console.log('   run [suite]    - Run benchmark suite (default: all)');
          console.log('   report [fmt]   - Generate report (markdown, json, html)');
          console.log('   list           - List available suites');
      }
    },
  },

  setup: {
    name: '/setup',
    description: 'Generate MCP config for agentic tools',
    usage: '/setup <tool> | /setup --list | /setup --all',
    handler: async (args, _handler) => {
      const subcommand = args[0] || '--list';

      if (subcommand === '--list' || subcommand === 'list') {
        console.log('\n🔧 Supported Agentic Tools:\n');
        const tools = listSupportedTools();
        for (const { tool, description, configPath } of tools) {
          console.log(`   ${tool.padEnd(12)} ${description}`);
          console.log(`   ${''.padEnd(12)} Config: ${configPath}\n`);
        }
        console.log('Usage:');
        console.log('   /setup claude     - Generate config for Claude Code');
        console.log('   /setup copilot    - Generate config for GitHub Copilot');
        console.log('   /setup --all      - Generate configs for all tools');
        console.log('   /setup --detect   - Detect existing configs');
        return;
      }

      if (subcommand === '--detect' || subcommand === 'detect') {
        console.log('\n🔍 Detecting existing MCP configurations...\n');
        const detected = detectExistingTools(PROJECT_ROOT);
        if (detected.length > 0) {
          console.log('   Found configurations for:');
          for (const tool of detected) {
            const template = CONFIG_TEMPLATES[tool];
            console.log(`   - ${tool}: ${join(template.directory, template.filename)}`);
          }
        } else {
          console.log('   No existing MCP configurations found.');
        }
        return;
      }

      if (subcommand === '--all' || subcommand === 'all') {
        console.log('\n📝 Generating MCP configs for all tools...\n');
        const allTools = Object.keys(CONFIG_TEMPLATES) as AgentTool[];
        const paths = writeConfigs(allTools, PROJECT_ROOT, {
          projectRoot: '.',
        });
        for (const path of paths) {
          console.log(`   ✅ ${path}`);
        }
        console.log('\n🎉 All configurations generated!');
        return;
      }

      // Check if it's a valid tool name
      const tool = subcommand as AgentTool;
      if (!CONFIG_TEMPLATES[tool]) {
        console.error(`❌ Unknown tool: ${tool}`);
        console.log('   Run /setup --list to see available tools');
        return;
      }

      console.log(`\n📝 Generating MCP config for ${CONFIG_TEMPLATES[tool].description}...\n`);

      const configPath = writeConfig(tool, PROJECT_ROOT, {
        projectRoot: '.',
      });

      console.log(`   ✅ Created: ${configPath}`);
      console.log(getInstallInstructions(tool));
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

/**
 * Generate reports from stored benchmark results
 */
async function generateReportFromStored(format: ReportFormat): Promise<void> {
  const reportDir = join(PROJECT_ROOT, 'benchmarks', 'reports');

  if (!existsSync(reportDir)) {
    console.log('⚠️  No benchmark reports directory found.');
    console.log('   Run benchmarks first: /bench run');
    return;
  }

  // Find all JSON result files
  const files = await readdir(reportDir);
  const jsonFiles = files.filter(f => f.endsWith('.json') && f.startsWith('benchmark-'));

  if (jsonFiles.length === 0) {
    console.log('⚠️  No benchmark results found.');
    console.log('   Run benchmarks first: /bench run');
    return;
  }

  // Sort by modification time (newest first)
  const fileStats = await Promise.all(
    jsonFiles.map(async f => {
      const path = join(reportDir, f);
      const content = await readFile(path, 'utf-8');
      const data = JSON.parse(content) as { metadata?: { timestamp?: string } };
      return { file: f, path, timestamp: data.metadata?.timestamp || '' };
    })
  );
  fileStats.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  console.log(`\n📊 Found ${fileStats.length} benchmark result(s)\n`);

  // Show available results
  console.log('Available results:');
  for (let i = 0; i < Math.min(5, fileStats.length); i++) {
    const stat = fileStats[i];
    console.log(`   ${i + 1}. ${stat.file}`);
  }
  if (fileStats.length > 5) {
    console.log(`   ... and ${fileStats.length - 5} more`);
  }

  // Generate report from most recent result
  const latestFile = fileStats[0];
  console.log(`\n📄 Generating ${format} report from: ${latestFile.file}\n`);

  const content = await readFile(latestFile.path, 'utf-8');
  const storedResult = JSON.parse(content) as {
    metadata: { title: string; timestamp: string; systemVersion: string; gitCommit?: string };
    summary: { totalTests: number; passed: number; failed: number; totalExecutionTimeMs: number };
    metrics: Array<{ name: string; value: number; unit: string; stdDev?: number }>;
    latencyStats: {
      p50: number;
      p75: number;
      p90: number;
      p95: number;
      p99: number;
      min: number;
      max: number;
      mean: number;
      stdDev: number;
    };
    irMetrics?: {
      precisionAtK: Record<number, number>;
      recall: number;
      f1: number;
      mrr: number;
      map: number;
      ndcg: number;
    };
    testResults?: Array<{
      testCaseId: string;
      passed: boolean;
      actual: unknown;
      executionTimeMs: number;
      metrics: Array<{ name: string; value: number; unit: string }>;
      error?: string;
    }>;
  };

  // Convert stored format back to BenchmarkSuiteResult
  const suiteResult: BenchmarkSuiteResult = {
    config: {
      name: latestFile.file.replace('benchmark-', '').replace(/-\d{4}-\d{2}-\d{2}.*\.json$/, ''),
      description: storedResult.metadata.title,
    },
    testResults: storedResult.testResults || [],
    aggregatedMetrics: storedResult.metrics || [],
    latencyStats: storedResult.latencyStats || {
      p50: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
      mean: 0,
      stdDev: 0,
    },
    irMetrics: storedResult.irMetrics,
    totalExecutionTimeMs: storedResult.summary?.totalExecutionTimeMs || 0,
    timestamp: storedResult.metadata.timestamp,
    systemVersion: storedResult.metadata.systemVersion,
    gitCommit: storedResult.metadata.gitCommit,
  };

  const reportGenerator = new ReportGenerator();
  const outputPaths = await reportGenerator.generateSuiteReport(suiteResult, {
    outputDir: reportDir,
    formats: [format],
    title: storedResult.metadata.title,
  });

  console.log(`✅ Generated report(s):`);
  for (const path of outputPaths) {
    console.log(`   ${path}`);
  }
}

/**
 * Run benchmark suites
 */
async function runBenchmarks(suiteName: string): Promise<void> {
  const datasetPath = join(PROJECT_ROOT, 'benchmarks', 'datasets', 'seu-claude');
  const reportDir = join(PROJECT_ROOT, 'benchmarks', 'reports');

  // Check if dataset exists
  if (!existsSync(datasetPath)) {
    console.log('⚠️  No ground truth dataset found.');
    console.log('   Run: npx tsx scripts/generate-ground-truth.ts');
    return;
  }

  const suites = new Map<string, IBenchmarkSuite>();
  suites.set('code-understanding', new CodeUnderstandingSuite());
  suites.set('dependency', new DependencyAnalysisSuite());
  suites.set('scalability', new ScalabilitySuite());
  suites.set('accuracy', new AccuracySuite());
  suites.set('memory-efficiency', new MemoryEfficiencySuite());

  const suitesToRun: IBenchmarkSuite[] = [];

  if (suiteName === 'all') {
    suitesToRun.push(...suites.values());
  } else if (suites.has(suiteName)) {
    suitesToRun.push(suites.get(suiteName)!);
  } else {
    console.error(`❌ Unknown suite: ${suiteName}`);
    console.log(
      '   Available: code-understanding, dependency, scalability, accuracy, memory-efficiency, all'
    );
    return;
  }

  console.log(`\n🔬 Running ${suitesToRun.length} benchmark suite(s)...\n`);

  const reportGenerator = new ReportGenerator();
  const config = {
    name: 'cli-benchmark',
    description: 'Benchmark run from CLI',
  };

  for (const suite of suitesToRun) {
    console.log(`📊 Running: ${suite.name}`);
    console.log(`   ${suite.description}\n`);

    try {
      const startTime = Date.now();
      const result = await suite.run(config, datasetPath);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // Print summary
      const passed = result.testResults.filter(r => r.passed).length;
      const total = result.testResults.length;
      const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';

      console.log(`   ✅ Completed in ${duration}s`);
      console.log(`   📈 Results: ${passed}/${total} passed (${passRate}%)`);
      console.log(
        `   ⏱️  Latency: P50=${result.latencyStats.p50.toFixed(0)}ms, P95=${result.latencyStats.p95.toFixed(0)}ms`
      );

      if (result.irMetrics) {
        console.log(
          `   🎯 IR Metrics: Precision=${(result.irMetrics.precisionAtK[1] || 0).toFixed(3)}, Recall=${result.irMetrics.recall.toFixed(3)}`
        );
      }

      // Generate report
      await mkdir(reportDir, { recursive: true });
      const reportPaths = await reportGenerator.generateSuiteReport(result, {
        outputDir: reportDir,
        formats: ['json', 'markdown'],
      });
      console.log(`   📄 Reports: ${reportPaths.map(p => p.split('/').pop()).join(', ')}`);
      console.log('');
    } catch (error) {
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
      console.log('');
    }
  }

  console.log('🏁 Benchmark run complete!');
  console.log(`   Reports saved to: ${reportDir}`);
}

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
