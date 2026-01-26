/**
 * Tests for GitTracker
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitTracker } from '../indexer/git-tracker.js';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

describe('GitTracker', () => {
  let gitDir: string;
  let nonGitDir: string;
  let gitTracker: GitTracker;

  beforeEach(async () => {
    // Create a temporary git repo
    gitDir = await mkdtemp(join(tmpdir(), 'seu-claude-git-test-'));
    nonGitDir = await mkdtemp(join(tmpdir(), 'seu-claude-nongit-test-'));

    // Initialize git repo
    execSync('git init', { cwd: gitDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: gitDir, stdio: 'pipe' });

    // Create initial commit
    await writeFile(join(gitDir, 'test.ts'), 'export const x = 1;');
    execSync('git add .', { cwd: gitDir, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: gitDir, stdio: 'pipe' });

    gitTracker = new GitTracker(gitDir);
  });

  afterEach(async () => {
    await rm(gitDir, { recursive: true, force: true });
    await rm(nonGitDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('should detect git repository', async () => {
      const result = await gitTracker.initialize();
      expect(result).toBe(true);
    });

    it('should detect non-git directory', async () => {
      const tracker = new GitTracker(nonGitDir);
      const result = await tracker.initialize();
      expect(result).toBe(false);
    });
  });

  describe('getModifiedSince', () => {
    it('should return empty array when not initialized', async () => {
      const tracker = new GitTracker(nonGitDir);
      const result = await tracker.getModifiedSince(new Date());
      expect(result).toEqual([]);
    });

    it('should return modified files since date', async () => {
      await gitTracker.initialize();

      // Create and commit another file
      await writeFile(join(gitDir, 'new.ts'), 'export const y = 2;');
      execSync('git add .', { cwd: gitDir, stdio: 'pipe' });
      execSync('git commit -m "Add new file"', { cwd: gitDir, stdio: 'pipe' });

      // Get files modified since yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await gitTracker.getModifiedSince(yesterday);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getUncommittedChanges', () => {
    it('should return empty when no uncommitted changes', async () => {
      await gitTracker.initialize();
      const result = await gitTracker.getUncommittedChanges();
      expect(result).toEqual([]);
    });

    it('should return modified files', async () => {
      await gitTracker.initialize();

      // Modify a tracked file
      await writeFile(join(gitDir, 'test.ts'), 'export const x = 2;');

      const result = await gitTracker.getUncommittedChanges();
      expect(result).toContain('test.ts');
    });

    it('should return empty for non-git repo', async () => {
      const tracker = new GitTracker(nonGitDir);
      const result = await tracker.getUncommittedChanges();
      expect(result).toEqual([]);
    });
  });

  describe('getRecentlyModifiedFiles', () => {
    it('should return recently modified files', async () => {
      await gitTracker.initialize();

      const result = await gitTracker.getRecentlyModifiedFiles(10);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].relativePath).toBe('test.ts');
      expect(result[0].commitCount).toBeGreaterThanOrEqual(1);
    });

    it('should return empty for non-git repo', async () => {
      const tracker = new GitTracker(nonGitDir);
      const result = await tracker.getRecentlyModifiedFiles(10);
      expect(result).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      await gitTracker.initialize();

      // Create multiple files
      for (let i = 0; i < 5; i++) {
        await writeFile(join(gitDir, `file${i}.ts`), `export const v${i} = ${i};`);
        execSync('git add .', { cwd: gitDir, stdio: 'pipe' });
        execSync(`git commit -m "Add file${i}"`, { cwd: gitDir, stdio: 'pipe' });
      }

      const result = await gitTracker.getRecentlyModifiedFiles(3);
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getFileHash', () => {
    it('should return hash for tracked file', async () => {
      await gitTracker.initialize();
      const hash = await gitTracker.getFileHash('test.ts');
      expect(hash).toBeTruthy();
      expect(hash?.length).toBe(40); // SHA-1 hash
    });

    it('should return null for non-git repo', async () => {
      const tracker = new GitTracker(nonGitDir);
      const hash = await tracker.getFileHash('test.ts');
      expect(hash).toBeNull();
    });

    it('should return null for non-existent file', async () => {
      await gitTracker.initialize();
      const hash = await gitTracker.getFileHash('nonexistent.ts');
      expect(hash).toBeNull();
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return false for clean file', async () => {
      await gitTracker.initialize();
      const hasChanges = await gitTracker.hasUncommittedChanges('test.ts');
      expect(hasChanges).toBe(false);
    });

    it('should return true for modified file', async () => {
      await gitTracker.initialize();
      await writeFile(join(gitDir, 'test.ts'), 'export const x = 999;');

      const hasChanges = await gitTracker.hasUncommittedChanges('test.ts');
      expect(hasChanges).toBe(true);
    });

    it('should return false for non-git repo', async () => {
      const tracker = new GitTracker(nonGitDir);
      const hasChanges = await tracker.hasUncommittedChanges('test.ts');
      expect(hasChanges).toBe(false);
    });
  });

  describe('getCurrentBranch', () => {
    it('should return branch name', async () => {
      await gitTracker.initialize();
      const branch = await gitTracker.getCurrentBranch();
      // Could be 'main', 'master', or other default
      expect(branch).toBeTruthy();
      expect(typeof branch).toBe('string');
    });

    it('should return unknown for non-git repo', async () => {
      const tracker = new GitTracker(nonGitDir);
      const branch = await tracker.getCurrentBranch();
      expect(branch).toBe('unknown');
    });
  });

  describe('getStatus', () => {
    it('should return full git status', async () => {
      await gitTracker.initialize();

      const status = await gitTracker.getStatus();
      expect(status.isGitRepo).toBe(true);
      expect(status.branch).toBeTruthy();
      expect(Array.isArray(status.uncommittedChanges)).toBe(true);
      expect(Array.isArray(status.recentlyModified)).toBe(true);
    });

    it('should work for non-git repo', async () => {
      const tracker = new GitTracker(nonGitDir);
      const status = await tracker.getStatus();

      expect(status.isGitRepo).toBe(false);
      expect(status.branch).toBe('unknown');
      expect(status.uncommittedChanges).toEqual([]);
      expect(status.recentlyModified).toEqual([]);
    });
  });
});
