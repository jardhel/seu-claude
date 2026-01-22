import Parser from 'tree-sitter';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import type { LanguageStrategy, CodeSymbol, ImportStatement } from '../../config/LanguageStrategy';
import { TypeScriptStrategy } from '../../config/TypeScriptStrategy';
import { PythonStrategy } from '../../config/PythonStrategy';

/**
 * Result of parsing a source file
 */
export interface ParseResult {
  filePath: string;
  language: string;
  symbols: CodeSymbol[];
  imports: ImportStatement[];
  parseTimeMs: number;
  errors: string[];
}

/**
 * Cached parse result with metadata
 */
interface CachedParse {
  result: ParseResult;
  sourceHash: string;
  cachedAt: number;
}

/**
 * TreeSitterAdapter - Unified interface for parsing multiple languages
 *
 * Features:
 * - Multi-language support via LanguageStrategy pattern
 * - In-memory caching of parse results
 * - Extracts both symbols (functions, classes, calls) and imports
 */
export class TreeSitterAdapter {
  private parser: Parser;
  private strategies: Map<string, LanguageStrategy>;
  private extensionMap: Map<string, LanguageStrategy>;
  private cache: Map<string, CachedParse>;

  constructor() {
    this.parser = new Parser();
    this.strategies = new Map();
    this.extensionMap = new Map();
    this.cache = new Map();

    // Register built-in strategies
    this.registerStrategy(new TypeScriptStrategy());
    this.registerStrategy(new PythonStrategy());
  }

  /**
   * Register a language strategy
   */
  registerStrategy(strategy: LanguageStrategy): void {
    this.strategies.set(strategy.languageId, strategy);
    for (const ext of strategy.extensions) {
      this.extensionMap.set(ext, strategy);
    }
  }

  /**
   * Get strategy for a file based on extension
   */
  getStrategyForFile(filePath: string): LanguageStrategy | null {
    const ext = extname(filePath).toLowerCase();
    return this.extensionMap.get(ext) || null;
  }

  /**
   * Check if a file is supported
   */
  isSupported(filePath: string): boolean {
    return this.getStrategyForFile(filePath) !== null;
  }

  /**
   * Get list of supported extensions
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }

  /**
   * Parse a source file
   */
  async parseFile(filePath: string): Promise<ParseResult> {
    const strategy = this.getStrategyForFile(filePath);
    if (!strategy) {
      return {
        filePath,
        language: 'unknown',
        symbols: [],
        imports: [],
        parseTimeMs: 0,
        errors: [`Unsupported file type: ${extname(filePath)}`],
      };
    }

    try {
      const source = await readFile(filePath, 'utf-8');
      return this.parseSource(source, filePath, strategy);
    } catch (error) {
      return {
        filePath,
        language: strategy.languageId,
        symbols: [],
        imports: [],
        parseTimeMs: 0,
        errors: [`Failed to read file: ${(error as Error).message}`],
      };
    }
  }

  /**
   * Parse source code directly
   */
  parseSource(source: string, filePath: string, strategy?: LanguageStrategy): ParseResult {
    const resolvedStrategy = strategy || this.getStrategyForFile(filePath);
    if (!resolvedStrategy) {
      return {
        filePath,
        language: 'unknown',
        symbols: [],
        imports: [],
        parseTimeMs: 0,
        errors: [`Unsupported file type: ${extname(filePath)}`],
      };
    }

    // Check cache
    const sourceHash = this.hashSource(source);
    const cached = this.cache.get(filePath);
    if (cached && cached.sourceHash === sourceHash) {
      return cached.result;
    }

    const startTime = performance.now();
    const errors: string[] = [];

    try {
      // Set language for parser
      this.parser.setLanguage(resolvedStrategy.getParser());

      // Parse the source
      const tree = this.parser.parse(source);

      // Check for parse errors
      if (tree.rootNode.hasError) {
        errors.push('Parse tree contains errors');
      }

      // Extract symbols and imports
      const symbols = resolvedStrategy.extractSymbols(tree, source);
      const imports = resolvedStrategy.extractImports(tree, source);

      const parseTimeMs = performance.now() - startTime;

      const result: ParseResult = {
        filePath,
        language: resolvedStrategy.languageId,
        symbols,
        imports,
        parseTimeMs,
        errors,
      };

      // Cache the result
      this.cache.set(filePath, {
        result,
        sourceHash,
        cachedAt: Date.now(),
      });

      return result;
    } catch (error) {
      return {
        filePath,
        language: resolvedStrategy.languageId,
        symbols: [],
        imports: [],
        parseTimeMs: performance.now() - startTime,
        errors: [`Parse error: ${(error as Error).message}`],
      };
    }
  }

  /**
   * Parse multiple files
   */
  async parseFiles(filePaths: string[]): Promise<ParseResult[]> {
    return Promise.all(filePaths.map(fp => this.parseFile(fp)));
  }

  /**
   * Get function definitions from a file
   */
  async getFunctions(filePath: string): Promise<CodeSymbol[]> {
    const result = await this.parseFile(filePath);
    return result.symbols.filter(s => s.type === 'function');
  }

  /**
   * Get class definitions from a file
   */
  async getClasses(filePath: string): Promise<CodeSymbol[]> {
    const result = await this.parseFile(filePath);
    return result.symbols.filter(s => s.type === 'class');
  }

  /**
   * Get call sites from a file
   */
  async getCallSites(filePath: string): Promise<CodeSymbol[]> {
    const result = await this.parseFile(filePath);
    return result.symbols.filter(s => s.type === 'call');
  }

  /**
   * Get imports from a file
   */
  async getImports(filePath: string): Promise<ImportStatement[]> {
    const result = await this.parseFile(filePath);
    return result.imports;
  }

  /**
   * Clear the parse cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Invalidate cache for a specific file
   */
  invalidateCache(filePath: string): void {
    this.cache.delete(filePath);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; files: string[] } {
    return {
      size: this.cache.size,
      files: Array.from(this.cache.keys()),
    };
  }

  /**
   * Simple hash function for cache invalidation
   */
  private hashSource(source: string): string {
    let hash = 0;
    for (let i = 0; i < source.length; i++) {
      const char = source.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }
}
