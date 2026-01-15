import { readFile, stat } from 'fs/promises';
import { join, extname, relative } from 'path';
import { createRequire } from 'module';
import fastGlob from 'fast-glob';
import { createHash } from 'crypto';
import { Config, getLanguageFromExtension } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { GitTracker } from './git-tracker.js';

// Use createRequire for CJS module compatibility
const require = createRequire(import.meta.url);
const ignore = require('ignore') as typeof import('ignore').default;
type Ignore = ReturnType<typeof ignore>;

export interface FileInfo {
  path: string;
  relativePath: string;
  language: string;
  hash: string;
  size: number;
  modifiedAt: Date;
  gitPriority?: number; // Higher = more recently modified in git
  hasUncommittedChanges?: boolean;
}

export interface CrawlResult {
  files: FileInfo[];
  totalFiles: number;
  totalSize: number;
  languages: Record<string, number>;
  gitAware: boolean;
}

export class Crawler {
  private config: Config;
  private ignorer: Ignore;
  private log = logger.child('crawler');
  private gitTracker: GitTracker | null = null;
  private gitRecentFiles: Map<string, number> = new Map();
  private gitUncommitted: Set<string> = new Set();

  constructor(config: Config) {
    this.config = config;
    this.ignorer = ignore();
    this.setupIgnorePatterns();
  }

  private setupIgnorePatterns(): void {
    // Add default ignore patterns
    this.ignorer.add(this.config.ignorePatterns);
  }

  async loadGitignore(): Promise<void> {
    try {
      const gitignorePath = join(this.config.projectRoot, '.gitignore');
      const content = await readFile(gitignorePath, 'utf-8');
      this.ignorer.add(content.split('\n').filter(line => line.trim() && !line.startsWith('#')));
      this.log.debug('Loaded .gitignore patterns');
    } catch {
      // .gitignore doesn't exist, continue without it
    }

    try {
      const claudeignorePath = join(this.config.projectRoot, '.claudeignore');
      const content = await readFile(claudeignorePath, 'utf-8');
      this.ignorer.add(content.split('\n').filter(line => line.trim() && !line.startsWith('#')));
      this.log.debug('Loaded .claudeignore patterns');
    } catch {
      // .claudeignore doesn't exist, continue without it
    }
  }

  /**
   * Initialize git-aware tracking for prioritizing recently modified files
   */
  async initializeGitTracking(): Promise<boolean> {
    this.gitTracker = new GitTracker(this.config.projectRoot);
    const isGit = await this.gitTracker.initialize();
    
    if (!isGit) {
      this.gitTracker = null;
      return false;
    }

    // Get recently modified files with priority scores
    const recentFiles = await this.gitTracker.getRecentlyModifiedFiles(100);
    recentFiles.forEach((file, index) => {
      // Higher priority for more recently modified files
      this.gitRecentFiles.set(file.relativePath, 100 - index);
    });

    // Get uncommitted changes (highest priority)
    const uncommitted = await this.gitTracker.getUncommittedChanges();
    uncommitted.forEach(file => {
      this.gitUncommitted.add(file);
      // Uncommitted files get highest priority
      this.gitRecentFiles.set(file, 200);
    });

    this.log.info(`Git tracking enabled: ${recentFiles.length} recent files, ${uncommitted.length} uncommitted`);
    return true;
  }

  async crawl(): Promise<CrawlResult> {
    await this.loadGitignore();
    
    // Initialize git tracking for smart prioritization
    const gitAware = await this.initializeGitTracking();

    const supportedExtensions = Object.keys(
      await import('../utils/config.js').then(m => m.LANGUAGE_EXTENSIONS)
    );
    const globPatterns = supportedExtensions.map(ext => `**/*${ext}`);

    this.log.info(`Crawling ${this.config.projectRoot}...`);

    const filePaths = await fastGlob(globPatterns, {
      cwd: this.config.projectRoot,
      absolute: true,
      ignore: this.config.ignorePatterns,
      dot: false,
      followSymbolicLinks: false,
    });

    const files: FileInfo[] = [];
    const languages: Record<string, number> = {};
    let totalSize = 0;

    for (const filePath of filePaths) {
      const relativePath = relative(this.config.projectRoot, filePath);

      // Check against ignore patterns
      if (this.ignorer.ignores(relativePath)) {
        continue;
      }

      const ext = extname(filePath);
      const language = getLanguageFromExtension(ext);

      if (!language) {
        continue;
      }

      try {
        const stats = await stat(filePath);
        const content = await readFile(filePath, 'utf-8');
        const hash = this.hashContent(content);

        // Get git priority (higher = more recently modified)
        const gitPriority = this.gitRecentFiles.get(relativePath) ?? 0;
        const hasUncommittedChanges = this.gitUncommitted.has(relativePath);

        const fileInfo: FileInfo = {
          path: filePath,
          relativePath,
          language,
          hash,
          size: stats.size,
          modifiedAt: stats.mtime,
          gitPriority,
          hasUncommittedChanges,
        };

        files.push(fileInfo);
        totalSize += stats.size;
        languages[language] = (languages[language] || 0) + 1;
      } catch (err) {
        this.log.warn(`Failed to process file: ${filePath}`, err);
      }
    }

    // Sort files by git priority (uncommitted first, then recently modified)
    if (gitAware) {
      files.sort((a, b) => (b.gitPriority ?? 0) - (a.gitPriority ?? 0));
    }

    this.log.info(`Found ${files.length} files across ${Object.keys(languages).length} languages`);
    if (gitAware) {
      const uncommittedCount = files.filter(f => f.hasUncommittedChanges).length;
      const prioritizedCount = files.filter(f => (f.gitPriority ?? 0) > 0).length;
      this.log.info(`Git-aware: ${uncommittedCount} uncommitted, ${prioritizedCount} recently modified`);
    }

    return {
      files,
      totalFiles: files.length,
      totalSize,
      languages,
      gitAware,
    };
  }

  hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  async getFileContent(filePath: string): Promise<string> {
    return readFile(filePath, 'utf-8');
  }
}
