/**
 * Cross-Reference Tracker
 * Tracks callers/callees relationships between functions for code navigation
 */

import { Tree, SyntaxNode } from 'web-tree-sitter';
import { logger } from '../utils/logger.js';

export interface FunctionReference {
  /** The function/method name being called */
  name: string;
  /** Line number of the call */
  line: number;
  /** Column of the call */
  column: number;
  /** Full call expression (e.g., "obj.method()" or "func()") */
  callExpression: string;
  /** Whether this is a method call (has receiver) */
  isMethodCall: boolean;
  /** The receiver/object if method call (e.g., "obj" in "obj.method()") */
  receiver?: string;
}

export interface SymbolDefinition {
  /** Symbol name */
  name: string;
  /** Type: function, method, class, etc. */
  type: string;
  /** File path */
  filePath: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Scope chain (e.g., ["ClassName", "methodName"]) */
  scope: string[];
  /** Functions/methods this symbol calls (callees) */
  calls: string[];
  /** Functions/methods that call this symbol (callers) - populated later */
  calledBy: string[];
}

export interface CrossReferenceGraph {
  /** Map of fully qualified name -> definition */
  definitions: Map<string, SymbolDefinition>;
  /** Map of symbol name -> files where it's called */
  callSites: Map<string, Array<{ file: string; line: number; caller: string }>>;
}

// Node types that represent function/method calls per language
const CALL_EXPRESSION_TYPES: Record<string, string[]> = {
  typescript: ['call_expression', 'new_expression'],
  javascript: ['call_expression', 'new_expression'],
  python: ['call', 'attribute'],
  rust: ['call_expression', 'method_call_expression'],
  go: ['call_expression'],
  java: ['method_invocation', 'object_creation_expression'],
  c: ['call_expression'],
  cpp: ['call_expression'],
  c_sharp: ['invocation_expression', 'object_creation_expression'],
  ruby: ['call', 'method_call'],
  php: ['function_call_expression', 'method_call_expression', 'object_creation_expression'],
};

// Node types that define functions/methods
const DEFINITION_TYPES: Record<string, string[]> = {
  typescript: ['function_declaration', 'method_definition', 'arrow_function'],
  javascript: ['function_declaration', 'method_definition', 'arrow_function'],
  python: ['function_definition'],
  rust: ['function_item'],
  go: ['function_declaration', 'method_declaration'],
  java: ['method_declaration', 'constructor_declaration'],
  c: ['function_definition'],
  cpp: ['function_definition'],
  c_sharp: ['method_declaration', 'constructor_declaration'],
  ruby: ['method', 'singleton_method'],
  php: ['function_definition', 'method_declaration'],
};

export class CrossReferenceTracker {
  private log = logger.child('xref-tracker');
  private graph: CrossReferenceGraph;

  constructor() {
    this.graph = {
      definitions: new Map(),
      callSites: new Map(),
    };
  }

  /**
   * Extract cross-references from a parsed AST
   */
  extractReferences(
    tree: Tree,
    filePath: string,
    language: string
  ): { definitions: SymbolDefinition[]; calls: FunctionReference[] } {
    const definitions: SymbolDefinition[] = [];
    const calls: FunctionReference[] = [];
    const callTypes = CALL_EXPRESSION_TYPES[language] || [];
    const defTypes = DEFINITION_TYPES[language] || [];

    // First pass: collect all definitions
    const collectDefinitions = (node: SyntaxNode, scope: string[] = []): void => {
      if (defTypes.includes(node.type)) {
        const name = this.extractName(node, language);
        if (name) {
          const currentScope = [...scope, name];
          const def: SymbolDefinition = {
            name,
            type: this.normalizeType(node.type),
            filePath,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            scope: currentScope,
            calls: [],
            calledBy: [],
          };

          // Extract calls within this definition
          const callsInDef = this.extractCallsFromNode(node, language, callTypes);
          def.calls = [...new Set(callsInDef.map(c => c.name))];

          definitions.push(def);

          // Continue with nested scope
          for (const child of node.children) {
            collectDefinitions(child, currentScope);
          }
          return;
        }
      }

      // Handle class definitions to track scope
      if (this.isClassLike(node.type, language)) {
        const className = this.extractName(node, language);
        const classScope = className ? [...scope, className] : scope;
        for (const child of node.children) {
          collectDefinitions(child, classScope);
        }
        return;
      }

      for (const child of node.children) {
        collectDefinitions(child, scope);
      }
    };

    // Second pass: collect all calls at file level
    const collectCalls = (node: SyntaxNode): void => {
      if (callTypes.includes(node.type)) {
        const ref = this.extractCallReference(node, language);
        if (ref) {
          calls.push(ref);
        }
      }
      for (const child of node.children) {
        collectCalls(child);
      }
    };

    collectDefinitions(tree.rootNode);
    collectCalls(tree.rootNode);

    return { definitions, calls };
  }

