/**
 * Task Tree Provider
 *
 * Displays the task DAG in a tree view sidebar.
 * Shows task hierarchy, status icons, and allows interaction.
 */

import * as vscode from 'vscode';
import { SeuClaudeClient, Task } from '../SeuClaudeClient';

export class TaskItem extends vscode.TreeItem {
  constructor(
    public readonly task: Task,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(task.label, collapsibleState);

    this.id = task.id;
    this.tooltip = `${task.label}\nStatus: ${task.status}`;
    this.description = task.status;
    this.contextValue = 'task';

    // Set icon based on status
    this.iconPath = this.getStatusIcon(task.status);
  }

  private getStatusIcon(status: Task['status']): vscode.ThemeIcon {
    switch (status) {
      case 'pending':
        return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.gray'));
      case 'running':
        return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
      case 'completed':
        return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
      case 'failed':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }
}

export class TaskTreeProvider implements vscode.TreeDataProvider<TaskItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private tasks: Task[] = [];

  constructor(private client: SeuClaudeClient) {
    // Initial load
    this.loadTasks();
  }

  refresh(): void {
    this.loadTasks();
  }

  private async loadTasks(): Promise<void> {
    try {
      this.tasks = await this.client.getTaskTree();
      this._onDidChangeTreeData.fire();
    } catch (error) {
      console.error('Failed to load tasks:', error);
      vscode.window.showErrorMessage('Failed to load tasks from seu-claude');
    }
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskItem): Thenable<TaskItem[]> {
    if (!element) {
      // Root level - return top-level tasks
      return Promise.resolve(
        this.tasks.map((task) => this.createTaskItem(task))
      );
    }

    // Return children of the element
    const children = element.task.children || [];
    return Promise.resolve(
      children.map((task) => this.createTaskItem(task))
    );
  }

  getParent(element: TaskItem): vscode.ProviderResult<TaskItem> {
    if (!element.task.parentId) {
      return null;
    }

    const parent = this.findTask(this.tasks, element.task.parentId);
    if (parent) {
      return this.createTaskItem(parent);
    }

    return null;
  }

  private createTaskItem(task: Task): TaskItem {
    const hasChildren = task.children && task.children.length > 0;
    const collapsibleState = hasChildren
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

    return new TaskItem(task, collapsibleState);
  }

  private findTask(tasks: Task[], id: string): Task | null {
    for (const task of tasks) {
      if (task.id === id) {
        return task;
      }
      if (task.children) {
        const found = this.findTask(task.children, id);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }
}
