/**
 * CLI Test Suite (RED Phase)
 *
 * Tests for Phase 4 CLI commands using TDD approach
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { execSync } from 'child_process';

// Skip SQLite-dependent tests in CI - better-sqlite3 native bindings don't build
const describeWithSQLite = process.env.CI ? describe.skip : describe;

describe('CLI Commands', () => {
  let testDir: string;
  let cliPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cli-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    cliPath = join(process.cwd(), 'dist/cli/index.js');
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('/help', () => {
    it('should display available commands', () => {
      const output = execSync(`node "${cliPath}" help`, { encoding: 'utf-8' });

      expect(output).toContain('Seu-Claude v2 CLI Commands');
      expect(output).toContain('/plan');
      expect(output).toContain('/test');
      expect(output).toContain('/deps');
      expect(output).toContain('/check');
      expect(output).toContain('/find');
      expect(output).toContain('/nuke');
    });

    it('should show help by default with no arguments', () => {
      const output = execSync(`node "${cliPath}"`, { encoding: 'utf-8' });

      expect(output).toContain('Seu-Claude v2 CLI Commands');
    });
  });

  describeWithSQLite('/plan', () => {
    it('should create a new task', () => {
      const output = execSync(`node "${cliPath}" plan create "Test Task"`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      expect(output).toContain('Task created');
      expect(output).toContain('Test Task');
    });

    it('should list all tasks', () => {
      // Create a task first
      execSync(`node "${cliPath}" plan create "Task 1"`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      const output = execSync(`node "${cliPath}" plan list`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      expect(output).toContain('total');
      expect(output).toContain('Task 1');
    });

    it('should display task tree', () => {
      // Create tasks
      execSync(`node "${cliPath}" plan create "Root Task"`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      const output = execSync(`node "${cliPath}" plan tree`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      expect(output).toContain('Root Task');
    });
  });

  describe('/deps', () => {
    it('should analyze dependencies of a file', async () => {
      // Create test files
      const fileA = join(testDir, 'fileA.ts');
      const fileB = join(testDir, 'fileB.ts');

      await writeFile(fileB, 'export const value = 42;');
      await writeFile(fileA, `import { value } from './fileB.js';\nconsole.log(value);`);

      const output = execSync(`node "${cliPath}" deps "${fileA}"`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      expect(output).toContain('Statistics');
      expect(output).toContain('Files:');
      expect(output).toContain('Imports:');
    });

    it('should detect circular dependencies', async () => {
      const fileA = join(testDir, 'circA.ts');
      const fileB = join(testDir, 'circB.ts');

      await writeFile(fileA, `import './circB.js';\nexport const a = 1;`);
      await writeFile(fileB, `import './circA.js';\nexport const b = 2;`);

      const output = execSync(`node "${cliPath}" deps "${fileA}"`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      expect(output).toContain('Circular');
    });
  });

  describe('/check', () => {
    it('should validate TypeScript file', async () => {
      const file = join(testDir, 'valid.ts');
      await writeFile(file, `export function add(a: number, b: number): number { return a + b; }`);

      const output = execSync(`node "${cliPath}" check "${file}"`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      expect(output).toContain('Validating');
    });

    it('should report type errors', async () => {
      const file = join(testDir, 'invalid.ts');
      await writeFile(file, `const x: number = "string";`); // Type error

      try {
        execSync(`node "${cliPath}" check "${file}"`, {
          encoding: 'utf-8',
          cwd: testDir,
        });
      } catch (error: any) {
        // Should fail with validation errors
        expect(error.stdout || error.stderr).toContain('Validation');
      }
    });
  });

  describe('/find', () => {
    it('should find symbol definitions', async () => {
      const file = join(testDir, 'symbols.ts');
      await writeFile(file, `export function myFunction() { return 42; }`);

      const output = execSync(`node "${cliPath}" find myFunction "${file}"`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      expect(output).toContain('Finding symbol');
      expect(output).toContain('myFunction');
    });
  });

  describeWithSQLite('/nuke', () => {
    it('should require confirmation', () => {
      const output = execSync(`node "${cliPath}" nuke`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      expect(output).toContain('confirm');
      expect(output).toContain('--confirm');
    });

    it('should clear state with confirmation', () => {
      // Create some state
      execSync(`node "${cliPath}" plan create "Task"`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      // Nuke with confirmation
      const output = execSync(`node "${cliPath}" nuke --confirm`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      expect(output).toContain('Context reset');
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown commands', () => {
      try {
        execSync(`node "${cliPath}" unknown-command`, {
          encoding: 'utf-8',
          cwd: testDir,
        });
        throw new Error('Should have failed');
      } catch (error: any) {
        expect(error.status).toBe(1);
        expect(error.stderr || error.stdout).toContain('Unknown command');
      }
    });

    it('should handle missing arguments gracefully', () => {
      const output = execSync(`node "${cliPath}" deps`, {
        encoding: 'utf-8',
        cwd: testDir,
      });

      expect(output).toContain('Usage');
    });
  });
});
