# seu-claude Roadmap

## Current Status

**Latest Release:** v1.0.2 (January 2026)
**npm:** `seu-claude@1.0.2`

---

## 🚀 Release Strategy

### Phase 1: v1.0.x - Foundation ✅ COMPLETE

**Goal:** Stable, production-ready semantic indexing for Claude Code

**Status:** ✅ SHIPPED (v1.0.0 → v1.0.2)

- [x] AST-based semantic chunking with Tree-sitter
- [x] LanceDB vector storage (low memory footprint)
- [x] 10+ language support (TS, JS, Python, Rust, Go, Java, C/C++, C#, Ruby, PHP)
- [x] Cross-reference tracking (`search_xrefs` tool)
- [x] Git-aware indexing with priority scoring
- [x] Incremental indexing (FileIndex with hash tracking)
- [x] Progress reporting during indexing
- [x] CLI tools: `setup`, `doctor`, `index`
- [x] CI/CD with GitHub Actions
- [x] npm provenance publishing

---

### Phase 2: v1.1.0 - Observability & Metrics 🔜 NEXT

**Goal:** Help users understand and optimize their usage

**Features:**

- [ ] **Token consumption analytics** - Track tokens used per query/session
  - Before/after comparison metrics
  - Cost estimation dashboard
  - Export reports (JSON, CSV)
- [ ] **Memory usage profiling** - Real-time memory monitoring
  - Peak memory during indexing
  - Idle memory footprint
  - Per-language memory breakdown
- [ ] **Index statistics dashboard**
  - Files indexed, chunks created, index size
  - Language distribution charts
  - Most frequently searched symbols
- [ ] **Query analytics**
  - Search latency histograms
  - Cache hit rates
  - Most common query patterns

**Technical Tasks:**

- [ ] Add telemetry module (opt-in, local-only)
- [ ] Create `seu-claude stats` CLI command
- [ ] Add `get_stats` MCP tool for Claude integration
- [ ] JSON export for all metrics

---

### Phase 3: v1.2.0 - Enhanced Search

**Goal:** Make searches smarter and more accurate

**Features:**

- [ ] **Hybrid search** - Combine keyword (BM25) + semantic search
  - Configurable weighting between keyword and semantic
  - Better handling of exact matches (function names, variables)
- [ ] **Code similarity detection**
  - Find duplicate/similar code patterns
  - Detect copy-paste code across files
  - Similarity threshold configuration
- [ ] **Search result ranking improvements**
  - Boost recently modified files
  - Prioritize by git blame recency
  - Factor in file importance (entry points, exports)
- [ ] **Fuzzy symbol search**
  - Typo-tolerant function/class name search
  - CamelCase/snake_case normalization
- [ ] **Scoped search**
  - Search within specific directories
  - Filter by file patterns (e.g., `*.test.ts`)
  - Exclude paths from search

---

### Phase 4: v1.3.0 - Developer Experience

**Goal:** Seamless integration into development workflows

**Features:**

- [ ] **Real-time file watching**
  - Auto-reindex on file save
  - Debounced updates for rapid edits
  - Configurable watch patterns
- [ ] **Query caching**
  - LRU cache for frequent queries
  - Cache invalidation on index changes
  - Configurable cache size
- [ ] **Better cross-references**
  - Type-aware symbol resolution
  - Track imports/exports relationships
  - Call hierarchy visualization (JSON)
- [ ] **Configuration file support**
  - `.seurc.json` for project-specific settings
  - Ignore patterns, embedding model, index location
  - Environment variable overrides

---

### Phase 5: v2.0.0 - Platform Expansion

**Goal:** Extend seu-claude beyond CLI to become a development platform

**Features:**

- [ ] **VS Code Extension**
  - Sidebar showing indexed symbols
  - "Find similar code" context menu
  - Inline semantic search (Ctrl+Shift+S)
  - Index status in status bar
- [ ] **Web Dashboard**
  - Visual index explorer
  - Search interface with filters
  - Dependency graph visualization
  - Token usage charts
- [ ] **Multi-project support**
  - Index multiple projects simultaneously
  - Cross-project search
  - Project-specific configurations
- [ ] **Custom embedding models**
  - Bring your own model (ONNX format)
  - Support for larger models (768/1024 dim)
  - Matryoshka embedding truncation

---

### Phase 6: v2.1.0 - Intelligence

**Goal:** Proactive insights and advanced code understanding

**Features:**

- [ ] **Language Server Protocol (LSP) integration**
  - Use LSP for precise symbol resolution
  - Go-to-definition accuracy improvements
  - Type information in search results
- [ ] **Code health metrics**
  - Complexity analysis per function
  - Dead code detection
  - Circular dependency warnings
- [ ] **Semantic diff**
  - Understand what changed semantically (not just lines)
  - "What functions were modified in this PR?"
  - Impact analysis for changes
- [ ] **Auto-documentation suggestions**
  - Identify undocumented public APIs
  - Generate docstring templates
  - Coverage of documentation

---

### Phase 7: v3.0.0 - Ecosystem

**Goal:** Build a community and plugin ecosystem

**Features:**

- [ ] **Plugin system**
  - Custom chunking strategies
  - Language-specific analyzers
  - Third-party embedding providers
- [ ] **Additional language support**
  - Kotlin, Swift, Scala
  - SQL, GraphQL
  - Terraform, YAML, JSON schemas
- [ ] **Team features**
  - Shared index servers
  - Index synchronization
  - Usage analytics across team
- [ ] **Integration APIs**
  - REST API for external tools
  - WebSocket for real-time updates
  - Webhook notifications

---

## 🎯 Priority Matrix for v1.1.0

### HIGH PRIORITY (Ship first)

| Feature | Impact | Effort |
|---------|--------|--------|
| Token consumption analytics | High - validates ROI | Medium |
| `seu-claude stats` CLI | High - immediate visibility | Low |
| Index statistics | Medium - helps debugging | Low |

### MEDIUM PRIORITY

| Feature | Impact | Effort |
|---------|--------|--------|
| Memory profiling | Medium - optimization | Medium |
| Query analytics | Medium - UX improvement | Medium |
| JSON export | Medium - integration | Low |

### LOWER PRIORITY (v1.2.0+)

| Feature | Impact | Effort |
|---------|--------|--------|
| Hybrid search | High - accuracy | High |
| Real-time watching | Medium - DX | High |
| VS Code extension | High - adoption | Very High |

---

## 📊 Success Metrics

### v1.1.0 Goals
- [ ] Users can see 90%+ token reduction vs baseline
- [ ] `seu-claude stats` shows index health at a glance
- [ ] Sub-100ms query latency maintained

### v1.2.0 Goals
- [ ] Hybrid search improves exact-match accuracy by 50%
- [ ] Duplicate code detection covers 95% of copy-paste patterns

### v2.0.0 Goals
- [ ] VS Code extension reaches 1000+ installs
- [ ] Web dashboard used by 20% of users
- [ ] Multi-project support enables monorepo workflows

---

## 🧪 Feature Validation

Before building each feature, validate demand:

1. **Token analytics** - Users frequently ask "how much does this save me?"
2. **Hybrid search** - Users report missing exact function name matches
3. **VS Code extension** - GitHub issues requesting IDE integration
4. **Real-time watching** - Users manually re-running index after edits

---

## 💡 Design Principles

1. **Local-first** - All data stays on the user's machine
2. **Zero-config** - Works out of the box with sensible defaults
3. **Resource-light** - Stay under 200MB RAM idle, 500MB during indexing
4. **Fast feedback** - Sub-second responses for all operations
5. **Transparent** - Users can always see what's indexed and why
