import { execSync } from 'child_process';

/**
 * Resource limits configuration
 */
export interface ResourceLimits {
  /** Memory limit in bytes */
  memoryBytes?: number;
  /** Memory limit as string (e.g., '256m', '1g') */
  memory?: string;
  /** CPU cores limit as fraction (e.g., 0.5 for half a core) */
  cpuCores?: number;
  /** CPU limit as percentage string (e.g., '50%') */
  cpu?: string;
  /** Maximum number of processes */
  maxProcesses?: number;
  /** Maximum number of file descriptors */
  maxFileDescriptors?: number;
  /** Disk read limit in bytes per second */
  diskReadBytesPerSec?: number;
  /** Disk write limit in bytes per second */
  diskWriteBytesPerSec?: number;
}

/**
 * Current resource usage
 */
export interface ResourceUsage {
  memoryBytes: number;
  cpuPercent: number;
  diskReadBytes: number;
  diskWriteBytes: number;
}

/**
 * Resource limit violation
 */
export interface ResourceViolation {
  resource: 'memory' | 'cpu' | 'processes' | 'fileDescriptors' | 'diskRead' | 'diskWrite';
  limit: number;
  actual: number;
  message: string;
}

/**
 * Cgroup configuration for Linux
 */
export interface CgroupConfig {
  memory?: {
    limit: number;
    swap?: number;
  };
  cpu?: {
    quota: number;
    period: number;
  };
  pids?: {
    max: number;
  };
  blkio?: {
    readBps?: number;
    writeBps?: number;
  };
}

/**
 * Available limiting mechanisms
 */
export type LimitingMechanism = 'cgroups' | 'docker' | 'ulimit' | 'process';

/**
 * Parse memory string to bytes
 */
function parseMemory(memory: string): number {
  const match = memory.match(/^(\d+(?:\.\d+)?)\s*([kmgKMG])?[bB]?$/i);
  if (!match) {
    throw new Error(`Invalid memory format: ${memory}`);
  }

  const value = parseFloat(match[1]);
  const unit = (match[2] || '').toLowerCase();

  const multipliers: Record<string, number> = {
    '': 1,
    'k': 1024,
    'm': 1024 * 1024,
    'g': 1024 * 1024 * 1024,
  };

  return Math.floor(value * multipliers[unit]);
}

/**
 * Parse CPU percentage to fraction
 */
function parseCpuPercentage(cpu: string): number {
  const match = cpu.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (!match) {
    throw new Error(`Invalid CPU format: ${cpu}`);
  }

  const percentage = parseFloat(match[1]);
  if (percentage > 100) {
    throw new Error(`CPU percentage cannot exceed 100%: ${cpu}`);
  }

  return percentage / 100;
}

/**
 * Format bytes to memory string
 */
