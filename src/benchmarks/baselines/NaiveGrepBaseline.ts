/**
 * NaiveGrepBaseline - Simple grep-based baseline for benchmark comparison
 *
 * Provides a lower bound for benchmark results by using simple
 * pattern matching without semantic understanding.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import type { IBaseline } from '../framework/types.js';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Search result from grep
 */
export interface GrepResult {
  file: string;
  line: number;
  content: string;
  score: number;
}

/**
 * Dependency info from naive analysis
 */
export interface NaiveDependencyInfo {
  imports: string[];
  exports: string[];
  dependencies: string[];
}

export class NaiveGrepBaseline implements IBaseline {
  readonly name = 'naive-grep';
  readonly description = 'Simple grep-based baseline without semantic understanding';

  private log = logger.child('naive-grep-baseline');
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Search for a symbol using grep
   */
  async search(
    query: string,
    options?: { limit?: number; fileTypes?: string[] }
  ): Promise<GrepResult[]> {
    const limit = options?.limit ?? 20;
    const fileTypes = options?.fileTypes ?? ['ts', 'tsx', 'js', 'jsx', 'py'];
    const results: GrepResult[] = [];

    try {
      // Build grep command with file type filters
      const includeArgs = fileTypes.map(t => `--include="*.${t}"`).join(' ');
      const cmd = `grep -rn ${includeArgs} "${query}" "${this.projectRoot}" 2>/dev/null | head -${limit * 2}`;

      const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });

      const lines = stdout.split('\n').filter(l => l.trim());

      for (const line of lines) {
        // Parse grep output: file:line:content
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          const [, file, lineNum, content] = match;
          results.push({
            file,
            line: parseInt(lineNum, 10),
            content: content.trim(),
            score: this.calculateScore(query, content),
          });
        }
      }

      // Sort by score and limit
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
    } catch (error) {
      this.log.warn(`Grep search failed: ${error}`);
      return [];
    }
  }

  /**
   * Analyze dependencies using simple regex
   */
  async analyzeDependencies(filePath: string): Promise<NaiveDependencyInfo> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const ext = extname(filePath);

      const imports: string[] = [];
      const exports: string[] = [];
      const dependencies: string[] = [];

      if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        // JavaScript/TypeScript imports
        const importRegex =
          /import\s+(?:(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          imports.push(match[1]);
          if (!match[1].startsWith('.') && !match[1].startsWith('/')) {
            dependencies.push(match[1].split('/')[0]);
          }
        }

        // Require statements
        const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
          imports.push(match[1]);
          if (!match[1].startsWith('.') && !match[1].startsWith('/')) {
            dependencies.push(match[1].split('/')[0]);
          }
        }

        // Exports
        const exportRegex = /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g;
        while ((match = exportRegex.exec(content)) !== null) {
          exports.push(match[1]);
        }
      } else if (ext === '.py') {
        // Python imports
        const importRegex = /^(?:from\s+(\S+)\s+)?import\s+(.+)$/gm;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          if (match[1]) {
            imports.push(match[1]);
            dependencies.push(match[1].split('.')[0]);
          } else {
            const modules = match[2].split(',').map(m => m.trim().split(' ')[0]);
            imports.push(...modules);
            dependencies.push(...modules.map(m => m.split('.')[0]));
          }
        }

        // Python function/class definitions (rough export detection)
        const defRegex = /^(?:def|class)\s+(\w+)/gm;
        while ((match = defRegex.exec(content)) !== null) {
          exports.push(match[1]);
        }
      }

      return {
        imports: [...new Set(imports)],
        exports: [...new Set(exports)],
        dependencies: [...new Set(dependencies)],
      };
    } catch (error) {
      this.log.warn(`Dependency analysis failed for ${filePath}: ${error}`);
      return { imports: [], exports: [], dependencies: [] };
    }
  }

  /**
   * Find function definitions using regex
   */
  async findFunctionDefinitions(
    symbolName: string,
    searchPath: string
  ): Promise<Array<{ file: string; line: number; type: string }>> {
    const results: Array<{ file: string; line: number; type: string }> = [];

    try {
      // Search for function/method/class definitions
      const patterns = [
        `function\\s+${symbolName}\\s*\\(`, // JS function
        `\\b${symbolName}\\s*=\\s*(?:async\\s+)?(?:\\([^)]*\\)|\\w+)\\s*=>`, // Arrow function
        `\\b${symbolName}\\s*:\\s*(?:async\\s+)?function`, // Object method
        `class\\s+${symbolName}\\b`, // Class
        `def\\s+${symbolName}\\s*\\(`, // Python function
        `fn\\s+${symbolName}\\s*\\(`, // Rust function
        `func\\s+${symbolName}\\s*\\(`, // Go function
      ];

      for (const pattern of patterns) {
        const cmd = `grep -rn -E '${pattern}' "${searchPath}" 2>/dev/null | head -10`;
        try {
          const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
          const lines = stdout.split('\n').filter(l => l.trim());

          for (const line of lines) {
            const match = line.match(/^(.+?):(\d+):/);
            if (match) {
              const type = line.includes('class') ? 'class' : 'function';
              results.push({
                file: match[1],
                line: parseInt(match[2], 10),
                type,
              });
            }
          }
        } catch {
          // Pattern didn't match, continue
        }
      }

      return results;
    } catch (error) {
      this.log.warn(`Function definition search failed: ${error}`);
      return [];
    }
  }

  /**
   * Find function calls using regex
   */
  async findFunctionCalls(
    symbolName: string,
    searchPath: string
  ): Promise<Array<{ file: string; line: number }>> {
    const results: Array<{ file: string; line: number }> = [];

    try {
      // Search for function calls (name followed by parenthesis)
      const cmd = `grep -rn '\\b${symbolName}\\s*(' "${searchPath}" 2>/dev/null | head -50`;
      const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });

      const lines = stdout.split('\n').filter(l => l.trim());

      for (const line of lines) {
        const match = line.match(/^(.+?):(\d+):/);
        if (match) {
          // Filter out definitions (rough heuristic)
          if (!line.includes('function ') && !line.includes('def ') && !line.includes('class ')) {
            results.push({
              file: match[1],
              line: parseInt(match[2], 10),
            });
          }
        }
      }

      return results;
    } catch (error) {
      this.log.warn(`Function call search failed: ${error}`);
      return [];
    }
  }

  /**
   * Calculate relevance score based on query match quality
   */
  private calculateScore(query: string, content: string): number {
    const lowerQuery = query.toLowerCase();
    const lowerContent = content.toLowerCase();

    // Exact match
    if (content.includes(query)) {
      return 1.0;
    }

    // Case-insensitive match
    if (lowerContent.includes(lowerQuery)) {
      return 0.8;
    }

    // Word boundary match
    const wordRegex = new RegExp(`\\b${this.escapeRegex(lowerQuery)}\\b`, 'i');
    if (wordRegex.test(content)) {
      return 0.9;
    }

    // Partial match
    const words = lowerQuery.split(/\s+/);
    const matchedWords = words.filter(w => lowerContent.includes(w));
    return (matchedWords.length / words.length) * 0.5;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
