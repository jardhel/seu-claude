import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { SymbolResolver } from './symbol-resolver.js';

// These tests use longer timeouts due to TreeSitter initialization
describe('SymbolResolver', () => {
  let testDir: string;
  let resolver: SymbolResolver;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `symbol-resolver-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (resolver) {
      await resolver.stop();
    }
    await rm(testDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('initializes and reports LSP availability', { timeout: 15000 }, async () => {
      resolver = new SymbolResolver(testDir);
      await resolver.initialize();

      // LSP may or may not be available depending on environment
      expect(typeof resolver.isLSPAvailable()).toBe('boolean');
    });
  });

  describe('findSymbol with TreeSitter fallback', () => {
    it('finds function definitions using TreeSitter', { timeout: 20000 }, async () => {
      const file = join(testDir, 'functions.ts');
      await writeFile(
        file,
        `
export function myHelper() {
  return 42;
}

export function anotherFunction() {
  const result = myHelper();
  return result * 2;
}
      `.trim()
      );

      resolver = new SymbolResolver(testDir);
      await resolver.initialize();
      const result = await resolver.findSymbol('myHelper', [file]);

      expect(result.symbolName).toBe('myHelper');
      expect(result.definitionCount).toBeGreaterThanOrEqual(1);
      // At least one definition should exist
      if (result.definitions.length > 0) {
        expect(result.definitions[0].name).toBe('myHelper');
        expect(result.definitions[0].type).toBe('function');
      }
    });

    it('finds class definitions using TreeSitter', { timeout: 20000 }, async () => {
      const file = join(testDir, 'classes.ts');
      await writeFile(
        file,
        `
export class MyService {
  private value: number;

  constructor() {
    this.value = 0;
  }

  getValue(): number {
    return this.value;
  }
}
      `.trim()
      );

      resolver = new SymbolResolver(testDir);
      await resolver.initialize();
      const result = await resolver.findSymbol('MyService', [file]);

      expect(result.symbolName).toBe('MyService');
      expect(result.definitionCount).toBeGreaterThanOrEqual(1);
      if (result.definitions.length > 0) {
        expect(result.definitions[0].name).toBe('MyService');
        expect(result.definitions[0].type).toBe('class');
      }
    });

    it('returns empty results for non-existent symbol', { timeout: 20000 }, async () => {
      const file = join(testDir, 'empty.ts');
      await writeFile(
        file,
        `
export function someFunction() {
  return 1;
}
      `.trim()
      );

      resolver = new SymbolResolver(testDir);
      await resolver.initialize();
      const result = await resolver.findSymbol('nonExistentSymbol', [file]);

      expect(result.symbolName).toBe('nonExistentSymbol');
      expect(result.definitionCount).toBe(0);
    });

    it('indicates source is treesitter when LSP unavailable', { timeout: 20000 }, async () => {
      const file = join(testDir, 'source.ts');
      await writeFile(
        file,
        `
export const myConstant = 42;
      `.trim()
      );

      resolver = new SymbolResolver(testDir);
      await resolver.initialize();
      const result = await resolver.findSymbol('myConstant', [file]);

      // Source should be 'treesitter' when LSP is not available
      if (!resolver.isLSPAvailable()) {
        expect(result.source).toBe('treesitter');
      }
    });
  });

  describe('cleanup', () => {
    it('stops cleanly', { timeout: 15000 }, async () => {
      resolver = new SymbolResolver(testDir);
      await resolver.initialize();
      await resolver.stop();

      // Should be able to stop multiple times without error
      await resolver.stop();

      expect(resolver.isLSPAvailable()).toBe(false);
    });
  });
});