function formatMemory(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Math.floor(bytes / (1024 * 1024 * 1024))}g`;
  }
  if (bytes >= 1024 * 1024) {
    return `${Math.floor(bytes / (1024 * 1024))}m`;
  }
  if (bytes >= 1024) {
    return `${Math.floor(bytes / 1024)}k`;
  }
  return `${bytes}`;
}

/**
 * ResourceLimiter - Cross-platform resource limiting
 *
 * Provides resource limiting through:
 * - cgroups (Linux)
 * - Docker resource limits
 * - ulimit (Unix)
 * - Process-based monitoring and killing
 */
export class ResourceLimiter {
  readonly platform: NodeJS.Platform;
  private _limits: ResourceLimits = {};

  constructor() {
    this.platform = process.platform;
  }

  /**
   * Get available limiting mechanisms on this platform
   */
  async getAvailableMechanisms(): Promise<LimitingMechanism[]> {
    const mechanisms: LimitingMechanism[] = ['process']; // Always available

    // Check for ulimit (Unix-like systems)
    if (this.platform !== 'win32') {
      mechanisms.push('ulimit');
    }

    // Check for Docker
    try {
      execSync('docker info', { stdio: 'pipe', timeout: 5000 });
      mechanisms.push('docker');
    } catch {
      // Docker not available
    }

    // Check for cgroups (Linux only)
    if (this.platform === 'linux') {
      try {
        // Check for cgroup v2
        execSync('test -f /sys/fs/cgroup/cgroup.controllers', { stdio: 'pipe' });
        mechanisms.push('cgroups');
      } catch {
        // Try cgroup v1
        try {
          execSync('test -d /sys/fs/cgroup/memory', { stdio: 'pipe' });
          mechanisms.push('cgroups');
        } catch {
          // No cgroups available
        }
      }
    }

    return mechanisms;
  }

  /**
   * Set resource limits
   */
  setLimits(limits: ResourceLimits): void {
    // Parse and validate memory
    if (limits.memory !== undefined) {
      this._limits.memoryBytes = parseMemory(limits.memory);
    }
    if (limits.memoryBytes !== undefined) {
      if (limits.memoryBytes < 0) {
        throw new Error('Memory limit cannot be negative');
      }
      this._limits.memoryBytes = limits.memoryBytes;
    }

    // Parse and validate CPU
    if (limits.cpu !== undefined) {
      this._limits.cpuCores = parseCpuPercentage(limits.cpu);
    }
    if (limits.cpuCores !== undefined) {
      if (limits.cpuCores < 0) {
        throw new Error('CPU limit cannot be negative');
      }
      this._limits.cpuCores = limits.cpuCores;
    }

    // Validate and set other limits
    if (limits.maxProcesses !== undefined) {
      if (limits.maxProcesses < 0) {
        throw new Error('Max processes cannot be negative');
      }
      this._limits.maxProcesses = limits.maxProcesses;
    }

    if (limits.maxFileDescriptors !== undefined) {
      if (limits.maxFileDescriptors < 0) {
        throw new Error('Max file descriptors cannot be negative');
      }
      this._limits.maxFileDescriptors = limits.maxFileDescriptors;
    }

    if (limits.diskReadBytesPerSec !== undefined) {
      if (limits.diskReadBytesPerSec < 0) {
        throw new Error('Disk read limit cannot be negative');
      }
      this._limits.diskReadBytesPerSec = limits.diskReadBytesPerSec;
    }

    if (limits.diskWriteBytesPerSec !== undefined) {
      if (limits.diskWriteBytesPerSec < 0) {
        throw new Error('Disk write limit cannot be negative');
      }
      this._limits.diskWriteBytesPerSec = limits.diskWriteBytesPerSec;
    }
  }

  /**
   * Get current limits
   */
  getLimits(): ResourceLimits {
    return { ...this._limits };
  }

  /**
   * Get ulimit commands for process limits
   */
  getUlimitCommands(): string[] {
    const commands: string[] = [];

    if (this._limits.memoryBytes !== undefined) {
      // -v: virtual memory limit (in KB)
      const memoryKb = Math.floor(this._limits.memoryBytes / 1024);
      commands.push(`ulimit -v ${memoryKb}`);
      // -m: max memory size (in KB) - resident set size
      commands.push(`ulimit -m ${memoryKb}`);
    }

    if (this._limits.maxFileDescriptors !== undefined) {
      commands.push(`ulimit -n ${this._limits.maxFileDescriptors}`);
    }

    if (this._limits.maxProcesses !== undefined) {
      commands.push(`ulimit -u ${this._limits.maxProcesses}`);
    }

    return commands;
  }

  /**
   * Get Docker flags for container limits
   */
  getDockerFlags(): string[] {
    const flags: string[] = [];

    if (this._limits.memoryBytes !== undefined) {
      flags.push('--memory', formatMemory(this._limits.memoryBytes));
      // Disable swap to enforce strict memory limit
      flags.push('--memory-swap', formatMemory(this._limits.memoryBytes));
    }

    if (this._limits.cpuCores !== undefined) {
      flags.push('--cpus', this._limits.cpuCores.toString());
    }

    if (this._limits.maxProcesses !== undefined) {
      flags.push('--pids-limit', this._limits.maxProcesses.toString());
    }

    if (this._limits.diskReadBytesPerSec !== undefined) {
      // Note: This requires knowing the device, simplified here
      flags.push('--device-read-bps', `/dev/sda:${this._limits.diskReadBytesPerSec}`);
    }

    if (this._limits.diskWriteBytesPerSec !== undefined) {
      flags.push('--device-write-bps', `/dev/sda:${this._limits.diskWriteBytesPerSec}`);
    }

    return flags;
  }

  /**
   * Get cgroup configuration for Linux
   */
  getCgroupConfig(): CgroupConfig {
    const config: CgroupConfig = {};

    if (this._limits.memoryBytes !== undefined) {
      config.memory = {
        limit: this._limits.memoryBytes,
        swap: this._limits.memoryBytes, // Disable swap
      };
    }

    if (this._limits.cpuCores !== undefined) {
      // CFS scheduler: quota/period = CPU fraction
      const period = 100000; // 100ms in microseconds
      const quota = Math.floor(this._limits.cpuCores * period);
      config.cpu = { quota, period };
    }

    if (this._limits.maxProcesses !== undefined) {
      config.pids = { max: this._limits.maxProcesses };
    }

    if (this._limits.diskReadBytesPerSec !== undefined || this._limits.diskWriteBytesPerSec !== undefined) {
      config.blkio = {
        readBps: this._limits.diskReadBytesPerSec,
        writeBps: this._limits.diskWriteBytesPerSec,
      };
    }

    return config;
  }

  /**
   * Get current resource usage of this process
   */
  async getCurrentUsage(): Promise<ResourceUsage> {
    const memUsage = process.memoryUsage();

    return {
      memoryBytes: memUsage.rss,
      cpuPercent: 0, // Would need to track over time
      diskReadBytes: 0,
      diskWriteBytes: 0,
    };
  }

  /**
   * Get resource usage of a specific process
   */
  async getProcessUsage(pid: number): Promise<ResourceUsage> {
    try {
      if (this.platform === 'darwin') {
        // macOS: use ps
        const output = execSync(`ps -p ${pid} -o rss=`, { encoding: 'utf-8', stdio: 'pipe' });
        const rssKb = parseInt(output.trim(), 10);
        return {
          memoryBytes: rssKb * 1024,
          cpuPercent: 0,
          diskReadBytes: 0,
          diskWriteBytes: 0,
        };
      } else if (this.platform === 'linux') {
        // Linux: read from /proc
        const { readFileSync } = await import('fs');
        const statm = readFileSync(`/proc/${pid}/statm`, 'utf-8');
        const [, rss] = statm.split(' ');
        const pageSize = 4096; // Typical page size
        return {
          memoryBytes: parseInt(rss, 10) * pageSize,
          cpuPercent: 0,
          diskReadBytes: 0,
          diskWriteBytes: 0,
        };
      }
    } catch {
      // Process may have exited
    }

    return {
      memoryBytes: 0,
      cpuPercent: 0,
      diskReadBytes: 0,
      diskWriteBytes: 0,
    };
  }

  /**
   * Check if usage violates any limits
   */
  checkViolations(usage: ResourceUsage): ResourceViolation[] {
    const violations: ResourceViolation[] = [];

    if (this._limits.memoryBytes !== undefined && usage.memoryBytes > this._limits.memoryBytes) {
      violations.push({
        resource: 'memory',
        limit: this._limits.memoryBytes,
        actual: usage.memoryBytes,
        message: `Memory usage (${formatMemory(usage.memoryBytes)}) exceeds limit (${formatMemory(this._limits.memoryBytes)})`,
      });
    }

    if (this._limits.cpuCores !== undefined && usage.cpuPercent > this._limits.cpuCores * 100) {
      violations.push({
        resource: 'cpu',
        limit: this._limits.cpuCores * 100,
        actual: usage.cpuPercent,
        message: `CPU usage (${usage.cpuPercent}%) exceeds limit (${this._limits.cpuCores * 100}%)`,
      });
    }

    if (this._limits.diskReadBytesPerSec !== undefined && usage.diskReadBytes > this._limits.diskReadBytesPerSec) {
      violations.push({
        resource: 'diskRead',
        limit: this._limits.diskReadBytesPerSec,
        actual: usage.diskReadBytes,
        message: `Disk read rate exceeds limit`,
      });
    }

    if (this._limits.diskWriteBytesPerSec !== undefined && usage.diskWriteBytes > this._limits.diskWriteBytesPerSec) {
      violations.push({
        resource: 'diskWrite',
        limit: this._limits.diskWriteBytesPerSec,
        actual: usage.diskWriteBytes,
        message: `Disk write rate exceeds limit`,
      });
    }

    return violations;
  }

  /**
   * Cleanup any cgroup resources
   */
  async cleanup(): Promise<void> {
    // Currently no cleanup needed as we don't create cgroups directly
    // Docker handles its own cleanup
  }

  /**
   * Builder for creating resource limits
   */
  static builder(): ResourceLimitsBuilder {
    return new ResourceLimitsBuilder();
  }

  /**
   * Preset limit configurations
   */
  static presets = {
    /**
     * Restrictive preset for untrusted code
     */
    restrictive: (): ResourceLimits => ({
      memoryBytes: 128 * 1024 * 1024, // 128MB
      cpuCores: 0.25, // 25% of one core
      maxProcesses: 20,
      maxFileDescriptors: 256,
    }),

    /**
     * Permissive preset for trusted code
     */
    permissive: (): ResourceLimits => ({
      memoryBytes: 2 * 1024 * 1024 * 1024, // 2GB
      cpuCores: 2, // 2 cores
      maxProcesses: 500,
      maxFileDescriptors: 4096,
    }),

    /**
     * Minimal preset for simple scripts
     */
    minimal: (): ResourceLimits => ({
      memoryBytes: 64 * 1024 * 1024, // 64MB
      cpuCores: 0.1, // 10% of one core
      maxProcesses: 5,
      maxFileDescriptors: 64,
    }),
  };
}

/**
 * Fluent builder for resource limits
 */
export class ResourceLimitsBuilder {
  private limits: ResourceLimits = {};

  withMemory(memory: string): this {
    this.limits.memoryBytes = parseMemory(memory);
    return this;
  }

  withMemoryBytes(bytes: number): this {
    if (bytes < 0) {
      throw new Error('Memory cannot be negative');
    }
    this.limits.memoryBytes = bytes;
    return this;
  }

  withCpu(cpu: string): this {
    this.limits.cpuCores = parseCpuPercentage(cpu);
    return this;
  }

  withCpuCores(cores: number): this {
    if (cores < 0) {
      throw new Error('CPU cores cannot be negative');
    }
    this.limits.cpuCores = cores;
    return this;
  }

  withMaxProcesses(max: number): this {
    if (max < 0) {
      throw new Error('Max processes cannot be negative');
    }
    this.limits.maxProcesses = max;
    return this;
  }

  withMaxFileDescriptors(max: number): this {
    if (max < 0) {
      throw new Error('Max file descriptors cannot be negative');
    }
    this.limits.maxFileDescriptors = max;
    return this;
  }

  withDiskReadLimit(bytesPerSec: number): this {
    if (bytesPerSec < 0) {
      throw new Error('Disk read limit cannot be negative');
    }
    this.limits.diskReadBytesPerSec = bytesPerSec;
    return this;
  }

  withDiskWriteLimit(bytesPerSec: number): this {
    if (bytesPerSec < 0) {
      throw new Error('Disk write limit cannot be negative');
    }
    this.limits.diskWriteBytesPerSec = bytesPerSec;
    return this;
  }

  build(): ResourceLimits {
    return { ...this.limits };
  }
}
