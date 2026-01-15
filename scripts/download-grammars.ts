#!/usr/bin/env node

/**
 * Download Tree-sitter WASM grammar files for supported languages.
 * Run with: npx tsx scripts/download-grammars.ts
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LANGUAGES_DIR = join(__dirname, '../languages');

// Tree-sitter WASM files from the official releases
const GRAMMAR_URLS: Record<string, string> = {
  'tree-sitter-typescript.wasm':
    'https://github.com/niclas-van-eyk/tree-sitter-typescript/releases/download/0.0.5/tree-sitter-typescript.wasm',
  'tree-sitter-javascript.wasm':
    'https://github.com/niclas-van-eyk/tree-sitter-javascript/releases/download/0.0.1/tree-sitter-javascript.wasm',
  'tree-sitter-python.wasm':
    'https://github.com/niclas-van-eyk/tree-sitter-python/releases/download/0.0.1/tree-sitter-python.wasm',
  'tree-sitter-rust.wasm':
    'https://github.com/niclas-van-eyk/tree-sitter-rust/releases/download/0.0.1/tree-sitter-rust.wasm',
  'tree-sitter-go.wasm':
    'https://github.com/niclas-van-eyk/tree-sitter-go/releases/download/0.0.1/tree-sitter-go.wasm',
};

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`Downloading: ${url}`);

  const response = await fetch(url, {
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await writeFile(destPath, Buffer.from(buffer));

  console.log(`  -> Saved to ${destPath}`);
}

async function main(): Promise<void> {
  console.log('Downloading Tree-sitter WASM grammars...\n');

  // Ensure languages directory exists
  await mkdir(LANGUAGES_DIR, { recursive: true });

  const results: { name: string; success: boolean; error?: string }[] = [];

  for (const [filename, url] of Object.entries(GRAMMAR_URLS)) {
    const destPath = join(LANGUAGES_DIR, filename);

    try {
      await downloadFile(url, destPath);
      results.push({ name: filename, success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  -> Failed: ${message}`);
      results.push({ name: filename, success: false, error: message });
    }
  }

  console.log('\n--- Summary ---');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Downloaded: ${successful}/${results.length}`);
  if (failed > 0) {
    console.log(`Failed: ${failed}`);
    console.log('\nNote: You can manually download grammars from:');
    console.log('https://github.com/niclas-van-eyk/tree-sitter-grammars');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
