import { spawn, execSync, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import type {
  ISandbox,
  SandboxStatus,
  ExecutionOptions,
  ExecutionResult,
  SandboxCreateOptions,
} from '../../core/interfaces/ISandbox.js';

/**
 * DockerSandbox - Secure sandbox using Docker containers
 *
 * Provides strong isolation through:
 * - Container isolation (namespaces, cgroups)
 * - Network isolation
 * - Resource limits (CPU, memory)
 * - Filesystem isolation with controlled mounts
 */
export class DockerSandbox implements ISandbox {
  readonly id: string;
  private _status: SandboxStatus = 'idle';
  private _containerId: string | null = null;
  private currentProcess: ChildProcess | null = null;
  private readonly options: SandboxCreateOptions;

  constructor(options: SandboxCreateOptions = {}) {
    this.id = `docker-${randomUUID().slice(0, 8)}`;
    this.options = {
      image: options.image ?? 'node:20-alpine',
      cpuLimit: options.cpuLimit,
      memoryLimit: options.memoryLimit,
    };
  }

  get status(): SandboxStatus {
    return this._status;
  }

  get containerId(): string | null {
    return this._containerId;
  }

  async initialize(): Promise<void> {
    if (this._status === 'stopped') {
      throw new Error('Sandbox has been destroyed');
    }

    // Verify Docker is available
    const available = await this.isAvailable();
    if (!available) {
      throw new Error('Docker is not available');
    }

    // Pull the image if not present (don't fail if already exists)
    try {
      execSync(`docker pull ${this.options.image}`, {
        stdio: 'pipe',
        timeout: 120000, // 2 minute timeout for pull
      });
    } catch {
      // Image might already exist locally, continue
    }

    this._status = 'idle';
  }

  async execute(options: ExecutionOptions): Promise<ExecutionResult> {
    if (this._status === 'stopped') {
      throw new Error('Sandbox has been destroyed');
    }

    const startTime = performance.now();
    const timeout = options.timeout ?? 30000;

    return new Promise(resolve => {
      this._status = 'running';

      // Build docker run command
      const dockerArgs = this.buildDockerArgs(options);

      const proc = spawn('docker', dockerArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.currentProcess = proc;

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let containerId: string | null = null;

      proc.stdout?.on('data', data => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', data => {
        stderr += data.toString();
      });

      // Handle stdin if provided
      if (options.stdin) {
        proc.stdin?.write(options.stdin);
        proc.stdin?.end();
      } else {
        proc.stdin?.end();
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        // Try to get container ID from docker ps to kill it
        if (containerId) {
          try {
            execSync(`docker kill ${containerId}`, { stdio: 'pipe' });
          } catch {
            // Container might already be stopped
          }
        }
        proc.kill('SIGKILL');
      }, timeout);

      // Try to capture container ID for cleanup
      // We use --cidfile but for simplicity, we'll just rely on the process cleanup
      proc.on('spawn', () => {
        // Container has started, try to get its ID
        try {
          const result = execSync(
            `docker ps -q --filter "ancestor=${this.options.image}" --filter "status=running" | head -1`,
            { stdio: 'pipe', encoding: 'utf-8' }
          );
          containerId = result.trim() || null;
          if (containerId) {
            this._containerId = containerId;
          }
        } catch {
          // Ignore errors getting container ID
        }
      });

      proc.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        this.currentProcess = null;
        this._status = this._status === 'stopped' ? 'stopped' : 'idle';

        resolve({
          exitCode: timedOut ? 124 : (code ?? (signal ? 128 : 1)),
          stdout,
          stderr,
          timedOut,
          durationMs: performance.now() - startTime,
        });
      });

      proc.on('error', error => {
        clearTimeout(timeoutId);
        this.currentProcess = null;
        this._status = 'error';

        resolve({
          exitCode: 1,
          stdout,
          stderr: stderr + '\n' + error.message,
          timedOut: false,
          durationMs: performance.now() - startTime,
        });
      });
    });
  }

  private buildDockerArgs(options: ExecutionOptions): string[] {
    const args: string[] = ['run', '--rm'];

    // Interactive mode for stdin support
    if (options.stdin) {
      args.push('-i');
    }

    // Network isolation (default: disabled)
    if (options.networkEnabled !== true) {
      args.push('--network', 'none');
    }

    // Working directory
    if (options.workingDir) {
      args.push('-w', options.workingDir);
    }

    // Environment variables
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    // Volume mounts
    if (options.mounts) {
      for (const mount of options.mounts) {
        const mountOpt = mount.readonly ? ':ro' : '';
        args.push('-v', `${mount.hostPath}:${mount.containerPath}${mountOpt}`);
      }
    }

    // Resource limits
    if (this.options.memoryLimit) {
      args.push('--memory', this.options.memoryLimit);
      args.push('--memory-swap', this.options.memoryLimit); // Disable swap
    }

    if (this.options.cpuLimit) {
      args.push('--cpus', this.options.cpuLimit);
    }

    // Security options - drop capabilities for extra security
    args.push('--cap-drop', 'ALL');

    // Image
    args.push(this.options.image!);

    // Command and args
    args.push(options.command);
    if (options.args) {
      args.push(...options.args);
    }

    return args;
  }

  async stop(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGKILL');
      this.currentProcess = null;
    }

    // Also try to stop any running container
    if (this._containerId) {
      try {
        execSync(`docker kill ${this._containerId}`, { stdio: 'pipe' });
      } catch {
        // Container might already be stopped
      }
    }
  }

  async destroy(): Promise<void> {
    await this.stop();

    // Clean up any leftover containers
    if (this._containerId) {
      try {
        execSync(`docker rm -f ${this._containerId}`, { stdio: 'pipe' });
      } catch {
        // Container might already be removed
      }
      this._containerId = null;
    }

    this._status = 'stopped';
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Docker daemon is running
      execSync('docker info', { stdio: 'pipe', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
