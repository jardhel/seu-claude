import Parser, { Language, Tree, SyntaxNode } from 'web-tree-sitter';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFile, access } from 'fs/promises';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ParsedNode {
  type: string;
  name: string | null;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  text: string;
  children: ParsedNode[];
  docstring: string | null;
  scope: string[];
}

const LANGUAGE_WASM_MAP: Record<string, string> = {
  typescript: 'tree-sitter-typescript.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
  rust: 'tree-sitter-rust.wasm',
  go: 'tree-sitter-go.wasm',
  java: 'tree-sitter-java.wasm',
  c: 'tree-sitter-c.wasm',
  cpp: 'tree-sitter-cpp.wasm',
  c_sharp: 'tree-sitter-c-sharp.wasm',
  ruby: 'tree-sitter-ruby.wasm',
  php: 'tree-sitter-php.wasm',
};

// Node types we want to extract as semantic chunks
const EXTRACTABLE_TYPES: Record<string, string[]> = {
  typescript: [
    'function_declaration',
    'method_definition',
    'class_declaration',
    'interface_declaration',
    'type_alias_declaration',
    'enum_declaration',
    'arrow_function',
    'export_statement',
  ],
  javascript: [
    'function_declaration',
    'method_definition',
    'class_declaration',
    'arrow_function',
    'export_statement',
  ],
  python: [
    'function_definition',
    'class_definition',
    'decorated_definition',
  ],
  rust: [
    'function_item',
    'impl_item',
    'struct_item',
    'enum_item',
    'trait_item',
    'mod_item',
  ],
  go: [
    'function_declaration',
    'method_declaration',
    'type_declaration',
    'interface_type',
  ],
  java: [
    'method_declaration',
    'class_declaration',
    'interface_declaration',
    'enum_declaration',
  ],
  c: ['function_definition', 'struct_specifier', 'enum_specifier'],
  cpp: [
    'function_definition',
    'class_specifier',
    'struct_specifier',
    'namespace_definition',
  ],
  c_sharp: [
    'method_declaration',
    'class_declaration',
    'interface_declaration',
    'namespace_declaration',
  ],
  ruby: ['method', 'class', 'module', 'singleton_method'],
  php: ['function_definition', 'method_declaration', 'class_declaration', 'interface_declaration'],
};

export class ASTParser {
  private parser: Parser | null = null;
  private loadedLanguages: Map<string, Language> = new Map();
  private log = logger.child('parser');
  private languagesDir: string;

  constructor(languagesDir?: string) {
    this.languagesDir = languagesDir || join(__dirname, '../../languages');
  }

  async initialize(): Promise<void> {
    if (this.parser) return;

    await Parser.init();
    this.parser = new Parser();
    this.log.info('Tree-sitter parser initialized');
  }

  async loadLanguage(language: string): Promise<Language | null> {
    if (this.loadedLanguages.has(language)) {
      return this.loadedLanguages.get(language)!;
    }

    const wasmFile = LANGUAGE_WASM_MAP[language];
    if (!wasmFile) {
      this.log.warn(`No WASM file mapped for language: ${language}`);
      return null;
    }

    const wasmPath = join(this.languagesDir, wasmFile);

    try {
      await access(wasmPath);
    } catch {
      this.log.warn(`WASM file not found: ${wasmPath}. Run 'npm run download-grammars' first.`);
      return null;
    }

    try {
      const lang = await Parser.Language.load(wasmPath);
      this.loadedLanguages.set(language, lang);
      this.log.debug(`Loaded language: ${language}`);
      return lang;
    } catch (err) {
      this.log.error(`Failed to load language ${language}:`, err);
      return null;
    }
  }

  async parse(code: string, language: string): Promise<Tree | null> {
    await this.initialize();

    const lang = await this.loadLanguage(language);
    if (!lang || !this.parser) {
      return null;
    }

    this.parser.setLanguage(lang);
    return this.parser.parse(code);
  }

  extractNodes(tree: Tree, language: string): ParsedNode[] {
    const extractableTypes = EXTRACTABLE_TYPES[language] || [];
    const nodes: ParsedNode[] = [];

    const traverse = (node: SyntaxNode, scope: string[] = []): void => {
      if (extractableTypes.includes(node.type)) {
        const name = this.extractNodeName(node, language);
        const docstring = this.extractDocstring(node, language);
        const currentScope = name ? [...scope, name] : scope;

        nodes.push({
          type: node.type,
          name,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          startColumn: node.startPosition.column,
          endColumn: node.endPosition.column,
          text: node.text,
          children: [],
          docstring,
          scope: currentScope,
        });

        // Continue traversing for nested definitions
        for (const child of node.children) {
          traverse(child, currentScope);
        }
      } else {
        // Keep traversing to find extractable nodes
        for (const child of node.children) {
          traverse(child, scope);
        }
      }
    };

    traverse(tree.rootNode);
    return nodes;
  }

  private extractNodeName(node: SyntaxNode, _language: string): string | null {
    // Common patterns for finding the name node
    const nameFields = ['name', 'identifier'];

    for (const field of nameFields) {
      const nameNode = node.childForFieldName(field);
      if (nameNode) {
        return nameNode.text;
      }
    }

    // Fallback: search for identifier child
    for (const child of node.children) {
      if (child.type === 'identifier' || child.type === 'property_identifier') {
        return child.text;
      }
      if (child.type === 'type_identifier') {
        return child.text;
      }
    }

    return null;
  }

  private extractDocstring(node: SyntaxNode, language: string): string | null {
    // Look for comment immediately before the node
    const prevSibling = node.previousNamedSibling;

    if (prevSibling) {
      if (prevSibling.type === 'comment' || prevSibling.type === 'block_comment') {
        return prevSibling.text;
      }
      // Python docstrings
      if (language === 'python' && prevSibling.type === 'expression_statement') {
        const stringChild = prevSibling.firstChild;
        if (stringChild?.type === 'string') {
          return stringChild.text;
        }
      }
    }

    // Check first child for docstrings (Python)
    if (language === 'python') {
      const body = node.childForFieldName('body');
      if (body) {
        const firstChild = body.firstNamedChild;
        if (firstChild?.type === 'expression_statement') {
          const stringNode = firstChild.firstChild;
          if (stringNode?.type === 'string') {
            return stringNode.text;
          }
        }
      }
    }

    return null;
  }

  async parseFile(filePath: string, language: string): Promise<ParsedNode[]> {
    const content = await readFile(filePath, 'utf-8');
    const tree = await this.parse(content, language);

    if (!tree) {
      return [];
    }

    return this.extractNodes(tree, language);
  }
}
