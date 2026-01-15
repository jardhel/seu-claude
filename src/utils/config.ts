import { homedir } from 'os';
import { join } from 'path';

export interface Config {
  projectRoot: string;
  dataDir: string;
  embeddingModel: string;
  embeddingDimensions: number;
  maxChunkTokens: number;
  minChunkLines: number;
  supportedLanguages: string[];
  ignorePatterns: string[];
}

const defaultConfig: Config = {
  projectRoot: process.cwd(),
  dataDir: join(homedir(), '.seu-claude'),
  embeddingModel: 'Xenova/nomic-embed-text-v1.5',
  embeddingDimensions: 256, // Matryoshka truncation for smaller storage
  maxChunkTokens: 512,
  minChunkLines: 5,
  supportedLanguages: [
    'typescript',
    'javascript',
    'python',
    'rust',
    'go',
    'java',
    'c',
    'cpp',
    'c_sharp',
    'ruby',
    'php',
  ],
  ignorePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
    '**/__pycache__/**',
    '**/.venv/**',
    '**/venv/**',
    '**/*.min.js',
    '**/*.bundle.js',
    '**/package-lock.json',
    '**/yarn.lock',
    '**/pnpm-lock.yaml',
  ],
};

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const envConfig: Partial<Config> = {};

  if (process.env.PROJECT_ROOT) {
    envConfig.projectRoot = process.env.PROJECT_ROOT;
  }
  if (process.env.DATA_DIR) {
    envConfig.dataDir = process.env.DATA_DIR;
  }
  if (process.env.EMBEDDING_MODEL) {
    envConfig.embeddingModel = process.env.EMBEDDING_MODEL;
  }
  if (process.env.EMBEDDING_DIMENSIONS) {
    envConfig.embeddingDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS, 10);
  }

  return {
    ...defaultConfig,
    ...envConfig,
    ...overrides,
  };
}

export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'c_sharp',
  '.rb': 'ruby',
  '.php': 'php',
};

export function getLanguageFromExtension(ext: string): string | null {
  return LANGUAGE_EXTENSIONS[ext.toLowerCase()] || null;
}
