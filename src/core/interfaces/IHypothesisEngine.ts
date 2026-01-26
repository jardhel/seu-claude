import type { ExecutionResult } from './ISandbox.js';
import type { ValidationResult } from './IGatekeeper.js';

/**
 * A hypothesis about code behavior to test
 */
export interface Hypothesis {
  id: string;
  /** Description of what we're testing */
  description: string;
  /** The test code */
  testCode: string;
  /** The implementation code to test */
  implementationCode: string;
  /** File path for the test */
  testFilePath: string;
  /** File path for the implementation */
  implementationFilePath: string;
}

/**
 * Result of testing a hypothesis
 */
export interface HypothesisResult {
  hypothesis: Hypothesis;
  /** Current phase in the TDD cycle */
  phase: 'red' | 'green' | 'refactor' | 'complete' | 'failed';
  /** Test execution result */
  testResult?: ExecutionResult;
  /** Validation results from gatekeeper */
  validationResult?: ValidationResult;
  /** Error message if failed */
  error?: string;
  /** Suggestions for next steps */
  suggestions: string[];
}

/**
 * Options for running TDD cycle
 */
export interface TDDOptions {
  /** Maximum iterations to attempt */
  maxIterations?: number;
  /** Timeout per test run in ms */
  testTimeout?: number;
  /** Whether to auto-fix lint issues */
  autoFix?: boolean;
}

/**
 * IHypothesisEngine - Automated TDD loop executor
 *
 * Implements the Red-Green-Refactor cycle:
 * 1. RED: Write a failing test (verify it fails)
 * 2. GREEN: Write minimum code to make it pass
 * 3. REFACTOR: Improve code while keeping tests green
 */
export interface IHypothesisEngine {
  /**
   * Create a new hypothesis to test
   */
  createHypothesis(
    description: string,
    testCode: string,
    implementationCode: string,
    testFilePath: string,
    implementationFilePath: string
  ): Hypothesis;

  /**
   * Verify the RED phase - test should fail
   */
  verifyRed(hypothesis: Hypothesis): Promise<HypothesisResult>;

  /**
   * Verify the GREEN phase - test should pass
   */
  verifyGreen(hypothesis: Hypothesis): Promise<HypothesisResult>;

  /**
   * Run the full TDD cycle
   */
  runTDDCycle(hypothesis: Hypothesis, options?: TDDOptions): Promise<HypothesisResult>;

  /**
   * Run tests for a hypothesis
   */
  runTests(hypothesis: Hypothesis): Promise<ExecutionResult>;

  /**
   * Validate code quality with gatekeeper
   */
  validateCode(hypothesis: Hypothesis): Promise<ValidationResult>;
}
