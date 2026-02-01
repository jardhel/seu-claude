#!/usr/bin/env npx ts-node
/**
 * Manual Docker Sandbox Integration Test
 *
 * Run with: npx ts-node scripts/test-docker-sandbox.ts
 *
 * Prerequisites:
 * - Docker daemon must be running
 * - Run: docker info (should not error)
 */

import { DockerSandbox } from '../src/adapters/sandbox/DockerSandbox.js';

async function runTests() {
  console.log('🐳 Docker Sandbox Integration Tests\n');
  console.log('='.repeat(50));

  // Check Docker availability
  const sandbox = new DockerSandbox();
  const available = await sandbox.isDockerAvailable();

  if (!available) {
    console.error('❌ Docker is not available. Please start Docker and try again.');
    console.log('\nTo start Docker:');
    console.log('  - macOS: Open Docker Desktop');
    console.log('  - Linux: sudo systemctl start docker');
    console.log('  - Colima: colima start');
    process.exit(1);
  }

  console.log('✅ Docker is available\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Basic command execution
  try {
    console.log('Test 1: Basic command execution');
    const s1 = new DockerSandbox();
    await s1.initialize();
    const result = await s1.execute('echo', ['Hello from Docker!']);
    await s1.destroy();

    if (result.exitCode === 0 && result.stdout.includes('Hello from Docker!')) {
      console.log('  ✅ Passed - Output:', result.stdout.trim());
      passed++;
    } else {
      console.log('  ❌ Failed - Unexpected result:', result);
      failed++;
    }
  } catch (e) {
    console.log('  ❌ Failed with error:', e);
    failed++;
  }

  // Test 2: Node.js execution
  try {
    console.log('\nTest 2: Node.js script execution');
    const s2 = new DockerSandbox({ image: 'node:20-alpine' });
    await s2.initialize();
    const result = await s2.execute('node', ['-e', 'console.log(JSON.stringify({version: process.version, platform: process.platform}))']);
    await s2.destroy();

    if (result.exitCode === 0) {
      const output = JSON.parse(result.stdout.trim());
      console.log('  ✅ Passed - Node.js', output.version, 'on', output.platform);
      passed++;
    } else {
      console.log('  ❌ Failed:', result.stderr);
      failed++;
    }
  } catch (e) {
    console.log('  ❌ Failed with error:', e);
    failed++;
  }

  // Test 3: Network isolation
  try {
    console.log('\nTest 3: Network isolation (should fail to reach internet)');
    const s3 = new DockerSandbox({ networkEnabled: false });
    await s3.initialize();
    const result = await s3.execute('sh', ['-c', 'ping -c 1 8.8.8.8 2>&1 || echo "Network blocked"'], { timeout: 5000 });
    await s3.destroy();

    if (result.stdout.includes('Network blocked') || result.exitCode !== 0) {
      console.log('  ✅ Passed - Network correctly isolated');
      passed++;
    } else {
      console.log('  ❌ Failed - Network should be blocked');
      failed++;
    }
  } catch (e) {
    console.log('  ❌ Failed with error:', e);
    failed++;
  }

  // Test 4: Memory limits
  try {
    console.log('\nTest 4: Memory limits (256MB)');
    const s4 = new DockerSandbox({ memoryLimit: 256 * 1024 * 1024 });
    await s4.initialize();
    const result = await s4.execute('sh', ['-c', 'cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || echo "cgroup not available"']);
    await s4.destroy();

    const limit = parseInt(result.stdout.trim());
    if (!isNaN(limit) && limit <= 256 * 1024 * 1024 + 1024) {
      console.log('  ✅ Passed - Memory limit set to', (limit / 1024 / 1024).toFixed(0), 'MB');
      passed++;
    } else if (result.stdout.includes('cgroup not available')) {
      console.log('  ⚠️  Skipped - cgroups not available in this Docker setup');
    } else {
      console.log('  ❌ Failed - Unexpected limit:', result.stdout.trim());
      failed++;
    }
  } catch (e) {
    console.log('  ❌ Failed with error:', e);
    failed++;
  }

  // Test 5: Environment variables
  try {
    console.log('\nTest 5: Environment variables');
    const s5 = new DockerSandbox();
    await s5.initialize();
    const result = await s5.execute('sh', ['-c', 'echo $MY_VAR'], { env: { MY_VAR: 'secret-value-123' } });
    await s5.destroy();

    if (result.stdout.trim() === 'secret-value-123') {
      console.log('  ✅ Passed - Environment variable passed correctly');
      passed++;
    } else {
      console.log('  ❌ Failed - Expected "secret-value-123", got:', result.stdout.trim());
      failed++;
    }
  } catch (e) {
    console.log('  ❌ Failed with error:', e);
    failed++;
  }

  // Test 6: Timeout handling
  try {
    console.log('\nTest 6: Timeout handling (2s timeout on sleep 10)');
    const s6 = new DockerSandbox();
    await s6.initialize();
    const start = Date.now();
    const result = await s6.execute('sleep', ['10'], { timeout: 2000 });
    const duration = Date.now() - start;
    await s6.destroy();

    if (result.timedOut && duration < 5000) {
      console.log('  ✅ Passed - Timed out correctly after', duration, 'ms');
      passed++;
    } else {
      console.log('  ❌ Failed - Should have timed out');
      failed++;
    }
  } catch (e) {
    console.log('  ❌ Failed with error:', e);
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
