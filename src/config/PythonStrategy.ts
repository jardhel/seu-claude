import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import type { LanguageStrategy, CodeSymbol, QueryPatterns, ImportStatement } from './LanguageStrategy';

export class PythonStrategy implements LanguageStrategy {
  languageId = 'python';
  extensions = ['.py', '.pyi'];

  getParser(): unknown {
    return Python;
  }

  getQueryPatterns(): QueryPatterns {
    return {
      functionDefinitions: `
        (function_definition
          name: (identifier) @name) @definition
      `,
      callSites: `
        (call
          function: (identifier) @callee) @call
        (call
          function: (attribute
            attribute: (identifier) @callee)) @call
      `,
      classDefinitions: `
        (class_definition
          name: (identifier) @name) @definition
      `,
      methodDefinitions: `
        (function_definition
          name: (identifier) @name) @definition
      `,
    };
  }

  extractSymbols(tree: Parser.Tree, _source: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const cursor = tree.walk();

    const visit = (): void => {
      const node = cursor.currentNode;

      // Function definitions
      if (node.type === 'function_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          // Check if this is a method (inside a class)
          let parentClass: string | undefined;
          let isMethod = false;
          let parent = node.parent;
          while (parent) {
            if (parent.type === 'class_definition') {
              const classNameNode = parent.childForFieldName('name');
              if (classNameNode) {
                parentClass = classNameNode.text;
                isMethod = true;
              }
              break;
            }
            parent = parent.parent;
          }

          symbols.push({
            name: nameNode.text,
            type: isMethod ? 'method' : 'function',
            parentClass,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            startColumn: node.startPosition.column,
            endColumn: node.endPosition.column,
          });
        }
      }

      // Class definitions
      if (node.type === 'class_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          symbols.push({
            name: nameNode.text,
            type: 'class',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            startColumn: node.startPosition.column,
            endColumn: node.endPosition.column,
          });
        }
      }

      // Call expressions
      if (node.type === 'call') {
        const funcNode = node.childForFieldName('function');
        if (funcNode) {
          let callee: string;
          if (funcNode.type === 'identifier') {
            callee = funcNode.text;
          } else if (funcNode.type === 'attribute') {
            const attrNode = funcNode.childForFieldName('attribute');
            callee = attrNode ? attrNode.text : funcNode.text;
          } else {
            callee = funcNode.text;
          }

          symbols.push({
            name: `call:${callee}`,
            type: 'call',
            callee,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            startColumn: node.startPosition.column,
            endColumn: node.endPosition.column,
          });
        }
      }

      // Recurse into children
      if (cursor.gotoFirstChild()) {
        do {
          visit();
        } while (cursor.gotoNextSibling());
        cursor.gotoParent();
      }
    };

    visit();
    return symbols;
  }

  extractImports(tree: Parser.Tree, _source: string): ImportStatement[] {
    const imports: ImportStatement[] = [];
    const cursor = tree.walk();

    const visit = (): void => {
      const node = cursor.currentNode;

      // import foo, bar
      // import foo.bar
      if (node.type === 'import_statement') {
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child?.type === 'dotted_name') {
            imports.push({
              modulePath: child.text,
              importedSymbols: [child.text.split('.').pop() || child.text],
              isDefault: false,
              isNamespace: true,
              line: node.startPosition.row + 1,
            });
          } else if (child?.type === 'aliased_import') {
            const nameNode = child.childForFieldName('name');
            const aliasNode = child.childForFieldName('alias');
            if (nameNode) {
              imports.push({
                modulePath: nameNode.text,
                importedSymbols: [aliasNode?.text || nameNode.text],
                isDefault: false,
                isNamespace: true,
                line: node.startPosition.row + 1,
              });
            }
          }
        }
      }

      // from foo import bar, baz
      // from foo.bar import baz
      if (node.type === 'import_from_statement') {
        let modulePath = '';
        const importedSymbols: string[] = [];
        let isNamespace = false;
        let foundImportKeyword = false;

        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (!child) continue;

          // Track when we see 'import' keyword
          if (child.type === 'import') {
            foundImportKeyword = true;
            continue;
          }

          // Module name comes before 'import' keyword
          if (!foundImportKeyword && (child.type === 'dotted_name' || child.type === 'relative_import')) {
            modulePath = child.text;
          }

          // Wildcard import: from foo import *
          if (child.type === 'wildcard_import') {
            importedSymbols.push('*');
            isNamespace = true;
          }

          // Named imports come after 'import' keyword
          if (foundImportKeyword && child.type === 'dotted_name') {
            importedSymbols.push(child.text);
          }

          if (child.type === 'aliased_import') {
            const nameNode = child.childForFieldName('name');
            const aliasNode = child.childForFieldName('alias');
            if (nameNode) {
              importedSymbols.push(aliasNode?.text || nameNode.text);
            }
          }
        }

        if (modulePath) {
          imports.push({
            modulePath,
            importedSymbols: importedSymbols.length > 0 ? importedSymbols : ['*'],
            isDefault: false,
            isNamespace,
            line: node.startPosition.row + 1,
          });
        }
      }

      // Recurse into children
      if (cursor.gotoFirstChild()) {
        do {
          visit();
        } while (cursor.gotoNextSibling());
        cursor.gotoParent();
      }
    };

    visit();
    return imports;
  }
}
