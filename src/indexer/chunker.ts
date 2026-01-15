import { ASTParser, ParsedNode } from './parser.js';
import { Config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { createHash } from 'crypto';

export interface CodeChunk {
  id: string;
  filePath: string;
  relativePath: string;
  code: string;
  startLine: number;
  endLine: number;
  language: string;
  type: string;
  name: string | null;
  scope: string;
  docstring: string | null;
  tokenEstimate: number;
}

export class SemanticChunker {
  private parser: ASTParser;
  private config: Config;
  private log = logger.child('chunker');

  constructor(config: Config, languagesDir?: string) {
    this.config = config;
    this.parser = new ASTParser(languagesDir);
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
    const chunks: CodeChunk[] = [];

    if (nodes.length === 0) {
      // No extractable nodes, use fallback
      return this.fallbackChunk(filePath, relativePath, content, language);
    }

    for (const node of nodes) {
      const chunk = this.nodeToChunk(node, filePath, relativePath, language);

      // Check if chunk is too large and needs splitting
      if (chunk.tokenEstimate > this.config.maxChunkTokens) {
        const subChunks = this.splitLargeChunk(chunk, content);
        chunks.push(...subChunks);
      } else if (chunk.tokenEstimate >= this.config.minChunkLines * 10) {
        // Only include chunks with sufficient content
        chunks.push(chunk);
      }
    }

    // If no chunks were created from AST, use fallback
    if (chunks.length === 0) {
      return this.fallbackChunk(filePath, relativePath, content, language);
    }

    this.log.debug(`Created ${chunks.length} chunks from ${relativePath}`);
    return chunks;
  }

  private nodeToChunk(
    node: ParsedNode,
    filePath: string,
    relativePath: string,
    language: string
  ): CodeChunk {
    const scope = node.scope.join('.');
    const tokenEstimate = this.estimateTokens(node.text);

    // Create context-enriched text for better embeddings
    let enrichedText = '';

    // Add scope context
    if (scope) {
      enrichedText += `// Scope: ${scope}\n`;
    }

    // Add docstring if available
    if (node.docstring) {
      enrichedText += node.docstring + '\n';
    }

    enrichedText += node.text;

    const id = this.generateChunkId(filePath, node.startLine, node.endLine, node.text);

    return {
      id,
      filePath,
      relativePath,
      code: enrichedText,
      startLine: node.startLine,
      endLine: node.endLine,
      language,
      type: this.normalizeNodeType(node.type),
      name: node.name,
      scope,
      docstring: node.docstring,
      tokenEstimate,
    };
  }

  private splitLargeChunk(chunk: CodeChunk, fullContent: string): CodeChunk[] {
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
    return {
      id: this.generateChunkId(parent.filePath, startLine, endLine, code),
      filePath: parent.filePath,
      relativePath: parent.relativePath,
      code,
      startLine,
      endLine,
      language: parent.language,
      type: parent.type,
      name: parent.name ? `${parent.name}_part${index}` : null,
      scope: parent.scope,
      docstring: index === 0 ? parent.docstring : null,
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
