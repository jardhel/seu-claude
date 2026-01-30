#!/usr/bin/env npx tsx
/**
 * Script to generate ground truth dataset for seu-claude
 *
 * Usage: npx tsx scripts/generate-ground-truth.ts
 *
 * This script uses seu-claude's own GroundTruthGenerator to analyze
 * the seu-claude codebase and create benchmark datasets.
 */

import { join } from 'path';
import { GroundTruthGenerator } from '../src/benchmarks/datasets/GroundTruthGenerator.js';
import { DatasetLoader } from '../src/benchmarks/datasets/DatasetLoader.js';

async function main() {
  const projectRoot = process.cwd();
  const outputDir = join(projectRoot, 'benchmarks', 'datasets', 'seu-claude');

  console.log('🔬 Generating ground truth dataset for seu-claude...');
  console.log(`   Project root: ${projectRoot}`);
  console.log(`   Output: ${outputDir}`);
  console.log('');

  const generator = new GroundTruthGenerator();

  try {
    // Generate dataset from seu-claude's source
    const dataset = await generator.generate(projectRoot, {
      entryPoints: [
        'src/core/usecases/TaskManager.ts',
        'src/core/usecases/RecursiveScout.ts',
        'src/indexer/chunker.ts',
        'src/indexer/xref-tracker.ts',
        'src/search/hybrid.ts',
        'src/vector/store.ts',
        'src/vector/embed.ts',
        'src/benchmarks/index.ts',
      ],
      outputDir,
      maxSymbols: 300,
      languages: ['typescript'],
      excludePatterns: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
      ],
    });

    // Print summary
    console.log('✅ Dataset generated successfully!');
    console.log('');
    console.log('📊 Dataset Summary:');
    console.log(`   Name: ${dataset.metadata.name}`);
    console.log(`   Version: ${dataset.metadata.version}`);
    console.log(`   Files analyzed: ${dataset.metadata.totalFiles}`);
    console.log(`   Lines of code: ${dataset.metadata.totalLinesOfCode}`);
    console.log(`   Languages: ${dataset.metadata.languages.join(', ')}`);
    console.log(`   Git commit: ${dataset.metadata.sourceCommit || 'N/A'}`);
    console.log('');
    console.log('📋 Test Cases:');
    console.log(`   Symbol lookups: ${dataset.symbolLookups.length}`);
    console.log(`   Call graphs: ${dataset.callGraphs.length}`);
    console.log(`   Import resolutions: ${dataset.importResolutions.length}`);
    console.log(`   Circular dependencies: ${dataset.circularDependencies.length}`);
    console.log('');

    // Validate the dataset
    const loader = new DatasetLoader();
    const validation = await loader.validateDataset(outputDir);

    if (validation.valid) {
      console.log('✅ Dataset validation passed!');
    } else {
      console.log('⚠️  Dataset validation issues:');
      for (const error of validation.errors) {
        console.log(`   ❌ ${error}`);
      }
    }

    if (validation.warnings.length > 0) {
      console.log('');
      console.log('⚠️  Warnings:');
      for (const warning of validation.warnings) {
        console.log(`   ⚠️  ${warning}`);
      }
    }

    // Print difficulty distribution
    const stats = await loader.getStats(outputDir);
    console.log('');
    console.log('📈 Difficulty Distribution:');
    console.log(`   Easy: ${stats.difficultyDistribution.easy}`);
    console.log(`   Medium: ${stats.difficultyDistribution.medium}`);
    console.log(`   Hard: ${stats.difficultyDistribution.hard}`);

    console.log('');
    console.log(`📁 Dataset saved to: ${outputDir}`);
  } catch (error) {
    console.error('❌ Error generating dataset:', error);
    process.exit(1);
  }
}

main();
