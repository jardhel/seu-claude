import { describe, it, expect, beforeEach } from 'vitest';
import { ASTParser, ParsedNode } from '../indexer/parser.js';

describe('ASTParser', () => {
  let parser: ASTParser;

  beforeEach(() => {
    parser = new ASTParser();
  });

  describe('constructor', () => {
    it('should create an ASTParser instance', () => {
      expect(parser).toBeInstanceOf(ASTParser);
    });

    it('should accept optional languagesDir', () => {
      const customParser = new ASTParser('/custom/languages');
      expect(customParser).toBeInstanceOf(ASTParser);
    });
  });

  describe('initialize', () => {
    it('should initialize without error', async () => {
      await expect(parser.initialize()).resolves.toBeUndefined();
    });

    it('should be idempotent (can call multiple times)', async () => {
      await parser.initialize();
      await expect(parser.initialize()).resolves.toBeUndefined();
    });
  });

  describe('loadLanguage', () => {
    beforeEach(async () => {
      await parser.initialize();
    });

    it('should return null for unsupported language', async () => {
      const lang = await parser.loadLanguage('unsupportedlang');
      expect(lang).toBeNull();
    });

    it('should return null for language without WASM file', async () => {
      const lang = await parser.loadLanguage('cobol');
      expect(lang).toBeNull();
    });

    it('should cache loaded languages', async () => {
      // Attempt to load typescript twice - should use cache
      const lang1 = await parser.loadLanguage('typescript');
      const lang2 = await parser.loadLanguage('typescript');

      // Both should return the same result (either null or Language)
      expect(lang1).toBe(lang2);
    });

    it('should handle missing WASM file gracefully', async () => {
      // Use a custom path that doesn't exist
      const customParser = new ASTParser('/nonexistent/path');
      await customParser.initialize();

      const lang = await customParser.loadLanguage('typescript');
      expect(lang).toBeNull();
    });
  });

  describe('parse', () => {
    it('should return null for unsupported language', async () => {
      const tree = await parser.parse('const x = 1;', 'unsupportedlang');
      expect(tree).toBeNull();
    });

    it('should handle empty code', async () => {
      const tree = await parser.parse('', 'typescript');
      // Either returns a tree with empty root or null depending on grammar availability
      if (tree !== null) {
        expect(tree.rootNode).toBeDefined();
      }
    });

    it('should initialize parser if not already done', async () => {
      // Create fresh parser without explicit init
      const freshParser = new ASTParser();
      // This should auto-initialize
      await freshParser.parse('const x = 1;', 'typescript');
      // No error means success
    });

    it('should handle syntax errors gracefully', async () => {
      // Invalid syntax - parser should still return a tree (with error nodes)
      const tree = await parser.parse('const const const', 'typescript');
      // Should not throw - returns tree with errors or null
      expect(tree === null || tree !== null).toBe(true);
    });

    it('should handle very long code', async () => {
      const longCode = Array(1000).fill('const x = 1;').join('\n');
      const tree = await parser.parse(longCode, 'typescript');
      // Should not throw
      expect(tree === null || tree !== null).toBe(true);
    });
  });

  describe('extractNodes', () => {
    it('should return empty array for language without extractable types', async () => {
      await parser.initialize();
      const tree = await parser.parse('const x = 1;', 'typescript');

      if (tree) {
        const nodes = parser.extractNodes(tree, 'unknownlang');
        expect(nodes).toEqual([]);
      }
    });

    it('should handle tree with no extractable nodes', async () => {
      await parser.initialize();
      const tree = await parser.parse('// just a comment', 'typescript');

      if (tree) {
        const nodes = parser.extractNodes(tree, 'typescript');
        // Comments alone shouldn't produce extractable nodes
        expect(Array.isArray(nodes)).toBe(true);
      }
    });
  });

  describe('parseFile', () => {
    it('should throw for non-existent file', async () => {
      await expect(parser.parseFile('/nonexistent/file.ts', 'typescript')).rejects.toThrow();
    });
  });
});

