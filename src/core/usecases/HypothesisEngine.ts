import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import type {
  IHypothesisEngine,
  Hypothesis,
  HypothesisResult,
  TDDOptions,
} from '../interfaces/IHypothesisEngine.js';
import type { ExecutionResult } from '../interfaces/ISandbox.js';
import type { ValidationResult } from '../interfaces/IGatekeeper.js';
import { ProcessSandbox } from '../../adapters/sandbox/ProcessSandbox.js';
import { Gatekeeper } from './Gatekeeper.js';

const DEFAULT_OPTIONS: Required<TDDOptions> = {
  maxIterations: 3,
  testTimeout: 30000,
  autoFix: false,
};

/**
 * HypothesisEngine - Automated TDD loop executor
 *
 * Implements the Red-Green-Refactor cycle:
 * 1. RED: Write a failing test (verify it fails)
 * 2. GREEN: Write minimum code to make it pass
 * 3. REFACTOR: Improve code while keeping tests green
 */
export class HypothesisEngine implements IHypothesisEngine {
  private sandbox: ProcessSandbox;
  private gatekeeper: Gatekeeper;

  constructor() {
    this.sandbox = new ProcessSandbox();
    this.gatekeeper = new Gatekeeper();
  }

  createHypothesis(
    description: string,
    testCode: string,
    implementationCode: string,
    testFilePath: string,
    implementationFilePath: string
  ): Hypothesis {
    return {
      id: randomUUID(),
      description,
      testCode,
      implementationCode,
      testFilePath,
      implementationFilePath,
    };
  }

  async verifyRed(hypothesis: Hypothesis): Promise<HypothesisResult> {
    // Write files
    await this.writeHypothesisFiles(hypothesis);

    // Run tests - they should FAIL in the red phase
    const testResult = await this.runTests(hypothesis);

    if (testResult.exitCode !== 0) {
      // Good - test fails as expected in RED phase
      return {
        hypothesis,
        phase: 'red',
        testResult,
        suggestions: ['Test fails as expected. Now implement the code to make it pass.'],
      };
    } else {
      // Test passed when it should fail - not a valid RED phase
      return {
        hypothesis,
        phase: 'failed',
        testResult,
        error: 'Test passed but should fail in RED phase. Ensure test is written correctly.',
        suggestions: [
          'Make sure the test actually tests the expected behavior',
          'Check that the implementation is intentionally wrong/missing',
        ],
      };
    }
  }

  async verifyGreen(hypothesis: Hypothesis): Promise<HypothesisResult> {
    // Write files
    await this.writeHypothesisFiles(hypothesis);

    // Run tests - they should PASS in the green phase
    const testResult = await this.runTests(hypothesis);

    if (testResult.exitCode === 0) {
      // Good - test passes
      return {
        hypothesis,
        phase: 'green',
        testResult,
        suggestions: ['Test passes! Consider refactoring for cleaner code.'],
      };
    } else {
      // Test failed
      return {
        hypothesis,
        phase: 'failed',
        testResult,
        error: 'Test failed in GREEN phase.',
        suggestions: this.generateFailureSuggestions(testResult),
      };
    }
  }

  async runTDDCycle(hypothesis: Hypothesis, options?: TDDOptions): Promise<HypothesisResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Write files
    await this.writeHypothesisFiles(hypothesis);

    // Run tests with configured timeout
    const testResult = await this.runTests(hypothesis, opts.testTimeout);

    if (testResult.exitCode === 0) {
      // Tests pass - validate code quality
      const validationResult = await this.validateCode(hypothesis);

      if (validationResult.passed) {
        return {
          hypothesis,
          phase: 'complete',
          testResult,
          validationResult,
          suggestions: ['TDD cycle complete!', 'All tests pass', 'Code quality validated'],
        };
      } else if (opts.autoFix) {
        // Attempt auto-fix via gatekeeper
        const fixedValidation = await this.gatekeeper.preflightCheck(
          [hypothesis.implementationFilePath, hypothesis.testFilePath],
          { fix: true }
        );
        if (fixedValidation.passed) {
          return {
            hypothesis,
            phase: 'complete',
            testResult,
            validationResult: {
              passed: true,
              errors: [],
              warnings: fixedValidation.totalWarnings > 0 ? validationResult.warnings : [],
              durationMs: validationResult.durationMs + fixedValidation.durationMs,
            },
            suggestions: ['TDD cycle complete!', 'Code quality issues auto-fixed'],
          };
        }
        return {
          hypothesis,
          phase: 'refactor',
          testResult,
          validationResult,
          suggestions: [
            'Tests pass but some code quality issues could not be auto-fixed',
            ...validationResult.errors.map(e => `Fix: ${e.message} at ${e.file}:${e.line}`),
          ],
        };
      } else {
        return {
          hypothesis,
          phase: 'refactor',
          testResult,
          validationResult,
          suggestions: [
            'Tests pass but code quality issues found',
            ...validationResult.errors.map(e => `Fix: ${e.message} at ${e.file}:${e.line}`),
          ],
        };
      }
    } else {
      // Tests fail
      return {
        hypothesis,
        phase: 'failed',
        testResult,
        error: 'Tests failed',
        suggestions: this.generateFailureSuggestions(testResult),
      };
    }
  }

  async runTests(hypothesis: Hypothesis, timeout: number = 30000): Promise<ExecutionResult> {
    await this.sandbox.initialize();

    try {
      return await this.sandbox.execute({
        command: 'node',
        args: ['--test', hypothesis.testFilePath],
        timeout,
      });
    } finally {
      await this.sandbox.destroy();
    }
  }

  async validateCode(hypothesis: Hypothesis): Promise<ValidationResult> {
    const result = await this.gatekeeper.preflightCheck([
      hypothesis.implementationFilePath,
      hypothesis.testFilePath,
    ]);

    // Combine all validator results
    const errors = [];
    const warnings = [];

    for (const [, validatorResult] of result.validatorResults) {
      errors.push(...validatorResult.errors);
      warnings.push(...validatorResult.warnings);
    }

    return {
      passed: result.passed,
      errors,
      warnings,
      durationMs: result.durationMs,
    };
  }

  private async writeHypothesisFiles(hypothesis: Hypothesis): Promise<void> {
    await writeFile(hypothesis.implementationFilePath, hypothesis.implementationCode);
    await writeFile(hypothesis.testFilePath, hypothesis.testCode);
  }

  private generateFailureSuggestions(testResult: ExecutionResult): string[] {
    const suggestions: string[] = [];

    if (testResult.timedOut) {
      suggestions.push('Test timed out - check for infinite loops or long-running operations');
    }

    if (testResult.stderr.includes('Cannot find module')) {
      suggestions.push('Module not found - check import paths and ensure files exist');
    }

    if (testResult.stderr.includes('SyntaxError')) {
      suggestions.push('Syntax error in code - check for typos or malformed code');
    }

    if (testResult.stderr.includes('AssertionError')) {
      suggestions.push('Assertion failed - the implementation does not match expected behavior');

      // Try to extract the expected vs actual values
      const match = testResult.stderr.match(/Expected.*?(\S+).*?Actual.*?(\S+)/);
      if (match) {
        suggestions.push(`Expected: ${match[1]}, Got: ${match[2]}`);
      }
    }

    if (suggestions.length === 0) {
      suggestions.push('Check test output for details');
      suggestions.push('Review the implementation logic');
    }

    return suggestions;
  }
}
