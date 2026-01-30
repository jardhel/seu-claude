import { ASTParser, ParsedNode } from './parser.js';
import { CrossReferenceTracker } from './xref-tracker.js';
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
    const chunks: CodeChunk[] = [];

    // Extract cross-references for this file
    const { definitions, calls } = this.xrefTracker.extractReferences(tree, filePath, language);
    this.xrefTracker.addToGraph(filePath, definitions, calls);

    if (nodes.length === 0) {
      // No extractable nodes, use fallback
      return this.fallbackChunk(filePath, relativePath, content, language);
    }

    for (const node of nodes) {
      const chunk = this.nodeToChunk(node, filePath, relativePath, language);

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
    language: string
  ): CodeChunk {
    const scope = node.scope.join('.');
    const tokenEstimate = this.estimateTokens(node.text);

    // Create context-enriched text for better embeddings
    let enrichedText = '';

    // Add scope context
    if (scope) {
      enrichedText += `${this.getCommentPrefix(language)} Scope: ${scope}\n`;
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

  private splitLargeChunk(chunk: CodeChunk, _fullContent: string): CodeChunk[] {
    const nodeText = this.extractOriginalNodeText(chunk);
    const nodeLines = nodeText.split('\n');

    if (nodeLines.length === 0 || nodeText.trim().length === 0) {
      return [];
    }

    const chunks: CodeChunk[] = [];
    const maxChars = Math.max(1, this.config.maxChunkTokens) * 4;

    // Precompute cumulative line lengths for fast slice-length estimation
    const cumulativeLineLengths: number[] = new Array(nodeLines.length + 1);
    cumulativeLineLengths[0] = 0;
    for (let i = 0; i < nodeLines.length; i++) {
      cumulativeLineLengths[i + 1] = cumulativeLineLengths[i] + nodeLines[i].length;
    }

    const sliceLength = (start: number, end: number): number => {
      const count = end - start;
      if (count <= 0) return 0;
      const chars = cumulativeLineLengths[end] - cumulativeLineLengths[start];
      const newlines = count - 1;
      return chars + newlines;
    };

    let startIndex = 0;
    let partIndex = 0;

    while (startIndex < nodeLines.length) {
      const header = this.buildSplitChunkHeader(chunk, nodeLines, partIndex);
      const headerLength = header.length + 2; // + "\n\n" separator before body
      const availableBodyChars = Math.max(0, maxChars - headerLength);

      let endIndex = startIndex;
      while (endIndex < nodeLines.length) {
        const nextEnd = endIndex + 1;
        const bodyChars = sliceLength(startIndex, nextEnd);

        // Always include at least one line to guarantee progress
        if (bodyChars > availableBodyChars && endIndex > startIndex) {
          break;
        }

        endIndex = nextEnd;

        if (bodyChars >= availableBodyChars) {
          break;
        }
      }

      const body = nodeLines.slice(startIndex, endIndex).join('\n');
      const code = `${header}\n\n${body}`;

      const subChunk = this.createSubChunk(
        chunk,
        code,
        chunk.startLine + startIndex,
        chunk.startLine + endIndex - 1,
        partIndex
      );
      chunks.push(subChunk);

      if (endIndex >= nodeLines.length) {
        break;
      }

      const chunkLineCount = endIndex - startIndex;
      const overlapRatio = this.clampOverlapRatio(this.config.chunkOverlapRatio);
      let overlapLines =
        chunkLineCount > 1 ? Math.max(1, Math.floor(chunkLineCount * overlapRatio)) : 0;
      overlapLines = Math.min(overlapLines, Math.max(0, chunkLineCount - 1));

      startIndex = endIndex - overlapLines;
      partIndex += 1;
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
      calls: parent.calls,
      calledBy: parent.calledBy,
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
    const chunkSize = Math.max(1, Math.floor(this.config.maxChunkTokens / 4));
    const overlapRatio = this.clampOverlapRatio(this.config.chunkOverlapRatio);
    const overlap = Math.min(chunkSize - 1, Math.floor(chunkSize * overlapRatio));
    const step = Math.max(1, chunkSize - overlap);

    for (let i = 0; i < lines.length; i += step) {
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

  private getCommentPrefix(language: string): string {
    switch (language) {
      case 'python':
      case 'ruby':
        return '#';
      default:
        return '//';
    }
  }

  private clampOverlapRatio(ratio: number): number {
    if (Number.isNaN(ratio)) return 0;
    return Math.max(0, Math.min(0.9, ratio));
  }

  private extractOriginalNodeText(chunk: CodeChunk): string {
    let text = chunk.code;

    if (chunk.scope) {
      const scopeLine = `${this.getCommentPrefix(chunk.language)} Scope: ${chunk.scope}\n`;
      if (text.startsWith(scopeLine)) {
        text = text.slice(scopeLine.length);
      }
    }

    if (chunk.docstring) {
      const docPrefix = chunk.docstring + '\n';
      if (text.startsWith(docPrefix)) {
        text = text.slice(docPrefix.length);
      }
    }

    return text;
  }

  private buildSplitChunkHeader(chunk: CodeChunk, nodeLines: string[], partIndex: number): string {
    const prefix = this.getCommentPrefix(chunk.language);
    const headerLines: string[] = [];

    if (chunk.scope) {
      headerLines.push(`${prefix} Scope: ${chunk.scope}`);
    }

    if (chunk.name || chunk.type) {
      const symbol = [chunk.type, chunk.name].filter(Boolean).join(' ');
      if (symbol.trim().length > 0) {
        headerLines.push(`${prefix} Symbol: ${symbol}`);
      }
    }

    if (chunk.docstring) {
      const preview = this.getDocstringPreview(chunk.docstring);
      if (preview) {
        headerLines.push(`${prefix} Doc: ${preview}`);
      }
    }

    headerLines.push(`${prefix} Part: ${partIndex + 1}`);

    if (partIndex > 0) {
      const groundingLines = nodeLines.slice(0, Math.max(0, this.config.chunkGroundingLines));
      if (groundingLines.length > 0) {
        headerLines.push(`${prefix} Grounding (start of symbol):`);
        for (const line of groundingLines) {
          headerLines.push(line.length > 0 ? `${prefix} ${line}` : `${prefix}`);
        }
      }
    }

    return headerLines.join('\n');
  }

  private getDocstringPreview(docstring: string): string {
    const maxChars = 200;
    const cleaned = docstring
      .split('\n')
      .map(line =>
        line
          .trim()
          .replace(/^\/\*\*?/, '')
          .replace(/^\*\/$/, '')
          .replace(/^\*/, '')
          .replace(/^\/\//, '')
          .replace(/^#/, '')
          .replace(/^'''/, '')
          .replace(/^"""/, '')
          .trim()
      )
      .filter(Boolean);

    const preview = cleaned.join(' ').trim();
    if (preview.length <= maxChars) return preview;
    return preview.slice(0, maxChars - 3).trimEnd() + '...';
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
