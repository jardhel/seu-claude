/**
 * GitAwareIndexer - Incremental indexing using git diff for change detection
 *
 * Uses git to efficiently detect which files have changed since the last
 * successful index, significantly reducing re-indexing time for large codebases.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { GitTracker, GitDiffResult } from './git-tracker.js';
import { FileIndex, IndexedFileInfo } from './file-index.js';
import { Crawler, FileInfo } from './crawler.js';
import { Config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const INDEX_STATE_FILE = 'index-state.json';

export interface IndexState {
  /** Last successfully indexed commit hash */
  lastIndexedCommit: string | null;
  /** Timestamp of last successful index */
  lastIndexedAt: number;
  /** Branch that was indexed */
  branch: string;
  /** Total files indexed */
  totalFiles: number;
  /** Whether the index includes uncommitted changes */
  includesUncommitted: boolean;
}

export interface IncrementalIndexPlan {
  /** Files that need to be added/updated */
  filesToIndex: FileInfo[];
  /** Files that need to be removed from index */
  filesToRemove: string[];
  /** Renamed files (old path -> new path) */
  renamedFiles: Map<string, string>;
  /** Whether this is a full re-index */
  isFullReindex: boolean;
  /** Reason for the indexing plan */
  reason: string;
  /** Git diff result (if git-based) */
  gitDiff?: GitDiffResult;
  /** Statistics */
  stats: {
    totalFilesInRepo: number;
    filesToAdd: number;
    filesToUpdate: number;
    filesToDelete: number;
    filesUnchanged: number;
  };
}

export class GitAwareIndexer {
  private config: Config;
  private gitTracker: GitTracker;
  private fileIndex: FileIndex;
  private crawler: Crawler;
  private log = logger.child('git-aware-indexer');
  private indexState: IndexState | null = null;

  constructor(config: Config) {
    this.config = config;
    this.gitTracker = new GitTracker(config.projectRoot);
    this.fileIndex = new FileIndex(config.dataDir, config.projectRoot);
    this.crawler = new Crawler(config);
  }

  private get stateFilePath(): string {
    return join(this.config.dataDir, INDEX_STATE_FILE);
  }

  /**
   * Initialize the git-aware indexer
   */
  async initialize(): Promise<void> {
    await this.gitTracker.initialize();
    await this.fileIndex.load();
    await this.loadState();
  }

  /**
   * Load index state from disk
   */
  private async loadState(): Promise<void> {
    try {
      const content = await readFile(this.stateFilePath, 'utf-8');
      this.indexState = JSON.parse(content) as IndexState;
      this.log.debug('Loaded index state:', this.indexState);
    } catch {
      this.indexState = null;
      this.log.debug('No existing index state found');
    }
  }

  /**
   * Save index state to disk
   */
  async saveState(state: IndexState): Promise<void> {
    await mkdir(dirname(this.stateFilePath), { recursive: true });
    await writeFile(this.stateFilePath, JSON.stringify(state, null, 2));
    this.indexState = state;
    this.log.debug('Saved index state:', state);
  }

  /**
   * Get current index state
   */
  getState(): IndexState | null {
    return this.indexState;
  }

  /**
   * Plan an incremental index based on git changes
   */
  async planIncrementalIndex(includeUncommitted = true): Promise<IncrementalIndexPlan> {
    // First, crawl to get current file list
    const crawlResult = await this.crawler.crawl();
    const currentFiles = crawlResult.files;
    const currentFileMap = new Map(currentFiles.map(f => [f.relativePath, f]));

    // Check if git is available
    if (!this.gitTracker.isGitRepository()) {
      this.log.info('Not a git repository, using file-based change detection');
      return this.planWithoutGit(currentFiles);
    }

    // Get current HEAD commit
    const headCommit = await this.gitTracker.getHeadCommit();
    const currentBranch = await this.gitTracker.getCurrentBranch();

    // Check if we have previous index state
    if (!this.indexState?.lastIndexedCommit || !headCommit) {
      this.log.info('No previous index state or HEAD commit, doing full index');
      return this.createFullIndexPlan(currentFiles, 'No previous index state');
    }

    // Check if branch changed
    if (this.indexState.branch !== currentBranch) {
      this.log.info(`Branch changed from ${this.indexState.branch} to ${currentBranch}`);
      // Still use git diff, just note the branch change
    }

    // Get git diff from last indexed commit to HEAD
    let gitDiff: GitDiffResult;
    try {
      gitDiff = await this.gitTracker.getDiff(this.indexState.lastIndexedCommit, headCommit);
    } catch (err) {
      this.log.warn('Failed to get git diff, falling back to file-based detection:', err);
      return this.planWithoutGit(currentFiles);
    }

    // If including uncommitted changes, also get working tree changes
    if (includeUncommitted) {
      const workingTreeChanges = await this.gitTracker.getWorkingTreeChanges();
      this.mergeGitDiffs(gitDiff, workingTreeChanges);
    }

    // Build the plan based on git diff
    const filesToIndex: FileInfo[] = [];
    const filesToRemove: string[] = [];
    const renamedFiles = new Map<string, string>();

    // Process added files
    for (const addedPath of gitDiff.added) {
      const fileInfo = currentFileMap.get(addedPath);
      if (fileInfo) {
        filesToIndex.push(fileInfo);
      }
    }

    // Process modified files
    for (const modifiedPath of gitDiff.modified) {
      const fileInfo = currentFileMap.get(modifiedPath);
      if (fileInfo) {
        filesToIndex.push(fileInfo);
      }
    }

    // Process deleted files
    for (const deletedPath of gitDiff.deleted) {
      filesToRemove.push(deletedPath);
    }

    // Process renamed files
    for (const [oldPath, newPath] of gitDiff.renamed) {
      renamedFiles.set(oldPath, newPath);
      filesToRemove.push(oldPath);
      const fileInfo = currentFileMap.get(newPath);
      if (fileInfo) {
        filesToIndex.push(fileInfo);
      }
    }

    // Also check for files that exist in current crawl but not in file index
    // (could happen if git diff missed something)
    for (const file of currentFiles) {
      const indexed = this.fileIndex.getFile(file.relativePath);
      if (!indexed) {
        // New file not caught by git
        if (!filesToIndex.some(f => f.relativePath === file.relativePath)) {
          filesToIndex.push(file);
        }
      }
    }

    const filesUnchanged = currentFiles.length - filesToIndex.length;

    return {
      filesToIndex,
      filesToRemove,
      renamedFiles,
      isFullReindex: false,
      reason: `Git-based incremental: ${gitDiff.added.length} added, ${gitDiff.modified.length} modified, ${gitDiff.deleted.length} deleted`,
      gitDiff,
      stats: {
        totalFilesInRepo: currentFiles.length,
        filesToAdd: gitDiff.added.length,
        filesToUpdate: gitDiff.modified.length,
        filesToDelete: filesToRemove.length,
        filesUnchanged,
      },
    };
  }

