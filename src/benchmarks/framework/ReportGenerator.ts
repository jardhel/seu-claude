/**
 * ReportGenerator - Multi-format benchmark report generation
 *
 * Generates reports in multiple formats:
 * - JSON: Machine-readable for CI/CD integration
 * - HTML: Interactive dashboard with charts
 * - LaTeX: Publication-ready tables for papers
 * - Markdown: GitHub-friendly summary
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { BenchmarkSuiteResult, BenchmarkComparison } from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * Report format options
 */
export type ReportFormat = 'json' | 'html' | 'latex' | 'markdown';

/**
 * Report configuration
 */
export interface ReportConfig {
  /** Output directory */
  outputDir: string;
  /** Report title */
  title?: string;
  /** Include raw test results */
  includeRawResults?: boolean;
  /** Include statistical analysis */
  includeStatistics?: boolean;
  /** Formats to generate */
  formats?: ReportFormat[];
}

export class ReportGenerator {
  private log = logger.child('report-generator');

  constructor() {
    // Stateless report generator
  }

  /**
   * Generate reports for a benchmark suite result
   */
  async generateSuiteReport(result: BenchmarkSuiteResult, config: ReportConfig): Promise<string[]> {
    const formats = config.formats ?? ['json', 'markdown'];
    const outputPaths: string[] = [];

    await mkdir(config.outputDir, { recursive: true });

    for (const format of formats) {
      const fileName = `benchmark-${result.config.name}-${result.timestamp.replace(/[:.]/g, '-')}.${this.getExtension(format)}`;
      const outputPath = join(config.outputDir, fileName);

      let content: string;
      switch (format) {
        case 'json':
          content = this.generateJSON(result, config);
          break;
        case 'html':
          content = this.generateHTML(result, config);
          break;
        case 'latex':
          content = this.generateLaTeX(result, config);
          break;
        case 'markdown':
          content = this.generateMarkdown(result, config);
          break;
        default:
          continue;
      }

      await writeFile(outputPath, content, 'utf-8');
      outputPaths.push(outputPath);
      this.log.info(`Generated ${format} report: ${outputPath}`);
    }

    return outputPaths;
  }

  /**
   * Generate comparison report between baseline and current
   */
  async generateComparisonReport(
    comparison: BenchmarkComparison,
    config: ReportConfig
  ): Promise<string[]> {
    const formats = config.formats ?? ['json', 'markdown'];
    const outputPaths: string[] = [];

    await mkdir(config.outputDir, { recursive: true });

    for (const format of formats) {
      const fileName = `comparison-${comparison.baseline.config.name}-${Date.now()}.${this.getExtension(format)}`;
      const outputPath = join(config.outputDir, fileName);

      let content: string;
      switch (format) {
        case 'json':
          content = JSON.stringify(comparison, null, 2);
          break;
        case 'markdown':
          content = this.generateComparisonMarkdown(comparison, config);
          break;
        case 'html':
          content = this.generateComparisonHTML(comparison, config);
          break;
        case 'latex':
          content = this.generateComparisonLaTeX(comparison, config);
          break;
        default:
          continue;
      }

      await writeFile(outputPath, content, 'utf-8');
      outputPaths.push(outputPath);
    }

    return outputPaths;
  }

  // === JSON Format ===

  private generateJSON(result: BenchmarkSuiteResult, config: ReportConfig): string {
    const report = {
      metadata: {
        title: config.title ?? `Benchmark Report: ${result.config.name}`,
        timestamp: result.timestamp,
        systemVersion: result.systemVersion,
        gitCommit: result.gitCommit,
      },
      summary: {
        totalTests: result.testResults.length,
        passed: result.testResults.filter(r => r.passed).length,
        failed: result.testResults.filter(r => !r.passed).length,
        totalExecutionTimeMs: result.totalExecutionTimeMs,
      },
      metrics: result.aggregatedMetrics,
      latencyStats: result.latencyStats,
      irMetrics: result.irMetrics,
      ...(config.includeRawResults ? { testResults: result.testResults } : {}),
    };

    return JSON.stringify(report, null, 2);
  }

  // === Markdown Format ===

