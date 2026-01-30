# Building a Semantic Search Tool Using Itself: The seu-claude Story

_How we used AI-powered code search to build AI-powered code search_

---

## Introduction

What if you could use the very tool you're building to help build it? That's exactly what we did with **seu-claude** — a semantic code understanding MCP server for Claude Code. This article tells the story of developing Phase 3 of seu-claude while using seu-claude's own features to navigate, understand, and improve the codebase.

This is the ultimate form of dogfooding.

---

## What is seu-claude?

**seu-claude** (Semantic Embedding Utilities for Claude) is an MCP (Model Context Protocol) server that gives Claude Code superpowers for understanding codebases:

- **Semantic Search**: Find code by meaning, not just keywords. Ask "where is user authentication handled?" and get relevant results.
- **Cross-Reference Tracking**: Understand who calls what — trace function calls across your entire codebase.
- **AST-Based Chunking**: Intelligent code splitting that respects function/class boundaries using Tree-sitter.
- **Git-Aware Indexing**: Prioritize recently modified and uncommitted files.

Think of it as giving Claude Code a mental map of your codebase.

---

## The Challenge: Phase 3 — Enhanced Search

Our roadmap for v1.2.0 included ambitious search improvements:

| Feature             | Goal                           |
| ------------------- | ------------------------------ |
| Scoped Search       | Filter by directories/patterns |
| Hybrid Search       | Combine BM25 + semantic search |
| Fuzzy Symbol Search | Typo-tolerant function lookup  |
| Code Similarity     | Find duplicate patterns        |
| Search Ranking      | Boost important files          |

But first, we had a problem: **test coverage had slipped** during rapid Phase 2 development. Before adding new features, we needed a solid foundation.

---

## Phase 0: Fixing the Foundation

### The Coverage Crisis

Running `npm run test:coverage` revealed concerning gaps:

```
index-codebase.ts  | 11.45% statements
embed.ts           | 50.45% statements
crawler.ts         | 77.21% statements
```

The core indexing tool at 11% coverage? That's a ticking time bomb.

### Using seu-claude to Fix seu-claude

Here's where it gets meta. We used `search_codebase` to find the problematic test:

```typescript
// Query: "empty directory test embedder"
// Result: tools.test.ts:64-82

it('should handle empty directory', async () => {
  await store.initialize();
  try {
    await embedder.initialize(); // ← This hangs!
  } catch {
    return;
  }
  // ...
});
```

The test was trying to initialize a real HuggingFace embedder, which either downloaded models (slow) or hung indefinitely (broken).

**The Fix**: Create a mock embedder that doesn't require network access:

```typescript
const createMockEmbedder = () => ({
  embed: (text: string): Promise<number[]> => {
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const vector = new Array(384).fill(0).map((_, i) => Math.sin(hash + i) * 0.5 + 0.5);
    return Promise.resolve(normalize(vector));
  },
  // ... other methods
});
```

### Results After Coverage Sprint

| Metric     | Before | After     |
| ---------- | ------ | --------- |
| Statements | 79.5%  | **87.2%** |
| Branches   | 71.8%  | **77.0%** |
| Functions  | 90.5%  | **96.9%** |
| Lines      | 79.9%  | **87.5%** |

**394 tests passing**, up from 370. Foundation solid. Time to build.

---

## Feature 1: Scoped Search

### The Need

Users wanted to search within specific directories:

- "Find authentication logic in `src/` but not in tests"
- "Search `lib/**/*.ts` for utility functions"

### Implementation (TDD Style)

Following Test-Driven Development, we wrote failing tests first:

```typescript
it('should filter results by includePaths', async () => {
  // ... setup chunks in src/ and lib/

  const results = await searchTool.execute({
    query: 'function',
    scope: {
      includePaths: ['src/**'],
    },
  });

  expect(results.length).toBe(1);
  expect(results[0].relativePath).toBe('src/app.ts');
});
```

Then implemented using `micromatch` for glob pattern matching:

```typescript
private applyScopeFilter(
  results: FormattedSearchResult[],
  scope: SearchScope
): FormattedSearchResult[] {
  return results.filter(result => {
    const path = result.relativePath;

    if (scope.includePaths?.length > 0) {
      if (!micromatch.isMatch(path, scope.includePaths)) {
        return false;
      }
    }

    if (scope.excludePaths?.length > 0) {
      if (micromatch.isMatch(path, scope.excludePaths)) {
        return false;
      }
    }

    return true;
  });
}
```

**5 new tests, all passing. Feature shipped.**

---

## Feature 2: Hybrid Search (BM25 + Semantic)

This is the big one. Pure semantic search is great for conceptual queries ("find user authentication"), but struggles with exact matches ("find `getUserById`").

### The Hybrid Approach

```
Query ──┬──> BM25 (Keywords) ────┐
        │                        ├──> Score Fusion ──> Results
        └──> Semantic (Vectors) ─┘

final_score = α × semantic + (1-α) × keyword
Default α = 0.7 (70% semantic, 30% keyword)
```

### Building BM25 from Scratch

BM25 (Best Match 25) is a probabilistic ranking function. We implemented it in ~250 lines:

