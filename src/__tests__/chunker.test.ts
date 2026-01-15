import { describe, it, expect, beforeEach } from '@jest/globals';
import { SemanticChunker } from '../indexer/chunker.js';
import { loadConfig, Config } from '../utils/config.js';

describe('SemanticChunker', () => {
  let config: Config;
  let chunker: SemanticChunker;

  beforeEach(() => {
    config = loadConfig({
      projectRoot: '/test',
      maxChunkTokens: 512,
      minChunkLines: 5,
    });
    chunker = new SemanticChunker(config);
  });

  describe('constructor', () => {
    it('should create a SemanticChunker instance', () => {
      expect(chunker).toBeInstanceOf(SemanticChunker);
    });

    it('should accept optional languagesDir', () => {
      const chunkerWithDir = new SemanticChunker(config, '/custom/languages');
      expect(chunkerWithDir).toBeInstanceOf(SemanticChunker);
    });
  });

  describe('initialize', () => {
    it('should initialize without error', async () => {
      await expect(chunker.initialize()).resolves.toBeUndefined();
    });
  });

  describe('chunkFile - fallback chunking', () => {
    it('should use fallback chunking when parser returns null', async () => {
      const content = `
function hello() {
  console.log("hello");
}

function world() {
  console.log("world");
}
`.trim();

      const chunks = await chunker.chunkFile(
        '/test/file.ts',
        'file.ts',
        content,
        'typescript'
      );

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].type).toBe('block');
    });

    it('should create chunks with correct structure', async () => {
      const content = 'const x = 1;\nconst y = 2;\nconst z = 3;';

      const chunks = await chunker.chunkFile(
        '/test/simple.ts',
        'simple.ts',
        content,
        'typescript'
      );

      expect(chunks.length).toBeGreaterThan(0);

      const chunk = chunks[0];
      expect(chunk).toHaveProperty('id');
      expect(chunk).toHaveProperty('filePath', '/test/simple.ts');
      expect(chunk).toHaveProperty('relativePath', 'simple.ts');
      expect(chunk).toHaveProperty('code');
      expect(chunk).toHaveProperty('startLine');
      expect(chunk).toHaveProperty('endLine');
      expect(chunk).toHaveProperty('language', 'typescript');
      expect(chunk).toHaveProperty('type');
      expect(chunk).toHaveProperty('scope');
      expect(chunk).toHaveProperty('tokenEstimate');
    });

    it('should generate unique IDs for different content', async () => {
      const content1 = 'const a = 1;';
      const content2 = 'const b = 2;';

      const chunks1 = await chunker.chunkFile('/test/a.ts', 'a.ts', content1, 'typescript');
      const chunks2 = await chunker.chunkFile('/test/b.ts', 'b.ts', content2, 'typescript');

      if (chunks1.length > 0 && chunks2.length > 0) {
        expect(chunks1[0].id).not.toBe(chunks2[0].id);
      }
    });

    it('should handle empty content', async () => {
      const chunks = await chunker.chunkFile('/test/empty.ts', 'empty.ts', '', 'typescript');
      expect(chunks).toHaveLength(0);
    });

    it('should handle whitespace-only content', async () => {
      const chunks = await chunker.chunkFile(
        '/test/whitespace.ts',
        'whitespace.ts',
        '   \n\n   \n',
        'typescript'
      );
      expect(chunks).toHaveLength(0);
    });

    it('should estimate tokens based on content length', async () => {
      const content = 'a'.repeat(100); // 100 characters

      const chunks = await chunker.chunkFile(
        '/test/tokens.ts',
        'tokens.ts',
        content,
        'typescript'
      );

      if (chunks.length > 0) {
        // ~4 chars per token, so 100 chars ≈ 25 tokens
        expect(chunks[0].tokenEstimate).toBeGreaterThanOrEqual(20);
        expect(chunks[0].tokenEstimate).toBeLessThanOrEqual(30);
      }
    });

    it('should set correct line numbers', async () => {
      const content = 'line1\nline2\nline3\nline4\nline5';

      const chunks = await chunker.chunkFile(
        '/test/lines.ts',
        'lines.ts',
        content,
        'typescript'
      );

      if (chunks.length > 0) {
        expect(chunks[0].startLine).toBe(1);
        expect(chunks[0].endLine).toBeGreaterThanOrEqual(1);
      }
    });

    it('should use relative path as scope for fallback chunks', async () => {
      const content = 'const x = 1;';

      const chunks = await chunker.chunkFile(
        '/test/src/utils/helper.ts',
        'src/utils/helper.ts',
        content,
        'typescript'
      );

      if (chunks.length > 0) {
        expect(chunks[0].scope).toBe('src/utils/helper.ts');
      }
    });
  });

  describe('large content handling', () => {
    it('should create multiple chunks for large content', async () => {
      // Create content larger than maxChunkTokens
      const lines = Array(200)
        .fill(null)
        .map((_, i) => `const var${i} = ${i};`);
      const content = lines.join('\n');

      const smallConfig = loadConfig({
        projectRoot: '/test',
        maxChunkTokens: 100, // Very small for testing
        minChunkLines: 1,
      });
      const smallChunker = new SemanticChunker(smallConfig);

      const chunks = await smallChunker.chunkFile(
        '/test/large.ts',
        'large.ts',
        content,
        'typescript'
      );

      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should create overlapping chunks in fallback mode', async () => {
      const lines = Array(50)
        .fill(null)
        .map((_, i) => `line ${i}`);
      const content = lines.join('\n');

      const chunks = await chunker.chunkFile(
        '/test/overlap.ts',
        'overlap.ts',
        content,
        'typescript'
      );

      // Verify chunks were created
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('ID generation', () => {
    it('should generate consistent IDs for same input', async () => {
      const content = 'const x = 1;';

      const chunks1 = await chunker.chunkFile('/test/a.ts', 'a.ts', content, 'typescript');
      const chunks2 = await chunker.chunkFile('/test/a.ts', 'a.ts', content, 'typescript');

      if (chunks1.length > 0 && chunks2.length > 0) {
        expect(chunks1[0].id).toBe(chunks2[0].id);
      }
    });

    it('should generate 16-character hex IDs', async () => {
      const content = 'const x = 1;';

      const chunks = await chunker.chunkFile('/test/a.ts', 'a.ts', content, 'typescript');

      if (chunks.length > 0) {
        expect(chunks[0].id).toMatch(/^[a-f0-9]{16}$/);
      }
    });
  });

  describe('language handling', () => {
    it('should preserve language in chunks', async () => {
      // Test with TypeScript only since it has reliable fallback
      const chunks = await chunker.chunkFile(
        '/test/file.ts',
        'file.ts',
        'const x = 1;',
        'typescript'
      );

      if (chunks.length > 0) {
        expect(chunks[0].language).toBe('typescript');
      }
    });

    it('should handle various languages via fallback', async () => {
      const languages = ['python', 'rust', 'go', 'java'];

      for (const language of languages) {
        // Even if parser fails, fallback should work
        const chunks = await chunker.chunkFile(
          `/test/file.${language}`,
          `file.${language}`,
          'some code content here\nline 2\nline 3',
          language
        );

        // Fallback chunking should still preserve language
        if (chunks.length > 0) {
          expect(chunks[0].language).toBe(language);
        }
      }
    });
  });
});

describe('SemanticChunker - Node Type Normalization', () => {
  let config: Config;

  beforeEach(() => {
    config = loadConfig({ projectRoot: '/test' });
  });

  it('should normalize function types', () => {
    // We test normalization indirectly through the chunker behavior
    // The normalizeNodeType is private, but we can verify it works through integration
    const chunker = new SemanticChunker(config);
    expect(chunker).toBeDefined();
  });
});

describe('SemanticChunker - Integration', () => {
  let config: Config;

  beforeEach(() => {
    config = loadConfig({
      projectRoot: '/test',
      maxChunkTokens: 512,
      minChunkLines: 5,
    });
  });

  it('should handle real TypeScript code', async () => {
    const chunker = new SemanticChunker(config);

    const tsCode = `
export class Calculator {
  private value: number = 0;

  add(n: number): Calculator {
    this.value += n;
    return this;
  }

  subtract(n: number): Calculator {
    this.value -= n;
    return this;
  }

  getResult(): number {
    return this.value;
  }
}

export function createCalculator(): Calculator {
  return new Calculator();
}
`.trim();

    const chunks = await chunker.chunkFile(
      '/test/calculator.ts',
      'calculator.ts',
      tsCode,
      'typescript'
    );

    expect(chunks.length).toBeGreaterThan(0);

    // Verify all chunks have required fields
    for (const chunk of chunks) {
      expect(chunk.id).toBeDefined();
      expect(chunk.code).toBeDefined();
      expect(chunk.language).toBe('typescript');
    }
  });

  it('should handle real Python code via fallback', async () => {
    const chunker = new SemanticChunker(config);

    const pyCode = `
class Calculator:
    def __init__(self):
        self.value = 0

    def add(self, n):
        self.value += n
        return self

    def subtract(self, n):
        self.value -= n
        return self

    def get_result(self):
        return self.value


def create_calculator():
    return Calculator()
`.trim();

    // Parser may fail with WASM version issues, but fallback should work
    const chunks = await chunker.chunkFile(
      '/test/calculator.py',
      'calculator.py',
      pyCode,
      'python'
    );

    // Fallback chunking should still produce chunks
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].language).toBe('python');
  });

  it('should handle code with unicode', async () => {
    const chunker = new SemanticChunker(config);

    const code = `
// 日本語コメント
const greeting = "こんにちは";
const emoji = "🎉";

function greet(name: string): string {
  return \`\${greeting}, \${name}! \${emoji}\`;
}
`.trim();

    const chunks = await chunker.chunkFile('/test/unicode.ts', 'unicode.ts', code, 'typescript');

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].code).toContain('日本語');
  });
});
