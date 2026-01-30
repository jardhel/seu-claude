/**
 * DatasetLoader - Loads and manages benchmark datasets
 *
 * Provides filtering, sampling, and stratified loading of ground truth datasets.
 */

import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { logger } from '../../utils/logger.js';

import type {
  DatasetLoadOptions,
  DatasetMetadata,
  GroundTruthDataset,
  SymbolLookupGroundTruth,
  CallGraphGroundTruth,
  ImportResolutionGroundTruth,
  CircularDependencyGroundTruth,
} from './types.js';

/**
 * Seeded random number generator for reproducible sampling
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

/**
 * DatasetLoader provides flexible loading and filtering of benchmark datasets
 */
export class DatasetLoader {
  private log = logger.child('dataset-loader');
  private cache: Map<string, GroundTruthDataset> = new Map();

  /**
   * Load a complete dataset from a directory
   */
  async loadDataset(datasetPath: string): Promise<GroundTruthDataset> {
    // Check cache first
    if (this.cache.has(datasetPath)) {
      return this.cache.get(datasetPath)!;
    }

    this.log.info(`Loading dataset from: ${datasetPath}`);

    // Check if complete dataset file exists
    const completeDatasetPath = join(datasetPath, 'dataset.json');
    if (existsSync(completeDatasetPath)) {
      const content = await readFile(completeDatasetPath, 'utf-8');
      const dataset = JSON.parse(content) as GroundTruthDataset;
      this.cache.set(datasetPath, dataset);
      return dataset;
    }

    // Load individual files
    const dataset = await this.loadIndividualFiles(datasetPath);
    this.cache.set(datasetPath, dataset);
    return dataset;
  }

  /**
   * Load dataset from individual JSON files
   */
  private async loadIndividualFiles(datasetPath: string): Promise<GroundTruthDataset> {
    const loadJson = async <T>(filename: string, defaultValue: T): Promise<T> => {
      const filePath = join(datasetPath, filename);
      if (!existsSync(filePath)) {
        this.log.warn(`File not found: ${filename}, using default`);
        return defaultValue;
      }
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    };

    const metadata = await loadJson<DatasetMetadata>('metadata.json', {
      name: 'unknown',
      version: '0.0.0',
      createdAt: new Date().toISOString(),
      sourceCodebase: datasetPath,
      totalFiles: 0,
      totalLinesOfCode: 0,
      languages: [],
      generatorVersion: 'unknown',
    });

    const symbolLookups = await loadJson<SymbolLookupGroundTruth[]>('symbol-lookups.json', []);
    const callGraphs = await loadJson<CallGraphGroundTruth[]>('call-graphs.json', []);
    const importResolutions = await loadJson<ImportResolutionGroundTruth[]>(
      'import-resolutions.json',
      []
    );
    const circularDependencies = await loadJson<CircularDependencyGroundTruth[]>(
      'circular-dependencies.json',
      []
    );

    return {
      metadata,
      symbolLookups,
      callGraphs,
      importResolutions,
      circularDependencies,
    };
  }

  /**
   * Load symbol lookup test cases with filtering
   */
  async loadSymbolLookups(
    datasetPath: string,
    options: DatasetLoadOptions = {}
  ): Promise<SymbolLookupGroundTruth[]> {
    const dataset = await this.loadDataset(datasetPath);
    return this.filterAndSample(dataset.symbolLookups, options);
  }

  /**
   * Load call graph test cases with filtering
   */
  async loadCallGraphs(
    datasetPath: string,
    options: DatasetLoadOptions = {}
  ): Promise<CallGraphGroundTruth[]> {
    const dataset = await this.loadDataset(datasetPath);
    return this.filterAndSample(dataset.callGraphs, options);
  }

  /**
   * Load import resolution test cases with filtering
   */
  async loadImportResolutions(
    datasetPath: string,
    options: DatasetLoadOptions = {}
  ): Promise<ImportResolutionGroundTruth[]> {
    const dataset = await this.loadDataset(datasetPath);
    return this.filterAndSample(dataset.importResolutions, options);
  }

  /**
   * Load circular dependency test cases with filtering
   */
  async loadCircularDependencies(
    datasetPath: string,
    options: DatasetLoadOptions = {}
  ): Promise<CircularDependencyGroundTruth[]> {
    const dataset = await this.loadDataset(datasetPath);
    return this.filterAndSample(dataset.circularDependencies, options);
  }

  /**
   * Get dataset metadata
   */
  async getMetadata(datasetPath: string): Promise<DatasetMetadata> {
    const dataset = await this.loadDataset(datasetPath);
    return dataset.metadata;
  }

