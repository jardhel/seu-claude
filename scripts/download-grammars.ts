#!/usr/bin/env node

/**
 * Download Tree-sitter WASM grammar files for supported languages.
 * Uses @vscode/tree-sitter-wasm (MIT licensed, maintained by Microsoft)
 * 
 * Run with: npx tsx scripts/download-grammars.ts
 */

import { writeFile, mkdir, access, readFile, copyFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LANGUAGES_DIR = join(__dirname, '../languages');

// Languages we support - map to @vscode/tree-sitter-wasm filenames
// All grammars are MIT licensed
const SUPPORTED_GRAMMARS = [
  'tree-sitter-typescript',
  'tree-sitter-javascript', 
  'tree-sitter-python',
  'tree-sitter-rust',
  'tree-sitter-go',
  'tree-sitter-c',
  'tree-sitter-cpp',
  'tree-sitter-java',
];

async function downloadFromNpm(): Promise<void> {
  console.log('Installing @vscode/tree-sitter-wasm...\n');
  
  try {
    // Install the package temporarily
    execSync('npm install --no-save @vscode/tree-sitter-wasm@latest', {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
    });
  } catch (error) {
    throw new Error('Failed to install @vscode/tree-sitter-wasm');
  }
}

async function copyGrammars(): Promise<{ name: string; success: boolean; error?: string }[]> {
  const results: { name: string; success: boolean; error?: string }[] = [];
  const vscodeWasmDir = join(__dirname, '../node_modules/@vscode/tree-sitter-wasm/wasm');
  
  // Ensure languages directory exists
  await mkdir(LANGUAGES_DIR, { recursive: true });
  
  for (const grammar of SUPPORTED_GRAMMARS) {
    const wasmFile = `${grammar}.wasm`;
    const srcPath = join(vscodeWasmDir, wasmFile);
    const destPath = join(LANGUAGES_DIR, wasmFile);
    
    // Check if already exists
    try {
      await access(destPath);
      console.log(`Skipping ${wasmFile} (already exists)`);
      results.push({ name: wasmFile, success: true });
      continue;
    } catch {
      // File doesn't exist, copy it
    }
    
    // Copy from npm package
    try {
      if (existsSync(srcPath)) {
        await copyFile(srcPath, destPath);
        console.log(`Copied: ${wasmFile}`);
        results.push({ name: wasmFile, success: true });
      } else {
        console.log(`Not found in package: ${wasmFile}`);
        results.push({ name: wasmFile, success: false, error: 'Not found in @vscode/tree-sitter-wasm' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to copy ${wasmFile}: ${message}`);
      results.push({ name: wasmFile, success: false, error: message });
    }
  }
  
  return results;
}

async function main(): Promise<void> {
  console.log('Downloading Tree-sitter WASM grammars...\n');
  console.log('Source: @vscode/tree-sitter-wasm (MIT licensed, by Microsoft)\n');
  
  await downloadFromNpm();
  const results = await copyGrammars();
  
  console.log('\n--- Summary ---');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Downloaded: ${successful}/${results.length}`);
  if (failed > 0) {
    console.log(`Failed: ${failed}`);
    console.log('\nFailed grammars:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\nNote: Grammars are MIT licensed from the tree-sitter project.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
