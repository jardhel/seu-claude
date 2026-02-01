/**
 * Seu-Claude VSCode Extension
 *
 * Provides IDE integration for the seu-claude AI development framework:
 * - Task DAG visualization and management
 * - TDD workflow status bar
 * - Dependency graph visualization
 * - Symbol resolution CodeLens
 * - MCP tool integration
 */

import * as vscode from 'vscode';
import { TaskTreeProvider } from './providers/TaskTreeProvider';
import { DependencyTreeProvider } from './providers/DependencyTreeProvider';
import { SymbolCodeLensProvider } from './providers/SymbolCodeLensProvider';
import { TddStatusBar } from './views/TddStatusBar';
import { DependencyGraphPanel } from './views/DependencyGraphPanel';
import { SeuClaudeClient } from './SeuClaudeClient';
import * as commands from './commands';

let client: SeuClaudeClient;
let tddStatusBar: TddStatusBar;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Seu-Claude extension is activating...');

  // Initialize MCP client
  client = new SeuClaudeClient();
  await client.connect();

  // Register Tree View Providers
  const taskTreeProvider = new TaskTreeProvider(client);
  const dependencyTreeProvider = new DependencyTreeProvider(client);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('seuClaudeTasks', taskTreeProvider),
    vscode.window.registerTreeDataProvider('seuClaudeDependencies', dependencyTreeProvider)
  );

  // Register CodeLens Provider
  const config = vscode.workspace.getConfiguration('seu-claude');
  if (config.get('enableCodeLens')) {
    const codeLensProvider = new SymbolCodeLensProvider(client);
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        [
          { language: 'typescript' },
          { language: 'javascript' },
          { language: 'typescriptreact' },
          { language: 'javascriptreact' },
          { language: 'python' },
        ],
        codeLensProvider
      )
    );
  }

  // Register TDD Status Bar
  if (config.get('showTddStatusBar')) {
    tddStatusBar = new TddStatusBar();
    context.subscriptions.push(tddStatusBar);
  }

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('seu-claude.refreshTasks', () => {
      taskTreeProvider.refresh();
    }),

    vscode.commands.registerCommand('seu-claude.createTask', async () => {
      await commands.createTask(client);
      taskTreeProvider.refresh();
    }),

    vscode.commands.registerCommand('seu-claude.completeTask', async (taskItem) => {
      await commands.completeTask(client, taskItem.id);
      taskTreeProvider.refresh();
    }),

    vscode.commands.registerCommand('seu-claude.analyzeDependencies', async () => {
      await commands.analyzeDependencies(client);
      dependencyTreeProvider.refresh();
    }),

    vscode.commands.registerCommand('seu-claude.runTDD', async () => {
      await commands.runTDD(client, tddStatusBar);
    }),

    vscode.commands.registerCommand('seu-claude.findSymbol', async () => {
      await commands.findSymbol(client);
    }),

    vscode.commands.registerCommand('seu-claude.validateCode', async () => {
      await commands.validateCode(client);
    }),

    vscode.commands.registerCommand('seu-claude.showDependencyGraph', () => {
      DependencyGraphPanel.createOrShow(context.extensionUri, client);
    })
  );

  // Auto-refresh on file changes
  if (config.get('autoRefreshTasks')) {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    context.subscriptions.push(
      watcher.onDidChange(() => taskTreeProvider.refresh()),
      watcher.onDidCreate(() => taskTreeProvider.refresh()),
      watcher.onDidDelete(() => taskTreeProvider.refresh()),
      watcher
    );
  }

  console.log('Seu-Claude extension activated successfully');
}

export function deactivate(): void {
  if (client) {
    client.disconnect();
  }
  console.log('Seu-Claude extension deactivated');
}
