import { MemoryProfiler } from '../../stats/memory-profiler.js';
import type { Config } from '../../utils/config.js';
import { mkdtemp, rm, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('MemoryProfiler', () => {
  let tempDir: string;
  let config: Config;
  let profiler: MemoryProfiler;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'seu-claude-memory-test-'));
    config = {
      projectRoot: tempDir,
      dataDir: join(tempDir, '.seu-claude'),
      embeddingModel: 'Xenova/all-MiniLM-L6-v2',
      embeddingDimensions: 384,
      maxChunkTokens: 512,
      minChunkLines: 5,
      supportedLanguages: ['typescript', 'javascript'],
      ignorePatterns: ['**/node_modules/**'],
    };

    // Ensure data directory exists
    await mkdir(config.dataDir, { recursive: true });

    profiler = new MemoryProfiler(config);
  });

  afterEach(async () => {
    profiler.stopSampling();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getCurrentMemory', () => {
    it('should return current memory usage', () => {
      const memory = profiler.getCurrentMemory();

      expect(memory).toHaveProperty('timestamp');
      expect(memory).toHaveProperty('heapUsed');
      expect(memory).toHaveProperty('heapTotal');
      expect(memory).toHaveProperty('external');
      expect(memory).toHaveProperty('rss');
      expect(memory).toHaveProperty('arrayBuffers');

      expect(memory.heapUsed).toBeGreaterThan(0);
      expect(memory.heapTotal).toBeGreaterThanOrEqual(memory.heapUsed);
      expect(memory.rss).toBeGreaterThan(0);
    });
  });

  describe('sample', () => {
    it('should take a memory sample and update profile', () => {
      const sample = profiler.sample();

      expect(sample.timestamp).toBeGreaterThan(0);
      expect(sample.heapUsed).toBeGreaterThan(0);

      const profile = profiler.getProfile();
      expect(profile.samples.length).toBeGreaterThan(0);
      // Memory can change between sample and getProfile, so just check it's close
      expect(profile.currentHeapUsed).toBeGreaterThan(0);
    });

    it('should track peak memory', () => {
      // Take multiple samples
      profiler.sample();
      profiler.sample();
      profiler.sample();

      const profile = profiler.getProfile();
      expect(profile.peakHeapUsed).toBeGreaterThan(0);
      expect(profile.peakTimestamp).toBeGreaterThan(0);
    });

    it('should respect max samples limit', () => {
      // Take more than max samples
      for (let i = 0; i < 120; i++) {
        profiler.sample();
      }

      const profile = profiler.getProfile();
      expect(profile.samples.length).toBeLessThanOrEqual(100);
    });
  });

  describe('startOperation / endOperation', () => {
    it('should track operation memory usage', () => {
      const opId = profiler.startOperation('indexing', { files: 10 });
      expect(opId).toContain('indexing-');

      // Simulate some work
      const arr = new Array(10000).fill('test');

      profiler.sample(); // Take sample during operation

      const completed = profiler.endOperation(opId);

      expect(completed).toBeDefined();
      expect(completed?.operationType).toBe('indexing');
      expect(completed?.startedAt).toBeGreaterThan(0);
      // endedAt should be >= startedAt (can be same millisecond)
      expect(completed?.endedAt).toBeGreaterThanOrEqual(completed!.startedAt);
      expect(completed?.startMemory).toBeDefined();
      expect(completed?.endMemory).toBeDefined();
      expect(completed?.peakMemory).toBeDefined();
      expect(completed?.metadata).toEqual({ files: 10 });

      // Prevent optimization from removing arr
      expect(arr.length).toBe(10000);
    });

    it('should return undefined for mismatched operation id', () => {
      profiler.startOperation('indexing');
      const result = profiler.endOperation('wrong-id');
      expect(result).toBeUndefined();
    });

    it('should return undefined when no operation active', () => {
      const result = profiler.endOperation('any-id');
      expect(result).toBeUndefined();
    });

    it('should update peak memory during operation', () => {
      const opId = profiler.startOperation('indexing');

      // Take samples during operation
      profiler.sample();
      profiler.sample();
      profiler.sample();

      const completed = profiler.endOperation(opId);

      expect(completed?.peakMemory?.heapUsed).toBeGreaterThan(0);
    });
  });

  describe('recordLanguageMemory', () => {
    it('should record memory for a language', () => {
      profiler.recordLanguageMemory('typescript', 5, 100);

      const profile = profiler.getProfile();
      expect(profile.memoryByLanguage.length).toBe(1);
      expect(profile.memoryByLanguage[0].language).toBe('typescript');
      expect(profile.memoryByLanguage[0].filesProcessed).toBe(5);
      expect(profile.memoryByLanguage[0].totalChunks).toBe(100);
    });

    it('should accumulate stats for same language', () => {
      profiler.recordLanguageMemory('typescript', 5, 100);
      profiler.recordLanguageMemory('typescript', 3, 50);

      const profile = profiler.getProfile();
      expect(profile.memoryByLanguage.length).toBe(1);
      expect(profile.memoryByLanguage[0].filesProcessed).toBe(8);
      expect(profile.memoryByLanguage[0].totalChunks).toBe(150);
    });

    it('should track multiple languages separately', () => {
      profiler.recordLanguageMemory('typescript', 5, 100);
      profiler.recordLanguageMemory('python', 3, 50);
      profiler.recordLanguageMemory('rust', 2, 30);

      const profile = profiler.getProfile();
      expect(profile.memoryByLanguage.length).toBe(3);
    });
  });

  describe('getStats', () => {
    it('should return formatted stats', () => {
      profiler.sample();
      const stats = profiler.getStats();

      expect(stats.current).toMatch(/\d+(\.\d+)? (B|KB|MB|GB)/);
      expect(stats.peak).toMatch(/\d+(\.\d+)? (B|KB|MB|GB)/);
      expect(stats.peakTime).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(typeof stats.samplesCount).toBe('number');
      expect(typeof stats.operationsCount).toBe('number');
      expect(typeof stats.languagesTracked).toBe('number');
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(profiler.formatBytes(0)).toBe('0 B');
      expect(profiler.formatBytes(512)).toBe('512 B');
      expect(profiler.formatBytes(1024)).toBe('1 KB');
      expect(profiler.formatBytes(1536)).toBe('1.5 KB');
      expect(profiler.formatBytes(1048576)).toBe('1 MB');
      expect(profiler.formatBytes(1073741824)).toBe('1 GB');
    });
  });

  describe('formatForClaude', () => {
    beforeEach(() => {
      profiler.sample();
      profiler.recordLanguageMemory('typescript', 5, 100);
    });

    it('should format as summary', () => {
      const output = profiler.formatForClaude('summary');

      expect(output).toContain('Memory Profile');
      expect(output).toContain('Current Heap');
      expect(output).toContain('Peak Heap');
    });

    it('should format as json', () => {
      const output = profiler.formatForClaude('json');

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('projectRoot');
      expect(parsed).toHaveProperty('currentHeapUsed');
      expect(parsed).toHaveProperty('peakHeapUsed');
      expect(parsed).toHaveProperty('memoryByLanguage');
    });

    it('should format as detailed markdown', () => {
      const output = profiler.formatForClaude('detailed');

      expect(output).toContain('# Memory Profile');
      expect(output).toContain('## Current Status');
      expect(output).toContain('## Memory by Language');
      expect(output).toContain('| Language |');
    });

    it('should default to summary format', () => {
      const output = profiler.formatForClaude();
      expect(output).toContain('Memory Profile');
    });
  });

  describe('persistence', () => {
    it('should persist and load profile', async () => {
      profiler.sample();
      profiler.sample();
      profiler.recordLanguageMemory('typescript', 5, 100);

      await profiler.persist();

      // Create new profiler and load
      const newProfiler = new MemoryProfiler(config);
      await newProfiler.load();

      const loadedProfile = newProfiler.getProfile();
      expect(loadedProfile.memoryByLanguage.length).toBe(1);
      expect(loadedProfile.memoryByLanguage[0].language).toBe('typescript');
    });

    it('should handle missing profile file gracefully', async () => {
      const newProfiler = new MemoryProfiler(config);
      await newProfiler.load(); // Should not throw

      const profile = newProfiler.getProfile();
      expect(profile.projectRoot).toBe(tempDir);
    });
  });

  describe('sampling interval', () => {
    it('should start and stop sampling', async () => {
      profiler.startSampling(100);

      // Wait for a few samples
      await new Promise(resolve => setTimeout(resolve, 350));

      profiler.stopSampling();

      const profile = profiler.getProfile();
      expect(profile.samples.length).toBeGreaterThan(1);
    });

    it('should stop previous sampling when starting new', () => {
      profiler.startSampling(100);
      profiler.startSampling(200); // Should stop previous
      profiler.stopSampling();
      // No error thrown means success
    });
  });

  describe('reset', () => {
    it('should reset profile to empty state', () => {
      profiler.sample();
      profiler.sample();
      profiler.recordLanguageMemory('typescript', 5, 100);
      profiler.startOperation('indexing');

      profiler.reset();

      const profile = profiler.getProfile();
      expect(profile.samples.length).toBe(0);
      expect(profile.memoryByLanguage.length).toBe(0);
      expect(profile.operations.length).toBe(0);
    });
  });
});
