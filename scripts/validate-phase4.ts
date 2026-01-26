#!/usr/bin/env node
/**
 * Validate Phase 4 - Using HypothesisEngine
 *
 * This script uses the HypothesisEngine to test a hypothesis:
 * "Can we create a simple CLI command that works?"
 *
 * This demonstrates:
 * 1. RED: Write a failing test
 * 2. GREEN: Write minimal code to make it pass
 * 3. REFACTOR: Validate with Gatekeeper
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm } from 'fs/promises';
import { HypothesisEngine } from '../src/core/usecases/HypothesisEngine.js';

async function main() {
  console.log('🧪 Phase 4 Validation - Using HypothesisEngine\n');
  console.log('Hypothesis: "A simple CLI command can be created and tested"\n');

  // Create temp directory for test
  const testDir = join(tmpdir(), `phase4-validation-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    // RED PHASE: Write a failing test (using Node's built-in test runner)
    const testCode = `
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('CLI help command', () => {
  const result = execSync('node cli-simple.js help', {
    encoding: 'utf-8',
    cwd: __dirname
  });

  assert.match(result, /Available commands/);
  assert.match(result, /help/);
});

test('CLI version command', () => {
  const result = execSync('node cli-simple.js version', {
    encoding: 'utf-8',
    cwd: __dirname
  });

  assert.match(result, /\\d+\\.\\d+\\.\\d+/);
});
`;

    // GREEN PHASE: Write minimal implementation
    const implementationCode = `#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0] || 'help';

const commands = {
  help: () => {
    console.log('Available commands:');
    console.log('  help    - Show this help');
    console.log('  version - Show version');
  },
  version: () => {
    console.log('2.3.0');
  }
};

const handler = commands[command];
if (handler) {
  handler();
} else {
  console.error('Unknown command:', command);
  process.exit(1);
}
`;

    const engine = new HypothesisEngine();

    // Create hypothesis
    console.log('📝 Creating hypothesis...');
    const hypothesis = engine.createHypothesis(
      'Simple CLI command handler',
      testCode,
      implementationCode,
      join(testDir, 'cli-simple.test.js'),
      join(testDir, 'cli-simple.js')
    );

    // Run TDD cycle
    console.log('🔄 Running TDD cycle...\n');

    // Phase 1: Verify RED (test should fail without implementation)
    console.log('  1️⃣ RED Phase - Verifying test fails...');
    const redResult = await engine.verifyRed({
      ...hypothesis,
      implementationCode: '// Empty implementation'
    });

    if (redResult.phase === 'red') {
      console.log('     ✅ Test fails as expected (RED phase validated)\n');
    } else {
      console.log('     ❌ Test should fail but passed\n');
      console.log(JSON.stringify(redResult, null, 2));
    }

    // Phase 2: Verify GREEN (test should pass with implementation)
    console.log('  2️⃣ GREEN Phase - Verifying implementation works...');
    const greenResult = await engine.verifyGreen(hypothesis);

    if (greenResult.phase === 'green') {
      console.log('     ✅ Test passes with implementation (GREEN phase validated)\n');
    } else {
      console.log('     ❌ Test failed:\n');
      if (greenResult.testResult) {
        console.log('     stdout:', greenResult.testResult.stdout.slice(0, 500));
        console.log('     stderr:', greenResult.testResult.stderr.slice(0, 500));
      }
      console.log('     Suggestions:', greenResult.suggestions);
    }

    // Phase 3: Full TDD cycle with validation
    console.log('  3️⃣ REFACTOR Phase - Running full TDD cycle with validation...');
    const fullResult = await engine.runTDDCycle(hypothesis);

    console.log(`     Phase: ${fullResult.phase}`);
    console.log(`     Status: ${fullResult.phase === 'complete' ? '✅ PASSED' : '❌ FAILED'}`);

    if (fullResult.suggestions) {
      console.log('     Suggestions:');
      fullResult.suggestions.forEach(s => console.log(`       - ${s}`));
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Validation Summary\n');
    console.log(`  RED Phase:     ${redResult.phase === 'red' ? '✅ Valid' : '❌ Invalid'}`);
    console.log(`  GREEN Phase:   ${greenResult.phase === 'green' ? '✅ Valid' : '❌ Invalid'}`);
    console.log(`  REFACTOR Phase: ${fullResult.phase === 'complete' ? '✅ Valid' : '❌ Invalid'}`);

    const allPassed =
      redResult.phase === 'red' &&
      greenResult.phase === 'green' &&
      fullResult.phase === 'complete';

    if (allPassed) {
      console.log('\n🎉 Phase 4 approach validated!');
      console.log('   The TDD workflow works correctly.');
      console.log('   We can proceed with Phase 4 implementation.\n');
    } else {
      console.log('\n⚠️  Some phases failed.');
      console.log('   Review the output above and fix issues.\n');
    }

    console.log('💡 Next Steps:');
    console.log('   1. Apply this TDD approach to each Phase 4 task');
    console.log('   2. Write test first (RED)');
    console.log('   3. Implement code (GREEN)');
    console.log('   4. Validate with Gatekeeper (REFACTOR)');
    console.log('   5. Track progress in TaskManager');
    console.log('='.repeat(60));

  } finally {
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error('❌ Validation failed:', err);
  process.exit(1);
});
