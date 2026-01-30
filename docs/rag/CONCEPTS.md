# Seu-Claude RAG System Concepts

## Overview

Seu-claude implements a sophisticated Retrieval-Augmented Generation (RAG) system for code understanding. The system combines **semantic search** (vector embeddings) with **keyword search** (BM25) to provide accurate and relevant code retrieval.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     RAG Pipeline                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. INDEXING PHASE                                           │
│     ┌─────────┐    ┌──────────────┐    ┌─────────────────┐  │
│     │ Crawler │───▶│ SemanticChunker │───▶│ EmbeddingEngine │  │
│     └─────────┘    └──────────────┘    └─────────────────┘  │
│           │               │                    │             │
│           ▼               ▼                    ▼             │
│     FileIndex        XRefTracker         VectorStore        │
│                                          (LanceDB)          │
│                          │                                   │
│                          ▼                                   │
│                     BM25Engine                               │
│                                                              │
│  2. SEARCH PHASE                                             │
│     ┌───────┐    ┌──────────────┐    ┌──────────────┐      │
│     │ Query │───▶│ HybridSearcher │───▶│ SearchRanker │      │
│     └───────┘    └──────────────┘    └──────────────┘      │
│                         │                    │               │
│                         ▼                    ▼               │
│                 Semantic + BM25      Ranked Results          │
│                   Combination                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Vector Store (LanceDB)

**File:** `src/vector/store.ts`

LanceDB is an Apache Arrow-based vector database that provides:

- Persistent vector storage
- Fast similarity search
- Filtering by metadata (type, language, file path)

```typescript
interface VectorStore {
  search(vector: number[], limit: number, filter?: string): Promise<SearchResult[]>;
  upsert(chunks: CodeChunk[]): Promise<void>;
  delete(filePath: string): Promise<void>;
  getStats(): Promise<StoreStats>;
}
```

### 2. Embedding Engine

**File:** `src/vector/embed.ts`

Uses HuggingFace Transformers.js with quantized models:

| Model                          | Dimensions | Use Case             |
| ------------------------------ | ---------- | -------------------- |
| `Xenova/all-MiniLM-L6-v2`      | 384        | Default, balanced    |
| `Xenova/bge-small-en-v1.5`     | 384        | Higher quality       |
| `Xenova/nomic-embed-text-v1.5` | 768        | Best quality, slower |

Features:

- Batch embedding for efficiency
- Query-specific prefixing
- Matryoshka dimension truncation support
- Offline model caching

### 3. BM25 Keyword Search

**File:** `src/search/bm25.ts`

Classic BM25 algorithm implementation:

- Inverted index structure
- Tokenization with camelCase/snake_case splitting
- Configurable parameters (k1=1.2, b=0.75)
- Serialization for persistence

### 4. Hybrid Search

**File:** `src/search/hybrid.ts`

Combines semantic and keyword results:

```
FinalScore = α × SemanticScore + (1-α) × NormalizedBM25Score
```

Default: α = 0.7 (70% semantic, 30% keyword)

Also supports Reciprocal Rank Fusion (RRF) as an alternative.

### 5. Semantic Chunker

**File:** `src/indexer/chunker.ts`

AST-based code chunking:

- Extracts functions, classes, methods
- Preserves semantic boundaries
- Cross-reference enrichment (callers/callees)
- Token estimation for size management

### 6. Cross-Reference Tracker

**File:** `src/indexer/xref-tracker.ts`

Builds call graph relationships:

- Tracks function calls
- Maps callers/callees
- Supports 10+ languages
- Persisted as `xref-graph.json`

## Search Modes

### Semantic Search

Best for conceptual queries: "how do we handle authentication"

### Keyword Search

Best for exact matches: "handleAuthCallback function"

### Hybrid Search (Default)

Best for general use: combines both approaches

## Configuration

### Environment Variables

```bash
# Embedding model (optional)
SEU_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2

# Embedding dimensions (optional, for Matryoshka truncation)
SEU_EMBEDDING_DIMS=384

# Semantic weight for hybrid search (0-1)
SEU_SEMANTIC_WEIGHT=0.7
```

### Data Directory Structure

```
.seu-claude-v2/
├── lancedb/           # Vector store (LanceDB)
├── bm25-index.json    # BM25 inverted index
├── fuzzy-index.json   # Symbol fuzzy matcher
├── xref-graph.json    # Call graph relationships
└── file-index.json    # File metadata tracking
```

## Incremental Indexing

The system tracks file changes for efficient updates:

1. **FileIndex** stores hash + mtime for each file
2. On re-index, only changed files are processed
3. Old chunks are deleted before re-indexing
4. Cross-references are rebuilt incrementally

## Performance Characteristics

| Operation            | Typical Latency | Notes                 |
| -------------------- | --------------- | --------------------- |
| Single query         | 50-200ms        | Depends on index size |
| Embedding generation | 10-50ms         | Per query             |
| BM25 lookup          | <10ms           | Very fast             |
| Hybrid combination   | <5ms            | Score merging         |
| Ranking              | <10ms           | Post-processing       |

## Best Practices

1. **Index regularly** - Run indexing after significant code changes
2. **Use hybrid mode** - Default mode provides best results
3. **Scope searches** - Use include/exclude patterns for large codebases
4. **Cache results** - Use TaskManager to cache expensive operations

## See Also

- [INDEXING.md](./INDEXING.md) - Detailed indexing pipeline
- [SEARCH.md](./SEARCH.md) - Search modes and ranking
- [CONFIGURATION.md](./CONFIGURATION.md) - All configuration options
