import { execSync } from 'child_process';
import { join } from 'path';
import { logger } from '../utils/logger.js';

export interface GitFileInfo {
  path: string;
  relativePath: string;
  lastCommit: Date;
  commitCount: number;
  authors: string[];
}

export interface GitStatus {
  isGitRepo: boolean;
  branch: string;
  uncommittedChanges: string[];
  recentlyModified: GitFileInfo[];
}

export class GitTracker {
  private projectRoot: string;
  private log = logger.child('git-tracker');
  private isGitRepo: boolean = false;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async initialize(): Promise<boolean> {
    try {
      await Promise.resolve(
        execSync('git rev-parse --is-inside-work-tree', {
          cwd: this.projectRoot,
          stdio: 'pipe',
        })
      );
      this.isGitRepo = true;
      this.log.info('Git repository detected');
      return true;
    } catch {
      this.isGitRepo = false;
      this.log.info('Not a git repository, git-aware features disabled');
      return false;
    }
  }

  /**
   * Get files modified since a given date
   */
  async getModifiedSince(since: Date): Promise<string[]> {
    if (!this.isGitRepo) return [];

    try {
      const sinceStr = since.toISOString().split('T')[0];
      const output = await Promise.resolve(
        execSync(
          `git log --since="${sinceStr}" --name-only --pretty=format: | sort -u | grep -v '^$'`,
          { cwd: this.projectRoot, stdio: 'pipe', encoding: 'utf-8' }
        )
      );
      return output.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get uncommitted changes (staged + unstaged)
   */
  async getUncommittedChanges(): Promise<string[]> {
    if (!this.isGitRepo) return [];

    try {
      const output = await Promise.resolve(
        execSync('git status --porcelain', {
          cwd: this.projectRoot,
          stdio: 'pipe',
          encoding: 'utf-8',
        })
      );

      return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => line.slice(3).trim())
        .filter(f => !f.startsWith('?')); // Exclude untracked
    } catch {
      return [];
    }
  }

  /**
   * Get files ordered by recent activity (most recently changed first)
   */
  async getRecentlyModifiedFiles(limit = 50): Promise<GitFileInfo[]> {
    if (!this.isGitRepo) return [];

    try {
      // Get files with their last commit info
      const output = await Promise.resolve(
        execSync(`git log --all --name-only --pretty=format:"%H|%aI|%an" -n ${limit * 2}`, {
          cwd: this.projectRoot,
          stdio: 'pipe',
          encoding: 'utf-8',
        })
      );

      const fileMap = new Map<string, GitFileInfo>();
      let currentCommit: { date: Date; author: string } | null = null;

      for (const line of output.split('\n')) {
        if (line.includes('|')) {
          const [, dateStr, author] = line.split('|');
          currentCommit = { date: new Date(dateStr), author };
        } else if (line.trim() && currentCommit) {
          const relativePath = line.trim();
          const fullPath = join(this.projectRoot, relativePath);

          if (!fileMap.has(relativePath)) {
            fileMap.set(relativePath, {
              path: fullPath,
              relativePath,
              lastCommit: currentCommit.date,
              commitCount: 1,
              authors: [currentCommit.author],
            });
          } else {
            const existing = fileMap.get(relativePath)!;
            existing.commitCount++;
            if (!existing.authors.includes(currentCommit.author)) {
              existing.authors.push(currentCommit.author);
            }
          }
        }
      }

      // Sort by last commit date (most recent first)
      return Array.from(fileMap.values())
        .sort((a, b) => b.lastCommit.getTime() - a.lastCommit.getTime())
        .slice(0, limit);
    } catch (err) {
      this.log.warn('Failed to get recently modified files:', err);
      return [];
    }
  }

  /**
   * Get file hash from git (for change detection)
   */
  async getFileHash(relativePath: string): Promise<string | null> {
    if (!this.isGitRepo) return null;

    try {
      const output = await Promise.resolve(
        execSync(`git hash-object "${relativePath}"`, {
          cwd: this.projectRoot,
          stdio: 'pipe',
          encoding: 'utf-8',
        })
      );
      return output.trim();
    } catch {
      return null;
    }
  }

  /**
   * Check if file has uncommitted changes
   */
  async hasUncommittedChanges(relativePath: string): Promise<boolean> {
    if (!this.isGitRepo) return false;

    try {
      const output = await Promise.resolve(
        execSync(`git status --porcelain "${relativePath}"`, {
          cwd: this.projectRoot,
          stdio: 'pipe',
          encoding: 'utf-8',
        })
      );
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    if (!this.isGitRepo) return 'unknown';

    try {
      const output = await Promise.resolve(
        execSync('git branch --show-current', {
          cwd: this.projectRoot,
          stdio: 'pipe',
          encoding: 'utf-8',
        })
      );
      return output.trim() || 'HEAD';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get full git status for the repository
   */
  async getStatus(): Promise<GitStatus> {
    return {
      isGitRepo: this.isGitRepo,
      branch: await this.getCurrentBranch(),
      uncommittedChanges: await this.getUncommittedChanges(),
      recentlyModified: await this.getRecentlyModifiedFiles(20),
    };
  }
}
