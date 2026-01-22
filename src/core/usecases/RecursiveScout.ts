import { resolve, dirname, extname } from 'path';
import { existsSync, statSync } from 'fs';
import { TreeSitterAdapter, ParseResult } from '../../adapters/parsers/TreeSitterAdapter';
import type { CodeSymbol, ImportStatement } from '../../config/LanguageStrategy';

/**
 * Represents a node in the dependency graph
 */
export interface DependencyNode {
  filePath: string;
  imports: ImportStatement[];
  symbols: CodeSymbol[];
  dependencies: string[]; // Resolved file paths this file depends on
  dependents: string[];   // Files that depend on this file
}

/**
 * Represents the full dependency graph
 */
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  roots: string[];        // Entry points (files with no dependents in the graph)
  leaves: string[];       // Files with no dependencies
  circularDeps: string[][]; // Detected circular dependencies
}

/**
 * Options for the RecursiveScout
 */
export interface ScoutOptions {
  /** Maximum depth to traverse (default: 50) */
  maxDepth?: number;
  /** Whether to follow node_modules imports (default: false) */
  includeNodeModules?: boolean;
  /** File extensions to consider when resolving imports */
  extensions?: string[];
  /** Directories to skip */
  excludeDirs?: string[];
}

const DEFAULT_OPTIONS: Required<ScoutOptions> = {
  maxDepth: 50,
  includeNodeModules: false,
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.py'],
  excludeDirs: ['node_modules', '.git', 'dist', 'build', '__pycache__'],
};

/**
 * RecursiveScout - Walks import graphs using Tree-Sitter AST navigation
 *
 * Features:
 * - Builds dependency graphs from entry points
 * - Resolves relative and absolute imports to file paths
 * - Detects circular dependencies
 * - Maps symbols to their source files
 */
export class RecursiveScout {
  private adapter: TreeSitterAdapter;
  private options: Required<ScoutOptions>;
  private parseCache: Map<string, ParseResult>;

  constructor(adapter?: TreeSitterAdapter, options?: ScoutOptions) {
    this.adapter = adapter || new TreeSitterAdapter();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.parseCache = new Map();
  }

  /**
   * Build a dependency graph starting from entry points
   */
  async buildDependencyGraph(entryPoints: string[]): Promise<DependencyGraph> {
    const nodes = new Map<string, DependencyNode>();
    const visited = new Set<string>();
    const circularDeps: string[][] = [];

    // Process each entry point
    for (const entry of entryPoints) {
      const resolvedEntry = resolve(entry);
      if (!existsSync(resolvedEntry)) {
        continue;
      }
      await this.walkDependencies(resolvedEntry, nodes, visited, [], circularDeps);
    }

    // Build reverse dependencies (dependents)
    for (const [filePath, node] of nodes) {
      for (const dep of node.dependencies) {
        const depNode = nodes.get(dep);
        if (depNode && !depNode.dependents.includes(filePath)) {
          depNode.dependents.push(filePath);
        }
      }
    }

    // Find roots (files with no dependents) and leaves (files with no dependencies)
    const roots: string[] = [];
    const leaves: string[] = [];

    for (const [filePath, node] of nodes) {
      if (node.dependents.length === 0) {
        roots.push(filePath);
      }
      if (node.dependencies.length === 0) {
        leaves.push(filePath);
      }
    }

    return { nodes, roots, leaves, circularDeps };
  }

  /**
   * Recursively walk dependencies
   */
  private async walkDependencies(
    filePath: string,
    nodes: Map<string, DependencyNode>,
    visited: Set<string>,
    currentPath: string[],
    circularDeps: string[][],
    depth: number = 0
  ): Promise<void> {
    // Check depth limit
    if (depth > this.options.maxDepth) {
      return;
    }

    // Check for circular dependency
    const cycleIndex = currentPath.indexOf(filePath);
    if (cycleIndex !== -1) {
      const cycle = [...currentPath.slice(cycleIndex), filePath];
      circularDeps.push(cycle);
      return;
    }

    // Skip if already visited
    if (visited.has(filePath)) {
      return;
    }
    visited.add(filePath);

    // Skip unsupported files
    if (!this.adapter.isSupported(filePath)) {
      return;
    }

    // Parse the file
    const parseResult = await this.parseFile(filePath);
    const dependencies: string[] = [];

    // Resolve imports to file paths
    for (const imp of parseResult.imports) {
      const resolved = this.resolveImport(imp.modulePath, filePath);
      if (resolved && !dependencies.includes(resolved)) {
        dependencies.push(resolved);
      }
    }

    // Create node
    const node: DependencyNode = {
      filePath,
      imports: parseResult.imports,
      symbols: parseResult.symbols,
      dependencies,
      dependents: [],
    };
    nodes.set(filePath, node);

    // Recursively process dependencies
    const newPath = [...currentPath, filePath];
    for (const dep of dependencies) {
      await this.walkDependencies(dep, nodes, visited, newPath, circularDeps, depth + 1);
    }
  }

