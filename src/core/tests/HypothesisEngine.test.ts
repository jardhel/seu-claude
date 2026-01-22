import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { HypothesisEngine } from '../usecases/HypothesisEngine';

describe('HypothesisEngine', () => {
  let testDir: string;
  let engine: HypothesisEngine;

  beforeEach(async () => {
    testDir = join(tmpdir(), `hypothesis-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    engine = new HypothesisEngine();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('createHypothesis', () => {
    it('creates a hypothesis with all fields', () => {
      const hypothesis = engine.createHypothesis(
        'Adding two numbers',
        'test("adds", () => expect(add(1, 2)).toBe(3));',
        'function add(a, b) { return a + b; }',
        join(testDir, 'add.test.js'),
        join(testDir, 'add.js')
      );

      expect(hypothesis.id).toBeDefined();
      expect(hypothesis.description).toBe('Adding two numbers');
      expect(hypothesis.testCode).toContain('add(1, 2)');
      expect(hypothesis.implementationCode).toContain('return a + b');
    });
  });

  describe('RED phase', () => {
    it('verifies test fails without implementation', async () => {
      const testPath = join(testDir, 'failing.test.js');
      const implPath = join(testDir, 'failing.js');

      const testCode = `
const { test } = require('node:test');
const assert = require('node:assert');
const { add } = require('./failing.js');

test('add returns sum', () => {
  assert.strictEqual(add(2, 3), 5);
});
      `.trim();

      // Empty/wrong implementation
      const implCode = `
module.exports.add = function add(a, b) {
  return 0; // Wrong implementation
};
      `.trim();

      const hypothesis = engine.createHypothesis(
        'Add function should return sum',
        testCode,
        implCode,
        testPath,
        implPath
      );

      const result = await engine.verifyRed(hypothesis);

      expect(result.phase).toBe('red');
      expect(result.testResult?.exitCode).not.toBe(0);
    });
  });

  describe('GREEN phase', () => {
    it('verifies test passes with correct implementation', async () => {
      const testPath = join(testDir, 'passing.test.js');
      const implPath = join(testDir, 'passing.js');

      const testCode = `
const { test } = require('node:test');
const assert = require('node:assert');
const { multiply } = require('./passing.js');

test('multiply returns product', () => {
  assert.strictEqual(multiply(2, 3), 6);
});
      `.trim();

      const implCode = `
module.exports.multiply = function multiply(a, b) {
  return a * b;
};
      `.trim();

      const hypothesis = engine.createHypothesis(
        'Multiply function should return product',
        testCode,
        implCode,
        testPath,
        implPath
      );

      const result = await engine.verifyGreen(hypothesis);

      expect(result.phase).toBe('green');
      expect(result.testResult?.exitCode).toBe(0);
    });
  });

  describe('runTests', () => {
    it('runs test file and returns result', async () => {
      const testPath = join(testDir, 'run.test.js');
      const implPath = join(testDir, 'run.js');

      const testCode = `
const { test } = require('node:test');
const assert = require('node:assert');

test('simple test', () => {
  assert.strictEqual(1 + 1, 2);
});
      `.trim();

      const implCode = `// No implementation needed`;

      const hypothesis = engine.createHypothesis(
        'Simple arithmetic',
        testCode,
        implCode,
        testPath,
        implPath
      );

      // Write files first
      await writeFile(testPath, testCode);
      await writeFile(implPath, implCode);

      const result = await engine.runTests(hypothesis);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('pass');
    });
  });

  describe('TDD Cycle', () => {
    it('runs full red-green cycle', async () => {
      const testPath = join(testDir, 'cycle.test.js');
      const implPath = join(testDir, 'cycle.js');

      const testCode = `
const { test } = require('node:test');
const assert = require('node:assert');
const { greet } = require('./cycle.js');

test('greet returns greeting', () => {
  assert.strictEqual(greet('World'), 'Hello, World!');
});
      `.trim();

      const implCode = `
module.exports.greet = function greet(name) {
  return 'Hello, ' + name + '!';
};
      `.trim();

      const hypothesis = engine.createHypothesis(
        'Greet function should return greeting',
        testCode,
        implCode,
        testPath,
        implPath
      );

      const result = await engine.runTDDCycle(hypothesis);

      expect(result.phase).toBe('complete');
      expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('provides suggestions on failure', async () => {
      const testPath = join(testDir, 'fail.test.js');
      const implPath = join(testDir, 'fail.js');

      const testCode = `
const { test } = require('node:test');
const assert = require('node:assert');
const { broken } = require('./fail.js');

test('broken function', () => {
  assert.strictEqual(broken(), 'expected');
});
      `.trim();

      const implCode = `
module.exports.broken = function broken() {
  return 'wrong';
};
      `.trim();

      const hypothesis = engine.createHypothesis(
        'Broken function test',
        testCode,
        implCode,
        testPath,
        implPath
      );

      const result = await engine.runTDDCycle(hypothesis, { maxIterations: 1 });

      expect(result.phase).toBe('failed');
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Integration with Gatekeeper', () => {
    it('validates code quality during cycle', async () => {
      const testPath = join(testDir, 'quality.test.js');
      const implPath = join(testDir, 'quality.js');

      const testCode = `
const { test } = require('node:test');
const assert = require('node:assert');

test('quality check', () => {
  assert.ok(true);
});
      `.trim();

      const implCode = `
const value = 42;
console.log(value);
      `.trim();

      const hypothesis = engine.createHypothesis(
        'Code quality test',
        testCode,
        implCode,
        testPath,
        implPath
      );

      await writeFile(testPath, testCode);
      await writeFile(implPath, implCode);

      const validationResult = await engine.validateCode(hypothesis);

      expect(validationResult).toBeDefined();
      expect(validationResult.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
