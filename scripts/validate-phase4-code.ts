#!/usr/bin/env node
/**
 * REFACTOR Phase - Validate Phase 4 Code Quality
 */

import { Gatekeeper } from '../src/core/usecases/Gatekeeper.js';

async function main() {
  console.log('\n🔎 REFACTOR Phase - Gatekeeper Validation\n');

  const gk = new Gatekeeper();
  const result = await gk.preflightCheck([
    'src/cli/index.ts',
    'src/mcp/handler.ts',
    'src/mcp/server.ts',
    'src/v2.ts',
  ]);

  console.log('   Validation:', result.passed ? '✅ PASSED' : '❌ FAILED');
  console.log('   Errors:', result.totalErrors);
  console.log('   Warnings:', result.totalWarnings);
  console.log('   Duration:', result.durationMs.toFixed(0) + 'ms');

  if (result.totalErrors > 0) {
    console.log('\n   Errors found:');
    for (const [validator, vResult] of result.validatorResults) {
      if (vResult.errors.length > 0) {
        console.log(`\n   ${validator}:`);
        vResult.errors.slice(0, 5).forEach(e => {
          console.log('     -', e.file.split('/').pop() + ':' + e.line, e.message);
        });
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(
    result.passed ? '✅ Phase 4 Code Quality: PASSED' : '❌ Phase 4 Code Quality: FAILED'
  );
  console.log('='.repeat(60) + '\n');

  process.exit(result.passed ? 0 : 1);
}

main().catch(console.error);