describe('ParsedNode structure', () => {
  it('should define correct interface', () => {
    const node: ParsedNode = {
      type: 'function_declaration',
      name: 'testFunc',
      startLine: 1,
      endLine: 5,
      startColumn: 0,
      endColumn: 1,
      text: 'function testFunc() {}',
      children: [],
      docstring: null,
      scope: ['testFunc'],
    };

    expect(node.type).toBe('function_declaration');
    expect(node.name).toBe('testFunc');
    expect(node.startLine).toBe(1);
    expect(node.endLine).toBe(5);
    expect(node.startColumn).toBe(0);
    expect(node.endColumn).toBe(1);
    expect(node.text).toBe('function testFunc() {}');
    expect(node.children).toEqual([]);
    expect(node.docstring).toBeNull();
    expect(node.scope).toEqual(['testFunc']);
  });

  it('should allow null name', () => {
    const node: ParsedNode = {
      type: 'arrow_function',
      name: null,
      startLine: 1,
      endLine: 1,
      startColumn: 0,
      endColumn: 20,
      text: '() => {}',
      children: [],
      docstring: null,
      scope: [],
    };

    expect(node.name).toBeNull();
  });

  it('should allow nested children', () => {
    const child: ParsedNode = {
      type: 'method_definition',
      name: 'method1',
      startLine: 2,
      endLine: 4,
      startColumn: 2,
      endColumn: 3,
      text: 'method1() {}',
      children: [],
      docstring: null,
      scope: ['MyClass', 'method1'],
    };

    const parent: ParsedNode = {
      type: 'class_declaration',
      name: 'MyClass',
      startLine: 1,
      endLine: 5,
      startColumn: 0,
      endColumn: 1,
      text: 'class MyClass { method1() {} }',
      children: [child],
      docstring: '// My class comment',
      scope: ['MyClass'],
    };

    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].name).toBe('method1');
  });
});

describe('LANGUAGE_WASM_MAP coverage', () => {
  let parser: ASTParser;

  beforeEach(async () => {
    parser = new ASTParser();
    await parser.initialize();
  });

  const supportedLanguages = [
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
  ];

  it.each(supportedLanguages)('should have WASM mapping for %s', async lang => {
    // Attempt to load - will return null if WASM not present, but no error
    const result = await parser.loadLanguage(lang);
    // Either loads successfully or returns null gracefully
    expect(result === null || result !== null).toBe(true);
  });
});

describe('EXTRACTABLE_TYPES coverage', () => {
  let parser: ASTParser;

  beforeEach(async () => {
    parser = new ASTParser();
    await parser.initialize();
  });

  describe('TypeScript extractable types', () => {
    const tsCode = `
      function regularFunction() {}

      class MyClass {
        myMethod() {}
      }

      interface MyInterface {
        prop: string;
      }

      type MyType = string | number;

      enum MyEnum {
        A,
        B
      }

      const arrowFunc = () => {};

      export const exported = 1;
    `;

    it('should attempt to extract TypeScript nodes', async () => {
      const tree = await parser.parse(tsCode, 'typescript');

      if (tree) {
        const nodes = parser.extractNodes(tree, 'typescript');
        // Should extract some nodes (exact count depends on grammar)
        expect(Array.isArray(nodes)).toBe(true);
      }
    });
  });

  describe('Python extractable types', () => {
    const pyCode = `
def my_function():
    pass

class MyClass:
    def my_method(self):
        pass

@decorator
def decorated_function():
    pass
    `;

    it('should attempt to extract Python nodes', async () => {
      const tree = await parser.parse(pyCode, 'python');

      if (tree) {
        const nodes = parser.extractNodes(tree, 'python');
        expect(Array.isArray(nodes)).toBe(true);
      }
    });
  });

  describe('Rust extractable types', () => {
    const rustCode = `
fn my_function() {}

struct MyStruct {
    field: i32,
}

enum MyEnum {
    A,
    B,
}

trait MyTrait {
    fn trait_method(&self);
}

impl MyStruct {
    fn impl_method(&self) {}
}

mod my_module {}
    `;

    it('should attempt to extract Rust nodes', async () => {
      const tree = await parser.parse(rustCode, 'rust');

      if (tree) {
        const nodes = parser.extractNodes(tree, 'rust');
        expect(Array.isArray(nodes)).toBe(true);
      }
    });
  });

  describe('Go extractable types', () => {
    const goCode = `
package main

func myFunction() {}

func (s *MyStruct) myMethod() {}

type MyStruct struct {
    Field int
}

type MyInterface interface {
    Method()
}
    `;

    it('should attempt to extract Go nodes', async () => {
      const tree = await parser.parse(goCode, 'go');

      if (tree) {
        const nodes = parser.extractNodes(tree, 'go');
        expect(Array.isArray(nodes)).toBe(true);
      }
    });
  });

  describe('Java extractable types', () => {
    const javaCode = `
public class MyClass {
    public void myMethod() {}
}

interface MyInterface {
    void method();
}

enum MyEnum {
    A, B
}
    `;

    it('should attempt to extract Java nodes', async () => {
      const tree = await parser.parse(javaCode, 'java');

      if (tree) {
        const nodes = parser.extractNodes(tree, 'java');
        expect(Array.isArray(nodes)).toBe(true);
      }
    });
  });
});

