/**
 * Represents a parsed code symbol (function, class, method, etc.)
 */
export interface CodeSymbol {
  name: string;
  type: 'function' | 'method' | 'class' | 'call';
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  /** For calls: the name of the function being called */
  callee?: string;
  /** For methods: the parent class name */
  parentClass?: string;
}

/**
 * Represents an import statement
 */
export interface ImportStatement {
  /** The module path (e.g., './utils', 'lodash', '../core/Task') */
  modulePath: string;
  /** Imported symbols (e.g., ['Task', 'TaskStatus']) or ['*'] for namespace import */
  importedSymbols: string[];
  /** Whether this is a default import */
  isDefault: boolean;
  /** Whether this is a namespace import (import * as X) */
  isNamespace: boolean;
  /** Line number of the import */
  line: number;
}

/**
 * Tree-sitter query patterns for extracting symbols
 */
export interface QueryPatterns {
  functionDefinitions: string;
  callSites: string;
  classDefinitions?: string;
  methodDefinitions?: string;
}

/**
 * Language-specific strategy for parsing source code
 */
export interface LanguageStrategy {
  /** Language identifier (e.g., 'typescript', 'python') */
  languageId: string;
  /** File extensions this strategy handles */
  extensions: string[];
  /** Tree-sitter language module */
  getParser(): unknown;
  /** Query patterns for symbol extraction */
  getQueryPatterns(): QueryPatterns;
  /** Extract symbols from a parsed tree */
  extractSymbols(tree: unknown, source: string): CodeSymbol[];
  /** Extract import statements from a parsed tree */
  extractImports(tree: unknown, source: string): ImportStatement[];
}
