# Phase 3: Enhanced Search - Implementation Plan

**Version:** v1.2.0
**Status:** In Development
**Start Date:** January 16, 2026

---

## Overview

Phase 3 focuses on making searches smarter and more accurate through hybrid search, scoped queries, fuzzy matching, and code similarity detection.

---

## Features & Priority

| # | Feature | Priority | Effort | Impact |
|---|---------|----------|--------|--------|
| 1 | Scoped Search | HIGH | Low | Medium |
| 2 | Hybrid Search (BM25 + Semantic) | HIGH | High | High |
| 3 | Fuzzy Symbol Search | HIGH | Medium | Medium |
| 4 | Search Ranking Improvements | MEDIUM | Medium | Medium |
| 5 | Code Similarity Detection | MEDIUM | High | Medium |

---

## Engineering Standards

### Test-Driven Development
- Write tests BEFORE implementation
- Minimum 80% coverage on new code
- Unit tests for all public methods
- Integration tests for tool endpoints

### Code Quality
- TypeScript strict mode
- No `any` types without justification
- Comprehensive JSDoc comments
- Follow existing patterns in codebase

### Performance Targets
- Query latency: < 100ms (p95)
- Memory overhead: < 50MB per feature
- Index size impact: < 20% increase

### Documentation
- Update README.md with new features
- Update tool descriptions in server.ts
- Add usage examples
- Update CHANGELOG.md

---

## Feature 1: Scoped Search

### Goal
Allow users to limit search to specific directories or file patterns.

### API Design
```typescript
interface SearchOptions {
  query: string;
  limit?: number;
  filterType?: string;
  filterLanguage?: string;
  // NEW
  scope?: {
    includePaths?: string[];  // e.g., ["src/**", "lib/**"]
    excludePaths?: string[];  // e.g., ["**/*.test.ts", "**/node_modules/**"]
  };
}
```

### Implementation
1. Extend `SearchOptions` interface
2. Add path matching using `micromatch` library
3. Apply filters post-search (simplest) or in LanceDB query
4. Update MCP tool schema

### Files to Modify
- `src/tools/search-codebase.ts`
- `src/__tests__/tools.test.ts`

### Tests
- [ ] Search with includePaths returns only matching files
- [ ] Search with excludePaths filters out matching files
- [ ] Glob patterns work correctly (**, *, ?)
- [ ] Empty scope returns all results
- [ ] Invalid glob patterns handled gracefully

---

## Feature 2: Hybrid Search (BM25 + Semantic)

### Goal
Combine keyword-based search (BM25) with semantic search for better accuracy on exact matches.

### Architecture
```
┌─────────────────────────────────────────────────────┐
│                   Hybrid Search                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Query ──┬──> BM25 Search ────┐                     │
│          │                    ├──> Score Fusion ──> Results
│          └──> Semantic Search ┘                     │
│                                                     │
│  final_score = α × semantic + (1-α) × bm25         │
│  Default α = 0.7                                    │
└─────────────────────────────────────────────────────┘
```

### API Design
```typescript
interface SearchOptions {
  query: string;
  mode?: 'semantic' | 'keyword' | 'hybrid';  // default: 'hybrid'
  hybridWeight?: number;  // 0-1, semantic weight, default: 0.7
  // ... existing options
}
```

### Implementation
1. Create `src/search/bm25.ts` - BM25 scoring engine
2. Create `src/search/text-index.ts` - Inverted index for text search
3. Create `src/search/hybrid.ts` - Score fusion logic
4. Build text index during `index_codebase`
5. Update `search_codebase` tool to use hybrid

### Dependencies
- None needed - implement BM25 from scratch (simple algorithm)

### Data Structures
```typescript
// Inverted Index: term -> { docId, tf, positions }[]
interface InvertedIndex {
  terms: Map<string, TermEntry[]>;
  docCount: number;
  avgDocLength: number;
}

interface TermEntry {
  chunkId: string;
  termFrequency: number;
  positions: number[];
}
```

### Storage
- Store inverted index in `{dataDir}/text-index.json`
- Rebuild during full reindex
- Incremental updates on file changes

### Tests
- [ ] BM25 returns exact matches with high scores
- [ ] Semantic search returns conceptually similar code
- [ ] Hybrid mode combines both effectively
- [ ] Weight parameter affects score balance
- [ ] Performance: < 50ms for keyword search

---

## Feature 3: Fuzzy Symbol Search

### Goal
Find functions/classes even with typos or case mismatches.

### API Design
```typescript
// New tool: search_symbols
interface SymbolSearchOptions {
  pattern: string;           // e.g., "getUsr" finds "getUser"
  fuzzyThreshold?: number;   // 0-1, default: 0.6
  types?: string[];          // ["function", "class", "method"]
  limit?: number;
}
```