  /**
   * Plan indexing without git (using file hash/mtime comparison)
   */
  private async planWithoutGit(currentFiles: FileInfo[]): Promise<IncrementalIndexPlan> {
    const changedFiles = this.fileIndex.getChangedFiles(currentFiles);
    const deletedFiles = this.fileIndex.getDeletedFiles(currentFiles);

    const filesUnchanged = currentFiles.length - changedFiles.length;

    return {
      filesToIndex: changedFiles,
      filesToRemove: deletedFiles,
      renamedFiles: new Map(),
      isFullReindex: !this.fileIndex.isLoaded() || this.fileIndex.size === 0,
      reason: `File-based incremental: ${changedFiles.length} changed, ${deletedFiles.length} deleted`,
      stats: {
        totalFilesInRepo: currentFiles.length,
        filesToAdd: changedFiles.filter(f => !this.fileIndex.getFile(f.relativePath)).length,
        filesToUpdate: changedFiles.filter(f => this.fileIndex.getFile(f.relativePath)).length,
        filesToDelete: deletedFiles.length,
        filesUnchanged,
      },
    };
  }

  /**
   * Create a full index plan (no incremental)
   */
  private createFullIndexPlan(currentFiles: FileInfo[], reason: string): IncrementalIndexPlan {
    return {
      filesToIndex: currentFiles,
      filesToRemove: [],
      renamedFiles: new Map(),
      isFullReindex: true,
      reason,
      stats: {
        totalFilesInRepo: currentFiles.length,
        filesToAdd: currentFiles.length,
        filesToUpdate: 0,
        filesToDelete: 0,
        filesUnchanged: 0,
      },
    };
  }

  /**
   * Merge two git diff results
   */
  private mergeGitDiffs(target: GitDiffResult, source: GitDiffResult): void {
    for (const added of source.added) {
      if (!target.added.includes(added) && !target.modified.includes(added)) {
        target.added.push(added);
      }
    }
    for (const modified of source.modified) {
      if (!target.modified.includes(modified) && !target.added.includes(modified)) {
        target.modified.push(modified);
      }
    }
    for (const deleted of source.deleted) {
      if (!target.deleted.includes(deleted)) {
        target.deleted.push(deleted);
      }
    }
    for (const [oldPath, newPath] of source.renamed) {
      if (!target.renamed.has(oldPath)) {
        target.renamed.set(oldPath, newPath);
      }
    }
  }

  /**
   * Update the file index with processed files
   */
  updateFileIndex(relativePath: string, info: Omit<IndexedFileInfo, 'relativePath'>): void {
    this.fileIndex.updateFile(relativePath, info);
  }

  /**
   * Remove a file from the file index
   */
  removeFromFileIndex(relativePath: string): void {
    this.fileIndex.removeFile(relativePath);
  }

  /**
   * Save the file index
   */
  async saveFileIndex(): Promise<void> {
    await this.fileIndex.save();
  }

  /**
   * Record successful indexing completion
   */
  async recordIndexSuccess(totalFiles: number, includesUncommitted: boolean): Promise<void> {
    const headCommit = await this.gitTracker.getHeadCommit();
    const branch = await this.gitTracker.getCurrentBranch();

    const state: IndexState = {
      lastIndexedCommit: headCommit,
      lastIndexedAt: Date.now(),
      branch,
      totalFiles,
      includesUncommitted,
    };

    await this.saveState(state);
    this.log.info(
      `Recorded index success: ${totalFiles} files at commit ${headCommit?.slice(0, 8) || 'unknown'}`
    );
  }

  /**
   * Get the git tracker instance
   */
  getGitTracker(): GitTracker {
    return this.gitTracker;
  }

  /**
   * Get the file index instance
   */
  getFileIndex(): FileIndex {
    return this.fileIndex;
  }
}
