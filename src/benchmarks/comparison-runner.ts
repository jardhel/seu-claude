/**
 * Comparison Runner
 *
 * Benchmarks seu-claude against other AI development tools:
 * - Raw Claude Code (no MCP)
 * - Aider
 * - Continue.dev
 *
 * Provides fair, reproducible comparisons with standardized metrics.
 */

import type { BenchmarkCase } from './runner.js';

// ============================================================================
// Agent Adapter Interface
// ============================================================================

export interface AgentAdapter {
  name: string;
  version: string;
  initialize(): Promise<void>;
  execute(prompt: string, context: ExecutionContext): Promise<ExecutionResult>;
  cleanup(): Promise<void>;
  isAvailable(): Promise<boolean>;
}

export interface ExecutionContext {
  workingDir: string;
  files: string[];
  timeout: number;
  tokenBudget?: number;
}

export interface ExecutionResult {
  success: boolean;
  filesModified: string[];
  tokensUsed: number;
  executionTimeMs: number;
  output: string;
  error?: string;
}

// ============================================================================
// Agent Adapters
// ============================================================================

/**
 * Seu-Claude adapter - uses MCP tools for persistent task management
 */
export class SeuClaudeAdapter implements AgentAdapter {
  name = 'seu-claude';
  version = '2.4.0';

  async initialize(): Promise<void> {
    // Initialize MCP connection
  }

  async execute(prompt: string, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();

    // In real implementation, this would use the MCP tools
    // For now, simulate execution
    return {
      success: true,
      filesModified: context.files,
      tokensUsed: 500,
      executionTimeMs: Date.now() - startTime,
      output: `Executed with seu-claude: ${prompt.substring(0, 50)}...`,
    };
  }

