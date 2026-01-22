/**
 * Result of a validation check
 */
export interface ValidationResult {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  /** Time taken for validation in ms */
  durationMs: number;
}

export interface ValidationError {
  file: string;
  line: number;
  column: number;
  message: string;
  rule?: string;
  severity: 'error';
}

export interface ValidationWarning {
  file: string;
  line: number;
  column: number;
  message: string;
  rule?: string;
  severity: 'warning';
}

/**
 * Options for running validation
 */
export interface ValidationOptions {
  /** Files or directories to validate */
  paths: string[];
  /** Whether to auto-fix issues if possible */
  fix?: boolean;
  /** Specific rules to enable/disable */
  rules?: Record<string, 'off' | 'warn' | 'error'>;
  /** Maximum number of errors before stopping */
  maxErrors?: number;
}

/**
 * IGatekeeper - Interface for pre-flight validation
 *
 * The Gatekeeper runs static analysis checks before code changes
 * are applied, ensuring code quality and preventing regressions.
 */
export interface IGatekeeper {
  /** Unique identifier for this validator */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** File extensions this gatekeeper can validate */
  readonly supportedExtensions: string[];

  /**
   * Check if this gatekeeper can validate the given file
   */
  canValidate(filePath: string): boolean;

  /**
   * Run validation on the specified paths
   */
  validate(options: ValidationOptions): Promise<ValidationResult>;

  /**
   * Check if the gatekeeper is properly configured and available
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Composite gatekeeper that runs multiple validators
 */
export interface IGatekeeperRegistry {
  /**
   * Register a gatekeeper
   */
  register(gatekeeper: IGatekeeper): void;

  /**
   * Get all registered gatekeepers
   */
  getAll(): IGatekeeper[];

  /**
   * Get gatekeepers that can validate a specific file
   */
  getForFile(filePath: string): IGatekeeper[];

  /**
   * Run all applicable validators on the given paths
   */
  validateAll(options: ValidationOptions): Promise<Map<string, ValidationResult>>;
}
