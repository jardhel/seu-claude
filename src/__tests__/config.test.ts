import { loadConfig, getLanguageFromExtension, LANGUAGE_EXTENSIONS } from '../utils/config.js';
import { homedir } from 'os';
import { join } from 'path';

describe('Config', () => {
  describe('loadConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return default config when no overrides', () => {
      const config = loadConfig();

      expect(config.projectRoot).toBe(process.cwd());
      expect(config.dataDir).toBe(join(homedir(), '.seu-claude'));
      expect(config.embeddingModel).toBe('Xenova/all-MiniLM-L6-v2');
      expect(config.embeddingDimensions).toBe(384);
      expect(config.maxChunkTokens).toBe(512);
      expect(config.minChunkLines).toBe(5);
    });

    it('should override with environment variables', () => {
      process.env.PROJECT_ROOT = '/custom/path';
      process.env.DATA_DIR = '/custom/data';
      process.env.EMBEDDING_MODEL = 'custom-model';
      process.env.EMBEDDING_DIMENSIONS = '512';

      const config = loadConfig();

      expect(config.projectRoot).toBe('/custom/path');
      expect(config.dataDir).toBe('/custom/data');
      expect(config.embeddingModel).toBe('custom-model');
      expect(config.embeddingDimensions).toBe(512);
    });

    it('should override with explicit options', () => {
      const config = loadConfig({
        projectRoot: '/explicit/path',
        maxChunkTokens: 1024,
      });

      expect(config.projectRoot).toBe('/explicit/path');
      expect(config.maxChunkTokens).toBe(1024);
    });

    it('should have correct supported languages', () => {
      const config = loadConfig();

      expect(config.supportedLanguages).toContain('typescript');
      expect(config.supportedLanguages).toContain('javascript');
      expect(config.supportedLanguages).toContain('python');
      expect(config.supportedLanguages).toContain('rust');
    });

    it('should have default ignore patterns', () => {
      const config = loadConfig();

      expect(config.ignorePatterns).toContain('**/node_modules/**');
      expect(config.ignorePatterns).toContain('**/.git/**');
      expect(config.ignorePatterns).toContain('**/dist/**');
    });
  });

  describe('getLanguageFromExtension', () => {
    it('should return typescript for .ts files', () => {
      expect(getLanguageFromExtension('.ts')).toBe('typescript');
      expect(getLanguageFromExtension('.tsx')).toBe('typescript');
    });

    it('should return javascript for .js files', () => {
      expect(getLanguageFromExtension('.js')).toBe('javascript');
      expect(getLanguageFromExtension('.jsx')).toBe('javascript');
      expect(getLanguageFromExtension('.mjs')).toBe('javascript');
    });

    it('should return python for .py files', () => {
      expect(getLanguageFromExtension('.py')).toBe('python');
    });

    it('should return null for unknown extensions', () => {
      expect(getLanguageFromExtension('.xyz')).toBeNull();
      expect(getLanguageFromExtension('.unknown')).toBeNull();
    });

    it('should be case insensitive', () => {
      expect(getLanguageFromExtension('.TS')).toBe('typescript');
      expect(getLanguageFromExtension('.PY')).toBe('python');
    });
  });

  describe('LANGUAGE_EXTENSIONS', () => {
    it('should map common extensions correctly', () => {
      expect(LANGUAGE_EXTENSIONS['.ts']).toBe('typescript');
      expect(LANGUAGE_EXTENSIONS['.js']).toBe('javascript');
      expect(LANGUAGE_EXTENSIONS['.py']).toBe('python');
      expect(LANGUAGE_EXTENSIONS['.rs']).toBe('rust');
      expect(LANGUAGE_EXTENSIONS['.go']).toBe('go');
    });
  });
});
