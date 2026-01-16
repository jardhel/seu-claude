/**
 * Memory Profiler - Track memory usage during indexing and queries
 *
 * This module tracks:
 * - Peak memory during indexing
 * - Idle memory usage
 * - Memory per language/file type
 * - Memory trends over time
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import type { Config } from '../utils/config.js';

export interface MemorySample {
  timestamp: number;
  heapUsed: number; // bytes
  heapTotal: number;
  external: number;
  rss: number; // resident set size
  arrayBuffers: number;
}

export interface OperationMemory {
  operationId: string;
  operationType: 'indexing' | 'query' | 'embedding';
  startedAt: number;
  endedAt?: number;
  startMemory: MemorySample;
  peakMemory?: MemorySample;
  endMemory?: MemorySample;
  metadata?: Record<string, unknown>;
}

export interface MemoryByLanguage {
  language: string;
  filesProcessed: number;
  totalChunks: number;
  peakHeapUsed: number;
  avgHeapPerFile: number;
}

export interface MemoryProfile {
  projectRoot: string;
  createdAt: number;
  updatedAt: number;
  // Current state
  currentHeapUsed: number;
  currentHeapTotal: number;
  // Historical peaks
  peakHeapUsed: number;
  peakHeapTotal: number;
  peakTimestamp: number;
  // Operations tracking
  operations: OperationMemory[];
  // Language breakdown
  memoryByLanguage: MemoryByLanguage[];
  // Sampling history (last 100 samples)
  samples: MemorySample[];
}

const MAX_SAMPLES = 100;
const MAX_OPERATIONS = 50;

export class MemoryProfiler {
  private profile: MemoryProfile;
  private sampleInterval: NodeJS.Timeout | null = null;
  private currentOperation: OperationMemory | null = null;
  private persistPath: string;

  constructor(private config: Config) {
    this.persistPath = join(config.dataDir, 'memory-profile.json');
    this.profile = this.createEmptyProfile();
  }

  private createEmptyProfile(): MemoryProfile {
    const now = Date.now();
    const memory = this.getCurrentMemory();
    return {
      projectRoot: this.config.projectRoot,
      createdAt: now,
      updatedAt: now,
      currentHeapUsed: memory.heapUsed,
      currentHeapTotal: memory.heapTotal,
      peakHeapUsed: memory.heapUsed,
      peakHeapTotal: memory.heapTotal,
      peakTimestamp: now,
      operations: [],
      memoryByLanguage: [],
      samples: [],
    };
  }

  /**
   * Get current memory usage from Node.js process
   */
  getCurrentMemory(): MemorySample {
    const mem = process.memoryUsage();
    return {
      timestamp: Date.now(),
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
      arrayBuffers: mem.arrayBuffers,
    };
  }

  /**
   * Load profile from disk
   */
  async load(): Promise<void> {
    try {
      if (existsSync(this.persistPath)) {
        const data = await readFile(this.persistPath, 'utf-8');
        const loaded = JSON.parse(data) as MemoryProfile;
        // Merge loaded profile with current memory state
        this.profile = {
          ...loaded,
          currentHeapUsed: this.getCurrentMemory().heapUsed,
          currentHeapTotal: this.getCurrentMemory().heapTotal,
          updatedAt: Date.now(),
        };
        logger.debug('Loaded memory profile', {
          operations: this.profile.operations.length,
          samples: this.profile.samples.length,
        });
      }
    } catch (error) {
      logger.warn('Failed to load memory profile, starting fresh', { error });
      this.profile = this.createEmptyProfile();
    }
  }

  /**
   * Persist profile to disk
   */
  async persist(): Promise<void> {
    try {
      // Ensure directory exists
      const { mkdir } = await import('fs/promises');
      const { dirname } = await import('path');
      await mkdir(dirname(this.persistPath), { recursive: true });

      this.profile.updatedAt = Date.now();
      await writeFile(this.persistPath, JSON.stringify(this.profile, null, 2));
      logger.debug('Persisted memory profile');
    } catch (error) {
      logger.warn('Failed to persist memory profile', { error });
    }
  }

  /**
   * Take a memory sample and update profile
   */
  sample(): MemorySample {
    const sample = this.getCurrentMemory();

    // Update current values
    this.profile.currentHeapUsed = sample.heapUsed;
    this.profile.currentHeapTotal = sample.heapTotal;

    // Check for new peak
    if (sample.heapUsed > this.profile.peakHeapUsed) {
      this.profile.peakHeapUsed = sample.heapUsed;
      this.profile.peakHeapTotal = sample.heapTotal;
      this.profile.peakTimestamp = sample.timestamp;
    }

    // Update current operation peak if tracking
    if (this.currentOperation) {
      if (
        !this.currentOperation.peakMemory ||
        sample.heapUsed > this.currentOperation.peakMemory.heapUsed
      ) {
        this.currentOperation.peakMemory = sample;
      }
    }

    // Add to samples history (rolling window)
    this.profile.samples.push(sample);
    if (this.profile.samples.length > MAX_SAMPLES) {
      this.profile.samples.shift();
    }

    return sample;
  }

  /**
   * Start periodic sampling
   */
  startSampling(intervalMs: number = 1000): void {
    this.stopSampling();
    this.sampleInterval = setInterval(() => this.sample(), intervalMs);
    logger.debug('Started memory sampling', { intervalMs });
  }

  /**
   * Stop periodic sampling
   */
  stopSampling(): void {
    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
      this.sampleInterval = null;
      logger.debug('Stopped memory sampling');
    }
  }

  /**
   * Start tracking an operation
   */
  startOperation(
    operationType: OperationMemory['operationType'],
    metadata?: Record<string, unknown>
  ): string {
    const operationId = `${operationType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startMemory = this.getCurrentMemory();

    this.currentOperation = {
      operationId,
      operationType,
      startedAt: Date.now(),
      startMemory,
      peakMemory: startMemory,
      metadata,
    };

    logger.debug('Started operation tracking', {
      operationId,
      operationType,
      startHeap: this.formatBytes(startMemory.heapUsed),
    });

    return operationId;
  }

  /**
   * End tracking an operation
   */
  endOperation(operationId: string): OperationMemory | undefined {
    if (!this.currentOperation || this.currentOperation.operationId !== operationId) {
      logger.warn('Operation ID mismatch or no active operation', { operationId });
      return undefined;
    }

    const endMemory = this.getCurrentMemory();
    this.currentOperation.endedAt = Date.now();
    this.currentOperation.endMemory = endMemory;

    // Add to operations list (keep last N)
    this.profile.operations.push(this.currentOperation);
    if (this.profile.operations.length > MAX_OPERATIONS) {
      this.profile.operations.shift();
    }

    const completed = this.currentOperation;
    this.currentOperation = null;

    logger.debug('Ended operation tracking', {
      operationId,
      durationMs: completed.endedAt! - completed.startedAt,
      peakHeap: this.formatBytes(completed.peakMemory?.heapUsed || 0),
    });

    return completed;
  }

  /**
   * Record memory usage for a specific language during indexing
   */
  recordLanguageMemory(language: string, filesProcessed: number, chunks: number): void {
    const currentHeap = this.getCurrentMemory().heapUsed;
    const existing = this.profile.memoryByLanguage.find((m) => m.language === language);

    if (existing) {
      existing.filesProcessed += filesProcessed;
      existing.totalChunks += chunks;
      if (currentHeap > existing.peakHeapUsed) {
        existing.peakHeapUsed = currentHeap;
      }
      existing.avgHeapPerFile = existing.peakHeapUsed / existing.filesProcessed;
    } else {
      this.profile.memoryByLanguage.push({
        language,
        filesProcessed,
        totalChunks: chunks,
        peakHeapUsed: currentHeap,
        avgHeapPerFile: currentHeap / filesProcessed,
      });
    }
  }

  /**
   * Get current profile summary
   */
  getProfile(): MemoryProfile {
    // Update current values before returning
    const current = this.getCurrentMemory();
    this.profile.currentHeapUsed = current.heapUsed;
    this.profile.currentHeapTotal = current.heapTotal;
    return this.profile;
  }

  /**
   * Get formatted statistics
   */
  getStats(): {
    current: string;
    peak: string;
    peakTime: string;
    samplesCount: number;
    operationsCount: number;
    languagesTracked: number;
  } {
    return {
      current: this.formatBytes(this.profile.currentHeapUsed),
      peak: this.formatBytes(this.profile.peakHeapUsed),
      peakTime: new Date(this.profile.peakTimestamp).toISOString(),
      samplesCount: this.profile.samples.length,
      operationsCount: this.profile.operations.length,
      languagesTracked: this.profile.memoryByLanguage.length,
    };
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Format for Claude output
   */
  formatForClaude(format: 'summary' | 'json' | 'detailed' = 'summary'): string {
    const profile = this.getProfile();
    const stats = this.getStats();

    if (format === 'json') {
      return JSON.stringify(profile, null, 2);
    }

    if (format === 'detailed') {
      let output = `# Memory Profile\n\n`;
      output += `## Current Status\n`;
      output += `- **Heap Used:** ${stats.current}\n`;
      output += `- **Peak Heap:** ${stats.peak} (at ${stats.peakTime})\n`;
      output += `- **Samples:** ${stats.samplesCount}\n`;
      output += `- **Operations Tracked:** ${stats.operationsCount}\n\n`;

      if (profile.memoryByLanguage.length > 0) {
        output += `## Memory by Language\n`;
        output += `| Language | Files | Chunks | Peak Heap | Avg/File |\n`;
        output += `|----------|-------|--------|-----------|----------|\n`;
        for (const lang of profile.memoryByLanguage) {
          output += `| ${lang.language} | ${lang.filesProcessed} | ${lang.totalChunks} | ${this.formatBytes(lang.peakHeapUsed)} | ${this.formatBytes(lang.avgHeapPerFile)} |\n`;
        }
        output += '\n';
      }

      if (profile.operations.length > 0) {
        output += `## Recent Operations\n`;
        const recent = profile.operations.slice(-10);
        for (const op of recent) {
          const duration = op.endedAt ? `${op.endedAt - op.startedAt}ms` : 'ongoing';
          const peak = op.peakMemory ? this.formatBytes(op.peakMemory.heapUsed) : 'N/A';
          output += `- **${op.operationType}** (${op.operationId.slice(0, 20)}...): ${duration}, peak ${peak}\n`;
        }
      }

      return output;
    }

    // Summary format
    let output = `Memory Profile for ${profile.projectRoot}\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    output += `Current Heap: ${stats.current}\n`;
    output += `Peak Heap: ${stats.peak}\n`;
    output += `Peak Time: ${stats.peakTime}\n`;
    output += `Operations: ${stats.operationsCount}\n`;
    output += `Languages: ${stats.languagesTracked}\n`;

    return output;
  }

  /**
   * Reset profile
   */
  reset(): void {
    this.stopSampling();
    this.currentOperation = null;
    this.profile = this.createEmptyProfile();
    logger.info('Memory profile reset');
  }
}
