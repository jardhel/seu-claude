#!/usr/bin/env npx tsx
/**
 * Download embedding model for offline/bundled use
 * Uses Transformers.js pipeline to download model files to local directory
 *
 * Usage:
 *   npm run download-model
 *   npm run download-model -- --bundled  # Download to models/ for npm distribution
 *
 * Environment Variables:
 *   HF_TOKEN - HuggingFace API token (required for some models)
 *
 * The model will be cached in:
 * - Default: ~/.seu-claude/models/ (shared across projects)
 * - With --bundled: ./models/ (included in npm package)
 */

import { pipeline, env } from '@huggingface/transformers';
import { mkdir, cp, access, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { existsSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const BUNDLED_MODEL_DIR = join(PROJECT_ROOT, 'models');
const DEFAULT_CACHE_DIR = join(homedir(), '.seu-claude', 'models');

// Model options - primary and fallback
const MODELS = [
  {
    name: 'Xenova/all-MiniLM-L6-v2',
    localName: 'all-MiniLM-L6-v2',
    size: '~23MB',
    dims: 384,
    requiresAuth: false,
  },
  {
    name: 'Xenova/bge-small-en-v1.5',
    localName: 'bge-small-en-v1.5',
    size: '~33MB',
    dims: 384,
    requiresAuth: false,
  },
  {
    name: 'Xenova/nomic-embed-text-v1.5',
    localName: 'nomic-embed-text-v1.5',
    size: '~130MB',
    dims: 768,
    requiresAuth: true, // May require HF_TOKEN
  },
];

// Use the first model that doesn't require auth by default
const DEFAULT_MODEL = MODELS[0];

const isBundled = process.argv.includes('--bundled');
const modelArg = process.argv.find(arg => arg.startsWith('--model='));
const selectedModelName = modelArg ? modelArg.split('=')[1] : DEFAULT_MODEL.name;
const selectedModel = MODELS.find(m => m.name === selectedModelName || m.localName === selectedModelName) || DEFAULT_MODEL;

async function checkModelExists(path: string): Promise<boolean> {
  try {
    await access(join(path, 'config.json'));
    await access(join(path, 'tokenizer.json'));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           seu-claude Embedding Model Downloader              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const targetDir = isBundled ? BUNDLED_MODEL_DIR : DEFAULT_CACHE_DIR;
  const modelPath = join(targetDir, selectedModel.localName);

  console.log(`Model: ${selectedModel.name}`);
  console.log(`Mode: ${isBundled ? 'Bundled (for npm distribution)' : 'Cache (for local use)'}`);
  console.log(`Target: ${modelPath}\n`);

  // Check if already downloaded
  if (await checkModelExists(modelPath)) {
    console.log('✅ Model already downloaded!\n');
    console.log('To force re-download, delete the models directory and run again.');
    return;
  }

  // Create target directory
  await mkdir(targetDir, { recursive: true });

  // Configure transformers.js
  env.cacheDir = targetDir;
  env.allowRemoteModels = true;

  // Check for HF_TOKEN if model requires auth
  const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
  if (selectedModel.requiresAuth && !hfToken) {
    console.log('⚠️  Note: This model may require HuggingFace authentication.');
    console.log('   Set HF_TOKEN environment variable if download fails.\n');
  }

  console.log(`📥 Downloading ${selectedModel.localName} model...`);
  console.log(`   Model size: ${selectedModel.size} (quantized q8 version)`);
  console.log(`   Embedding dimensions: ${selectedModel.dims}`);
  console.log('   This may take 1-5 minutes depending on your connection.\n');

  const startTime = Date.now();

  try {
    // Download the model using transformers.js
    const embedder = await pipeline('feature-extraction', selectedModel.name, {
      dtype: 'q8',
      progress_callback: (progress: { status: string; progress?: number; file?: string }) => {
        if (progress.status === 'progress' && progress.progress !== undefined) {
          const pct = Math.round(progress.progress);
          const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
          process.stdout.write(`\r   [${bar}] ${pct}% ${progress.file || ''}`);
        } else if (progress.status === 'done') {
          process.stdout.write('\n');
        }
      },
    });

    // Test the model works
    console.log('\n🧪 Testing model...');
    const testResult = await embedder('Hello, world!', { pooling: 'mean', normalize: true });
    const dims = Array.from(testResult.data as Float32Array).length;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Model downloaded and verified!`);
    console.log(`   Embedding dimensions: ${dims}`);
    console.log(`   Time elapsed: ${elapsed}s\n`);

    // Handle cache reorganization for bundled mode
    const hfCacheDir = join(targetDir, `models--Xenova--${selectedModel.localName}`);
    
    if (isBundled && existsSync(hfCacheDir)) {
      console.log('📦 Preparing model for npm distribution...');
      
      const snapshotsDir = join(hfCacheDir, 'snapshots');
      if (existsSync(snapshotsDir)) {
        const snapshots = readdirSync(snapshotsDir);
        if (snapshots.length > 0) {
          const latestSnapshot = join(snapshotsDir, snapshots[0]);
          
          await mkdir(modelPath, { recursive: true });
          await cp(latestSnapshot, modelPath, { recursive: true });
          await rm(hfCacheDir, { recursive: true, force: true });
          
          console.log(`✅ Model prepared at: ${modelPath}`);
        }
      }
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('                    Download Complete!                          ');
    console.log('════════════════════════════════════════════════════════════════\n');
    
    if (isBundled) {
      console.log('The model is now bundled in ./models/ and will be included in npm package.');
      console.log('Users installing seu-claude will have offline embedding support.\n');
    } else {
      console.log('The model is cached and will be used automatically by seu-claude.');
      console.log(`Model location: ${modelPath}\n`);
    }

    // Save model info for the embedding engine to use
    console.log('💡 To use this model, update your config or set SEU_CLAUDE_MODEL env var.\n');

  } catch (err) {
    console.error('\n❌ Failed to download model:', err);
    console.error('\nTroubleshooting:');
    console.error('1. Check your internet connection');
    if (selectedModel.requiresAuth) {
      console.error('2. This model may require authentication - set HF_TOKEN env var');
      console.error('3. Try a model that does not require auth:');
      console.error('   npm run download-model -- --model=Xenova/all-MiniLM-L6-v2');
    }
    console.error('4. Visit https://huggingface.co/' + selectedModel.name + ' to verify access\n');
    process.exit(1);
  }
}

main().catch(console.error);
