import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { ProcessSandbox } from '../../adapters/sandbox/ProcessSandbox.js';

describe('Sandbox', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `sandbox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('ProcessSandbox', () => {
    it('executes simple commands', async () => {
      const sandbox = new ProcessSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'echo',
          args: ['Hello, Sandbox!'],
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('Hello, Sandbox!');
        expect(result.timedOut).toBe(false);
      } finally {
        await sandbox.destroy();
      }
    });

    it('captures stderr', async () => {
      const sandbox = new ProcessSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'node',
          args: ['-e', 'console.error("error output")'],
        });

        expect(result.stderr.trim()).toBe('error output');
      } finally {
        await sandbox.destroy();
      }
    });

    it('returns non-zero exit code on failure', async () => {
      const sandbox = new ProcessSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'node',
          args: ['-e', 'process.exit(42)'],
        });

        expect(result.exitCode).toBe(42);
      } finally {
        await sandbox.destroy();
      }
    });

    it('handles timeout', async () => {
      const sandbox = new ProcessSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'sleep',
          args: ['10'],
          timeout: 100, // 100ms timeout
        });

        expect(result.timedOut).toBe(true);
        expect(result.exitCode).not.toBe(0);
      } finally {
        await sandbox.destroy();
      }
    });

    it('passes environment variables', async () => {
      const sandbox = new ProcessSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'node',
          args: ['-e', 'console.log(process.env.TEST_VAR)'],
          env: { TEST_VAR: 'test_value' },
        });

        expect(result.stdout.trim()).toBe('test_value');
      } finally {
        await sandbox.destroy();
      }
    });

    it('executes in specified working directory', async () => {
      const sandbox = new ProcessSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'pwd',
          workingDir: testDir,
        });

        // Handle macOS /private/var symlink
        const output = result.stdout.trim();
        expect(output.endsWith(testDir.split('/').pop()!)).toBe(true);
      } finally {
        await sandbox.destroy();
      }
    });

    it('runs Node.js scripts', async () => {
      const sandbox = new ProcessSandbox();
      await sandbox.initialize();

      const scriptPath = join(testDir, 'test.js');
      await writeFile(scriptPath, `
        const sum = (a, b) => a + b;
        console.log(JSON.stringify({ result: sum(2, 3) }));
      `);

      try {
        const result = await sandbox.execute({
          command: 'node',
          args: [scriptPath],
        });

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.result).toBe(5);
      } finally {
        await sandbox.destroy();
      }
    });

    it('runs tests with npm/vitest', async () => {
      const sandbox = new ProcessSandbox();
      await sandbox.initialize();

      // Create a simple test file
      const testFile = join(testDir, 'simple.test.js');
      await writeFile(testFile, `
        const { test } = require('node:test');
        const assert = require('node:assert');

        test('adds numbers', () => {
          assert.strictEqual(1 + 1, 2);
        });
      `);

      try {
        const result = await sandbox.execute({
          command: 'node',
          args: ['--test', testFile],
          timeout: 10000,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('pass');
      } finally {
        await sandbox.destroy();
      }
    });

    it('reports execution duration', async () => {
      const sandbox = new ProcessSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'node',
          args: ['-e', 'setTimeout(() => {}, 50)'],
        });

        expect(result.durationMs).toBeGreaterThanOrEqual(50);
      } finally {
        await sandbox.destroy();
      }
    });

    it('can be stopped while running', async () => {
      const sandbox = new ProcessSandbox();
      await sandbox.initialize();

      try {
        // Start a long-running command
        const execPromise = sandbox.execute({
          command: 'sleep',
          args: ['30'],
        });

        // Stop it after a short delay
        setTimeout(() => sandbox.stop(), 100);

        const result = await execPromise;
        expect(result.exitCode).not.toBe(0);
      } finally {
        await sandbox.destroy();
      }
    });

    it('checks availability', async () => {
      const sandbox = new ProcessSandbox();
      const available = await sandbox.isAvailable();

      expect(available).toBe(true); // Process execution should always be available
    });

    it('tracks status correctly', async () => {
      const sandbox = new ProcessSandbox();

      expect(sandbox.status).toBe('idle');

      await sandbox.initialize();
      expect(sandbox.status).toBe('idle');

      const execPromise = sandbox.execute({
        command: 'sleep',
        args: ['0.1'],
      });

      // Give it a moment to start
      await new Promise(r => setTimeout(r, 10));
      expect(sandbox.status).toBe('running');

      await execPromise;
      expect(sandbox.status).toBe('idle');

      await sandbox.destroy();
      expect(sandbox.status).toBe('stopped');
    });
  });
});
