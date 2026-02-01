/**
 * TDD Status Bar
 *
 * Shows the current TDD phase (RED/GREEN/REFACTOR) in the status bar.
 * Provides visual feedback for the TDD workflow.
 */

import * as vscode from 'vscode';

export type TddPhase = 'red' | 'green' | 'refactor' | 'idle';

export class TddStatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private currentPhase: TddPhase = 'idle';
  private animationInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = 'seu-claude.runTDD';
    this.statusBarItem.tooltip = 'Click to run TDD cycle';
    this.updateDisplay();
    this.statusBarItem.show();
  }

  setPhase(phase: TddPhase): void {
    this.currentPhase = phase;
    this.updateDisplay();

    if (phase === 'green') {
      // Show success animation
      this.animateSuccess();
    } else if (phase === 'red') {
      // Show failure animation
      this.animateFailure();
    }
  }

  getPhase(): TddPhase {
    return this.currentPhase;
  }

  private updateDisplay(): void {
    const config = this.getPhaseConfig(this.currentPhase);
    this.statusBarItem.text = config.text;
    this.statusBarItem.backgroundColor = config.backgroundColor;
    this.statusBarItem.color = config.color;
  }

  private getPhaseConfig(phase: TddPhase): {
    text: string;
    backgroundColor: vscode.ThemeColor | undefined;
    color: string | undefined;
  } {
    switch (phase) {
      case 'red':
        return {
          text: '$(error) TDD: RED',
          backgroundColor: new vscode.ThemeColor('statusBarItem.errorBackground'),
          color: undefined,
        };
      case 'green':
        return {
          text: '$(check) TDD: GREEN',
          backgroundColor: new vscode.ThemeColor('statusBarItem.warningBackground'),
          color: '#4ade80',
        };
      case 'refactor':
        return {
          text: '$(tools) TDD: REFACTOR',
          backgroundColor: new vscode.ThemeColor('statusBarItem.prominentBackground'),
          color: '#60a5fa',
        };
      case 'idle':
      default:
        return {
          text: '$(beaker) TDD',
          backgroundColor: undefined,
          color: undefined,
        };
    }
  }

  private animateSuccess(): void {
    this.stopAnimation();

    let count = 0;
    const icons = ['$(check)', '$(star)', '$(check)', '$(star-full)'];

    this.animationInterval = setInterval(() => {
      if (count >= 6) {
        this.stopAnimation();
        this.updateDisplay();
        return;
      }

      this.statusBarItem.text = `${icons[count % icons.length]} TDD: GREEN`;
      count++;
    }, 200);
  }

  private animateFailure(): void {
    this.stopAnimation();

    let count = 0;

    this.animationInterval = setInterval(() => {
      if (count >= 6) {
        this.stopAnimation();
        this.updateDisplay();
        return;
      }

      this.statusBarItem.text = count % 2 === 0 ? '$(error) TDD: RED' : '$(x) TDD: RED';
      count++;
    }, 200);
  }

  private stopAnimation(): void {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
  }

  showProgress(message: string): void {
    this.statusBarItem.text = `$(sync~spin) TDD: ${message}`;
  }

  showError(message: string): void {
    this.statusBarItem.text = `$(error) TDD: ${message}`;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }

  reset(): void {
    this.stopAnimation();
    this.currentPhase = 'idle';
    this.updateDisplay();
  }

  dispose(): void {
    this.stopAnimation();
    this.statusBarItem.dispose();
  }
}
