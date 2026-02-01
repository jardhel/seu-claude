/**
 * Dependency Tree Provider
 *
 * Displays the dependency graph for the current file or workspace
 * in a tree view sidebar.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { SeuClaudeClient, DependencyNode } from '../SeuClaudeClient';

export class DependencyItem extends vscode.TreeItem {
  constructor(
    public readonly node: DependencyNode,
    public readonly type: 'file' | 'import' | 'export' | 'symbol',
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(DependencyItem.getLabel(node, type), collapsibleState);

    this.tooltip = this.getTooltip();
    this.contextValue = type;
    this.iconPath = this.getIcon();

    if (type === 'file') {
      this.resourceUri = vscode.Uri.file(node.file);
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [this.resourceUri],
      };
    }
  }

  private static getLabel(node: DependencyNode, type: 'file' | 'import' | 'export' | 'symbol'): string {
    switch (type) {
      case 'file':
        return path.basename(node.file);
      case 'import':
        return `Imports (${node.imports.length})`;
      case 'export':
        return `Exports (${node.exports.length})`;
      case 'symbol':
        return `Symbols (${node.symbols.length})`;
      default:
        return node.file;
    }
  }

  private getTooltip(): string {
    switch (this.type) {
      case 'file':
        return this.node.file;
      case 'import':
        return this.node.imports.join('\n');
      case 'export':
        return this.node.exports.join('\n');
      default:
        return '';
    }
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.type) {
      case 'file':
        return new vscode.ThemeIcon('file-code');
      case 'import':
        return new vscode.ThemeIcon('arrow-down');
      case 'export':
        return new vscode.ThemeIcon('arrow-up');
      case 'symbol':
        return new vscode.ThemeIcon('symbol-function');
      default:
        return new vscode.ThemeIcon('file');
    }
  }
}

export class ImportItem extends vscode.TreeItem {
  constructor(public readonly importPath: string) {
    super(importPath, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('package');
    this.contextValue = 'import';
  }
}

export class ExportItem extends vscode.TreeItem {
  constructor(public readonly exportName: string) {
    super(exportName, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('symbol-variable');
    this.contextValue = 'export';
  }
}

export class SymbolItem extends vscode.TreeItem {
  constructor(
    public readonly symbolName: string,
    public readonly symbolType: string,
    public readonly file: string,
    public readonly line: number
  ) {
    super(symbolName, vscode.TreeItemCollapsibleState.None);
    this.description = symbolType;
    this.iconPath = this.getSymbolIcon(symbolType);
    this.contextValue = 'symbol';

    this.command = {
      command: 'vscode.open',
      title: 'Go to Definition',
      arguments: [
        vscode.Uri.file(file),
        { selection: new vscode.Range(line - 1, 0, line - 1, 0) }
      ],
    };
  }

  private getSymbolIcon(type: string): vscode.ThemeIcon {
    switch (type) {
      case 'function':
        return new vscode.ThemeIcon('symbol-function');
      case 'class':
        return new vscode.ThemeIcon('symbol-class');
      case 'interface':
        return new vscode.ThemeIcon('symbol-interface');
      case 'variable':
        return new vscode.ThemeIcon('symbol-variable');
      case 'type':
        return new vscode.ThemeIcon('symbol-type-parameter');
      default:
        return new vscode.ThemeIcon('symbol-misc');
    }
  }
}

type TreeItem = DependencyItem | ImportItem | ExportItem | SymbolItem;

export class DependencyTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private nodes: DependencyNode[] = [];
  private currentFile: string | null = null;

  constructor(private client: SeuClaudeClient) {
    // Watch for active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        this.currentFile = editor.document.uri.fsPath;
        this.refresh();
      }
    });

    // Initialize with current editor
    if (vscode.window.activeTextEditor) {
      this.currentFile = vscode.window.activeTextEditor.document.uri.fsPath;
    }
  }

  refresh(): void {
    this.loadDependencies();
  }

  private async loadDependencies(): Promise<void> {
    if (!this.currentFile) {
      this.nodes = [];
      this._onDidChangeTreeData.fire();
      return;
    }

    try {
      this.nodes = await this.client.analyzeDependencies([this.currentFile]);
      this._onDidChangeTreeData.fire();
    } catch (error) {
      console.error('Failed to load dependencies:', error);
    }
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    if (!element) {
      // Root level - return file nodes
      return Promise.resolve(
        this.nodes.map(
          (node) =>
            new DependencyItem(node, 'file', vscode.TreeItemCollapsibleState.Collapsed)
        )
      );
    }

    if (element instanceof DependencyItem) {
      switch (element.type) {
        case 'file':
          // Return imports, exports, symbols as children
          const children: TreeItem[] = [];
          if (element.node.imports.length > 0) {
            children.push(
              new DependencyItem(
                element.node,
                'import',
                vscode.TreeItemCollapsibleState.Collapsed
              )
            );
          }
          if (element.node.exports.length > 0) {
            children.push(
              new DependencyItem(
                element.node,
                'export',
                vscode.TreeItemCollapsibleState.Collapsed
              )
            );
          }
          if (element.node.symbols.length > 0) {
            children.push(
              new DependencyItem(
                element.node,
                'symbol',
                vscode.TreeItemCollapsibleState.Collapsed
              )
            );
          }
          return Promise.resolve(children);

        case 'import':
          return Promise.resolve(
            element.node.imports.map((imp) => new ImportItem(imp))
          );

        case 'export':
          return Promise.resolve(
            element.node.exports.map((exp) => new ExportItem(exp))
          );

        case 'symbol':
          return Promise.resolve(
            element.node.symbols.map(
              (sym) => new SymbolItem(sym.name, sym.type, element.node.file, sym.line)
            )
          );
      }
    }

    return Promise.resolve([]);
  }
}
