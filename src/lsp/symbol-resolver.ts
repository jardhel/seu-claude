/**
 * SymbolResolver - Hybrid symbol resolution using LSP primary, TreeSitter fallback
 *
 * Uses LSP (Language Server Protocol) for accurate symbol resolution when available,
 * falls back to TreeSitter-based analysis when LSP is unavailable.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { LSPClient, createLSPClient, SymbolKind } from './client.js';
import { TreeSitterAdapter } from '../adapters/parsers/TreeSitterAdapter.js';
import { RecursiveScout } from '../core/usecases/RecursiveScout.js';
import type { CodeSymbol } from '../config/LanguageStrategy.js';
import { logger } from '../utils/logger.js';

export interface SymbolDefinition {
  file: string;
  line: number;
  character?: number;
  type: string;
  name: string;
  source: 'lsp' | 'treesitter';
}

export interface SymbolReference {
  file: string;
  line: number;
  character?: number;
  source: 'lsp' | 'treesitter';
}

export interface SymbolResolutionResult {
  symbolName: string;
  definitions: SymbolDefinition[];
  references: SymbolReference[];
  definitionCount: number;
  referenceCount: number;
  source: 'lsp' | 'treesitter' | 'hybrid';
}

// Map LSP symbol kinds to our string types
const LSP_KIND_TO_TYPE: Record<number, string> = {
  [SymbolKind.File]: 'file',
  [SymbolKind.Module]: 'module',
  [SymbolKind.Namespace]: 'namespace',
  [SymbolKind.Package]: 'package',
  [SymbolKind.Class]: 'class',
  [SymbolKind.Method]: 'method',
  [SymbolKind.Property]: 'property',
  [SymbolKind.Field]: 'field',
  [SymbolKind.Constructor]: 'constructor',
  [SymbolKind.Enum]: 'enum',
  [SymbolKind.Interface]: 'interface',
  [SymbolKind.Function]: 'function',
  [SymbolKind.Variable]: 'variable',
  [SymbolKind.Constant]: 'const',
  [SymbolKind.String]: 'string',
  [SymbolKind.Number]: 'number',
  [SymbolKind.Boolean]: 'boolean',
  [SymbolKind.Array]: 'array',
  [SymbolKind.Object]: 'object',
  [SymbolKind.Key]: 'key',
  [SymbolKind.Null]: 'null',
  [SymbolKind.EnumMember]: 'enum_member',
  [SymbolKind.Struct]: 'struct',
  [SymbolKind.Event]: 'event',
  [SymbolKind.Operator]: 'operator',
  [SymbolKind.TypeParameter]: 'type_parameter',
};

export class SymbolResolver {
  private projectRoot: string;
  private lspClient: LSPClient | null = null;
  private treeSitterAdapter: TreeSitterAdapter;
  private scout: RecursiveScout;
  private log = logger.child('symbol-resolver');
  private initialized = false;
  private lspAvailable = false;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.treeSitterAdapter = new TreeSitterAdapter();
    this.scout = new RecursiveScout(this.treeSitterAdapter);
  }

  /**
   * Initialize the resolver, attempting to start LSP
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Try to start LSP client
    try {
      this.lspClient = await createLSPClient(this.projectRoot);
      this.lspAvailable = this.lspClient !== null;
      if (this.lspAvailable) {
        this.log.info('LSP client initialized - using LSP for symbol resolution');
      } else {
        this.log.info('LSP unavailable - using TreeSitter fallback');
      }
    } catch (err) {
      this.log.warn('Failed to initialize LSP client:', err);
      this.lspAvailable = false;
    }

    this.initialized = true;
  }

  /**
   * Check if LSP is available
   */
  isLSPAvailable(): boolean {
    return this.lspAvailable && this.lspClient?.isAvailable() === true;
  }

  /**
   * Find symbol definitions and references
   */
  async findSymbol(symbolName: string, entryPoints: string[]): Promise<SymbolResolutionResult> {
    await this.initialize();

    // Try LSP first if available
    if (this.isLSPAvailable()) {
      const lspResult = await this.findSymbolWithLSP(symbolName, entryPoints);
      if (lspResult.definitionCount > 0 || lspResult.referenceCount > 0) {
        return lspResult;
      }
      this.log.debug('LSP returned no results, falling back to TreeSitter');
    }

    // Fall back to TreeSitter
    return this.findSymbolWithTreeSitter(symbolName, entryPoints);
  }

  /**
   * Find symbol using LSP
   */
  private async findSymbolWithLSP(
    symbolName: string,
    entryPoints: string[]
  ): Promise<SymbolResolutionResult> {
    const definitions: SymbolDefinition[] = [];
    const references: SymbolReference[] = [];

    if (!this.lspClient) {
      return {
        symbolName,
        definitions,
        references,
        definitionCount: 0,
        referenceCount: 0,
        source: 'lsp',
      };
    }

    try {
      // Search workspace for symbols matching the name
      const workspaceSymbols = await this.lspClient.searchWorkspaceSymbols(symbolName);

      if (workspaceSymbols && workspaceSymbols.length > 0) {
        for (const sym of workspaceSymbols) {
          // Only include exact matches or prefix matches
          if (sym.name === symbolName || sym.name.startsWith(symbolName)) {
            const filePath = sym.location.uri.replace('file://', '');
            definitions.push({
              file: filePath,
              line: sym.location.range.start.line + 1, // LSP is 0-indexed
              character: sym.location.range.start.character,
              type: LSP_KIND_TO_TYPE[sym.kind] || 'unknown',
              name: sym.name,
              source: 'lsp',
            });

            // Open file and get references
            if (existsSync(filePath)) {
              const content = await readFile(filePath, 'utf-8');
              await this.lspClient.openFile(filePath, content);

              const refs = await this.lspClient.getReferences(
                filePath,
                sym.location.range.start.line,
                sym.location.range.start.character,
                false // Don't include declaration
              );

              if (refs) {
                for (const ref of refs) {
                  const refPath = ref.uri.replace('file://', '');
                  references.push({
                    file: refPath,
                    line: ref.range.start.line + 1,
                    character: ref.range.start.character,
                    source: 'lsp',
                  });
                }
              }

              await this.lspClient.closeFile(filePath);
            }
          }
        }
      }

      // If no workspace symbols found, try to find in entry points
      if (definitions.length === 0) {
        for (const entryPoint of entryPoints) {
          if (!existsSync(entryPoint)) continue;

          const content = await readFile(entryPoint, 'utf-8');
          await this.lspClient.openFile(entryPoint, content);

          // Search for symbol in file content
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const col = lines[i].indexOf(symbolName);
            if (col !== -1) {
              // Try to get definition at this location
              const defs = await this.lspClient.getDefinition(entryPoint, i, col);
              if (defs && defs.length > 0) {
                for (const def of defs) {
                  const defPath = def.uri.replace('file://', '');
                  // Avoid duplicates
                  if (
                    !definitions.some(
                      d => d.file === defPath && d.line === def.range.start.line + 1
                    )
                  ) {
                    definitions.push({
                      file: defPath,
                      line: def.range.start.line + 1,
                      character: def.range.start.character,
                      type: 'unknown', // LSP definition doesn't include kind
                      name: symbolName,
                      source: 'lsp',
                    });
                  }
                }
              }
              break; // Found symbol in this file
            }
          }

          await this.lspClient.closeFile(entryPoint);
        }
      }
    } catch (err) {
      this.log.warn('LSP symbol search failed:', err);
    }

    return {
      symbolName,
      definitions,
      references,
      definitionCount: definitions.length,
      referenceCount: references.length,
      source: 'lsp',
    };
  }

  /**
   * Find symbol using TreeSitter (fallback)
   */
  private async findSymbolWithTreeSitter(
    symbolName: string,
    entryPoints: string[]
  ): Promise<SymbolResolutionResult> {
    const graph = await this.scout.buildDependencyGraph(entryPoints);
    const defs = await this.scout.findSymbolDefinitions(symbolName, graph);
    const callSites = await this.scout.findCallSites(symbolName, graph);

    const definitions: SymbolDefinition[] = defs.map(
      (d: { filePath: string; symbol: CodeSymbol }) => ({
        file: d.filePath,
        line: d.symbol.startLine,
        type: d.symbol.type,
        name: d.symbol.name,
        source: 'treesitter' as const,
      })
    );

    const references: SymbolReference[] = callSites.map(
      (c: { filePath: string; symbol: CodeSymbol }) => ({
        file: c.filePath,
        line: c.symbol.startLine,
        source: 'treesitter' as const,
      })
    );

    return {
      symbolName,
      definitions,
      references,
      definitionCount: definitions.length,
      referenceCount: references.length,
      source: 'treesitter',
    };
  }

  /**
   * Get hover information for a position (LSP only)
   */
  async getHoverInfo(filePath: string, line: number, character: number): Promise<string | null> {
    if (!this.isLSPAvailable() || !this.lspClient) {
      return null;
    }

    try {
      if (existsSync(filePath)) {
        const content = await readFile(filePath, 'utf-8');
        await this.lspClient.openFile(filePath, content);
        const hover = await this.lspClient.getHover(filePath, line - 1, character);
        await this.lspClient.closeFile(filePath);
        return hover;
      }
    } catch (err) {
      this.log.warn('Failed to get hover info:', err);
    }

    return null;
  }

  /**
   * Stop the resolver and clean up resources
   */
  async stop(): Promise<void> {
    if (this.lspClient) {
      await this.lspClient.stop();
      this.lspClient = null;
    }
    this.lspAvailable = false;
    this.initialized = false;
  }
}

/**
 * Create and initialize a symbol resolver
 */
export async function createSymbolResolver(projectRoot: string): Promise<SymbolResolver> {
  const resolver = new SymbolResolver(projectRoot);
  await resolver.initialize();
  return resolver;
}
