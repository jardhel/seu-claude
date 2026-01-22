/**
 * Result of executing code in the sandbox
 */
export interface ExecutionResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether execution timed out */
  timedOut: boolean;
  /** Execution duration in ms */
  durationMs: number;
  /** Memory usage in bytes (if available) */
  memoryUsage?: number;
}

/**
 * Options for sandbox execution
 */
export interface ExecutionOptions {
  /** Command to execute */
  command: string;
  /** Arguments for the command */
  args?: string[];
  /** Working directory inside the sandbox */
  workingDir?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum memory in bytes (default: 512MB) */
  maxMemory?: number;
  /** Whether to allow network access (default: false) */
  networkEnabled?: boolean;
  /** Files to mount into the sandbox (host -> container paths) */
  mounts?: Array<{ hostPath: string; containerPath: string; readonly?: boolean }>;
  /** Standard input to pass to the command */
  stdin?: string;
}

/**
 * Sandbox status
 */
export type SandboxStatus = 'idle' | 'running' | 'stopped' | 'error';

/**
 * ISandbox - Interface for isolated code execution
 *
 * The Sandbox provides a secure environment for running untrusted code,
 * with resource limits, network isolation, and timeout handling.
 */
export interface ISandbox {
  /** Unique identifier for this sandbox */
  readonly id: string;

  /** Current status of the sandbox */
  readonly status: SandboxStatus;

  /**
   * Initialize the sandbox environment
   */
  initialize(): Promise<void>;

  /**
   * Execute a command in the sandbox
   */
  execute(options: ExecutionOptions): Promise<ExecutionResult>;

  /**
   * Stop any running execution
   */
  stop(): Promise<void>;

  /**
   * Clean up and destroy the sandbox
   */
  destroy(): Promise<void>;

  /**
   * Check if the sandbox runtime is available
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Factory for creating sandboxes
 */
export interface ISandboxFactory {
  /**
   * Create a new sandbox instance
   */
  create(options?: SandboxCreateOptions): Promise<ISandbox>;

  /**
   * Check if the sandbox runtime is available
   */
  isAvailable(): Promise<boolean>;
}

export interface SandboxCreateOptions {
  /** Base image to use (e.g., 'node:20-alpine') */
  image?: string;
  /** CPU limit (e.g., '0.5' for half a CPU) */
  cpuLimit?: string;
  /** Memory limit (e.g., '256m') */
  memoryLimit?: string;
}
