/**
 * Symbol CodeLens Provider
 *
 * Shows inline CodeLens above function/class definitions with:
 * - Reference count
 * - Quick actions (find references, analyze dependencies)
 */

import * as vscode from 'vscode';
import { SeuClaudeClient } from '../SeuClaudeClient';

export class SymbolCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  // Cache for symbol info to avoid repeated lookups
  private symbolCache = new Map<string, { references: number; timestamp: number }>();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(private client: SeuClaudeClient) {
    // Refresh CodeLens when document changes
    vscode.workspace.onDidChangeTextDocument(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();

    // Find function and class definitions
    const patterns = [
      // TypeScript/JavaScript functions
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
      // Arrow functions assigned to const/let
      /^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/gm,
      // Class definitions
      /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm,
      // Interface definitions (TypeScript)
      /^(?:export\s+)?interface\s+(\w+)/gm,
      // Type definitions (TypeScript)
      /^(?:export\s+)?type\s+(\w+)/gm,
      // Python functions
      /^(?:async\s+)?def\s+(\w+)/gm,
      // Python classes
      /^class\s+(\w+)/gm,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const symbolName = match[1];
        const position = document.positionAt(match.index);
        const range = new vscode.Range(position, position);

        // Get reference count (from cache or API)
        const refCount = await this.getReferenceCount(document.uri.fsPath, symbolName);

        // Add CodeLens for references
        const referencesLens = new vscode.CodeLens(range, {
          title: `${refCount} reference${refCount !== 1 ? 's' : ''}`,
          command: 'editor.action.findReferences',
          arguments: [document.uri, position],
        });
        codeLenses.push(referencesLens);

        // Add CodeLens for analyzing dependencies
        const analyzeLens = new vscode.CodeLens(range, {
          title: 'Analyze',
          command: 'seu-claude.findSymbol',
          arguments: [symbolName],
          tooltip: `Analyze dependencies for ${symbolName}`,
        });
        codeLenses.push(analyzeLens);
      }
    }

    return codeLenses;
  }

  resolveCodeLens(
    codeLens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens> {
    return codeLens;
  }

  private async getReferenceCount(filePath: string, symbolName: string): Promise<number> {
    const cacheKey = `${filePath}:${symbolName}`;
    const cached = this.symbolCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.references;
    }

    try {
      const symbolInfo = await this.client.findSymbol(symbolName, [filePath]);
      const refCount = symbolInfo?.references?.length ?? 0;

      this.symbolCache.set(cacheKey, {
        references: refCount,
        timestamp: Date.now(),
      });

      return refCount;
    } catch {
      // Return 0 on error to avoid blocking the UI
      return 0;
    }
  }

  // Clear cache when needed
  clearCache(): void {
    this.symbolCache.clear();
    this._onDidChangeCodeLenses.fire();
  }
}
