import type {
  IGatekeeper,
  IGatekeeperRegistry,
  ValidationResult,
  ValidationOptions,
} from '../interfaces/IGatekeeper.js';
import { ESLintValidator } from '../../adapters/sandbox/ESLintValidator.js';
import { TypeScriptValidator } from '../../adapters/sandbox/TypeScriptValidator.js';

/**
 * Registry for managing multiple validators
 */
export class GatekeeperRegistry implements IGatekeeperRegistry {
  private gatekeepers: Map<string, IGatekeeper> = new Map();

  register(gatekeeper: IGatekeeper): void {
    this.gatekeepers.set(gatekeeper.id, gatekeeper);
  }

  getAll(): IGatekeeper[] {
    return Array.from(this.gatekeepers.values());
  }

  getForFile(filePath: string): IGatekeeper[] {
    return this.getAll().filter(g => g.canValidate(filePath));
  }

  async validateAll(options: ValidationOptions): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();

    // Get unique validators needed for all files
    const neededValidators = new Set<IGatekeeper>();
    for (const path of options.paths) {
      for (const validator of this.getForFile(path)) {
        neededValidators.add(validator);
      }
    }

    // Run each validator
    const validationPromises = Array.from(neededValidators).map(async validator => {
      const result = await validator.validate(options);
      results.set(validator.id, result);
    });

    await Promise.all(validationPromises);

    return results;
  }
}

/**
 * Pre-flight check result
 */
export interface PreflightResult {
  passed: boolean;
  validatorResults: Map<string, ValidationResult>;
  totalErrors: number;
  totalWarnings: number;
  durationMs: number;
}

/**
 * Gatekeeper - Pre-flight validation orchestrator
 *
 * Runs static analysis checks before code changes are applied,
 * ensuring code quality and preventing regressions.
 */
export class Gatekeeper {
  private registry: GatekeeperRegistry;
  private cache: Map<string, { result: ValidationResult; hash: string }>;

  constructor() {
    this.registry = new GatekeeperRegistry();
    this.cache = new Map();

    // Register default validators
    this.registry.register(new ESLintValidator());
    this.registry.register(new TypeScriptValidator());
  }

  /**
   * Register a custom validator
   */
  registerValidator(validator: IGatekeeper): void {
    this.registry.register(validator);
  }

  /**
   * Run pre-flight checks on the specified files
   */
  async preflightCheck(paths: string[], options?: Partial<ValidationOptions>): Promise<PreflightResult> {
    const startTime = performance.now();

    const validationOptions: ValidationOptions = {
      paths,
      fix: options?.fix,
      rules: options?.rules,
      maxErrors: options?.maxErrors,
    };

    const validatorResults = await this.registry.validateAll(validationOptions);

    // Aggregate results
    let totalErrors = 0;
    let totalWarnings = 0;
    let passed = true;

    for (const [, result] of validatorResults) {
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
      if (!result.passed) {
        passed = false;
      }
    }

    return {
      passed,
      validatorResults,
      totalErrors,
      totalWarnings,
      durationMs: performance.now() - startTime,
    };
  }

  /**
   * Quick check if all validators are available
   */
  async checkAvailability(): Promise<Map<string, boolean>> {
    const availability = new Map<string, boolean>();

    for (const validator of this.registry.getAll()) {
      const available = await validator.isAvailable();
      availability.set(validator.id, available);
    }

    return availability;
  }

  /**
   * Get all registered validators
   */
  getValidators(): IGatekeeper[] {
    return this.registry.getAll();
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