  private generateMarkdown(result: BenchmarkSuiteResult, config: ReportConfig): string {
    const title = config.title ?? `Benchmark Report: ${result.config.name}`;
    const passed = result.testResults.filter(r => r.passed).length;
    const total = result.testResults.length;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';

    let md = `# ${title}\n\n`;
    md += `**Generated:** ${result.timestamp}  \n`;
    md += `**System Version:** ${result.systemVersion}  \n`;
    if (result.gitCommit) {
      md += `**Git Commit:** \`${result.gitCommit}\`  \n`;
    }
    md += `\n---\n\n`;

    // Summary
    md += `## Summary\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Total Tests | ${total} |\n`;
    md += `| Passed | ${passed} (${passRate}%) |\n`;
    md += `| Failed | ${total - passed} |\n`;
    md += `| Total Time | ${(result.totalExecutionTimeMs / 1000).toFixed(2)}s |\n`;
    md += `\n`;

    // Latency Stats
    md += `## Latency Statistics\n\n`;
    md += `| Percentile | Value (ms) |\n`;
    md += `|------------|------------|\n`;
    md += `| P50 | ${result.latencyStats.p50.toFixed(2)} |\n`;
    md += `| P95 | ${result.latencyStats.p95.toFixed(2)} |\n`;
    md += `| P99 | ${result.latencyStats.p99.toFixed(2)} |\n`;
    md += `| Mean | ${result.latencyStats.mean.toFixed(2)} |\n`;
    md += `| Std Dev | ${result.latencyStats.stdDev.toFixed(2)} |\n`;
    md += `\n`;

    // IR Metrics
    if (result.irMetrics) {
      md += `## Information Retrieval Metrics\n\n`;
      md += `| Metric | Value |\n`;
      md += `|--------|-------|\n`;
      for (const [k, v] of Object.entries(result.irMetrics.precisionAtK)) {
        md += `| Precision@${k} | ${(v * 100).toFixed(1)}% |\n`;
      }
      md += `| Recall | ${(result.irMetrics.recall * 100).toFixed(1)}% |\n`;
      md += `| F1 Score | ${(result.irMetrics.f1 * 100).toFixed(1)}% |\n`;
      md += `| MRR | ${result.irMetrics.mrr.toFixed(3)} |\n`;
      md += `| MAP | ${result.irMetrics.map.toFixed(3)} |\n`;
      md += `| NDCG | ${result.irMetrics.ndcg.toFixed(3)} |\n`;
      md += `\n`;
    }

    // Aggregated Metrics
    md += `## Aggregated Metrics\n\n`;
    md += `| Metric | Value | Unit |\n`;
    md += `|--------|-------|------|\n`;
    for (const metric of result.aggregatedMetrics) {
      const value =
        metric.unit === 'ratio' ? `${(metric.value * 100).toFixed(1)}%` : metric.value.toFixed(3);
      md += `| ${metric.name} | ${value} | ${metric.unit} |\n`;
    }
    md += `\n`;

    // Failed Tests
    const failed = result.testResults.filter(r => !r.passed);
    if (failed.length > 0) {
      md += `## Failed Tests\n\n`;
      for (const test of failed.slice(0, 10)) {
        md += `- **${test.testCaseId}**: ${test.error ?? 'Unknown error'}\n`;
      }
      if (failed.length > 10) {
        md += `\n*...and ${failed.length - 10} more*\n`;
      }
      md += `\n`;
    }

    md += `---\n\n`;
    md += `*Generated by seu-claude benchmark framework*\n`;

    return md;
  }

  // === HTML Format ===

