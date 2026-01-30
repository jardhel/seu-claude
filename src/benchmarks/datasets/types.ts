/**
 * Types for benchmark datasets and ground truth
 */

/**
 * Ground truth for symbol lookup tests
 */
export interface SymbolLookupGroundTruth {
  /** Test case ID */
  id: string;
  /** Symbol name to search for */
  symbolName: string;
  /** Expected definitions */
  definitions: SymbolLocation[];
  /** Expected call sites */
  callSites: CallSiteLocation[];
  /** Difficulty level for stratified testing */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Tags for filtering */
  tags: string[];
}

export interface SymbolLocation {
  /** Relative file path from dataset root */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Symbol type */
  type: 'function' | 'method' | 'class' | 'variable' | 'interface' | 'type';
  /** Parent scope (e.g., class name for methods) */
  scope?: string;
}

export interface CallSiteLocation {
  /** Relative file path */
  file: string;
  /** Line number */
  line: number;
  /** The calling function/method */
  caller: string;
}

/**
 * Ground truth for call graph tests
 */
export interface CallGraphGroundTruth {
  /** Test case ID */
  id: string;
  /** Target function/method to analyze */
  targetSymbol: string;
  /** File where the target is defined */
  targetFile: string;
  /** Functions/methods that call the target */
  callers: CallerInfo[];
  /** Functions/methods that the target calls */
  callees: CalleeInfo[];
  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Tags for filtering */
  tags: string[];
}

export interface CallerInfo {
  /** Fully qualified name or simple name */
  name: string;
  /** File where the caller is defined */
  file: string;
  /** Line of the call */
  callLine: number;
}

export interface CalleeInfo {
  /** Function/method name being called */
  name: string;
  /** Line where the call occurs */
  callLine: number;
}

/**
 * Ground truth for import resolution tests
 */
export interface ImportResolutionGroundTruth {
  /** Test case ID */
  id: string;
  /** Source file containing the import */
  sourceFile: string;
  /** Import statement (e.g., "./utils" or "@org/package") */
  importPath: string;
  /** Expected resolved file path (relative) */
  resolvedPath: string | null;
  /** Imported symbols */
  importedSymbols: string[];
  /** Import type */
  importType: 'relative' | 'absolute' | 'package' | 'builtin';
  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Tags */
  tags: string[];
}

/**
 * Ground truth for circular dependency tests
 */
export interface CircularDependencyGroundTruth {
  /** Test case ID */
  id: string;
  /** Files involved in the cycle */
  cycle: string[];
  /** Whether this is a true positive (actual cycle) */
  isCircular: boolean;
  /** Tags */
  tags: string[];
}

/**
 * Complete dataset metadata
 */
export interface DatasetMetadata {
  /** Dataset name */
  name: string;
  /** Dataset version */
  version: string;
  /** Creation timestamp */
  createdAt: string;
  /** Source codebase */
  sourceCodebase: string;
  /** Git commit hash of source */
  sourceCommit?: string;
  /** Total files analyzed */
  totalFiles: number;
  /** Total lines of code */
  totalLinesOfCode: number;
  /** Languages included */
  languages: string[];
  /** Generator version */
  generatorVersion: string;
}

/**
 * Complete ground truth dataset
 */
export interface GroundTruthDataset {
  metadata: DatasetMetadata;
  symbolLookups: SymbolLookupGroundTruth[];
  callGraphs: CallGraphGroundTruth[];
  importResolutions: ImportResolutionGroundTruth[];
  circularDependencies: CircularDependencyGroundTruth[];
}

/**
 * Options for dataset generation
 */
export interface DatasetGenerationOptions {
  /** Entry points for analysis */
  entryPoints: string[];
  /** Output directory for dataset files */
  outputDir: string;
  /** Maximum symbols to include (for large codebases) */
  maxSymbols?: number;
  /** Include only specific languages */
  languages?: string[];
  /** Exclude patterns */
  excludePatterns?: string[];
  /** Minimum symbol complexity for inclusion */
  minComplexity?: number;
}

/**
 * Options for loading datasets
 */
export interface DatasetLoadOptions {
  /** Filter by difficulty */
  difficulty?: ('easy' | 'medium' | 'hard')[];
  /** Filter by tags */
  tags?: string[];
  /** Filter by language */
  languages?: string[];
  /** Maximum test cases to load */
  limit?: number;
  /** Random seed for shuffling */
  seed?: number;
}
