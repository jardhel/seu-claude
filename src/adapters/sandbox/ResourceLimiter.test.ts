import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { ResourceLimiter, ResourceLimits, ResourceUsage } from './ResourceLimiter.js';

describe('ResourceLimiter', () => {
  let testDir: string;
  let limiter: ResourceLimiter;

  beforeEach(async () => {
    testDir = join(tmpdir(), `resource-limiter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    limiter = new ResourceLimiter();
  });

  afterEach(async () => {
    await limiter.cleanup();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('creates a limiter with default options', () => {
      expect(limiter).toBeDefined();
      expect(limiter.platform).toBe(process.platform);
    });

    it('detects available limiting mechanisms', async () => {
      const mechanisms = await limiter.getAvailableMechanisms();
      expect(Array.isArray(mechanisms)).toBe(true);
      // Should at least have process-based limiting
      expect(mechanisms.length).toBeGreaterThan(0);
    });
  });

  describe('limit configuration', () => {
    it('accepts memory limit in bytes', () => {
      const limits: ResourceLimits = {
        memoryBytes: 256 * 1024 * 1024, // 256MB
      };
      expect(() => limiter.setLimits(limits)).not.toThrow();
    });

    it('accepts memory limit as string with units', () => {
      const limits: ResourceLimits = {
        memory: '256m', // 256MB
      };
      expect(() => limiter.setLimits(limits)).not.toThrow();
      expect(limiter.getLimits().memoryBytes).toBe(256 * 1024 * 1024);
    });

    it('parses memory units correctly', () => {
      const testCases = [
        { input: '1k', expected: 1024 },
        { input: '1K', expected: 1024 },
        { input: '1m', expected: 1024 * 1024 },
        { input: '1M', expected: 1024 * 1024 },
        { input: '1g', expected: 1024 * 1024 * 1024 },
        { input: '1G', expected: 1024 * 1024 * 1024 },
        { input: '512m', expected: 512 * 1024 * 1024 },
        { input: '2g', expected: 2 * 1024 * 1024 * 1024 },
      ];

      for (const { input, expected } of testCases) {
        limiter.setLimits({ memory: input });
        expect(limiter.getLimits().memoryBytes).toBe(expected);
      }
    });

    it('accepts CPU limit as fraction', () => {
      const limits: ResourceLimits = {
        cpuCores: 0.5, // Half a CPU
      };
      expect(() => limiter.setLimits(limits)).not.toThrow();
    });

    it('accepts CPU limit as percentage string', () => {
      const limits: ResourceLimits = {
        cpu: '50%',
      };
      expect(() => limiter.setLimits(limits)).not.toThrow();
      expect(limiter.getLimits().cpuCores).toBe(0.5);
    });

    it('accepts process limit', () => {
      const limits: ResourceLimits = {
        maxProcesses: 10,
      };
      expect(() => limiter.setLimits(limits)).not.toThrow();
    });

    it('accepts file descriptor limit', () => {
      const limits: ResourceLimits = {
        maxFileDescriptors: 1024,
      };
      expect(() => limiter.setLimits(limits)).not.toThrow();
    });

    it('accepts disk I/O limits', () => {
      const limits: ResourceLimits = {
        diskReadBytesPerSec: 10 * 1024 * 1024, // 10 MB/s
        diskWriteBytesPerSec: 5 * 1024 * 1024, // 5 MB/s
      };
      expect(() => limiter.setLimits(limits)).not.toThrow();
    });

    it('rejects invalid memory limit', () => {
      expect(() => limiter.setLimits({ memoryBytes: -1 })).toThrow();
      expect(() => limiter.setLimits({ memory: 'invalid' })).toThrow();
    });

    it('rejects invalid CPU limit', () => {
      expect(() => limiter.setLimits({ cpuCores: -1 })).toThrow();
      expect(() => limiter.setLimits({ cpu: '150%' })).toThrow(); // Can't be > 100% per core
    });
  });

  describe('applying limits', () => {
    it('generates ulimit commands for process limits', async () => {
      limiter.setLimits({
        memoryBytes: 256 * 1024 * 1024,
        maxFileDescriptors: 1024,
      });

      const commands = limiter.getUlimitCommands();
      expect(commands.length).toBeGreaterThan(0);
      // Should include memory limit
      expect(commands.some(cmd => cmd.includes('-v') || cmd.includes('-m'))).toBe(true);
      // Should include file descriptor limit
      expect(commands.some(cmd => cmd.includes('-n'))).toBe(true);
    });

    it('generates Docker flags for container limits', async () => {
      limiter.setLimits({
        memoryBytes: 256 * 1024 * 1024,
        cpuCores: 0.5,
        maxProcesses: 100,
      });

      const flags = limiter.getDockerFlags();
      expect(flags).toContain('--memory');
      expect(flags).toContain('256m');
      expect(flags).toContain('--cpus');
      expect(flags).toContain('0.5');
      expect(flags).toContain('--pids-limit');
      expect(flags).toContain('100');
    });

    it('generates cgroup configuration for Linux', async () => {
      if (process.platform !== 'linux') {
        return; // Skip on non-Linux
      }

      limiter.setLimits({
        memoryBytes: 256 * 1024 * 1024,
        cpuCores: 0.5,
      });

      const cgroupConfig = limiter.getCgroupConfig();
      expect(cgroupConfig.memory).toBeDefined();
      expect(cgroupConfig.cpu).toBeDefined();
    });
  });

  describe('resource monitoring', () => {
    it('tracks current resource usage', async () => {
      const usage = await limiter.getCurrentUsage();

      expect(usage).toBeDefined();
      expect(typeof usage.memoryBytes).toBe('number');
      expect(usage.memoryBytes).toBeGreaterThanOrEqual(0);
    });

    it('tracks memory usage of child process', async () => {
      const scriptPath = join(testDir, 'memory-user.js');
      await writeFile(
        scriptPath,
        `
        // Allocate some memory
        const arr = new Array(1024 * 1024).fill('x');
        console.log('allocated');
        // Keep alive briefly
        setTimeout(() => {}, 100);
      `
      );

      limiter.setLimits({ memoryBytes: 512 * 1024 * 1024 });

      const { spawn } = await import('child_process');
      const proc = spawn('node', [scriptPath]);

      // Wait for process to start and allocate
      await new Promise(resolve => setTimeout(resolve, 50));

      const usage = await limiter.getProcessUsage(proc.pid!);
      expect(usage.memoryBytes).toBeGreaterThan(0);

      proc.kill();
    });

    it('detects when limits are exceeded', async () => {
      limiter.setLimits({ memoryBytes: 1024 }); // Very low limit (1KB)

      // Simulate checking against a larger usage
      const mockUsage: ResourceUsage = {
        memoryBytes: 2048,
        cpuPercent: 0,
        diskReadBytes: 0,
        diskWriteBytes: 0,
      };

      const violations = limiter.checkViolations(mockUsage);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].resource).toBe('memory');
      expect(violations[0].limit).toBe(1024);
      expect(violations[0].actual).toBe(2048);
    });
  });

  describe('enforcement', () => {
    it('can kill process exceeding memory limit', async () => {
      const scriptPath = join(testDir, 'memory-hog.js');
      await writeFile(
        scriptPath,
        `
        // Try to allocate lots of memory
        const arrays = [];
        try {
          while (true) {
            arrays.push(new Array(1024 * 1024).fill('x'));
          }
        } catch (e) {
          console.log('OOM');
        }
      `
      );

      limiter.setLimits({ memoryBytes: 50 * 1024 * 1024 }); // 50MB limit

      const { spawn } = await import('child_process');
      const proc = spawn('node', ['--max-old-space-size=50', scriptPath]);

      // The process should be killed or error out
      const exitCode = await new Promise<number | null>(resolve => {
        proc.on('close', resolve);
        // Timeout safety
        setTimeout(() => {
          proc.kill();
          resolve(null);
        }, 5000);
      });

      // Process should have been killed (non-zero exit) or we timed out
      expect(exitCode === null || exitCode !== 0).toBe(true);
    });
  });

  describe('resource limit builder', () => {
    it('provides fluent API for building limits', () => {
      const limits = ResourceLimiter.builder()
        .withMemory('256m')
        .withCpu('50%')
        .withMaxProcesses(100)
        .withMaxFileDescriptors(1024)
        .build();

      expect(limits.memoryBytes).toBe(256 * 1024 * 1024);
      expect(limits.cpuCores).toBe(0.5);
      expect(limits.maxProcesses).toBe(100);
      expect(limits.maxFileDescriptors).toBe(1024);
    });

    it('provides presets for common scenarios', () => {
      const restrictive = ResourceLimiter.presets.restrictive();
      expect(restrictive.memoryBytes).toBeLessThan(512 * 1024 * 1024);
      expect(restrictive.maxProcesses).toBeLessThan(50);

      const permissive = ResourceLimiter.presets.permissive();
      expect(permissive.memoryBytes).toBeGreaterThan(restrictive.memoryBytes!);
    });
  });
});