  private generateHTML(result: BenchmarkSuiteResult, config: ReportConfig): string {
    const title = config.title ?? `Benchmark Report: ${result.config.name}`;
    const passed = result.testResults.filter(r => r.passed).length;
    const total = result.testResults.length;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      --bg: #1a1a2e;
      --card: #16213e;
      --text: #eee;
      --accent: #e94560;
      --success: #4ade80;
      --warning: #fbbf24;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: var(--accent); margin-bottom: 1rem; }
    h2 { color: var(--text); margin: 2rem 0 1rem; border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; }
    .meta { color: #888; font-size: 0.9rem; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .card {
      background: var(--card);
      padding: 1.5rem;
      border-radius: 8px;
      border-left: 4px solid var(--accent);
    }
    .card h3 { font-size: 0.9rem; color: #888; margin-bottom: 0.5rem; }
    .card .value { font-size: 2rem; font-weight: bold; }
    .card .value.success { color: var(--success); }
    .card .value.warning { color: var(--warning); }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #333; }
    th { background: var(--card); color: var(--accent); }
    tr:hover { background: rgba(233, 69, 96, 0.1); }
    .bar-chart { display: flex; align-items: flex-end; gap: 4px; height: 100px; margin: 1rem 0; }
    .bar {
      flex: 1;
      background: var(--accent);
      min-width: 20px;
      transition: height 0.3s;
    }
    footer { margin-top: 3rem; text-align: center; color: #666; font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <div class="meta">
      Generated: ${result.timestamp} | Version: ${result.systemVersion}
      ${result.gitCommit ? `| Commit: ${result.gitCommit}` : ''}
    </div>

    <div class="grid">
      <div class="card">
        <h3>Total Tests</h3>
        <div class="value">${total}</div>
      </div>
      <div class="card">
        <h3>Pass Rate</h3>
        <div class="value ${passed === total ? 'success' : 'warning'}">${((passed / total) * 100).toFixed(1)}%</div>
      </div>
      <div class="card">
        <h3>Mean Latency</h3>
        <div class="value">${result.latencyStats.mean.toFixed(1)}ms</div>
      </div>
      <div class="card">
        <h3>P95 Latency</h3>
        <div class="value">${result.latencyStats.p95.toFixed(1)}ms</div>
      </div>
    </div>

    <h2>Latency Distribution</h2>
    <table>
      <tr><th>Percentile</th><th>Value (ms)</th></tr>
      <tr><td>P50</td><td>${result.latencyStats.p50.toFixed(2)}</td></tr>
      <tr><td>P75</td><td>${result.latencyStats.p75.toFixed(2)}</td></tr>
      <tr><td>P90</td><td>${result.latencyStats.p90.toFixed(2)}</td></tr>
      <tr><td>P95</td><td>${result.latencyStats.p95.toFixed(2)}</td></tr>
      <tr><td>P99</td><td>${result.latencyStats.p99.toFixed(2)}</td></tr>
    </table>

    ${
      result.irMetrics
        ? `
    <h2>Information Retrieval Metrics</h2>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      ${Object.entries(result.irMetrics.precisionAtK)
        .map(([k, v]) => `<tr><td>Precision@${k}</td><td>${(v * 100).toFixed(1)}%</td></tr>`)
        .join('')}
      <tr><td>Recall</td><td>${(result.irMetrics.recall * 100).toFixed(1)}%</td></tr>
      <tr><td>F1 Score</td><td>${(result.irMetrics.f1 * 100).toFixed(1)}%</td></tr>
      <tr><td>MRR</td><td>${result.irMetrics.mrr.toFixed(3)}</td></tr>
      <tr><td>MAP</td><td>${result.irMetrics.map.toFixed(3)}</td></tr>
      <tr><td>NDCG</td><td>${result.irMetrics.ndcg.toFixed(3)}</td></tr>
    </table>
    `
        : ''
    }

    <h2>Aggregated Metrics</h2>
    <table>
      <tr><th>Metric</th><th>Value</th><th>Std Dev</th></tr>
      ${result.aggregatedMetrics
        .map(
          m => `
        <tr>
          <td>${m.name}</td>
          <td>${m.unit === 'ratio' ? (m.value * 100).toFixed(1) + '%' : m.value.toFixed(3)}</td>
          <td>${m.stdDev?.toFixed(3) ?? '-'}</td>
        </tr>
      `
        )
        .join('')}
    </table>

    <footer>
      Generated by seu-claude benchmark framework
    </footer>
  </div>
</body>
</html>`;
  }

  // === LaTeX Format ===

  private generateLaTeX(result: BenchmarkSuiteResult, config: ReportConfig): string {
    const title = config.title ?? `Benchmark Report: ${result.config.name}`;
    const passed = result.testResults.filter(r => r.passed).length;
    const total = result.testResults.length;

    let latex = `\\documentclass{article}
\\usepackage{booktabs}
\\usepackage{siunitx}

\\title{${this.escapeLatex(title)}}
\\date{${result.timestamp}}

\\begin{document}
\\maketitle

\\section{Summary}
\\begin{table}[h]
\\centering
\\begin{tabular}{lr}
\\toprule
\\textbf{Metric} & \\textbf{Value} \\\\
\\midrule
Total Tests & ${total} \\\\
Passed & ${passed} (${((passed / total) * 100).toFixed(1)}\\%) \\\\
Failed & ${total - passed} \\\\
Total Time & \\SI{${(result.totalExecutionTimeMs / 1000).toFixed(2)}}{s} \\\\
\\bottomrule
\\end{tabular}
\\caption{Benchmark Summary}
\\end{table}

\\section{Latency Statistics}
\\begin{table}[h]
\\centering
\\begin{tabular}{lr}
\\toprule
\\textbf{Percentile} & \\textbf{Value (ms)} \\\\
\\midrule
P50 & ${result.latencyStats.p50.toFixed(2)} \\\\
P95 & ${result.latencyStats.p95.toFixed(2)} \\\\
P99 & ${result.latencyStats.p99.toFixed(2)} \\\\
Mean & ${result.latencyStats.mean.toFixed(2)} $\\pm$ ${result.latencyStats.stdDev.toFixed(2)} \\\\
\\bottomrule
\\end{tabular}
\\caption{Latency Distribution}
\\end{table}
`;

    if (result.irMetrics) {
      latex += `
\\section{Information Retrieval Metrics}
\\begin{table}[h]
\\centering
\\begin{tabular}{lr}
\\toprule
\\textbf{Metric} & \\textbf{Value} \\\\
\\midrule
${Object.entries(result.irMetrics.precisionAtK)
  .map(([k, v]) => `Precision@${k} & ${(v * 100).toFixed(1)}\\% \\\\`)
  .join('\n')}
Recall & ${(result.irMetrics.recall * 100).toFixed(1)}\\% \\\\
F1 Score & ${(result.irMetrics.f1 * 100).toFixed(1)}\\% \\\\
MRR & ${result.irMetrics.mrr.toFixed(3)} \\\\
MAP & ${result.irMetrics.map.toFixed(3)} \\\\
NDCG & ${result.irMetrics.ndcg.toFixed(3)} \\\\
\\bottomrule
\\end{tabular}
\\caption{Information Retrieval Metrics}
\\end{table}
`;
    }

    latex += `
\\end{document}
`;

    return latex;
  }

  // === Comparison Reports ===

  private generateComparisonMarkdown(
    comparison: BenchmarkComparison,
    config: ReportConfig
  ): string {
    const title = config.title ?? 'Benchmark Comparison Report';

    let md = `# ${title}\n\n`;
    md += `**Baseline:** ${comparison.baseline.config.name} (${comparison.baseline.timestamp})  \n`;
    md += `**Current:** ${comparison.current.config.name} (${comparison.current.timestamp})  \n`;
    md += `**Overall Assessment:** ${comparison.assessment.toUpperCase()}  \n`;
    md += `\n---\n\n`;

    md += `## Metric Comparisons\n\n`;
    md += `| Metric | Baseline | Current | Change | Significant? |\n`;
    md += `|--------|----------|---------|--------|-------------|\n`;

    for (const mc of comparison.metricComparisons) {
      const change =
        mc.percentChange >= 0
          ? `+${mc.percentChange.toFixed(1)}%`
          : `${mc.percentChange.toFixed(1)}%`;
      const sig = mc.isSignificant ? (mc.percentChange > 0 ? '✅ Yes' : '⚠️ Yes') : 'No';
      md += `| ${mc.metricName} | ${mc.baselineValue.toFixed(3)} | ${mc.currentValue.toFixed(3)} | ${change} | ${sig} |\n`;
    }

    md += `\n`;
    md += `### Statistical Details\n\n`;
    md += `- Significance level: ${(comparison.significanceLevel * 100).toFixed(1)}%\n`;
    md += `- Effect sizes reported using Cohen's d\n`;

    return md;
  }

  private generateComparisonHTML(comparison: BenchmarkComparison, _config: ReportConfig): string {
    // Simplified HTML comparison report
    return `<!DOCTYPE html>
<html><head><title>Benchmark Comparison</title></head>
<body>
<h1>Benchmark Comparison</h1>
<p>Assessment: <strong>${comparison.assessment.toUpperCase()}</strong></p>
<pre>${JSON.stringify(comparison.metricComparisons, null, 2)}</pre>
</body></html>`;
  }

  private generateComparisonLaTeX(comparison: BenchmarkComparison, _config: ReportConfig): string {
    return `\\documentclass{article}
\\begin{document}
\\section{Benchmark Comparison}
Assessment: ${comparison.assessment}

Significance Level: ${(comparison.significanceLevel * 100).toFixed(1)}\\%
\\end{document}`;
  }

  // === Helpers ===

  private getExtension(format: ReportFormat): string {
    switch (format) {
      case 'json':
        return 'json';
      case 'html':
        return 'html';
      case 'latex':
        return 'tex';
      case 'markdown':
        return 'md';
      default:
        return 'txt';
    }
  }

  private escapeLatex(text: string): string {
    return text
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/[&%$#_{}]/g, '\\$&')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  }
}
