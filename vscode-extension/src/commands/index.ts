/**
 * Command Handlers
 *
 * Implements all command palette commands for the seu-claude extension.
 */

import * as vscode from 'vscode';
import { SeuClaudeClient } from '../SeuClaudeClient';
import { TddStatusBar } from '../views/TddStatusBar';

/**
 * Create a new task
 */
export async function createTask(client: SeuClaudeClient): Promise<void> {
  const label = await vscode.window.showInputBox({
    prompt: 'Enter task label',
    placeHolder: 'e.g., Implement user authentication',
  });

  if (!label) {
    return;
  }

  try {
    const task = await client.createTask(label);
    vscode.window.showInformationMessage(`Created task: ${task.label}`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Complete a task
 */
export async function completeTask(client: SeuClaudeClient, taskId: string): Promise<void> {
  try {
    const task = await client.updateTaskStatus(taskId, 'completed');
    vscode.window.showInformationMessage(`Completed task: ${task.label}`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Analyze dependencies for current file
 */
export async function analyzeDependencies(client: SeuClaudeClient): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active file to analyze');
    return;
  }

  const filePath = editor.document.uri.fsPath;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Analyzing dependencies...',
      cancellable: false,
    },
    async () => {
      try {
        const nodes = await client.analyzeDependencies([filePath]);
        const totalImports = nodes.reduce((acc, n) => acc + n.imports.length, 0);
        const totalExports = nodes.reduce((acc, n) => acc + n.exports.length, 0);

        vscode.window.showInformationMessage(
          `Found ${nodes.length} files, ${totalImports} imports, ${totalExports} exports`
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to analyze dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );
}

/**
 * Run TDD cycle
 */
export async function runTDD(
  client: SeuClaudeClient,
  statusBar: TddStatusBar | undefined
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active file');
    return;
  }

  // Determine if this is a test file or implementation file
  const filePath = editor.document.uri.fsPath;
  const isTestFile = filePath.includes('.test.') || filePath.includes('.spec.');

  let testFilePath: string;
  let implFilePath: string;

  if (isTestFile) {
    testFilePath = filePath;
    implFilePath = filePath
      .replace('.test.', '.')
      .replace('.spec.', '.');
  } else {
    implFilePath = filePath;
    testFilePath = filePath
      .replace(/\.(\w+)$/, '.test.$1');
  }

  statusBar?.showProgress('Running tests...');

  try {
    // Get file contents
    const testDoc = await vscode.workspace.openTextDocument(testFilePath);
    const implDoc = await vscode.workspace.openTextDocument(implFilePath);

    const result = await client.runTDD(
      testDoc.getText(),
      implDoc.getText(),
      testFilePath,
      implFilePath
    );

    statusBar?.setPhase(result.phase);

    if (result.testsPassed && result.lintPassed) {
      vscode.window.showInformationMessage(`TDD: ${result.message}`);
    } else {
      vscode.window.showWarningMessage(`TDD: ${result.message}`);
    }
  } catch (error) {
    statusBar?.showError('Failed');
    vscode.window.showErrorMessage(
      `TDD failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Find symbol definition and references
 */
export async function findSymbol(client: SeuClaudeClient): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  // Get word under cursor
  const position = editor.selection.active;
  const wordRange = editor.document.getWordRangeAtPosition(position);
  const word = wordRange ? editor.document.getText(wordRange) : '';

  const symbolName = await vscode.window.showInputBox({
    prompt: 'Enter symbol name to find',
    value: word,
    placeHolder: 'e.g., MyClass, myFunction',
  });

  if (!symbolName) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Finding symbol: ${symbolName}...`,
      cancellable: false,
    },
    async () => {
      try {
        const symbol = await client.findSymbol(symbolName, [
          editor.document.uri.fsPath,
        ]);

        if (!symbol) {
          vscode.window.showWarningMessage(`Symbol '${symbolName}' not found`);
          return;
        }

        // Show QuickPick with references
  const items = (symbol.references ?? []).map((ref) => ({
          label: `$(file) ${ref.file.split('/').pop()}`,
          description: `Line ${ref.line}`,
          detail: ref.file,
          file: ref.file,
          line: ref.line,
          column: ref.column,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `${symbol.references.length} references found`,
        });

        if (selected) {
          const doc = await vscode.workspace.openTextDocument(selected.file);
          const editor = await vscode.window.showTextDocument(doc);
          const pos = new vscode.Position(selected.line - 1, selected.column);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos));
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to find symbol: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );
}

/**
 * Validate code with ESLint and TypeScript
 */
export async function validateCode(client: SeuClaudeClient): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active file to validate');
    return;
  }

  const filePath = editor.document.uri.fsPath;

  // Ask if user wants to auto-fix
  const fixOption = await vscode.window.showQuickPick(
    [
      { label: 'Validate only', fix: false },
      { label: 'Validate and auto-fix', fix: true },
    ],
    { placeHolder: 'Choose validation mode' }
  );

  if (!fixOption) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Validating code...',
      cancellable: false,
    },
    async () => {
      try {
        const result = await client.validateCode([filePath], fixOption.fix);

        if (result.valid) {
          vscode.window.showInformationMessage('Code validation passed!');
        } else {
          // Create diagnostics
          const diagnostics: vscode.Diagnostic[] = [];

          for (const error of result.errors) {
            const range = new vscode.Range(
              error.line - 1,
              error.column - 1,
              error.line - 1,
              error.column + 20
            );
            const diagnostic = new vscode.Diagnostic(
              range,
              `${error.rule}: ${error.message}`,
              vscode.DiagnosticSeverity.Error
            );
            diagnostics.push(diagnostic);
          }

          for (const warning of result.warnings) {
            const range = new vscode.Range(
              warning.line - 1,
              warning.column - 1,
              warning.line - 1,
              warning.column + 20
            );
            const diagnostic = new vscode.Diagnostic(
              range,
              `${warning.rule}: ${warning.message}`,
              vscode.DiagnosticSeverity.Warning
            );
            diagnostics.push(diagnostic);
          }

          // Show diagnostics in Problems panel
          const collection = vscode.languages.createDiagnosticCollection('seu-claude');
          collection.set(editor.document.uri, diagnostics);

          vscode.window.showWarningMessage(
            `Found ${result.errors.length} errors, ${result.warnings.length} warnings`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );
}
