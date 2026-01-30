import { extname, dirname, join, resolve } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  IGatekeeper,
  ValidationResult,
  ValidationOptions,
  ValidationError,
  ValidationWarning,
} from '../../core/interfaces/IGatekeeper.js';
import { access, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);

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

    const paths = options.paths.filter(p => this.canValidate(p));
    if (paths.length === 0) {
      return {
        passed: true,
        errors: [],
        warnings: [],
        durationMs: performance.now() - startTime,
      };
    }

    const absolutePaths = paths.map(p => resolve(p));
    const projectRoot = dirname(absolutePaths[0]);
    const tsconfigPath = await this.findNearestTsconfig(projectRoot);
    const executionCwd = tsconfigPath ? dirname(tsconfigPath) : process.cwd();

    const tempDir = await mkdtemp(join(tmpdir(), 'seu-claude-tsc-'));
    const tempTsconfigPath = join(tempDir, 'tsconfig.json');

    const tempConfig: Record<string, unknown> = {
      compilerOptions: {
        noEmit: true,
        skipLibCheck: true,
      },
      files: absolutePaths,
    };

    if (tsconfigPath) {
      tempConfig.extends = tsconfigPath;
    }

    try {
      await writeFile(tempTsconfigPath, JSON.stringify(tempConfig, null, 2), 'utf-8');

      await execFileAsync('npx', ['tsc', '-p', tempTsconfigPath, '--pretty', 'false'], {
        cwd: executionCwd,
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
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      durationMs: performance.now() - startTime,
    };
  }

  private async findNearestTsconfig(startDir: string): Promise<string | null> {
    let dir = startDir;

    for (let i = 0; i < 25; i++) {
      const candidate = join(dir, 'tsconfig.json');
      try {
        await access(candidate);
        return candidate;
      } catch {
        // continue
      }

      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return null;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('npx', ['tsc', '--version'], { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }
}