  /**
   * Parse a file (with caching)
   */
  private async parseFile(filePath: string): Promise<ParseResult> {
    if (this.parseCache.has(filePath)) {
      return this.parseCache.get(filePath)!;
    }

    const result = await this.adapter.parseFile(filePath);
    this.parseCache.set(filePath, result);
    return result;
  }

  /**
   * Resolve an import path to an actual file path
   */
  resolveImport(importPath: string, fromFile: string): string | null {
    // Skip node_modules unless explicitly included
    if (!this.options.includeNodeModules && !importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null;
    }

    const fromDir = dirname(fromFile);

    // Handle relative imports
    if (importPath.startsWith('.')) {
      return this.resolveRelativeImport(importPath, fromDir);
    }

    // Handle absolute imports (less common, project-specific)
    if (importPath.startsWith('/')) {
      return this.resolveWithExtensions(importPath);
    }

    return null;
  }

  /**
   * Resolve a relative import
   */
  private resolveRelativeImport(importPath: string, fromDir: string): string | null {
    const basePath = resolve(fromDir, importPath);
    return this.resolveWithExtensions(basePath);
  }

  /**
   * Try resolving with different extensions
   */
  private resolveWithExtensions(basePath: string): string | null {
    // Check if it's already a file with extension
    if (existsSync(basePath) && statSync(basePath).isFile()) {
      return basePath;
    }

    // Try adding extensions
    for (const ext of this.options.extensions) {
      const withExt = basePath + ext;
      if (existsSync(withExt) && statSync(withExt).isFile()) {
        return withExt;
      }
    }

    // Try index files
    for (const ext of this.options.extensions) {
      const indexPath = resolve(basePath, 'index' + ext);
      if (existsSync(indexPath) && statSync(indexPath).isFile()) {
        return indexPath;
      }
    }

    return null;
  }

  /**
   * Find all files that define a symbol
   */
  async findSymbolDefinitions(
    symbolName: string,
    graph: DependencyGraph
  ): Promise<{ filePath: string; symbol: CodeSymbol }[]> {
    const results: { filePath: string; symbol: CodeSymbol }[] = [];

    for (const [filePath, node] of graph.nodes) {
      for (const symbol of node.symbols) {
        if (symbol.name === symbolName && symbol.type !== 'call') {
          results.push({ filePath, symbol });
        }
      }
    }

    return results;
  }

  /**
   * Find all call sites for a symbol
   */
  async findCallSites(
    symbolName: string,
    graph: DependencyGraph
  ): Promise<{ filePath: string; symbol: CodeSymbol }[]> {
    const results: { filePath: string; symbol: CodeSymbol }[] = [];

    for (const [filePath, node] of graph.nodes) {
      for (const symbol of node.symbols) {
        if (symbol.type === 'call' && symbol.callee === symbolName) {
          results.push({ filePath, symbol });
        }
      }
    }

    return results;
  }

  /**
   * Get the import chain from one file to another
   */
  findImportPath(
    fromFile: string,
    toFile: string,
    graph: DependencyGraph
  ): string[] | null {
    const visited = new Set<string>();
    const queue: { file: string; path: string[] }[] = [{ file: fromFile, path: [fromFile] }];

    while (queue.length > 0) {
      const { file, path } = queue.shift()!;

      if (file === toFile) {
        return path;
      }

      if (visited.has(file)) {
        continue;
      }
      visited.add(file);

      const node = graph.nodes.get(file);
      if (node) {
        for (const dep of node.dependencies) {
          if (!visited.has(dep)) {
            queue.push({ file: dep, path: [...path, dep] });
          }
        }
      }
    }

    return null;
  }

  /**
   * Get statistics about the dependency graph
   */
  getGraphStats(graph: DependencyGraph): {
    totalFiles: number;
    totalImports: number;
    totalSymbols: number;
    avgDependencies: number;
    maxDependencies: { file: string; count: number };
    circularCount: number;
  } {
    let totalImports = 0;
    let totalSymbols = 0;
    let maxDeps = { file: '', count: 0 };

    for (const [filePath, node] of graph.nodes) {
      totalImports += node.imports.length;
      totalSymbols += node.symbols.length;
      if (node.dependencies.length > maxDeps.count) {
        maxDeps = { file: filePath, count: node.dependencies.length };
      }
    }

    const totalFiles = graph.nodes.size;
    const avgDependencies = totalFiles > 0
      ? Array.from(graph.nodes.values()).reduce((sum, n) => sum + n.dependencies.length, 0) / totalFiles
      : 0;

    return {
      totalFiles,
      totalImports,
      totalSymbols,
      avgDependencies: Math.round(avgDependencies * 100) / 100,
      maxDependencies: maxDeps,
      circularCount: graph.circularDeps.length,
    };
  }

  /**
   * Clear the parse cache
   */
  clearCache(): void {
    this.parseCache.clear();
  }
}
