import { readFile } from 'fs/promises';
import { VectorStore } from '../vector/store.js';
import { logger } from '../utils/logger.js';

export interface ContextOptions {
  filePath: string;
  symbol?: string;
  startLine?: number;
  endLine?: number;
  contextLines?: number;
}

export interface ContextResult {
  filePath: string;
  symbol?: string;
  code: string;
  startLine: number;
  endLine: number;
  relatedChunks: {
    type: string;
    name: string | null;
    scope: string;
    startLine: number;
    endLine: number;
  }[];
}

export class ReadSemanticContext {
  private store: VectorStore;
  private log = logger.child('read-context');

  constructor(store: VectorStore) {
    this.store = store;
  }

  async execute(options: ContextOptions): Promise<ContextResult> {
    const { filePath, symbol, startLine, endLine, contextLines = 5 } = options;

    this.log.debug(`Reading context for: ${filePath}${symbol ? `:${symbol}` : ''}`);

    try {
      // Read the full file
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // Get indexed chunks for this file
      const chunks = await this.store.getByFilePath(filePath);

      let targetStart = startLine || 1;
      let targetEnd = endLine || lines.length;

      // If symbol is specified, find its location
      if (symbol) {
        const matchingChunk = chunks.find(
          c => c.name === symbol || c.scope.endsWith(symbol)
        );

        if (matchingChunk) {
          targetStart = matchingChunk.startLine;
          targetEnd = matchingChunk.endLine;
        } else {
          // Fallback: search for symbol in content
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(symbol)) {
              targetStart = i + 1;
              targetEnd = Math.min(i + 50, lines.length); // Assume ~50 lines for the symbol
              break;
            }
          }
        }
      }

      // Add context lines
      const contextStart = Math.max(1, targetStart - contextLines);
      const contextEnd = Math.min(lines.length, targetEnd + contextLines);

      // Extract the code
      const code = lines.slice(contextStart - 1, contextEnd).join('\n');

      // Find related chunks (other definitions in the same file)
      const relatedChunks = chunks
        .filter(c => c.startLine !== targetStart) // Exclude the target itself
        .map(c => ({
          type: c.type,
          name: c.name,
          scope: c.scope,
          startLine: c.startLine,
          endLine: c.endLine,
        }));

      return {
        filePath,
        symbol,
        code,
        startLine: contextStart,
        endLine: contextEnd,
        relatedChunks,
      };
    } catch (err) {
      this.log.error('Failed to read context:', err);
      throw err;
    }
  }

  formatForClaude(result: ContextResult): string {
    const header = `## ${result.filePath}${result.symbol ? ` - ${result.symbol}` : ''}`;
    const lineInfo = `Lines ${result.startLine}-${result.endLine}`;
    const code = '```\n' + result.code + '\n```';

    let output = `${header}\n${lineInfo}\n\n${code}`;

    if (result.relatedChunks.length > 0) {
      output += '\n\n### Other definitions in this file:\n';
      for (const chunk of result.relatedChunks) {
        output += `- **${chunk.type}** \`${chunk.name || chunk.scope}\` (lines ${chunk.startLine}-${chunk.endLine})\n`;
      }
    }

    return output;
  }
}