### Implementation
1. Build symbol index during indexing (name -> chunk mapping)
2. Implement Levenshtein distance for fuzzy matching
3. Normalize CamelCase/snake_case for comparison
4. Create new `search_symbols` MCP tool

### Normalization Rules
```typescript
// Normalize for comparison
"getUserById"  -> "get user by id"
"get_user_by_id" -> "get user by id"
"GetUserById" -> "get user by id"
```

### Files to Create
- `src/search/fuzzy.ts` - Fuzzy matching utilities
- `src/search/symbol-index.ts` - Symbol name index
- `src/tools/search-symbols.ts` - New MCP tool

### Tests
- [ ] Exact match returns score 1.0
- [ ] Typo "getUsr" finds "getUser"
- [ ] Case-insensitive by default
- [ ] CamelCase matches snake_case
- [ ] Threshold filters out low matches

---

## Feature 4: Search Ranking Improvements

### Goal
Improve result relevance by factoring in file importance.

### Ranking Factors
| Factor | Weight | Source |
|--------|--------|--------|
| Semantic similarity | 0.5 | Vector search |
| BM25 keyword match | 0.2 | Text index |
| Git recency | 0.1 | Already have |
| Export/public symbol | 0.1 | AST analysis |
| Entry point file | 0.1 | File pattern |

### Entry Point Detection
Files that are likely important:
- `index.{ts,js,py}`, `main.{ts,js,py,go,rs}`
- `app.{ts,js,py}`, `server.{ts,js,py}`
- Files with many exports

### Implementation
1. Track export count during chunking
2. Detect entry point files during crawling
3. Apply ranking boosts during search
4. Make ranking factors configurable

### Files to Modify
- `src/indexer/chunker.ts` - Track exports
- `src/indexer/crawler.ts` - Detect entry points
- `src/tools/search-codebase.ts` - Apply ranking

---

## Feature 5: Code Similarity Detection

### Goal
Find duplicate or similar code patterns across the codebase.

### API Design
```typescript
// New tool: find_similar_code
interface FindSimilarOptions {
  code: string;              // Source code to compare
  threshold?: number;        // 0-1, default: 0.8
  limit?: number;
  excludeSameFile?: boolean; // Exclude matches from same file
}
```

### Algorithm: MinHash + LSH
1. Convert code to shingles (n-grams of tokens)
2. Generate MinHash signature
3. Use Locality-Sensitive Hashing for fast lookup
4. Return chunks with similarity above threshold

### Implementation
1. Create `src/search/similarity.ts` - MinHash implementation
2. Store MinHash signatures during indexing
3. Create `find_similar_code` MCP tool

### Tests
- [ ] Identical code returns similarity 1.0
- [ ] Renamed variables still match (AST-based shingles)
- [ ] Threshold filters appropriately
- [ ] Performance: < 200ms for similarity search

---

## Implementation Schedule

### Week 1: Foundation
- [ ] Set up feature branch `feature/phase3-enhanced-search`
- [ ] Feature 1: Scoped Search (complete)
- [ ] Update tests and documentation

### Week 2: Hybrid Search
- [ ] Feature 2: BM25 implementation
- [ ] Feature 2: Text index
- [ ] Feature 2: Hybrid search integration
- [ ] Performance benchmarks

### Week 3: Fuzzy & Ranking
- [ ] Feature 3: Fuzzy symbol search
- [ ] Feature 4: Search ranking improvements
- [ ] Integration testing

### Week 4: Similarity & Polish
- [ ] Feature 5: Code similarity detection
- [ ] End-to-end testing
- [ ] Documentation updates
- [ ] v1.2.0 release preparation

---

## Test Coverage Requirements

| Module | Minimum Coverage |
|--------|-----------------|
| `src/search/bm25.ts` | 90% |
| `src/search/hybrid.ts` | 85% |
| `src/search/fuzzy.ts` | 85% |
| `src/search/similarity.ts` | 80% |
| `src/tools/search-symbols.ts` | 85% |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| BM25 index too large | Compress terms, limit vocabulary |
| Slow hybrid search | Parallel query execution |
| MinHash memory usage | Streaming computation |
| Breaking changes | Feature flags for new modes |

---

## Success Metrics

- [ ] Hybrid search improves exact-match accuracy by 50%
- [ ] Fuzzy search finds 90%+ of typo'd symbols
- [ ] Code similarity detects 95%+ of copy-paste patterns
- [ ] All features maintain < 100ms p95 latency
- [ ] Test coverage stays above 85%
