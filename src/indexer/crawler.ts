import { readFile, stat } from 'fs/promises';
import { join, extname, relative } from 'path';
import { createRequire } from 'module';
import fastGlob from 'fast-glob';
import { createHash } from 'crypto';
import { Config, getLanguageFromExtension } from '../utils/config.js';
import { logger } from '../utils/logger.js';

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
}

export interface CrawlResult {
  files: FileInfo[];
  totalFiles: number;
  totalSize: number;
  languages: Record<string, number>;
}

export class Crawler {
  private config: Config;
  private ignorer: Ignore;
  private log = logger.child('crawler');

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

  async crawl(): Promise<CrawlResult> {
    await this.loadGitignore();

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

        const fileInfo: FileInfo = {
          path: filePath,
          relativePath,
          language,
          hash,
          size: stats.size,
          modifiedAt: stats.mtime,
        };

        files.push(fileInfo);
        totalSize += stats.size;
        languages[language] = (languages[language] || 0) + 1;
      } catch (err) {
        this.log.warn(`Failed to process file: ${filePath}`, err);
      }
    }

    this.log.info(`Found ${files.length} files across ${Object.keys(languages).length} languages`);

    return {
      files,
      totalFiles: files.length,
      totalSize,
      languages,
    };
  }

  hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  async getFileContent(filePath: string): Promise<string> {
    return readFile(filePath, 'utf-8');
  }
}