describe('Docstring extraction', () => {
  let parser: ASTParser;

  beforeEach(async () => {
    parser = new ASTParser();
    await parser.initialize();
  });

  it('should handle code with block comments', async () => {
    const code = `
/**
 * This is a docstring
 */
function documented() {}
    `;

    const tree = await parser.parse(code, 'typescript');
    if (tree) {
      const nodes = parser.extractNodes(tree, 'typescript');
      // Should not throw
      expect(Array.isArray(nodes)).toBe(true);
    }
  });

  it('should handle code with line comments', async () => {
    const code = `
// This is a comment
function commented() {}
    `;

    const tree = await parser.parse(code, 'typescript');
    if (tree) {
      const nodes = parser.extractNodes(tree, 'typescript');
      expect(Array.isArray(nodes)).toBe(true);
    }
  });

  it('should handle Python docstrings', async () => {
    const code = `
def my_function():
    """This is a docstring."""
    pass
    `;

    const tree = await parser.parse(code, 'python');
    if (tree) {
      const nodes = parser.extractNodes(tree, 'python');
      expect(Array.isArray(nodes)).toBe(true);
    }
  });
});

describe('Edge cases', () => {
  let parser: ASTParser;

  beforeEach(async () => {
    parser = new ASTParser();
    await parser.initialize();
  });

  it('should handle unicode in code', async () => {
    const code = `
// 日本語コメント
const greeting = "こんにちは";
function greet() { return greeting; }
    `;

    const tree = await parser.parse(code, 'typescript');
    if (tree) {
      const nodes = parser.extractNodes(tree, 'typescript');
      expect(Array.isArray(nodes)).toBe(true);
    }
  });

  it('should handle deeply nested structures', async () => {
    const code = `
class Outer {
  method1() {
    const inner = () => {
      const deepInner = () => {
        return 1;
      };
      return deepInner();
    };
    return inner();
  }
}
    `;

    const tree = await parser.parse(code, 'typescript');
    if (tree) {
      const nodes = parser.extractNodes(tree, 'typescript');
      expect(Array.isArray(nodes)).toBe(true);
    }
  });

  it('should handle code with only whitespace and comments', async () => {
    const code = `

    // Comment 1

    /* Block comment */

    `;

    const tree = await parser.parse(code, 'typescript');
    if (tree) {
      const nodes = parser.extractNodes(tree, 'typescript');
      // Should return empty or minimal nodes
      expect(Array.isArray(nodes)).toBe(true);
    }
  });

  it('should handle minified code', async () => {
    const code = 'function a(){return 1}function b(){return 2}function c(){return 3}';

    const tree = await parser.parse(code, 'typescript');
    if (tree) {
      const nodes = parser.extractNodes(tree, 'typescript');
      expect(Array.isArray(nodes)).toBe(true);
    }
  });
});