  /**
   * Get dataset statistics
   */
  async getStats(datasetPath: string): Promise<{
    totalSymbolLookups: number;
    totalCallGraphs: number;
    totalImportResolutions: number;
    totalCircularDependencies: number;
    difficultyDistribution: Record<string, number>;
    languageDistribution: Record<string, number>;
  }> {
    const dataset = await this.loadDataset(datasetPath);

    // Calculate difficulty distribution
    const difficultyDistribution: Record<string, number> = {
      easy: 0,
      medium: 0,
      hard: 0,
    };

    for (const lookup of dataset.symbolLookups) {
      difficultyDistribution[lookup.difficulty]++;
    }
    for (const graph of dataset.callGraphs) {
      difficultyDistribution[graph.difficulty]++;
    }
    for (const imp of dataset.importResolutions) {
      difficultyDistribution[imp.difficulty]++;
    }

    // Calculate language distribution
    const languageDistribution: Record<string, number> = {};
    for (const lang of dataset.metadata.languages) {
      languageDistribution[lang] = 0;
    }

    // Count files by language from symbol lookups
    for (const lookup of dataset.symbolLookups) {
      for (const def of lookup.definitions) {
        const ext = def.file.split('.').pop();
        if (ext === 'ts' || ext === 'tsx') languageDistribution['typescript']++;
        else if (ext === 'js' || ext === 'jsx') languageDistribution['javascript']++;
        else if (ext === 'py') languageDistribution['python']++;
      }
    }

    return {
      totalSymbolLookups: dataset.symbolLookups.length,
      totalCallGraphs: dataset.callGraphs.length,
      totalImportResolutions: dataset.importResolutions.length,
      totalCircularDependencies: dataset.circularDependencies.length,
      difficultyDistribution,
      languageDistribution,
    };
  }

  /**
   * Filter and sample test cases
   */
  private filterAndSample<T extends { difficulty?: string; tags?: string[] }>(
    items: T[],
    options: DatasetLoadOptions
  ): T[] {
    let filtered = [...items];

    // Filter by difficulty
    if (options.difficulty && options.difficulty.length > 0) {
      filtered = filtered.filter(item => {
        const difficulty = (item as { difficulty?: string }).difficulty;
        return difficulty && options.difficulty!.includes(difficulty as 'easy' | 'medium' | 'hard');
      });
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      filtered = filtered.filter(item => {
        const tags = (item as { tags?: string[] }).tags || [];
        return options.tags!.some(tag => tags.includes(tag));
      });
    }

    // Shuffle if seed provided
    if (options.seed !== undefined) {
      const rng = new SeededRandom(options.seed);
      filtered = rng.shuffle(filtered);
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * Load stratified sample (balanced by difficulty)
   */
  async loadStratifiedSample<T extends { difficulty: string }>(
    items: T[],
    sampleSize: number,
    seed: number = 42
  ): Promise<T[]> {
    const rng = new SeededRandom(seed);

    // Group by difficulty
    const byDifficulty: Record<string, T[]> = {
      easy: [],
      medium: [],
      hard: [],
    };

    for (const item of items) {
      if (byDifficulty[item.difficulty]) {
        byDifficulty[item.difficulty].push(item);
      }
    }

    // Calculate samples per difficulty (roughly equal)
    const perDifficulty = Math.floor(sampleSize / 3);
    const remainder = sampleSize % 3;

    const result: T[] = [];

    // Sample from each difficulty level
    for (const [diff, diffItems] of Object.entries(byDifficulty)) {
      const shuffled = rng.shuffle(diffItems);
      const count = diff === 'hard' ? perDifficulty + remainder : perDifficulty;
      result.push(...shuffled.slice(0, Math.min(count, shuffled.length)));
    }

    return rng.shuffle(result);
  }

  /**
   * Validate dataset integrity
   */
  async validateDataset(datasetPath: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const dataset = await this.loadDataset(datasetPath);

      // Check metadata
      if (!dataset.metadata.name) {
        errors.push('Missing dataset name in metadata');
      }
      if (!dataset.metadata.version) {
        errors.push('Missing dataset version in metadata');
      }
      if (dataset.metadata.totalFiles === 0) {
        warnings.push('Dataset reports 0 total files');
      }

      // Check symbol lookups
      for (const lookup of dataset.symbolLookups) {
        if (!lookup.id) {
          errors.push(`Symbol lookup missing ID: ${lookup.symbolName}`);
        }
        if (!lookup.symbolName) {
          errors.push(`Symbol lookup missing symbolName: ${lookup.id}`);
        }
        if (lookup.definitions.length === 0 && lookup.callSites.length === 0) {
          warnings.push(`Symbol lookup has no definitions or call sites: ${lookup.id}`);
        }
      }

      // Check call graphs
      for (const graph of dataset.callGraphs) {
        if (!graph.id) {
          errors.push(`Call graph missing ID: ${graph.targetSymbol}`);
        }
        if (!graph.targetFile) {
          errors.push(`Call graph missing target file: ${graph.id}`);
        }
      }

      // Check import resolutions
      for (const imp of dataset.importResolutions) {
        if (!imp.id) {
          errors.push(`Import resolution missing ID`);
        }
        if (!imp.sourceFile) {
          errors.push(`Import resolution missing source file: ${imp.id}`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to load dataset: ${error}`],
        warnings,
      };
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if a dataset exists
   */
  async exists(datasetPath: string): Promise<boolean> {
    try {
      const stats = await stat(datasetPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * List available test case types in a dataset
   */
  async listTestCaseTypes(datasetPath: string): Promise<string[]> {
    const dataset = await this.loadDataset(datasetPath);
    const types: string[] = [];

    if (dataset.symbolLookups.length > 0) types.push('symbol-lookup');
    if (dataset.callGraphs.length > 0) types.push('call-graph');
    if (dataset.importResolutions.length > 0) types.push('import-resolution');
    if (dataset.circularDependencies.length > 0) types.push('circular-dependency');

    return types;
  }
}
