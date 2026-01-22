import { extname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  IGatekeeper,
  ValidationResult,
  ValidationOptions,
  ValidationError,
  ValidationWarning,
} from '../../core/interfaces/IGatekeeper';

const execAsync = promisify(exec);

/**
 * TypeScript type checker validator
 */
export class TypeScriptValidator implements IGatekeeper {
  readonly id = 'typescript';
  readonly name = 'TypeScript';
  readonly supportedExtensions = ['.ts', '.tsx'];

  canValidate(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  async validate(options: ValidationOptions): Promise<ValidationResult> {
    const startTime = performance.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const paths = options.paths.filter(p => this.canValidate(p));
      if (paths.length === 0) {
        return {
          passed: true,
          errors: [],
          warnings: [],
          durationMs: performance.now() - startTime,
        };
      }

      // Use tsc with --noEmit for type checking only
      const args = [
        'npx', 'tsc',
        '--noEmit',
        '--skipLibCheck',
        '--esModuleInterop',
        '--allowSyntheticDefaultImports',
        '--strict',
        ...paths,
      ];

      await execAsync(args.join(' '), {
        cwd: process.cwd(),
        timeout: 60000,
      });

      // If we get here, no type errors
    } catch (error: any) {
      // TypeScript outputs errors to stderr/stdout
      const output = error.stdout || error.stderr || error.message || '';
      const lines = output.split('\n');

      for (const line of lines) {
        // Parse TypeScript error format: file(line,col): error TS1234: message
        const match = line.match(/^(.+)\((\d+),(\d+)\):\s*(error|warning)\s*(TS\d+):\s*(.+)$/);
        if (match) {
          const [, file, lineStr, colStr, severity, code, message] = match;
          const issue = {
            file,
            line: parseInt(lineStr, 10),
            column: parseInt(colStr, 10),
            message: `${code}: ${message}`,
            rule: code,
          };

          if (severity === 'error') {
            errors.push({ ...issue, severity: 'error' });
          } else {
            warnings.push({ ...issue, severity: 'warning' });
          }
        }
      }

      // If no structured errors found but command failed, add generic error
      if (errors.length === 0 && output.includes('error')) {
        errors.push({
          file: options.paths[0] || 'unknown',
          line: 1,
          column: 1,
          message: output.slice(0, 500),
          severity: 'error',
        });
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
      await execAsync('npx tsc --version', { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }
}