```typescript
export class BM25Engine {
  private invertedIndex: Map<string, TermEntry[]> = new Map();

  private tokenize(text: string): string[] {
    return text
      .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase
      .replace(/_/g, ' ') // snake_case
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 1);
  }

  search(query: string, limit = 10): BM25Result[] {
    const queryTerms = this.tokenize(query);
    const scores = new Map<string, number>();

    for (const term of queryTerms) {
      const entries = this.invertedIndex.get(term);
      if (!entries) continue;

      const termIdf = this.idf(term);

      for (const entry of entries) {
        // BM25 formula
        const tf = entry.termFrequency;
        const docLength = this.documents.get(entry.docId)!.length;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));

        scores.set(
          entry.docId,
          (scores.get(entry.docId) || 0) + (termIdf * numerator) / denominator
        );
      }
    }

    // Sort and return top results
    return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  }
}
```

### The HybridSearcher

Combining BM25 and semantic results with score normalization:

```typescript
export class HybridSearcher {
  combine(
    semanticResults: SearchResult[],
    keywordResults: SearchResult[],
    limit = 10
  ): HybridResult[] {
    // Normalize BM25 scores to 0-1
    const maxBM25 = Math.max(...keywordResults.map(r => r.score));

    // Combine all unique results
    for (const id of allIds) {
      const semanticScore = semanticMap.get(id)?.score ?? 0;
      const keywordScore = (keywordMap.get(id)?.score ?? 0) / maxBM25;

      const combinedScore =
        this.semanticWeight * semanticScore +
        (1 - this.semanticWeight) * keywordScore;

      results.push({ id, combinedScore, ... });
    }

    return results.sort((a, b) => b.combinedScore - a.combinedScore);
  }
}
```

**45 new tests (26 for BM25, 19 for Hybrid), all passing.**

---

## Dogfooding: Using seu-claude to Build seu-claude

Throughout development, we used seu-claude's own features:

### Semantic Search for Code Discovery

```
Query: "hybrid search combining BM25 keyword and semantic vector search"
Result: src/search/hybrid.ts:72-127 - The combine() method
```

This immediately showed us our own implementation, helping verify the indexing worked correctly.

### Cross-Reference Tracking

```
Symbol: "combine"
Callers:
  - hybrid.test.ts:54 (test)
  - hybrid.test.ts:75 (test)
  - hybrid.test.ts:93 (test)
  ...
```

We could see exactly where our new function was being used.

### Stats for Health Monitoring

```
Total Files: 63
Total Chunks: 928
Cross-References: 329 definitions, 6234 call sites
Storage: 3.8 MB total
```

Real-time visibility into the index state.

---

## Engineering Standards Applied

### Test-Driven Development (TDD)

- Write failing tests first
- Implement until tests pass
- Refactor with confidence

### Coverage Thresholds

```javascript
// jest.config.js
coverageThreshold: {
  global: {
    statements: 76,
    branches: 70,
    functions: 90,
    lines: 76,
  },
}
```

CI fails if coverage drops below these thresholds.

### Documentation as Code

Every public method has JSDoc comments. The MCP tool schemas serve as API documentation.

---

## Results

### Before Phase 3

- 370 tests
- 79.5% statement coverage
- Basic semantic search only

### After Phase 3 (In Progress)

- 444 tests (+20%)
- 88.4% statement coverage (+9%)
- Scoped search ✅
- Hybrid search (BM25 + Semantic) 🔄
- And more coming...

---

## Lessons Learned

### 1. Dogfooding Reveals Real UX Issues

Using your own tool surfaces pain points you'd never find otherwise. We discovered scoped search was essential when trying to navigate our own growing codebase.

### 2. TDD + AI = Powerful Combination

Claude Code writes tests, then implements features to make them pass. The test suite becomes a specification.

### 3. Coverage Matters (But So Does Velocity)

We found the sweet spot: 76-80% coverage with thresholds. High enough to catch regressions, low enough to not slow down development.

### 4. Semantic + Keyword = Better Than Either Alone

Pure semantic search misses exact function names. Pure keyword search misses conceptual similarity. Hybrid is the answer.

---

## What's Next?

Phase 3 continues with:

- **Fuzzy Symbol Search**: Find `getUser` even when you type `gtUser`
- **Code Similarity**: Detect copy-paste patterns
- **Ranking Improvements**: Boost important files (entry points, exports)

And Phase 4 brings:

- Real-time file watching
- VS Code extension
- Configuration files

---

## Try It Yourself

```bash
npx seu-claude setup
```

That's it. One command to give Claude Code semantic superpowers.

---

## Conclusion

Building a tool using itself isn't just dogfooding — it's a development superpower. Every feature we add makes the next feature easier to build. Every bug we find makes the tool more robust.

seu-claude started as an experiment: "What if Claude Code could understand codebases semantically?" Today, it's a production tool with:

- 63 indexed files
- 928 semantic chunks
- 6,234 cross-reference call sites
- Sub-100ms query latency

And we're just getting started.

---

_seu-claude is open source. Star us on GitHub and join the journey._

**Tags**: #AI #DeveloperTools #TypeScript #SemanticSearch #ClaudeCode #MCP #Dogfooding

---

_Written with assistance from Claude, using seu-claude to navigate the seu-claude codebase. 🤖_
