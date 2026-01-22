import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import type {
  ISandbox,
  SandboxStatus,
  ExecutionOptions,
  ExecutionResult,
} from '../../core/interfaces/ISandbox';

/**
 * ProcessSandbox - Lightweight sandbox using child processes
 *
 * Provides basic isolation through:
 * - Separate process space
 * - Timeout handling
 * - Environment isolation
 *
 * For stronger isolation, use DockerSandbox.
 */
export class ProcessSandbox implements ISandbox {
  readonly id: string;
  private _status: SandboxStatus = 'idle';
  private currentProcess: ChildProcess | null = null;

  constructor() {
    this.id = `process-${randomUUID().slice(0, 8)}`;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  async initialize(): Promise<void> {
    this._status = 'idle';
  }

  async execute(options: ExecutionOptions): Promise<ExecutionResult> {
    if (this._status === 'stopped') {
      throw new Error('Sandbox has been destroyed');
    }

    const startTime = performance.now();
    const timeout = options.timeout ?? 30000;

    return new Promise((resolve) => {
      this._status = 'running';

      const env = {
        ...process.env,
        ...options.env,
        // Remove some potentially dangerous env vars
        NODE_OPTIONS: undefined,
      };

      const proc = spawn(options.command, options.args || [], {
        cwd: options.workingDir || process.cwd(),
        env: env as NodeJS.ProcessEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout,
        killSignal: 'SIGKILL',
      });

      this.currentProcess = proc;

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle stdin if provided
      if (options.stdin) {
        proc.stdin?.write(options.stdin);
        proc.stdin?.end();
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
      }, timeout);

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

      proc.on('error', (error) => {
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

  async stop(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGKILL');
      this.currentProcess = null;
    }
  }

  async destroy(): Promise<void> {
    await this.stop();
    this._status = 'stopped';
  }

  async isAvailable(): Promise<boolean> {
    // Process-based sandbox is always available
    return true;
  }
}
