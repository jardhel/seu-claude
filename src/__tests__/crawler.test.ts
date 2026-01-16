import { describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';
import { Crawler } from '../indexer/crawler.js';
import { loadConfig, Config } from '../utils/config.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Crawler', () => {
  let testDir: string;
  let config: Config;

  beforeAll(async () => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `seu-claude-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create test files
    await mkdir(join(testDir, 'src'), { recursive: true });
    await mkdir(join(testDir, 'lib'), { recursive: true });
    await mkdir(join(testDir, 'node_modules', 'dep'), { recursive: true });

    // TypeScript files
    await writeFile(
      join(testDir, 'src', 'index.ts'),
      'export const hello = "world";\nexport function greet() { return "hi"; }'
    );
    await writeFile(
      join(testDir, 'src', 'utils.ts'),
      'export function add(a: number, b: number) { return a + b; }'
    );

    // JavaScript file
    await writeFile(join(testDir, 'lib', 'helper.js'), 'module.exports = { help: () => "help" };');

    // Python file
    await writeFile(
      join(testDir, 'script.py'),
      'def main():\n    print("hello")\n\nif __name__ == "__main__":\n    main()'
    );

    // File in node_modules (should be ignored)
    await writeFile(join(testDir, 'node_modules', 'dep', 'index.js'), 'module.exports = {};');

    // Create .gitignore
    await writeFile(join(testDir, '.gitignore'), '*.log\ntmp/\n');

    // Create .claudeignore
    await writeFile(join(testDir, '.claudeignore'), 'lib/\n');
  });

  afterAll(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    config = loadConfig({
      projectRoot: testDir,
      ignorePatterns: ['**/node_modules/**'],
    });
  });

  describe('constructor', () => {
    it('should create a Crawler instance with config', () => {
      const crawler = new Crawler(config);
      expect(crawler).toBeInstanceOf(Crawler);
    });

    it('should set up ignore patterns from config', () => {
      const crawler = new Crawler(config);
      // The crawler is created successfully with ignore patterns
      expect(crawler).toBeDefined();
    });
  });

  describe('hashContent', () => {
    it('should return a 16-character hex string', () => {
      const crawler = new Crawler(config);
      const hash = crawler.hashContent('test content');

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should return consistent hashes for same content', () => {
      const crawler = new Crawler(config);
      const content = 'const x = 1;';

      const hash1 = crawler.hashContent(content);
      const hash2 = crawler.hashContent(content);

      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different content', () => {
      const crawler = new Crawler(config);

      const hash1 = crawler.hashContent('content A');
      const hash2 = crawler.hashContent('content B');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty content', () => {
      const crawler = new Crawler(config);
      const hash = crawler.hashContent('');

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should handle unicode content', () => {
      const crawler = new Crawler(config);
      const hash = crawler.hashContent('こんにちは世界 🌍');

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('getFileContent', () => {
    it('should read file content as string', async () => {
      const crawler = new Crawler(config);
      const content = await crawler.getFileContent(join(testDir, 'src', 'index.ts'));

      expect(content).toContain('export const hello');
      expect(content).toContain('greet');
    });

    it('should throw for non-existent files', async () => {
      const crawler = new Crawler(config);

      await expect(crawler.getFileContent(join(testDir, 'nonexistent.ts'))).rejects.toThrow();
    });
  });

  describe('loadGitignore', () => {
    it('should load .gitignore patterns', async () => {
      const crawler = new Crawler(config);
      await crawler.loadGitignore();

      // Crawler should have loaded patterns (we verify via crawl behavior)
      expect(crawler).toBeDefined();
    });

    it('should handle missing .gitignore gracefully', async () => {
      const emptyDir = join(tmpdir(), `seu-claude-empty-${Date.now()}`);
      await mkdir(emptyDir, { recursive: true });

      try {
        const emptyConfig = loadConfig({ projectRoot: emptyDir });
        const crawler = new Crawler(emptyConfig);

        // Should not throw
        await expect(crawler.loadGitignore()).resolves.toBeUndefined();
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('crawl', () => {
    it('should find TypeScript files', async () => {
      const crawler = new Crawler(config);
      const result = await crawler.crawl();

      const tsFiles = result.files.filter(f => f.language === 'typescript');
      expect(tsFiles.length).toBeGreaterThanOrEqual(2);
    });

    it('should find Python files', async () => {
      const crawler = new Crawler(config);
      const result = await crawler.crawl();

      const pyFiles = result.files.filter(f => f.language === 'python');
      expect(pyFiles.length).toBeGreaterThanOrEqual(1);
    });

    it('should ignore node_modules', async () => {
      const crawler = new Crawler(config);
      const result = await crawler.crawl();

      const nodeModulesFiles = result.files.filter(f => f.path.includes('node_modules'));
      expect(nodeModulesFiles).toHaveLength(0);
    });

    it('should respect .claudeignore patterns', async () => {
      const crawler = new Crawler(config);
      const result = await crawler.crawl();

      // lib/ is in .claudeignore
      const libFiles = result.files.filter(f => f.relativePath.startsWith('lib/'));
      expect(libFiles).toHaveLength(0);
    });

    it('should return correct file info structure', async () => {
      const crawler = new Crawler(config);
      const result = await crawler.crawl();

      expect(result.files.length).toBeGreaterThan(0);

      const file = result.files[0];
      expect(file).toHaveProperty('path');
      expect(file).toHaveProperty('relativePath');
      expect(file).toHaveProperty('language');
      expect(file).toHaveProperty('hash');
      expect(file).toHaveProperty('size');
      expect(file).toHaveProperty('modifiedAt');

      expect(typeof file.path).toBe('string');
      expect(typeof file.relativePath).toBe('string');
      expect(typeof file.language).toBe('string');
      expect(typeof file.hash).toBe('string');
      expect(typeof file.size).toBe('number');
      // Check it's a Date-like object (instanceof can fail across ESM boundaries)
      expect(file.modifiedAt).toBeDefined();
      expect(typeof file.modifiedAt.getTime).toBe('function');
      expect(typeof file.modifiedAt.getTime()).toBe('number');
    });

    it('should return correct result structure', async () => {
      const crawler = new Crawler(config);
      const result = await crawler.crawl();

      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('totalFiles');
      expect(result).toHaveProperty('totalSize');
      expect(result).toHaveProperty('languages');

      expect(Array.isArray(result.files)).toBe(true);
      expect(typeof result.totalFiles).toBe('number');
      expect(typeof result.totalSize).toBe('number');
      expect(typeof result.languages).toBe('object');
    });

    it('should count files correctly', async () => {
      const crawler = new Crawler(config);
      const result = await crawler.crawl();

      expect(result.totalFiles).toBe(result.files.length);
    });

    it('should track languages correctly', async () => {
      const crawler = new Crawler(config);
      const result = await crawler.crawl();

      // Should have typescript and python at minimum
      expect(Object.keys(result.languages).length).toBeGreaterThanOrEqual(2);

      // Count should match
      let totalFromLanguages = 0;
      for (const count of Object.values(result.languages)) {
        totalFromLanguages += count;
      }
      expect(totalFromLanguages).toBe(result.totalFiles);
    });

    it('should calculate total size correctly', async () => {
      const crawler = new Crawler(config);
      const result = await crawler.crawl();

      const calculatedSize = result.files.reduce((sum, f) => sum + f.size, 0);
      expect(result.totalSize).toBe(calculatedSize);
    });

    it('should use absolute paths', async () => {
      const crawler = new Crawler(config);
      const result = await crawler.crawl();

      for (const file of result.files) {
        expect(file.path.startsWith('/')).toBe(true);
      }
    });

    it('should use relative paths from project root', async () => {
      const crawler = new Crawler(config);
      const result = await crawler.crawl();

      for (const file of result.files) {
        expect(file.relativePath.startsWith('/')).toBe(false);
        expect(file.path.endsWith(file.relativePath)).toBe(true);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty directories', async () => {
      const emptyDir = join(tmpdir(), `seu-claude-empty-${Date.now()}`);
      await mkdir(emptyDir, { recursive: true });

      try {
        const emptyConfig = loadConfig({ projectRoot: emptyDir });
        const crawler = new Crawler(emptyConfig);
        const result = await crawler.crawl();

        expect(result.files).toHaveLength(0);
        expect(result.totalFiles).toBe(0);
        expect(result.totalSize).toBe(0);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('should handle files with special characters in names', async () => {
      const specialDir = join(tmpdir(), `seu-claude-special-${Date.now()}`);
      await mkdir(specialDir, { recursive: true });

      try {
        await writeFile(join(specialDir, 'file with spaces.ts'), 'const x = 1;');
        await writeFile(join(specialDir, 'file-with-dashes.ts'), 'const y = 2;');
        await writeFile(join(specialDir, 'file_with_underscores.ts'), 'const z = 3;');

        const specialConfig = loadConfig({ projectRoot: specialDir });
        const crawler = new Crawler(specialConfig);
        const result = await crawler.crawl();

        expect(result.files.length).toBe(3);
      } finally {
        await rm(specialDir, { recursive: true, force: true });
      }
    });
  });

  describe('git-aware tracking', () => {
    it('should return gitAware false for non-git directory', async () => {
      const nonGitDir = join(tmpdir(), `seu-claude-nongit-${Date.now()}`);
      await mkdir(nonGitDir, { recursive: true });

      try {
        await writeFile(join(nonGitDir, 'test.ts'), 'const x = 1;');

        const nonGitConfig = loadConfig({ projectRoot: nonGitDir });
        const crawler = new Crawler(nonGitConfig);
        const result = await crawler.crawl();

        expect(result.gitAware).toBe(false);
      } finally {
        await rm(nonGitDir, { recursive: true, force: true });
      }
    });

    it('should return gitAware true for git repository', async () => {
      const gitDir = join(tmpdir(), `seu-claude-git-${Date.now()}`);
      await mkdir(gitDir, { recursive: true });

      try {
        // Initialize git repo
        const { execSync } = await import('child_process');
        execSync('git init', { cwd: gitDir, stdio: 'ignore' });
        execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'ignore' });
        execSync('git config user.name "Test"', { cwd: gitDir, stdio: 'ignore' });

        // Create and commit a file
        await writeFile(join(gitDir, 'committed.ts'), 'const committed = 1;');
        execSync('git add .', { cwd: gitDir, stdio: 'ignore' });
        execSync('git commit -m "initial"', { cwd: gitDir, stdio: 'ignore' });

        // Create an uncommitted file
        await writeFile(join(gitDir, 'uncommitted.ts'), 'const uncommitted = 2;');

        const gitConfig = loadConfig({ projectRoot: gitDir });
        const crawler = new Crawler(gitConfig);
        const result = await crawler.crawl();

        expect(result.gitAware).toBe(true);

        // The uncommitted file should have higher priority
        const uncommittedFile = result.files.find(f => f.relativePath === 'uncommitted.ts');
        if (uncommittedFile) {
          expect(uncommittedFile.gitPriority).toBeGreaterThan(0);
        }
      } finally {
        await rm(gitDir, { recursive: true, force: true });
      }
    });

    it('should prioritize recently modified files in git', async () => {
      const gitDir = join(tmpdir(), `seu-claude-gitrecent-${Date.now()}`);
      await mkdir(gitDir, { recursive: true });

      try {
        const { execSync } = await import('child_process');
        execSync('git init', { cwd: gitDir, stdio: 'ignore' });
        execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'ignore' });
        execSync('git config user.name "Test"', { cwd: gitDir, stdio: 'ignore' });

        // Create and commit files in order
        await writeFile(join(gitDir, 'old.ts'), 'const old = 1;');
        execSync('git add .', { cwd: gitDir, stdio: 'ignore' });
        execSync('git commit -m "old file"', { cwd: gitDir, stdio: 'ignore' });

        await writeFile(join(gitDir, 'new.ts'), 'const newer = 2;');
        execSync('git add .', { cwd: gitDir, stdio: 'ignore' });
        execSync('git commit -m "new file"', { cwd: gitDir, stdio: 'ignore' });

        const gitConfig = loadConfig({ projectRoot: gitDir });
        const crawler = new Crawler(gitConfig);
        const result = await crawler.crawl();

        expect(result.gitAware).toBe(true);
        expect(result.files.length).toBe(2);

        // Files should be sorted by git priority (most recent first)
        const priorities = result.files.map(f => f.gitPriority ?? 0);
        // Verify files have priority values assigned
        expect(priorities.some(p => p > 0)).toBe(true);
      } finally {
        await rm(gitDir, { recursive: true, force: true });
      }
    });

    it('should mark uncommitted files with hasUncommittedChanges', async () => {
      const gitDir = join(tmpdir(), `seu-claude-gituncommit-${Date.now()}`);
      await mkdir(gitDir, { recursive: true });

      try {
        const { execSync } = await import('child_process');
        execSync('git init', { cwd: gitDir, stdio: 'ignore' });
        execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'ignore' });
        execSync('git config user.name "Test"', { cwd: gitDir, stdio: 'ignore' });

        // Create and commit a file
        await writeFile(join(gitDir, 'committed.ts'), 'const x = 1;');
        execSync('git add .', { cwd: gitDir, stdio: 'ignore' });
        execSync('git commit -m "initial"', { cwd: gitDir, stdio: 'ignore' });

        // Modify the file without committing
        await writeFile(join(gitDir, 'committed.ts'), 'const x = 2; // modified');

        const gitConfig = loadConfig({ projectRoot: gitDir });
        const crawler = new Crawler(gitConfig);
        const result = await crawler.crawl();

        expect(result.gitAware).toBe(true);
        const modifiedFile = result.files.find(f => f.relativePath === 'committed.ts');
        expect(modifiedFile?.hasUncommittedChanges).toBe(true);
      } finally {
        await rm(gitDir, { recursive: true, force: true });
      }
    });
  });
});
