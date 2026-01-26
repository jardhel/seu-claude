#!/usr/bin/env node

/**
 * Fix relative imports to include .js extensions for ES modules
 *
 * ES modules require explicit file extensions even for TypeScript files.
 * TypeScript will resolve .js to .ts during compilation.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '../src');

/**
 * Recursively get all .ts files in a directory
 */
async function getAllTsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        return getAllTsFiles(fullPath);
      } else if (entry.name.endsWith('.ts')) {
        return fullPath;
      }
      return [];
    })
  );
  return files.flat();
}

/**
 * Fix imports in a single file
 */
async function fixImportsInFile(filePath) {
  let content = await readFile(filePath, 'utf-8');
  let modified = false;

  // Match relative imports without .js extension
  // Handles: from './foo' or from "../bar" or from '../../baz'
  const importRegex = /from\s+['"](\.\.[\/\\][\w\/\\.-]*|\.\/[\w\/\\.-]*)['"];?/g;

  const newContent = content.replace(importRegex, (match, importPath) => {
    // Skip if already has .js extension
    if (importPath.endsWith('.js')) {
      return match;
    }

    // Add .js extension
    modified = true;
    return match.replace(importPath, importPath + '.js');
  });

  if (modified) {
    await writeFile(filePath, newContent, 'utf-8');
    console.log(`✓ Fixed: ${filePath.replace(srcDir, 'src')}`);
    return 1;
  }

  return 0;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔧 Fixing ES module imports...\n');

  const files = await getAllTsFiles(srcDir);
  let fixedCount = 0;

  for (const file of files) {
    fixedCount += await fixImportsInFile(file);
  }

  console.log(`\n✅ Fixed ${fixedCount} files`);
}

main().catch(console.error);