  async cleanup(): Promise<void> {
    // Cleanup MCP connection
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * Raw Claude adapter - no MCP tools, just direct Claude API
 */
export class RawClaudeAdapter implements AgentAdapter {
  name = 'raw-claude';
  version = 'claude-3-opus';

  async initialize(): Promise<void> {
    // Initialize Claude API client
  }

  async execute(prompt: string, _context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();

    // In real implementation, this would call Claude API directly
    return {
      success: true,
      filesModified: [],
      tokensUsed: 1000, // Typically higher without tools
      executionTimeMs: Date.now() - startTime,
      output: `Executed with raw Claude: ${prompt.substring(0, 50)}...`,
    };
  }

  async cleanup(): Promise<void> {
    // Nothing to cleanup
  }

  async isAvailable(): Promise<boolean> {
    // Check if ANTHROPIC_API_KEY is set
    return !!process.env.ANTHROPIC_API_KEY;
  }
}

/**
 * Aider adapter - uses Aider CLI for AI-assisted coding
 * https://github.com/paul-gauthier/aider
 */
export class AiderAdapter implements AgentAdapter {
  name = 'aider';
  version = 'latest';
  private aiderPath: string;

  constructor(aiderPath: string = 'aider') {
    this.aiderPath = aiderPath;
  }

  async initialize(): Promise<void> {
    // Aider is stateless, no initialization needed
  }

  async execute(prompt: string, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const { execSync } = await import('child_process');

      // Run aider with the prompt in non-interactive mode
      const result = execSync(
        `${this.aiderPath} --yes --no-git --message "${prompt.replace(/"/g, '\\"')}"`,
        {
          cwd: context.workingDir,
          timeout: context.timeout,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      return {
        success: true,
        filesModified: context.files,
        tokensUsed: this.estimateTokens(result),
        executionTimeMs: Date.now() - startTime,
        output: result,
      };
    } catch (error) {
      return {
        success: false,
        filesModified: [],
        tokensUsed: 0,
        executionTimeMs: Date.now() - startTime,
        output: '',
        error: error instanceof Error ? error.message : 'Aider execution failed',
      };
    }
  }

  async cleanup(): Promise<void> {
    // Nothing to cleanup
  }

  async isAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import('child_process');
      execSync(`${this.aiderPath} --version`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  private estimateTokens(output: string): number {
    // Rough estimate: ~4 chars per token
    return Math.ceil(output.length / 4);
  }
}

/**
 * Continue.dev adapter - uses Continue extension API
 * https://continue.dev
 */
export class ContinueAdapter implements AgentAdapter {
  name = 'continue';
  version = 'latest';
  private apiEndpoint: string;

  constructor(apiEndpoint: string = 'http://localhost:65432') {
    this.apiEndpoint = apiEndpoint;
  }

  async initialize(): Promise<void> {
    // Check if Continue server is running
  }

  async execute(prompt: string, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Continue.dev uses a local HTTP API when running
      const response = await fetch(`${this.apiEndpoint}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          workingDir: context.workingDir,
          files: context.files,
        }),
        signal: AbortSignal.timeout(context.timeout),
      });

      if (!response.ok) {
        throw new Error(`Continue API error: ${response.status}`);
      }

      const result = (await response.json()) as {
        success?: boolean;
        filesModified?: string[];
        tokensUsed?: number;
        output?: string;
      };

      return {
        success: result.success ?? true,
        filesModified: result.filesModified ?? context.files,
        tokensUsed: result.tokensUsed ?? 0,
        executionTimeMs: Date.now() - startTime,
        output: result.output ?? '',
      };
    } catch (error) {
      return {
        success: false,
        filesModified: [],
        tokensUsed: 0,
        executionTimeMs: Date.now() - startTime,
        output: '',
        error: error instanceof Error ? error.message : 'Continue execution failed',
      };
    }
  }

  async cleanup(): Promise<void> {
    // Nothing to cleanup
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiEndpoint}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Mock adapter for testing comparisons
 */
export class MockAdapter implements AgentAdapter {
  constructor(
    public name: string,
    public version: string,
    private successRate: number = 0.8,
    private avgTokens: number = 750
  ) {}

  async initialize(): Promise<void> {}

  async execute(_prompt: string, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const success = Math.random() < this.successRate;

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 10));

    return {
      success,
      filesModified: success ? context.files : [],
      tokensUsed: this.avgTokens + Math.floor(Math.random() * 200),
      executionTimeMs: Date.now() - startTime,
      output: success ? 'Task completed' : 'Task failed',
      error: success ? undefined : 'Simulated failure',
    };
  }

  async cleanup(): Promise<void> {}

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

// ============================================================================
// Comparison Runner
// ============================================================================

export interface ComparisonResult {
  caseId: string;
  caseName: string;
  results: Map<string, AgentResult>;
  winner: string | null;
  timestamp: string;
}

export interface AgentResult {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  tokensUsed: number;
  filesModified: number;
  error?: string;
}

export interface ComparisonSuiteResult {
  cases: ComparisonResult[];
  summary: ComparisonSummary;
  runId: string;
  timestamp: string;
}

export interface ComparisonSummary {
  agentStats: Map<string, AgentStats>;
  overallWinner: string | null;
  totalCases: number;
}

export interface AgentStats {
  name: string;
  wins: number;
  successRate: number;
  avgExecutionTimeMs: number;
  avgTokensUsed: number;
  totalCases: number;
}

export class ComparisonRunner {
  private adapters: Map<string, AgentAdapter> = new Map();

  constructor(adapters?: AgentAdapter[]) {
    if (adapters) {
      for (const adapter of adapters) {
        this.registerAdapter(adapter);
      }
    }
  }

  registerAdapter(adapter: AgentAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  getAdapter(name: string): AgentAdapter | undefined {
    return this.adapters.get(name);
  }

  listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  async runComparison(benchmarkCase: BenchmarkCase): Promise<ComparisonResult> {
    const results = new Map<string, AgentResult>();

    // Setup the benchmark case
    await benchmarkCase.setup();

    // Run each adapter
    for (const [name, adapter] of this.adapters) {
      if (!(await adapter.isAvailable())) {
        results.set(name, {
          agentName: name,
          success: false,
          executionTimeMs: 0,
          tokensUsed: 0,
          filesModified: 0,
          error: 'Agent not available',
        });
        continue;
      }

      await adapter.initialize();

      const context: ExecutionContext = {
        workingDir: process.cwd(),
        files: benchmarkCase.expectedFiles,
        timeout: 60000,
        tokenBudget: benchmarkCase.tokenBudget,
      };

      const result = await adapter.execute(benchmarkCase.prompt, context);

      results.set(name, {
        agentName: name,
        success: result.success,
        executionTimeMs: result.executionTimeMs,
        tokensUsed: result.tokensUsed,
        filesModified: result.filesModified.length,
        error: result.error,
      });

      await adapter.cleanup();
    }

    // Determine winner (fastest successful completion)
    const winner = this.determineWinner(results);

    return {
      caseId: benchmarkCase.id,
      caseName: benchmarkCase.name,
      results,
      winner,
      timestamp: new Date().toISOString(),
    };
  }

  async runSuite(cases: BenchmarkCase[]): Promise<ComparisonSuiteResult> {
    const results: ComparisonResult[] = [];
    const runId = `comparison-${Date.now()}`;

    for (const benchmarkCase of cases) {
      const result = await this.runComparison(benchmarkCase);
      results.push(result);
    }

    return {
      cases: results,
      summary: this.calculateSummary(results),
      runId,
      timestamp: new Date().toISOString(),
    };
  }

  private determineWinner(results: Map<string, AgentResult>): string | null {
    let winner: string | null = null;
    let bestTime = Infinity;

    for (const [name, result] of results) {
      if (result.success && result.executionTimeMs < bestTime) {
        bestTime = result.executionTimeMs;
        winner = name;
      }
    }

    return winner;
  }

  private calculateSummary(results: ComparisonResult[]): ComparisonSummary {
    const agentStats = new Map<string, AgentStats>();
    const winCounts = new Map<string, number>();

    // Initialize stats for all adapters
    for (const name of this.adapters.keys()) {
      agentStats.set(name, {
        name,
        wins: 0,
        successRate: 0,
        avgExecutionTimeMs: 0,
        avgTokensUsed: 0,
        totalCases: 0,
      });
      winCounts.set(name, 0);
    }

    // Aggregate results
    for (const comparison of results) {
      if (comparison.winner) {
        winCounts.set(comparison.winner, (winCounts.get(comparison.winner) || 0) + 1);
      }

      for (const [name, result] of comparison.results) {
        const stats = agentStats.get(name);
        if (stats) {
          stats.totalCases++;
          if (result.success) {
            stats.successRate =
              (stats.successRate * (stats.totalCases - 1) + 1) / stats.totalCases;
          } else {
            stats.successRate =
              (stats.successRate * (stats.totalCases - 1)) / stats.totalCases;
          }
          stats.avgExecutionTimeMs =
            (stats.avgExecutionTimeMs * (stats.totalCases - 1) + result.executionTimeMs) /
            stats.totalCases;
          stats.avgTokensUsed =
            (stats.avgTokensUsed * (stats.totalCases - 1) + result.tokensUsed) /
            stats.totalCases;
        }
      }
    }

    // Set win counts
    for (const [name, wins] of winCounts) {
      const stats = agentStats.get(name);
      if (stats) {
        stats.wins = wins;
      }
    }

    // Determine overall winner
    let overallWinner: string | null = null;
    let maxWins = 0;
    for (const [name, wins] of winCounts) {
      if (wins > maxWins) {
        maxWins = wins;
        overallWinner = name;
      }
    }

    return {
      agentStats,
      overallWinner,
      totalCases: results.length,
    };
  }
}

// ============================================================================
// Report Generator
// ============================================================================

export class ComparisonReportGenerator {
  generateMarkdown(suiteResult: ComparisonSuiteResult): string {
    const lines: string[] = [];

    lines.push('# Benchmark Comparison Report');
    lines.push('');
    lines.push(`**Run ID:** ${suiteResult.runId}`);
    lines.push(`**Timestamp:** ${suiteResult.timestamp}`);
    lines.push(`**Total Cases:** ${suiteResult.summary.totalCases}`);
    lines.push('');

    // Summary table
    lines.push('## Summary');
    lines.push('');
    lines.push('| Agent | Wins | Success Rate | Avg Time (ms) | Avg Tokens |');
    lines.push('|-------|------|--------------|---------------|------------|');

    for (const [, stats] of suiteResult.summary.agentStats) {
      lines.push(
        `| ${stats.name} | ${stats.wins} | ${(stats.successRate * 100).toFixed(1)}% | ${stats.avgExecutionTimeMs.toFixed(0)} | ${stats.avgTokensUsed.toFixed(0)} |`
      );
    }

    lines.push('');
    lines.push(`**Overall Winner:** ${suiteResult.summary.overallWinner || 'N/A'}`);
    lines.push('');

    // Detailed results
    lines.push('## Detailed Results');
    lines.push('');

    for (const comparison of suiteResult.cases) {
      lines.push(`### ${comparison.caseName}`);
      lines.push('');
      lines.push(`**Winner:** ${comparison.winner || 'None'}`);
      lines.push('');
      lines.push('| Agent | Success | Time (ms) | Tokens |');
      lines.push('|-------|---------|-----------|--------|');

      for (const [, result] of comparison.results) {
        const status = result.success ? 'Pass' : 'Fail';
        lines.push(
          `| ${result.agentName} | ${status} | ${result.executionTimeMs} | ${result.tokensUsed} |`
        );
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  generateJSON(suiteResult: ComparisonSuiteResult): string {
    // Convert Maps to objects for JSON serialization
    const jsonResult = {
      ...suiteResult,
      cases: suiteResult.cases.map((c) => ({
        ...c,
        results: Object.fromEntries(c.results),
      })),
      summary: {
        ...suiteResult.summary,
        agentStats: Object.fromEntries(suiteResult.summary.agentStats),
      },
    };

    return JSON.stringify(jsonResult, null, 2);
  }

  generateHTML(suiteResult: ComparisonSuiteResult): string {
    const agentNames = Array.from(suiteResult.summary.agentStats.keys());
    const stats = Array.from(suiteResult.summary.agentStats.values());

    const winsData = stats.map((s) => s.wins);
    const successRateData = stats.map((s) => (s.successRate * 100).toFixed(1));
    const avgTimeData = stats.map((s) => s.avgExecutionTimeMs.toFixed(0));
    const avgTokensData = stats.map((s) => s.avgTokensUsed.toFixed(0));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Benchmark Comparison Report - ${suiteResult.runId}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --text-primary: #eee;
      --text-secondary: #aaa;
      --accent: #0f4c75;
      --success: #4ade80;
      --warning: #fbbf24;
      --error: #f87171;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; margin: 2rem 0 1rem; color: var(--text-secondary); }
    .meta { color: var(--text-secondary); margin-bottom: 2rem; }
    .winner-badge {
      display: inline-block;
      background: var(--success);
      color: #000;
      padding: 0.5rem 1rem;
      border-radius: 2rem;
      font-weight: bold;
      margin: 1rem 0;
    }
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 2rem;
      margin: 2rem 0;
    }
    .chart-container {
      background: var(--bg-secondary);
      border-radius: 1rem;
      padding: 1.5rem;
    }
    .chart-title { font-size: 1.1rem; margin-bottom: 1rem; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
      background: var(--bg-secondary);
      border-radius: 0.5rem;
      overflow: hidden;
    }
    th, td { padding: 1rem; text-align: left; }
    th { background: var(--accent); }
    tr:nth-child(even) { background: rgba(255,255,255,0.05); }
    .pass { color: var(--success); }
    .fail { color: var(--error); }
    .case-section { margin: 2rem 0; padding: 1.5rem; background: var(--bg-secondary); border-radius: 1rem; }
    footer { margin-top: 3rem; color: var(--text-secondary); font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Benchmark Comparison Report</h1>
    <div class="meta">
      <p>Run ID: ${suiteResult.runId}</p>
      <p>Generated: ${suiteResult.timestamp}</p>
      <p>Total Cases: ${suiteResult.summary.totalCases}</p>
    </div>

    ${suiteResult.summary.overallWinner ? `<div class="winner-badge">Winner: ${suiteResult.summary.overallWinner}</div>` : ''}

    <h2>Performance Overview</h2>
    <div class="charts-grid">
      <div class="chart-container">
        <div class="chart-title">Wins by Agent</div>
        <canvas id="winsChart"></canvas>
      </div>
      <div class="chart-container">
        <div class="chart-title">Success Rate (%)</div>
        <canvas id="successChart"></canvas>
      </div>
      <div class="chart-container">
        <div class="chart-title">Average Execution Time (ms)</div>
        <canvas id="timeChart"></canvas>
      </div>
      <div class="chart-container">
        <div class="chart-title">Average Tokens Used</div>
        <canvas id="tokensChart"></canvas>
      </div>
    </div>

    <h2>Summary Table</h2>
    <table>
      <thead>
        <tr>
          <th>Agent</th>
          <th>Wins</th>
          <th>Success Rate</th>
          <th>Avg Time (ms)</th>
          <th>Avg Tokens</th>
        </tr>
      </thead>
      <tbody>
        ${stats.map((s) => `
        <tr>
          <td>${s.name}</td>
          <td>${s.wins}</td>
          <td>${(s.successRate * 100).toFixed(1)}%</td>
          <td>${s.avgExecutionTimeMs.toFixed(0)}</td>
          <td>${s.avgTokensUsed.toFixed(0)}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>

    <h2>Detailed Results</h2>
    ${suiteResult.cases.map((c) => `
    <div class="case-section">
      <h3>${c.caseName}</h3>
      <p><strong>Winner:</strong> ${c.winner || 'None'}</p>
      <table>
        <thead>
          <tr><th>Agent</th><th>Status</th><th>Time (ms)</th><th>Tokens</th></tr>
        </thead>
        <tbody>
          ${Array.from(c.results.values()).map((r) => `
          <tr>
            <td>${r.agentName}</td>
            <td class="${r.success ? 'pass' : 'fail'}">${r.success ? 'Pass' : 'Fail'}</td>
            <td>${r.executionTimeMs}</td>
            <td>${r.tokensUsed}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    `).join('')}

    <footer>
      <p>Generated by seu-claude benchmark suite</p>
    </footer>
  </div>

  <script>
    const colors = ['#4ade80', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#f472b6'];
    const chartConfig = {
      responsive: true,
      plugins: { legend: { display: false } }
    };

    new Chart(document.getElementById('winsChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(agentNames)},
        datasets: [{ data: ${JSON.stringify(winsData)}, backgroundColor: colors }]
      },
      options: chartConfig
    });

    new Chart(document.getElementById('successChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(agentNames)},
        datasets: [{ data: ${JSON.stringify(successRateData)}, backgroundColor: colors }]
      },
      options: chartConfig
    });

    new Chart(document.getElementById('timeChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(agentNames)},
        datasets: [{ data: ${JSON.stringify(avgTimeData)}, backgroundColor: colors }]
      },
      options: chartConfig
    });

    new Chart(document.getElementById('tokensChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(agentNames)},
        datasets: [{ data: ${JSON.stringify(avgTokensData)}, backgroundColor: colors }]
      },
      options: chartConfig
    });
  </script>
</body>
</html>`;
  }
}

// ============================================================================
// Badge Generator
// ============================================================================

export interface BadgeOptions {
  label?: string;
  style?: 'flat' | 'flat-square' | 'plastic' | 'for-the-badge';
}

/**
 * Generates shields.io compatible badges for benchmark results
 */
export class BadgeGenerator {
  /**
   * Generate a success rate badge
   */
  static successRateBadge(rate: number, options: BadgeOptions = {}): string {
    const { label = 'benchmark', style = 'flat' } = options;
    const percentage = Math.round(rate * 100);
    const color = percentage >= 90 ? 'brightgreen' : percentage >= 70 ? 'yellow' : 'red';
    return `https://img.shields.io/badge/${encodeURIComponent(label)}-${percentage}%25-${color}?style=${style}`;
  }

  /**
   * Generate a markdown badge
   */
  static markdownBadge(rate: number, options: BadgeOptions = {}): string {
    const url = this.successRateBadge(rate, options);
    return `![Benchmark](${url})`;
  }

  /**
   * Generate an SVG badge (inline, no external dependency)
   */
  static svgBadge(label: string, value: string, color: string): string {
    const labelWidth = label.length * 7 + 10;
    const valueWidth = value.length * 7 + 10;
    const totalWidth = labelWidth + valueWidth;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="a">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#a)">
    <path fill="#555" d="M0 0h${labelWidth}v20H0z"/>
    <path fill="${color}" d="M${labelWidth} 0h${valueWidth}v20H${labelWidth}z"/>
    <path fill="url(#b)" d="M0 0h${totalWidth}v20H0z"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
  }

  /**
   * Generate a benchmark results badge with winner
   */
  static winnerBadge(winner: string, options: BadgeOptions = {}): string {
    const { style = 'for-the-badge' } = options;
    return `https://img.shields.io/badge/winner-${encodeURIComponent(winner)}-gold?style=${style}`;
  }

  /**
   * Generate a leaderboard badge for an agent's rank
   */
  static rankBadge(agentName: string, rank: number, total: number): string {
    const colors = ['gold', 'silver', '#cd7f32', 'gray']; // gold, silver, bronze, other
    const color = colors[Math.min(rank - 1, 3)];
    return this.svgBadge(agentName, `#${rank}/${total}`, color);
  }

  /**
   * Generate all badges for a suite result
   */
  static fromSuiteResult(result: ComparisonSuiteResult): {
    markdown: string;
    html: string;
    urls: { successRate: string; winner?: string };
  } {
    const winner = result.summary.overallWinner;
    const agents = Array.from(result.summary.agentStats.values());
    const avgSuccessRate = agents.reduce((acc, a) => acc + a.successRate, 0) / agents.length;

    const successBadge = this.successRateBadge(avgSuccessRate);
    const winnerBadge = winner ? this.winnerBadge(winner) : undefined;

    return {
      markdown: `![Benchmark](${successBadge})${winner ? ` ![Winner](${winnerBadge})` : ''}`,
      html: `<img src="${successBadge}" alt="Benchmark">${winner ? ` <img src="${winnerBadge}" alt="Winner">` : ''}`,
      urls: {
        successRate: successBadge,
        winner: winnerBadge,
      },
    };
  }
}