  /**
   * Extract calls from within a specific node (for associating with definitions)
   */
  private extractCallsFromNode(
    node: SyntaxNode,
    language: string,
    callTypes: string[]
  ): FunctionReference[] {
    const calls: FunctionReference[] = [];

    const traverse = (n: SyntaxNode): void => {
      if (callTypes.includes(n.type)) {
        const ref = this.extractCallReference(n, language);
        if (ref) {
          calls.push(ref);
        }
      }
      for (const child of n.children) {
        traverse(child);
      }
    };

    traverse(node);
    return calls;
  }

  /**
   * Extract a function reference from a call expression node
   */
  private extractCallReference(node: SyntaxNode, language: string): FunctionReference | null {
    let name: string | null = null;
    let receiver: string | undefined;
    let isMethodCall = false;

    // Handle different call patterns
    if (language === 'python') {
      if (node.type === 'call') {
        const func = node.childForFieldName('function');
        if (func) {
          if (func.type === 'attribute') {
            // obj.method()
            const attr = func.childForFieldName('attribute');
            const obj = func.childForFieldName('object');
            name = attr?.text ?? null;
            receiver = obj?.text;
            isMethodCall = true;
          } else if (func.type === 'identifier') {
            name = func.text;
          }
        }
      }
    } else if (language === 'typescript' || language === 'javascript') {
      if (node.type === 'call_expression') {
        const func = node.childForFieldName('function');
        if (func) {
          if (func.type === 'member_expression') {
            // obj.method() or obj.prop.method()
            const prop = func.childForFieldName('property');
            const obj = func.childForFieldName('object');
            name = prop?.text ?? null;
            receiver = obj?.text;
            isMethodCall = true;
          } else if (func.type === 'identifier') {
            name = func.text;
          }
        }
      } else if (node.type === 'new_expression') {
        const constructor = node.childForFieldName('constructor');
        name = constructor?.text ?? null;
      }
    } else if (language === 'java') {
      if (node.type === 'method_invocation') {
        const methodName = node.childForFieldName('name');
        const obj = node.childForFieldName('object');
        name = methodName?.text ?? null;
        receiver = obj?.text;
        isMethodCall = !!obj;
      }
    } else if (language === 'go') {
      if (node.type === 'call_expression') {
        const func = node.childForFieldName('function');
        if (func) {
          if (func.type === 'selector_expression') {
            const field = func.childForFieldName('field');
            const operand = func.childForFieldName('operand');
            name = field?.text ?? null;
            receiver = operand?.text;
            isMethodCall = true;
          } else if (func.type === 'identifier') {
            name = func.text;
          }
        }
      }
    } else if (language === 'rust') {
      if (node.type === 'call_expression') {
        const func = node.childForFieldName('function');
        name = func?.text ?? null;
      } else if (node.type === 'method_call_expression') {
        const method = node.childForFieldName('name');
        name = method?.text ?? null;
        isMethodCall = true;
      }
    } else {
      // Generic fallback: try common field names
      const func = node.childForFieldName('function') || node.childForFieldName('name');
      if (func) {
        // Check if it's a member access
        if (func.type.includes('member') || func.type.includes('selector')) {
          const prop = func.childForFieldName('property') || func.childForFieldName('field');
          name = prop?.text ?? func.text;
          isMethodCall = true;
        } else {
          name = func.text;
        }
      }
    }

    if (!name) return null;

    // Filter out common built-ins and noise
    if (this.isBuiltInOrNoise(name, language)) return null;

    return {
      name,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      callExpression: node.text.slice(0, 100), // Truncate long expressions
      isMethodCall,
      receiver,
    };
  }

  /**
   * Extract name from a definition node
   */
  private extractName(node: SyntaxNode, _language: string): string | null {
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
    }

