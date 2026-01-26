import { extname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  IGatekeeper,
  ValidationResult,
  ValidationOptions,
  ValidationError,
  ValidationWarning,
} from '../../core/interfaces/IGatekeeper.js';

const execAsync = promisify(exec);

/**
 * ESLint-based code validator
 */
export class ESLintValidator implements IGatekeeper {
  readonly id = 'eslint';
  readonly name = 'ESLint';
  readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  canValidate(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  async validate(options: ValidationOptions): Promise<ValidationResult> {
    const startTime = performance.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const paths = options.paths.filter((p: string) => this.canValidate(p));
      if (paths.length === 0) {
        return {
          passed: true,
          errors: [],
          warnings: [],
          durationMs: performance.now() - startTime,
        };
      }

      // Build ESLint command
      const args = [
        'npx', 'eslint',
        '--format', 'json',
        '--no-error-on-unmatched-pattern',
        ...paths,
      ];

      if (options.fix) {
        args.push('--fix');
      }

  const { stdout } = await execAsync(args.join(' '), {
        cwd: process.cwd(),
        timeout: 60000,
      });

      // Parse ESLint JSON output
      if (stdout) {
        const results = JSON.parse(stdout) as ESLintOutput[];
        for (const fileResult of results) {
          for (const msg of fileResult.messages) {
            const issue = {
              file: fileResult.filePath,
              line: msg.line || 1,
              column: msg.column || 1,
              message: msg.message,
              rule: msg.ruleId || undefined,
            };

            if (msg.severity === 2) {
              errors.push({ ...issue, severity: 'error' });
            } else if (msg.severity === 1) {
              warnings.push({ ...issue, severity: 'warning' });
            }
          }
        }
      }
    } catch (error: any) {
      // ESLint exits with code 1 when there are errors
      if (error.stdout) {
        try {
          const results = JSON.parse(error.stdout) as ESLintOutput[];
          for (const fileResult of results) {
            for (const msg of fileResult.messages) {
              const issue = {
                file: fileResult.filePath,
                line: msg.line || 1,
                column: msg.column || 1,
                message: msg.message,
                rule: msg.ruleId || undefined,
              };

              if (msg.severity === 2) {
                errors.push({ ...issue, severity: 'error' });
              } else if (msg.severity === 1) {
                warnings.push({ ...issue, severity: 'warning' });
              }
            }
          }
        } catch {
          // If we can't parse the output, add a generic error
          errors.push({
            file: options.paths[0] || 'unknown',
            line: 1,
            column: 1,
            message: `ESLint execution failed: ${error.message}`,
            severity: 'error',
          });
        }
      }
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      durationMs: performance.now() - startTime,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('npx eslint --version', { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }
}

interface ESLintOutput {
  filePath: string;
  messages: ESLintMessage[];
  errorCount: number;
  warningCount: number;
}

interface ESLintMessage {
  ruleId: string | null;
  severity: 1 | 2;
  message: string;
  line: number;
  column: number;
}
