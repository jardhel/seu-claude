import { ASTParser, ParsedNode } from './parser.js';
import { CrossReferenceTracker } from './xref-tracker.js';
import { Config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { createHash } from 'crypto';
import type { SyntaxNode, Tree } from 'web-tree-sitter';

export interface CodeChunk {
  id: string;
  filePath: string;
  relativePath: string;
  code: string;
  /**
   * Optional enriched text used for embeddings/BM25.
   * Kept separate from `code` so `startLine/endLine` continue to match the real file snippet.
   */
  indexText?: string;
  /**
   * Optional file-level context (typically imports/headers) used to build `indexText`.
   * Not persisted to the vector store.
   */
  fileContext?: string;
  startLine: number;
  endLine: number;
  language: string;
  type: string;
  name: string | null;
  scope: string;
  docstring: string | null;
  tokenEstimate: number;
  /** Functions/methods this chunk calls */
  calls?: string[];
  /** Functions/methods that call code in this chunk */
  calledBy?: string[];
}

export class SemanticChunker {
  private parser: ASTParser;
  private xrefTracker: CrossReferenceTracker;
  private config: Config;
  private log = logger.child('chunker');

  constructor(config: Config, languagesDir?: string) {
    this.config = config;
    this.parser = new ASTParser(languagesDir);
    this.xrefTracker = new CrossReferenceTracker();
  }

  async initialize(): Promise<void> {
    await this.parser.initialize();
  }

  async chunkFile(
    filePath: string,
    relativePath: string,
    content: string,
    language: string
  ): Promise<CodeChunk[]> {
    const tree = await this.parser.parse(content, language);

    if (!tree) {
      // Fallback to simple chunking if parsing fails
      return this.fallbackChunk(filePath, relativePath, content, language);
    }

    const nodes = this.parser.extractNodes(tree, language);
    const fileContext = this.extractFileContext(content, language, tree);
    const chunks: CodeChunk[] = [];

    // Extract cross-references for this file
    const { definitions, calls } = this.xrefTracker.extractReferences(tree, filePath, language);
    this.xrefTracker.addToGraph(filePath, definitions, calls);

    if (nodes.length === 0) {
      // No extractable nodes, use fallback
      return this.fallbackChunk(filePath, relativePath, content, language);
    }

    const structuralChunks: CodeChunk[] = [];
    for (const node of nodes) {
      const chunk = this.nodeToChunk(node, filePath, relativePath, language, fileContext?.text);

      // Enrich chunk with cross-reference data
      const matchingDef = definitions.find(
        d => d.startLine === node.startLine && d.name === node.name
      );
      if (matchingDef) {
        chunk.calls = matchingDef.calls;
        chunk.calledBy = matchingDef.calledBy;
      }

      // Check if chunk is too large and needs splitting
      if (chunk.tokenEstimate > this.config.maxChunkTokens) {
        const subChunks = this.splitLargeChunk(chunk, content);
        structuralChunks.push(...subChunks);
      } else if (chunk.tokenEstimate >= this.config.minChunkLines * 10) {
        // Only include chunks with sufficient content
        structuralChunks.push(chunk);
      }
    }

    // If no usable chunks were created from AST, use fallback
    if (structuralChunks.length === 0) {
      return this.fallbackChunk(filePath, relativePath, content, language);
    }

    // Add a small file-level chunk so imports/headers are searchable directly.
    if (fileContext) {
      const headerChunk = this.createFileContextChunk(
        filePath,
        relativePath,
        language,
        fileContext.text,
        fileContext.endLine
      );
      if (headerChunk) {
        chunks.push(headerChunk);
      }
    }

    chunks.push(...structuralChunks);
    this.log.debug(`Created ${chunks.length} chunks from ${relativePath}`);
    return chunks;
  }

  /**
   * Build reverse references after all files are processed
   */
  finalizeXrefs(): void {
    this.xrefTracker.buildReverseReferences();
  }

  /**
   * Get the cross-reference tracker for serialization
   */
  getXrefTracker(): CrossReferenceTracker {
    return this.xrefTracker;
  }

  private nodeToChunk(
    node: ParsedNode,
    filePath: string,
    relativePath: string,
    language: string,
    fileContext?: string
  ): CodeChunk {
    const scope = node.scope.join('.');
    const code = node.text;
    const tokenEstimate = this.estimateTokens(code);

    const id = this.generateChunkId(filePath, node.startLine, node.endLine, node.text);
    const type = this.normalizeNodeType(node.type);
    const normalizedFileContext = this.truncateFileContext(fileContext);
    const indexText = this.buildIndexText({
      fileContext: normalizedFileContext,
      scope,
      docstring: node.docstring,
      code,
      language,
      relativePath,
      type,
      name: node.name,
    });

    return {
      id,
      filePath,
      relativePath,
      code,
      indexText,
      fileContext: normalizedFileContext,
      startLine: node.startLine,
      endLine: node.endLine,
      language,
      type,
      name: node.name,
      scope,
      docstring: node.docstring,
      tokenEstimate,
    };
  }

  private splitLargeChunk(chunk: CodeChunk, _fullContent: string): CodeChunk[] {
    const lines = chunk.code.split('\n');
    const chunks: CodeChunk[] = [];
    const maxLines = Math.floor(this.config.maxChunkTokens / 4); // Rough estimate: 4 tokens per line

    let currentLines: string[] = [];
    let currentStartLine = chunk.startLine;

    for (let i = 0; i < lines.length; i++) {
      currentLines.push(lines[i]);

      if (currentLines.length >= maxLines) {
        const subChunk = this.createSubChunk(
          chunk,
          currentLines.join('\n'),
          currentStartLine,
          currentStartLine + currentLines.length - 1,
          chunks.length
        );
        chunks.push(subChunk);
        currentLines = [];
        currentStartLine = chunk.startLine + i + 1;
      }
    }

    // Don't forget remaining lines
    if (currentLines.length > 0) {
      const subChunk = this.createSubChunk(
        chunk,
        currentLines.join('\n'),
        currentStartLine,
        currentStartLine + currentLines.length - 1,
        chunks.length
      );
      chunks.push(subChunk);
    }

    return chunks;
  }

  private createSubChunk(
    parent: CodeChunk,
    code: string,
    startLine: number,
    endLine: number,
    index: number
  ): CodeChunk {
    const docstring = index === 0 ? parent.docstring : null;
    const indexText = this.buildIndexText({
      fileContext: parent.fileContext,
      scope: parent.scope,
      docstring,
      code,
      language: parent.language,
      relativePath: parent.relativePath,
      type: parent.type,
      name: parent.name,
    });

    return {
      id: this.generateChunkId(parent.filePath, startLine, endLine, code),
      filePath: parent.filePath,
      relativePath: parent.relativePath,
      code,
      indexText,
      fileContext: parent.fileContext,
      startLine,
      endLine,
      language: parent.language,
      type: parent.type,
      name: parent.name ? `${parent.name}_part${index}` : null,
      scope: parent.scope,
      docstring,
      tokenEstimate: this.estimateTokens(code),
    };
  }

  private fallbackChunk(
    filePath: string,
    relativePath: string,
    content: string,
    language: string
  ): CodeChunk[] {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];
    const chunkSize = Math.floor(this.config.maxChunkTokens / 4);
    const overlap = Math.floor(chunkSize / 4);

    for (let i = 0; i < lines.length; i += chunkSize - overlap) {
      const chunkLines = lines.slice(i, i + chunkSize);
      const code = chunkLines.join('\n');
      const startLine = i + 1;
      const endLine = Math.min(i + chunkSize, lines.length);

      if (code.trim().length > 0) {
        chunks.push({
          id: this.generateChunkId(filePath, startLine, endLine, code),
          filePath,
          relativePath,
          code,
          indexText: code,
          startLine,
          endLine,
          language,
          type: 'block',
          name: null,
          scope: relativePath,
          docstring: null,
          tokenEstimate: this.estimateTokens(code),
        });
      }
    }

    return chunks;
  }

  private createFileContextChunk(
    filePath: string,
    relativePath: string,
    language: string,
    fileContextText: string,
    endLine: number
  ): CodeChunk | null {
    const text = this.truncateFileContext(fileContextText)?.trim();
    if (!text) return null;

    const type = 'file_context';
    const id = this.generateChunkId(filePath, 1, endLine, text);

    return {
      id,
      filePath,
      relativePath,
      code: text,
      indexText: text,
      fileContext: text,
      startLine: 1,
      endLine: Math.max(1, endLine),
      language,
      type,
      name: null,
      scope: relativePath,
      docstring: null,
      tokenEstimate: this.estimateTokens(text),
    };
  }

  private buildIndexText(input: {
    fileContext?: string;
    scope: string;
    docstring: string | null;
    code: string;
    language: string;
    relativePath: string;
    type: string;
    name: string | null;
  }): string {
    const parts: string[] = [];

    if (input.fileContext && input.fileContext.trim()) {
      parts.push(input.fileContext.trimEnd());
    }

    // Add lightweight metadata that helps embeddings without polluting the code snippet.
    const meta: string[] = [];
    meta.push(`// File: ${input.relativePath}`);
    meta.push(`// Type: ${input.type}${input.name ? ` (${input.name})` : ''}`);
    if (input.scope) meta.push(`// Scope: ${input.scope}`);
    parts.push(meta.join('\n'));

    if (input.docstring) {
      parts.push(input.docstring);
    }

    parts.push(input.code);

    return parts.filter(Boolean).join('\n\n');
  }

  private truncateFileContext(text?: string): string | undefined {
    if (!text) return undefined;

    // Keep file-context small; we primarily want imports/headers and key module-level constants.
    const maxTokens = Math.min(128, Math.floor(this.config.maxChunkTokens / 4));
    const trimmed = text.trimEnd();
    if (this.estimateTokens(trimmed) <= maxTokens) {
      return trimmed;
    }

    const lines = trimmed.split('\n');
    const headLines = Math.min(20, lines.length);
    const tailLines = Math.min(40, Math.max(0, lines.length - headLines));

    const head = lines.slice(0, headLines);
    const tail = tailLines > 0 ? lines.slice(-tailLines) : [];
    const combined = [...head, ...(tail.length > 0 ? ['// ...'] : []), ...tail].join('\n').trimEnd();

    if (this.estimateTokens(combined) <= maxTokens) {
      return combined;
    }

    // Rough truncate by characters (~4 chars per token)
    const maxChars = maxTokens * 4;
    return combined.slice(0, maxChars).trimEnd();
  }

  private extractFileContext(
    content: string,
    language: string,
    tree?: Tree
  ): { text: string; endLine: number } | null {
    if ((language === 'typescript' || language === 'javascript') && tree) {
      return this.extractFileContextFromTree(content, tree);
    }

    const lines = content.split('\n');
    const maxScanLines = 80;
    let endLine = 0;

    for (let i = 0; i < Math.min(lines.length, maxScanLines); i++) {
      const line = lines[i];
      if (this.isFileContextLine(line, language)) {
        endLine = i + 1;
        continue;
      }
      // Stop at first non-header-ish line
      break;
    }

    if (endLine === 0) return null;

    const rawText = lines.slice(0, endLine).join('\n').trimEnd();
    const text = this.truncateFileContext(rawText);
    if (!text?.trim()) return null;

    return { text, endLine };
  }

  private extractFileContextFromTree(
    content: string,
    tree: Tree
  ): { text: string; endLine: number } | null {
    const root = tree.rootNode;
    const candidates: SyntaxNode[] = [];
    let endLine = 0;

    for (const child of root.namedChildren) {
      if (!this.isFileContextNode(child)) {
        continue;
      }

      candidates.push(child);
      endLine = Math.max(endLine, child.endPosition.row + 1);

      // Prevent pathological cases; we only want "header-ish" context, not the whole module.
      if (endLine >= 200) break;
    }

    if (candidates.length === 0 || endLine === 0) return null;

    // Use the real file prefix up to the last context node so line numbers still roughly make sense.
    const lines = content.split('\n');
    const rawText = lines.slice(0, Math.min(endLine, lines.length)).join('\n').trimEnd();
    const text = this.truncateFileContext(rawText);

    if (!text?.trim()) return null;
    return { text, endLine };
  }

  private isFileContextNode(node: SyntaxNode): boolean {
    const t = node.type;
    if (
      t === 'comment' ||
      t === 'import_statement' ||
      t === 'lexical_declaration' ||
      t === 'variable_declaration'
    ) {
      return true;
    }

    if (t === 'expression_statement') {
      // Common top-level side effects like `'use strict';` or `require('x')`
      const text = node.text.trim();
      if (/^(['"])use strict\1;?$/.test(text)) return true;
      if (/^(require|import)\s*\(/.test(text)) return true;
      // Allow a few other top-level statements (dotenv.config(), etc.) without being overly strict.
      return true;
    }

    // TS-only directive; safe to treat as context
    if (t === 'hash_bang_line' || t === 'jsx_fragment') {
      return true;
    }

    // Avoid including things like function/class declarations here.
    return false;
  }

  private isFileContextLine(line: string, language: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true;

    // Common comment styles
    if (trimmed.startsWith('//')) return true;
    if (trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('*/'))
      return true;
    if (trimmed.startsWith('#') && language === 'python') return true;

    // Per-language header/import patterns
    switch (language) {
      case 'typescript':
      case 'javascript':
        return (
          /^import\b/.test(trimmed) ||
          /^export\s+.*\sfrom\b/.test(trimmed) ||
          /^export\s+\*\s+from\b/.test(trimmed) ||
          /^(export\s+)?(const|let|var)\b/.test(trimmed) ||
          /^(const|let|var)\s+\w+\s*=\s*require\(/.test(trimmed) ||
          /^require\(/.test(trimmed) ||
          /^['"]use strict['"]/.test(trimmed)
        );

      case 'python':
        return /^(from\s+\S+\s+import\b|import\s+\S+)/.test(trimmed);

      case 'go':
        return /^package\b/.test(trimmed) || /^import\b/.test(trimmed);

      case 'rust':
        return /^(use\s+|extern\s+crate\b|mod\s+)/.test(trimmed);

      case 'java':
        return /^package\b/.test(trimmed) || /^import\b/.test(trimmed);

      case 'c_sharp':
        return /^using\b/.test(trimmed) || /^namespace\b/.test(trimmed);

      case 'c':
      case 'cpp':
        return /^#include\b/.test(trimmed) || /^#define\b/.test(trimmed);

      case 'php':
        return (
          /^<\?php\b/.test(trimmed) ||
          /^(use\s+|require(_once)?\b|include(_once)?\b)/.test(trimmed)
        );

      case 'ruby':
        return /^(require\b|require_relative\b|module\b|class\b)/.test(trimmed);

      default:
        return false;
    }
  }

  private generateChunkId(
    filePath: string,
    startLine: number,
    endLine: number,
    content: string
  ): string {
    const input = `${filePath}:${startLine}:${endLine}:${content}`;
    return createHash('sha256').update(input).digest('hex').slice(0, 16);
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for code
    return Math.ceil(text.length / 4);
  }

  private normalizeNodeType(type: string): string {
    // Normalize different language-specific types to common categories
    const typeMap: Record<string, string> = {
      function_declaration: 'function',
      function_definition: 'function',
      function_item: 'function',
      arrow_function: 'function',
      method_definition: 'method',
      method_declaration: 'method',
      class_declaration: 'class',
      class_definition: 'class',
      class_specifier: 'class',
      interface_declaration: 'interface',
      interface_type: 'interface',
      type_alias_declaration: 'type',
      type_declaration: 'type',
      struct_item: 'struct',
      struct_specifier: 'struct',
      enum_declaration: 'enum',
      enum_item: 'enum',
      enum_specifier: 'enum',
      impl_item: 'impl',
      trait_item: 'trait',
      mod_item: 'module',
      module: 'module',
      namespace_definition: 'namespace',
      namespace_declaration: 'namespace',
      export_statement: 'export',
      decorated_definition: 'decorated',
    };

    return typeMap[type] || type;
  }
}