    return null;
  }

  /**
   * Check if node type represents a class-like construct
   */
  private isClassLike(type: string, _language: string): boolean {
    return [
      'class_declaration',
      'class_definition',
      'class_specifier',
      'impl_item',
      'interface_declaration',
      'interface_type',
    ].includes(type);
  }

  /**
   * Normalize definition type across languages
   */
  private normalizeType(type: string): string {
    const typeMap: Record<string, string> = {
      function_declaration: 'function',
      function_definition: 'function',
      function_item: 'function',
      arrow_function: 'function',
      method_definition: 'method',
      method_declaration: 'method',
      constructor_declaration: 'constructor',
      singleton_method: 'method',
    };
    return typeMap[type] || type;
  }

  /**
   * Filter out built-in functions and noise
   */
  private isBuiltInOrNoise(name: string, _language: string): boolean {
    const commonBuiltIns = new Set([
      'console',
      'log',
      'error',
      'warn',
      'info',
      'debug',
      'print',
      'println',
      'printf',
      'sprintf',
      'require',
      'import',
      'export',
      'default',
      'toString',
      'valueOf',
      'hasOwnProperty',
      'length',
      'push',
      'pop',
      'shift',
      'unshift',
      'slice',
      'splice',
      'map',
      'filter',
      'reduce',
      'forEach',
      'find',
      'findIndex',
      'some',
      'every',
      'includes',
      'indexOf',
      'join',
      'split',
      'trim',
      'replace',
      'match',
      'test',
      'exec',
      'JSON',
      'parse',
      'stringify',
      'Object',
      'Array',
      'String',
      'Number',
      'Boolean',
      'Date',
      'Math',
      'Promise',
      'async',
      'await',
      'then',
      'catch',
      'finally',
      // Python
      'len',
      'str',
      'int',
      'float',
      'list',
      'dict',
      'set',
      'tuple',
      'range',
      'enumerate',
      'zip',
      'open',
      'read',
      'write',
      'close',
      'append',
      'extend',
      'keys',
      'values',
      'items',
      'get',
      'format',
      'isinstance',
      'type',
      'super',
      'self',
      '__init__',
      '__str__',
      '__repr__',
      // Go
      'make',
      'new',
      'append',
      'copy',
      'delete',
      'panic',
      'recover',
      'fmt',
      'Println',
      'Printf',
      'Sprintf',
      // Rust
      'unwrap',
      'expect',
      'clone',
      'into',
      'from',
      'as_ref',
      'as_mut',
      'iter',
      'collect',
      'ok',
      'err',
    ]);

    // Short names are usually noise
    if (name.length <= 2) return true;

    return commonBuiltIns.has(name);
  }

  /**
   * Add a file's references to the graph
   */
  addToGraph(filePath: string, definitions: SymbolDefinition[], calls: FunctionReference[]): void {
    // Add definitions
    for (const def of definitions) {
      const fqn = this.getFullyQualifiedName(def);
      this.graph.definitions.set(fqn, def);
    }

    // Track call sites
    for (const call of calls) {
      if (!this.graph.callSites.has(call.name)) {
        this.graph.callSites.set(call.name, []);
      }

      // Find which definition this call is inside
      const callerDef = definitions.find(d => call.line >= d.startLine && call.line <= d.endLine);

      this.graph.callSites.get(call.name)!.push({
        file: filePath,
        line: call.line,
        caller: callerDef ? this.getFullyQualifiedName(callerDef) : 'module',
      });
    }
  }

  /**
   * Build the reverse mapping (calledBy) after all files are processed
   */
  buildReverseReferences(): void {
    // For each call site, update the calledBy of the target if it exists
    for (const [symbolName, sites] of this.graph.callSites) {
      // Find definitions matching this symbol name
      for (const [fqn, def] of this.graph.definitions) {
        if (def.name === symbolName || fqn.endsWith(`.${symbolName}`)) {
          for (const site of sites) {
            if (!def.calledBy.includes(site.caller)) {
              def.calledBy.push(site.caller);
            }
          }
        }
      }
    }

    this.log.info(
      `Built cross-reference graph: ${this.graph.definitions.size} definitions, ` +
        `${this.graph.callSites.size} unique symbols called`
    );
  }

  /**
   * Get fully qualified name for a definition
   */
  private getFullyQualifiedName(def: SymbolDefinition): string {
    return def.scope.join('.');
  }

  /**
   * Get the graph for serialization
   */
  getGraph(): CrossReferenceGraph {
    return this.graph;
  }

  /**
   * Get callers of a function/method
   */
  getCallers(symbolName: string): Array<{ file: string; line: number; caller: string }> {
    return this.graph.callSites.get(symbolName) || [];
  }

  /**
   * Get what a function calls
   */
  getCallees(fqn: string): string[] {
    const def = this.graph.definitions.get(fqn);
    return def?.calls || [];
  }

  /**
   * Serialize graph for storage
   */
  serialize(): string {
    const data = {
      definitions: Object.fromEntries(this.graph.definitions),
      callSites: Object.fromEntries(this.graph.callSites),
    };
    return JSON.stringify(data);
  }

  /**
   * Deserialize graph from storage
   */
  deserialize(data: string): void {
    const parsed = JSON.parse(data) as {
      definitions: Record<string, SymbolDefinition>;
      callSites: Record<string, Array<{ file: string; line: number; caller: string }>>;
    };
    this.graph.definitions = new Map(Object.entries(parsed.definitions));
    this.graph.callSites = new Map(Object.entries(parsed.callSites));
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.graph.definitions.clear();
    this.graph.callSites.clear();
  }
}
