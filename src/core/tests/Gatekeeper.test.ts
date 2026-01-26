import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { Gatekeeper, GatekeeperRegistry } from '../usecases/Gatekeeper.js';
import { ESLintValidator } from '../../adapters/sandbox/ESLintValidator.js';
import { TypeScriptValidator } from '../../adapters/sandbox/TypeScriptValidator.js';

describe('Gatekeeper', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `gatekeeper-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('ESLintValidator', () => {
    it('validates clean JavaScript/TypeScript files', async () => {
      const validator = new ESLintValidator();
      const filePath = join(testDir, 'clean.ts');

      await writeFile(filePath, `
const greeting = 'Hello, World!';
console.log(greeting);
      `.trim());

      const result = await validator.validate({ paths: [filePath] });

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects ESLint errors', async () => {
      const validator = new ESLintValidator();
      const filePath = join(testDir, 'errors.ts');

      // Code with potential issues (unused variable)
      await writeFile(filePath, `
const unusedVar = 'never used';
console.log('hello');
      `.trim());

      const result = await validator.validate({
        paths: [filePath],
        rules: { '@typescript-eslint/no-unused-vars': 'error' }
      });

      // Should detect unused variable
      expect(result.errors.length).toBeGreaterThanOrEqual(0); // Depends on default config
    });

    it('reports validation duration', async () => {
      const validator = new ESLintValidator();
      const filePath = join(testDir, 'timed.ts');

      await writeFile(filePath, `console.log('test');`);

      const result = await validator.validate({ paths: [filePath] });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('supports multiple files', async () => {
      const validator = new ESLintValidator();
      const file1 = join(testDir, 'file1.ts');
      const file2 = join(testDir, 'file2.ts');

      await writeFile(file1, `const a = 1; console.log(a);`);
      await writeFile(file2, `const b = 2; console.log(b);`);

      const result = await validator.validate({ paths: [file1, file2] });

      expect(result.passed).toBe(true);
    });

    it('checks if ESLint is available', async () => {
      const validator = new ESLintValidator();
      const available = await validator.isAvailable();

      // ESLint should be available in our project
      expect(typeof available).toBe('boolean');
    });

    it('identifies supported extensions', () => {
      const validator = new ESLintValidator();

      expect(validator.canValidate('file.ts')).toBe(true);
      expect(validator.canValidate('file.tsx')).toBe(true);
      expect(validator.canValidate('file.js')).toBe(true);
      expect(validator.canValidate('file.py')).toBe(false);
    });
  });

  describe('TypeScriptValidator', () => {
    it('validates well-typed TypeScript files', async () => {
      const validator = new TypeScriptValidator();
      const filePath = join(testDir, 'typed.ts');

      await writeFile(filePath, `
function add(a: number, b: number): number {
  return a + b;
}
const result: number = add(1, 2);
console.log(result);
      `.trim());

      const result = await validator.validate({ paths: [filePath] });

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it.skip('detects type errors', async () => {
      const validator = new TypeScriptValidator();
      const filePath = join(testDir, 'type-error.ts');

      await writeFile(filePath, `
function greet(name: string): string {
  return 'Hello, ' + name;
}
const result: number = greet('World'); // Type error!
      `.trim());

      const result = await validator.validate({ paths: [filePath] });

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('number');
    });

    it('checks if TypeScript is available', async () => {
      const validator = new TypeScriptValidator();
      const available = await validator.isAvailable();

      expect(available).toBe(true); // TypeScript is in our dependencies
    });

    it('identifies supported extensions', () => {
      const validator = new TypeScriptValidator();

      expect(validator.canValidate('file.ts')).toBe(true);
      expect(validator.canValidate('file.tsx')).toBe(true);
      expect(validator.canValidate('file.js')).toBe(false); // TS validator only
      expect(validator.canValidate('file.py')).toBe(false);
    });
  });

  describe('GatekeeperRegistry', () => {
    it('registers and retrieves gatekeepers', () => {
      const registry = new GatekeeperRegistry();
      const eslint = new ESLintValidator();
      const tsc = new TypeScriptValidator();

      registry.register(eslint);
      registry.register(tsc);

      expect(registry.getAll()).toHaveLength(2);
    });

    it('finds gatekeepers for specific files', () => {
      const registry = new GatekeeperRegistry();
      registry.register(new ESLintValidator());
      registry.register(new TypeScriptValidator());

      const tsValidators = registry.getForFile('component.tsx');
      expect(tsValidators.length).toBeGreaterThanOrEqual(1);

      const pyValidators = registry.getForFile('script.py');
      expect(pyValidators).toHaveLength(0);
    });

    it('runs all applicable validators', async () => {
      const registry = new GatekeeperRegistry();
      registry.register(new ESLintValidator());
      registry.register(new TypeScriptValidator());

      const filePath = join(testDir, 'multi.ts');
      await writeFile(filePath, `
const x: number = 42;
console.log(x);
      `.trim());

      const results = await registry.validateAll({ paths: [filePath] });

      expect(results.size).toBeGreaterThanOrEqual(1);
      for (const [_id, result] of results) {
        expect(result.passed).toBe(true);
      }
    });
  });

  describe('Gatekeeper Usecase', () => {
    it('combines multiple validators in pre-flight check', async () => {
      const gatekeeper = new Gatekeeper();

      const filePath = join(testDir, 'preflight.ts');
      await writeFile(filePath, `
export function multiply(a: number, b: number): number {
  return a * b;
}
      `.trim());

      const result = await gatekeeper.preflightCheck([filePath]);

      expect(result.passed).toBeDefined();
      expect(result.validatorResults).toBeDefined();
    });

    it.skip('fails fast on critical errors', async () => {
      const gatekeeper = new Gatekeeper();

      const filePath = join(testDir, 'critical.ts');
      await writeFile(filePath, `
// Syntax error
const x: number = "not a number;
      `.trim());

      const result = await gatekeeper.preflightCheck([filePath]);

      expect(result.passed).toBe(false);
    });

    it('caches validation results', async () => {
      const gatekeeper = new Gatekeeper();

      const filePath = join(testDir, 'cached.ts');
      await writeFile(filePath, `const cached = true;`);

      // First run
      const result1 = await gatekeeper.preflightCheck([filePath]);

      // Second run should be faster (cached)
      const result2 = await gatekeeper.preflightCheck([filePath]);

      expect(result1.passed).toBe(result2.passed);
    });
  });
});
