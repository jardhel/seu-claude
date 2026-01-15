/**
 * Search Cross-References Tool
 * Query callers/callees relationships for functions and methods
 */

import { z } from 'zod';
import { Config, loadConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { readFile, access } from 'fs/promises';
import { join } from 'path';

export const SearchXrefsArgsSchema = z.object({
  symbol: z.string().describe('The function/method name to search for'),
  direction: z
    .enum(['callers', 'callees', 'both'])
    .optional()
    .default('both')
    .describe('Direction to search: callers (who calls this), callees (what this calls), or both'),
  maxResults: z
    .number()
    .optional()
    .default(20)
    .describe('Maximum number of results to return'),
});

export type SearchXrefsArgs = z.infer<typeof SearchXrefsArgsSchema>;

interface XrefResult {
  symbol: string;
  direction: 'caller' | 'callee';
  file: string;
  line?: number;
  context?: string;
}

interface StoredXrefGraph {
  definitions: Record<
    string,
    {
      name: string;
      type: string;
      filePath: string;
      startLine: number;
      endLine: number;
      calls: string[];
      calledBy: string[];
    }
  >;
  callSites: Record<string, Array<{ file: string; line: number; caller: string }>>;
}

export class SearchXrefs {
  private config: Config;
  private log = logger.child('search-xrefs');
  private xrefGraph: StoredXrefGraph | null = null;

  constructor(config: Config) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    await this.loadXrefGraph();
  }

  private async loadXrefGraph(): Promise<void> {
    const xrefPath = join(this.config.dataDir, 'xref-graph.json');

    try {
      await access(xrefPath);
      const content = await readFile(xrefPath, 'utf-8');
      this.xrefGraph = JSON.parse(content) as StoredXrefGraph;
      this.log.info(`Loaded cross-reference graph with ${Object.keys(this.xrefGraph.definitions).length} definitions`);
    } catch {
      this.log.warn('No cross-reference graph found. Run indexing first.');
      this.xrefGraph = null;
    }
  }

  async execute(args: SearchXrefsArgs): Promise<string> {
    const { symbol, direction, maxResults } = args;

    if (!this.xrefGraph) {
      await this.loadXrefGraph();
      if (!this.xrefGraph) {
        return JSON.stringify({
          error: 'Cross-reference graph not available. Please run indexing first.',
          suggestion: 'Use the index_codebase tool to index your codebase with cross-references enabled.',
        });
      }
    }

    const results: XrefResult[] = [];

    // Search for callers
    if (direction === 'callers' || direction === 'both') {
      const callSites = this.xrefGraph.callSites[symbol] || [];
      for (const site of callSites.slice(0, maxResults)) {
        results.push({
          symbol: site.caller,
          direction: 'caller',
          file: site.file,
          line: site.line,
          context: `Called from ${site.caller} at line ${site.line}`,
        });
      }

      // Also check definitions that have this in their calledBy
      for (const [fqn, def] of Object.entries(this.xrefGraph.definitions)) {
        if (def.name === symbol && def.calledBy.length > 0) {
          for (const caller of def.calledBy.slice(0, maxResults - results.length)) {
            if (!results.some(r => r.symbol === caller && r.direction === 'caller')) {
              results.push({
                symbol: caller,
                direction: 'caller',
                file: def.filePath,
                context: `${fqn} is called by ${caller}`,
              });
            }
          }
        }
      }
    }

    // Search for callees
    if (direction === 'callees' || direction === 'both') {
      // Find definitions matching the symbol
      for (const [fqn, def] of Object.entries(this.xrefGraph.definitions)) {
        if (def.name === symbol || fqn === symbol || fqn.endsWith(`.${symbol}`)) {
          for (const callee of def.calls.slice(0, maxResults - results.length)) {
            results.push({
              symbol: callee,
              direction: 'callee',
              file: def.filePath,
              line: def.startLine,
              context: `${fqn} calls ${callee}`,
            });
          }
        }
      }
    }

    if (results.length === 0) {
      // Try to find partial matches
      const partialMatches: string[] = [];
      for (const [fqn, def] of Object.entries(this.xrefGraph.definitions)) {
        if (def.name.toLowerCase().includes(symbol.toLowerCase())) {
          partialMatches.push(fqn);
        }
      }

      if (partialMatches.length > 0) {
        return JSON.stringify({
          message: `No exact match for "${symbol}". Did you mean one of these?`,
          suggestions: partialMatches.slice(0, 10),
          totalDefinitions: Object.keys(this.xrefGraph.definitions).length,
        });
      }

      return JSON.stringify({
        message: `No references found for "${symbol}"`,
        suggestion: 'The symbol may not be indexed or may be a built-in function.',
        totalDefinitions: Object.keys(this.xrefGraph.definitions).length,
      });
    }

    // Group results by direction
    const callers = results.filter(r => r.direction === 'caller');
    const callees = results.filter(r => r.direction === 'callee');

    return JSON.stringify({
      symbol,
      summary: {
        totalCallers: callers.length,
        totalCallees: callees.length,
      },
      callers: callers.map(r => ({
        caller: r.symbol,
        file: r.file,
        line: r.line,
      })),
      callees: callees.map(r => ({
        callee: r.symbol,
        definedIn: r.file,
      })),
    });
  }

  /**
   * Get all definitions for a specific file
   */
  async getFileSymbols(filePath: string): Promise<string> {
    if (!this.xrefGraph) {
      await this.loadXrefGraph();
      if (!this.xrefGraph) {
        return JSON.stringify({ error: 'Cross-reference graph not available' });
      }
    }

    const symbols = Object.entries(this.xrefGraph.definitions)
      .filter(([_, def]) => def.filePath === filePath || def.filePath.endsWith(filePath))
      .map(([fqn, def]) => ({
        name: def.name,
        fqn,
        type: def.type,
        line: def.startLine,
        calls: def.calls.length,
        calledBy: def.calledBy.length,
      }));

    return JSON.stringify({
      file: filePath,
      symbols,
      total: symbols.length,
    });
  }

  /**
   * Get statistics about the cross-reference graph
   */
  getStats(): string {
    if (!this.xrefGraph) {
      return JSON.stringify({ error: 'Cross-reference graph not available' });
    }

    const definitions = Object.values(this.xrefGraph.definitions);
    const totalCalls = definitions.reduce((sum, d) => sum + d.calls.length, 0);
    const totalCallSites = Object.values(this.xrefGraph.callSites).reduce(
      (sum, sites) => sum + sites.length,
      0
    );

    // Find most called functions
    const callCounts = new Map<string, number>();
    for (const [symbol, sites] of Object.entries(this.xrefGraph.callSites)) {
      callCounts.set(symbol, sites.length);
    }

    const mostCalled = [...callCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, callCount: count }));

    // Find functions with most dependencies
    const mostDependencies = definitions
      .filter(d => d.calls.length > 0)
      .sort((a, b) => b.calls.length - a.calls.length)
      .slice(0, 10)
      .map(d => ({ name: d.name, file: d.filePath, dependencies: d.calls.length }));

    return JSON.stringify({
      totalDefinitions: definitions.length,
      totalCallRelationships: totalCalls,
      totalCallSites: totalCallSites,
      mostCalledFunctions: mostCalled,
      functionsWithMostDependencies: mostDependencies,
    });
  }
}

// Factory function
export async function createSearchXrefs(config?: Config): Promise<SearchXrefs> {
  const cfg = config ?? loadConfig();
  const tool = new SearchXrefs(cfg);
  await tool.initialize();
  return tool;
}
