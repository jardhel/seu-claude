import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import type { LanguageStrategy, CodeSymbol, QueryPatterns } from './LanguageStrategy';

export class PythonStrategy implements LanguageStrategy {
  languageId = 'python';
  extensions = ['.py', '.pyi'];

  getParser(): Parser.Language {
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

  extractSymbols(tree: Parser.Tree, source: string): CodeSymbol[] {
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
}
