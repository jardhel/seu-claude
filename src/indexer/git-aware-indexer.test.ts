import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { execSync } from 'child_process';
import { GitAwareIndexer, IndexState } from './git-aware-indexer.js';
import type { Config } from '../utils/config.js';

describe('GitAwareIndexer', () => {
  let testDir: string;
  let dataDir: string;
  let config: Config;
  let indexer: GitAwareIndexer;

  beforeEach(async () => {
    testDir = join(tmpdir(), `git-aware-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    dataDir = join(testDir, '.seu-claude');
    await mkdir(testDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });

    config = {
      projectRoot: testDir,
      dataDir,
      embeddingModel: 'Xenova/all-MiniLM-L6-v2',
      embeddingDimensions: 384,
      maxChunkTokens: 512,
      minChunkLines: 5,
      chunkOverlapRatio: 0.25,
      chunkGroundingLines: 6,
      supportedLanguages: ['typescript', 'javascript'],
      ignorePatterns: ['node_modules/**', '**/*.test.ts'],
    };
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('without git', () => {
    it('initializes without git repository', async () => {
      indexer = new GitAwareIndexer(config);
      await indexer.initialize();

      expect(indexer.getGitTracker().isGitRepository()).toBe(false);
    });

    it('plans full index when no git available', async () => {
      await writeFile(join(testDir, 'file1.ts'), 'export const a = 1;');
      await writeFile(join(testDir, 'file2.ts'), 'export const b = 2;');

      indexer = new GitAwareIndexer(config);
      await indexer.initialize();

      const plan = await indexer.planIncrementalIndex();

      expect(plan.filesToIndex.length).toBe(2);
      expect(plan.isFullReindex).toBe(true);
      expect(plan.reason).toContain('File-based');
    });
  });

  describe('with git', () => {
    beforeEach(async () => {
      // Initialize git repo
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: testDir, stdio: 'pipe' });
    });

    it('initializes with git repository', async () => {
      indexer = new GitAwareIndexer(config);
      await indexer.initialize();

      expect(indexer.getGitTracker().isGitRepository()).toBe(true);
    });

    it('plans full index on first run', async () => {
      await writeFile(join(testDir, 'file1.ts'), 'export const a = 1;');
      execSync('git add file1.ts', { cwd: testDir, stdio: 'pipe' });
      execSync('git commit -m "Initial"', { cwd: testDir, stdio: 'pipe' });

      indexer = new GitAwareIndexer(config);
      await indexer.initialize();

      const plan = await indexer.planIncrementalIndex();

      expect(plan.filesToIndex.length).toBe(1);
      expect(plan.reason).toContain('No previous index state');
    });

    it('detects added files via git diff', async () => {
      // Create initial commit
      await writeFile(join(testDir, 'file1.ts'), 'export const a = 1;');
      execSync('git add file1.ts', { cwd: testDir, stdio: 'pipe' });
      execSync('git commit -m "Initial"', { cwd: testDir, stdio: 'pipe' });

      indexer = new GitAwareIndexer(config);
      await indexer.initialize();

      // Record the index state at this commit
      await indexer.recordIndexSuccess(1, false);

      // Add new file and commit
      await writeFile(join(testDir, 'file2.ts'), 'export const b = 2;');
      execSync('git add file2.ts', { cwd: testDir, stdio: 'pipe' });
      execSync('git commit -m "Add file2"', { cwd: testDir, stdio: 'pipe' });

      // Reload indexer to pick up new state
      indexer = new GitAwareIndexer(config);
      await indexer.initialize();

      const plan = await indexer.planIncrementalIndex(false);

      expect(plan.isFullReindex).toBe(false);
      expect(plan.stats.filesToAdd).toBe(1);
      expect(plan.filesToIndex.some(f => f.relativePath === 'file2.ts')).toBe(true);
    });

    it('detects modified files via git diff', async () => {
      // Create initial commit
      await writeFile(join(testDir, 'file1.ts'), 'export const a = 1;');
      execSync('git add file1.ts', { cwd: testDir, stdio: 'pipe' });
      execSync('git commit -m "Initial"', { cwd: testDir, stdio: 'pipe' });

      indexer = new GitAwareIndexer(config);
      await indexer.initialize();
      await indexer.recordIndexSuccess(1, false);

      // Modify and commit
      await writeFile(join(testDir, 'file1.ts'), 'export const a = 2; // modified');
      execSync('git add file1.ts', { cwd: testDir, stdio: 'pipe' });
      execSync('git commit -m "Modify file1"', { cwd: testDir, stdio: 'pipe' });

      indexer = new GitAwareIndexer(config);
      await indexer.initialize();

      const plan = await indexer.planIncrementalIndex(false);

      expect(plan.isFullReindex).toBe(false);
      expect(plan.stats.filesToUpdate).toBe(1);
    });

    it('detects deleted files via git diff', async () => {
      // Create initial commits
      await writeFile(join(testDir, 'file1.ts'), 'export const a = 1;');
      await writeFile(join(testDir, 'file2.ts'), 'export const b = 2;');
      execSync('git add .', { cwd: testDir, stdio: 'pipe' });
      execSync('git commit -m "Initial"', { cwd: testDir, stdio: 'pipe' });

      indexer = new GitAwareIndexer(config);
      await indexer.initialize();
      await indexer.recordIndexSuccess(2, false);

      // Delete and commit
      execSync('git rm file2.ts', { cwd: testDir, stdio: 'pipe' });
      execSync('git commit -m "Delete file2"', { cwd: testDir, stdio: 'pipe' });

      indexer = new GitAwareIndexer(config);
      await indexer.initialize();

      const plan = await indexer.planIncrementalIndex(false);

      expect(plan.filesToRemove).toContain('file2.ts');
      expect(plan.stats.filesToDelete).toBe(1);
    });

    it('includes uncommitted changes when requested', async () => {
      // Create initial commit
      await writeFile(join(testDir, 'file1.ts'), 'export const a = 1;');
      execSync('git add file1.ts', { cwd: testDir, stdio: 'pipe' });
      execSync('git commit -m "Initial"', { cwd: testDir, stdio: 'pipe' });

      indexer = new GitAwareIndexer(config);
      await indexer.initialize();
      await indexer.recordIndexSuccess(1, false);

      // Add uncommitted file
      await writeFile(join(testDir, 'uncommitted.ts'), 'export const u = 1;');

      indexer = new GitAwareIndexer(config);
      await indexer.initialize();

      const plan = await indexer.planIncrementalIndex(true);

      expect(plan.filesToIndex.some(f => f.relativePath === 'uncommitted.ts')).toBe(true);
    });
  });

  describe('state management', () => {
    it('saves and loads index state', async () => {
      indexer = new GitAwareIndexer(config);
      await indexer.initialize();

      const state: IndexState = {
        lastIndexedCommit: 'abc123',
        lastIndexedAt: Date.now(),
        branch: 'main',
        totalFiles: 10,
        includesUncommitted: true,
      };

      await indexer.saveState(state);

      // Create new indexer and verify state loaded
      const newIndexer = new GitAwareIndexer(config);
      await newIndexer.initialize();

      const loadedState = newIndexer.getState();
      expect(loadedState?.lastIndexedCommit).toBe('abc123');
      expect(loadedState?.branch).toBe('main');
      expect(loadedState?.totalFiles).toBe(10);
    });
  });
});
