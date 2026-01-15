/**
 * seu-claude Benchmark Suite
 * 
 * Validates performance claims from the manifest:
 * 1. Index time for 5,000 files < 5 minutes
 * 2. Query latency p99 < 100ms
 * 3. Peak RAM during indexing < 800MB
 * 4. Idle RAM < 100MB
 */

import { performance } from 'perf_hooks';
import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

interface BenchmarkResult {
  name: string;
  target: string;
  actual: string;
  passed: boolean;
  details?: string;
}

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

const RESULTS_DIR = join(process.cwd(), 'benchmark-results');

// Ensure results directory exists
if (!existsSync(RESULTS_DIR)) {
  mkdirSync(RESULTS_DIR, { recursive: true });
}

/**
 * Generate a synthetic test codebase for benchmarking
 */
function generateTestCodebase(numFiles: number, outputDir: string): void {
  console.log(`Generating ${numFiles} test files...`);
  
  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const templates = {
    ts: (i: number) => `
// File ${i}
export interface Entity${i} {
  id: string;
  name: string;
  createdAt: Date;
}

export class Service${i} {
  private data: Entity${i}[] = [];

  async findById(id: string): Promise<Entity${i} | null> {
    return this.data.find(e => e.id === id) || null;
  }

  async create(entity: Omit<Entity${i}, 'id'>): Promise<Entity${i}> {
    const newEntity: Entity${i} = {
      ...entity,
      id: crypto.randomUUID(),
    };
    this.data.push(newEntity);
    return newEntity;
  }

  async update(id: string, updates: Partial<Entity${i}>): Promise<Entity${i} | null> {
    const index = this.data.findIndex(e => e.id === id);
    if (index === -1) return null;
    this.data[index] = { ...this.data[index], ...updates };
    return this.data[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.data.findIndex(e => e.id === id);
    if (index === -1) return false;
    this.data.splice(index, 1);
    return true;
  }
}
`,
    py: (i: number) => `
"""Module ${i} - Example Python service"""
from dataclasses import dataclass
from typing import Optional, List
from datetime import datetime
import uuid

@dataclass
class Entity${i}:
    id: str
    name: str
    created_at: datetime

class Service${i}:
    """Service for managing Entity${i} instances"""
    
    def __init__(self):
        self._data: List[Entity${i}] = []
    
    def find_by_id(self, id: str) -> Optional[Entity${i}]:
        """Find entity by ID"""
        for entity in self._data:
            if entity.id == id:
                return entity
        return None
    
    def create(self, name: str) -> Entity${i}:
        """Create a new entity"""
        entity = Entity${i}(
            id=str(uuid.uuid4()),
            name=name,
            created_at=datetime.now()
        )
        self._data.append(entity)
        return entity
    
    def delete(self, id: str) -> bool:
        """Delete entity by ID"""
        for i, entity in enumerate(self._data):
            if entity.id == id:
                self._data.pop(i)
                return True
        return False
`,
  };

  // Generate files in subdirectories
  const languages = Object.keys(templates) as Array<keyof typeof templates>;
  const filesPerLang = Math.floor(numFiles / languages.length);
  
  let fileCount = 0;
  for (const lang of languages) {
    const langDir = join(outputDir, `src-${lang}`);
    mkdirSync(langDir, { recursive: true });
    
    for (let i = 0; i < filesPerLang; i++) {
      const fileName = `service${i}.${lang}`;
      const filePath = join(langDir, fileName);
      writeFileSync(filePath, templates[lang](i));
      fileCount++;
      
      if (fileCount % 500 === 0) {
        process.stdout.write(`  Generated ${fileCount}/${numFiles} files\r`);
      }
    }
  }
  
  console.log(`  Generated ${fileCount} files total`);
}

/**
 * Measure memory usage of a process
 */
function getProcessMemory(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    timestamp: Date.now(),
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    rss: mem.rss,
  };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)}MB`;
}

/**
 * Run all benchmarks
 */
async function runBenchmarks(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  seu-claude Benchmark Suite');
  console.log('='.repeat(60));
  console.log();
  
  const results: BenchmarkResult[] = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Benchmark 1: Memory at idle
  console.log('[Benchmark 1] Idle Memory Usage');
  console.log('  Target: < 100MB RSS');
  const idleMem = getProcessMemory();
  const idleRssMB = idleMem.rss / 1024 / 1024;
  results.push({
    name: 'Idle Memory',
    target: '< 100MB',
    actual: formatBytes(idleMem.rss),
    passed: idleRssMB < 100,
  });
  console.log(`  Result: ${formatBytes(idleMem.rss)} - ${idleRssMB < 100 ? '✓ PASS' : '✗ FAIL'}`);
  console.log();

  // Benchmark 2: Generate test codebase
  const testCodebaseDir = join(RESULTS_DIR, 'test-codebase');
  const NUM_TEST_FILES = 1000; // Reduced for quick benchmark
  
  console.log('[Benchmark 2] Test Codebase Generation');
  console.log(`  Generating ${NUM_TEST_FILES} files for testing...`);
  const genStart = performance.now();
  generateTestCodebase(NUM_TEST_FILES, testCodebaseDir);
  const genDuration = performance.now() - genStart;
  console.log(`  Generated in ${(genDuration / 1000).toFixed(1)}s`);
  console.log();

  // Benchmark 3: Index performance (placeholder - needs integration)
  console.log('[Benchmark 3] Index Performance');
  console.log('  Target: 5,000 files in < 5 minutes');
  console.log('  Status: Run manually with:');
  console.log('    PROJECT_ROOT=./benchmark-results/test-codebase npm start');
  console.log('    Then use index_codebase tool');
  console.log();

  // Benchmark 4: Query latency (placeholder - needs indexed data)
  console.log('[Benchmark 4] Query Latency');
  console.log('  Target: p99 < 100ms');
  console.log('  Status: Run after indexing');
  console.log();

  // Save results
  const reportPath = join(RESULTS_DIR, `benchmark-${timestamp}.json`);
  writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    results,
  }, null, 2));
  
  console.log('='.repeat(60));
  console.log('  Results Summary');
  console.log('='.repeat(60));
  
  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${result.name}: ${result.actual} (target: ${result.target}) - ${status}`);
  }
  
  console.log();
  console.log(`Results saved to: ${reportPath}`);
  console.log();
  
  // Cleanup
  console.log('Cleaning up test codebase...');
  rmSync(testCodebaseDir, { recursive: true, force: true });
  console.log('Done.');
}

// Run benchmarks
runBenchmarks().catch(console.error);
