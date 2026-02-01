import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { execSync } from 'child_process';
import { DockerSandbox } from './DockerSandbox.js';

// Check Docker availability once at module load
const checkDockerAvailable = (): boolean => {
  try {
    execSync('docker info', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

const dockerAvailable = checkDockerAvailable();

describe('DockerSandbox', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `docker-sandbox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('availability check', () => {
    it('checks if Docker daemon is running', async () => {
      const sandbox = new DockerSandbox();
      const available = await sandbox.isAvailable();

      // This should return true if Docker is installed and running
      expect(typeof available).toBe('boolean');
    });
  });

  describe('when Docker is available', () => {
    it.skipIf(!dockerAvailable)('initializes with default node:20-alpine image', async () => {

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        expect(sandbox.status).toBe('idle');
        expect(sandbox.id).toMatch(/^docker-/);
      } finally {
        await sandbox.destroy();
      }
    });

    it('executes simple commands in container', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'echo',
          args: ['Hello from Docker!'],
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('Hello from Docker!');
        expect(result.timedOut).toBe(false);
      } finally {
        await sandbox.destroy();
      }
    });

    it('captures stderr from container', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'sh',
          args: ['-c', 'echo "error output" >&2'],
        });

        expect(result.stderr.trim()).toBe('error output');
      } finally {
        await sandbox.destroy();
      }
    });

    it('returns non-zero exit code on failure', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'sh',
          args: ['-c', 'exit 42'],
        });

        expect(result.exitCode).toBe(42);
      } finally {
        await sandbox.destroy();
      }
    });

    it('handles timeout by killing container', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'sleep',
          args: ['30'],
          timeout: 500, // 500ms timeout
        });

        expect(result.timedOut).toBe(true);
        expect(result.durationMs).toBeLessThan(2000); // Should not wait full 30s
      } finally {
        await sandbox.destroy();
      }
    });

    it('passes environment variables to container', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'sh',
          args: ['-c', 'echo $TEST_VAR'],
          env: { TEST_VAR: 'docker_test_value' },
        });

        expect(result.stdout.trim()).toBe('docker_test_value');
      } finally {
        await sandbox.destroy();
      }
    });

    it('executes in specified working directory', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'pwd',
          workingDir: '/tmp',
        });

        expect(result.stdout.trim()).toBe('/tmp');
      } finally {
        await sandbox.destroy();
      }
    });

    it('mounts host directories into container', async () => {
      if (!dockerAvailable) return;

      // Create a test file on the host
      const testFile = join(testDir, 'test-input.txt');
      await writeFile(testFile, 'Hello from host!');

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'cat',
          args: ['/workspace/test-input.txt'],
          mounts: [
            { hostPath: testDir, containerPath: '/workspace', readonly: true },
          ],
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('Hello from host!');
      } finally {
        await sandbox.destroy();
      }
    });

    it('supports writable mounts', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'sh',
          args: ['-c', 'echo "Written by Docker" > /workspace/output.txt'],
          mounts: [
            { hostPath: testDir, containerPath: '/workspace', readonly: false },
          ],
        });

        expect(result.exitCode).toBe(0);

        // Verify file was written to host
        const content = await readFile(join(testDir, 'output.txt'), 'utf-8');
        expect(content.trim()).toBe('Written by Docker');
      } finally {
        await sandbox.destroy();
      }
    });

    it('isolates network when networkEnabled is false', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        // Try to ping google.com - should fail with network disabled
        const result = await sandbox.execute({
          command: 'ping',
          args: ['-c', '1', '-W', '1', 'google.com'],
          networkEnabled: false,
          timeout: 5000,
        });

        // Network disabled should cause ping to fail
        expect(result.exitCode).not.toBe(0);
      } finally {
        await sandbox.destroy();
      }
    });

    it('allows network when networkEnabled is true', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        // Simple check that we can resolve DNS
        const result = await sandbox.execute({
          command: 'sh',
          args: ['-c', 'getent hosts google.com || echo "failed"'],
          networkEnabled: true,
          timeout: 10000,
        });

        // With network enabled, DNS should work (or at least not be blocked)
        // The exact behavior depends on the host network
        expect(result.timedOut).toBe(false);
      } finally {
        await sandbox.destroy();
      }
    });

    it('runs Node.js scripts in container', async () => {
      if (!dockerAvailable) return;

      const scriptPath = join(testDir, 'test.js');
      await writeFile(
        scriptPath,
        `
        const sum = (a, b) => a + b;
        console.log(JSON.stringify({ result: sum(2, 3) }));
      `
      );

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'node',
          args: ['/workspace/test.js'],
          mounts: [
            { hostPath: testDir, containerPath: '/workspace', readonly: true },
          ],
        });

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.result).toBe(5);
      } finally {
        await sandbox.destroy();
      }
    });

    it('reports execution duration', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'sleep',
          args: ['0.1'],
        });

        expect(result.durationMs).toBeGreaterThanOrEqual(100);
      } finally {
        await sandbox.destroy();
      }
    });

    it('can be stopped while running', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        // Start a long-running command
        const execPromise = sandbox.execute({
          command: 'sleep',
          args: ['60'],
        });

        // Stop it after a short delay
        setTimeout(() => sandbox.stop(), 200);

        const result = await execPromise;
        expect(result.durationMs).toBeLessThan(5000); // Should not wait full 60s
      } finally {
        await sandbox.destroy();
      }
    });

    it('tracks status correctly', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();

      expect(sandbox.status).toBe('idle');

      await sandbox.initialize();
      expect(sandbox.status).toBe('idle');

      const execPromise = sandbox.execute({
        command: 'sleep',
        args: ['0.5'],
      });

      // Give it a moment to start the container
      await new Promise(r => setTimeout(r, 100));
      expect(sandbox.status).toBe('running');

      await execPromise;
      expect(sandbox.status).toBe('idle');

      await sandbox.destroy();
      expect(sandbox.status).toBe('stopped');
    });

    it('cleans up container after destroy', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      // Execute something to create a container
      await sandbox.execute({
        command: 'echo',
        args: ['test'],
      });

      const containerId = sandbox.containerId;
      await sandbox.destroy();

      // Verify container is removed by trying to inspect it
      const { execSync } = await import('child_process');
      let containerExists = true;
      try {
        execSync(`docker inspect ${containerId}`, { stdio: 'pipe' });
      } catch {
        containerExists = false;
      }

      expect(containerExists).toBe(false);
    });

    it('handles stdin input', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'cat',
          stdin: 'Hello from stdin',
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('Hello from stdin');
      } finally {
        await sandbox.destroy();
      }
    });
  });

  describe('with custom image', () => {
    it('uses specified image', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox({ image: 'alpine:latest' });
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'cat',
          args: ['/etc/alpine-release'],
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toMatch(/^\d+\.\d+/); // Alpine version number
      } finally {
        await sandbox.destroy();
      }
    });
  });

  describe('resource limits', () => {
    it('applies memory limit', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox({ memoryLimit: '64m' });
      await sandbox.initialize();

      try {
        // Try to allocate more memory than the limit
        const result = await sandbox.execute({
          command: 'node',
          args: ['-e', `
            const arr = [];
            try {
              while(true) {
                arr.push(new Array(1024 * 1024).fill('x'));
              }
            } catch(e) {
              console.log('OOM');
            }
          `],
          timeout: 10000,
        });

        // Should either be killed by OOM or catch the error
        expect(result.exitCode !== 0 || result.stdout.includes('OOM')).toBe(true);
      } finally {
        await sandbox.destroy();
      }
    });

    it('applies CPU limit', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox({ cpuLimit: '0.5' });
      await sandbox.initialize();

      try {
        // Run a CPU-intensive task - with limit it should be slower
        // We just verify it doesn't error
        const result = await sandbox.execute({
          command: 'node',
          args: ['-e', 'let x=0; for(let i=0;i<1000000;i++) x+=i; console.log(x);'],
          timeout: 10000,
        });

        expect(result.exitCode).toBe(0);
      } finally {
        await sandbox.destroy();
      }
    });
  });

  describe('error handling', () => {
    it('handles non-existent command', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();

      try {
        const result = await sandbox.execute({
          command: 'nonexistentcommand12345',
        });

        expect(result.exitCode).not.toBe(0);
      } finally {
        await sandbox.destroy();
      }
    });

    it('throws when executing after destroy', async () => {
      if (!dockerAvailable) return;

      const sandbox = new DockerSandbox();
      await sandbox.initialize();
      await sandbox.destroy();

      await expect(
        sandbox.execute({
          command: 'echo',
          args: ['test'],
        })
      ).rejects.toThrow('Sandbox has been destroyed');
    });
  });
});
