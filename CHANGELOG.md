# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] - 2026-01-26

### 🎉 Major Release: Neuro-Symbolic Architecture

Complete paradigm shift from traditional RAG to a **Hexagonal Neuro-Symbolic Architecture** that combines symbolic reasoning (AST, DAG, TDD) with LLM intelligence.

### Added

#### Core Infrastructure (Phases 1-4)

- **Phase 1: TaskManager** - Persistent task DAG with SQLite storage
  - Hierarchical task trees with parent-child relationships
  - Crash-resistant state management (survives process restarts)
  - Status tracking: pending → running → completed/failed
  - Tool output caching to prevent duplicate work
  - Recovery API: `await manager.recoverState()`

- **Phase 2: RecursiveScout** - AST-based dependency analysis
  - Multi-language AST parsing (TypeScript, Python, JavaScript)
  - Recursive import resolution with circular dependency detection
  - Symbol extraction (functions, classes, methods)
  - Import path finding between files
  - Dependency graph building with statistics

- **Phase 3: The Proving Ground** - Validation and testing
  - **Gatekeeper**: Pre-flight validation framework
    - ESLintValidator: Linting rules and style checks
    - TypeScriptValidator: Type errors with project config
    - Extensible validator registry
  - **ProcessSandbox**: Isolated command execution
    - Process isolation with timeout control
    - Working directory specification
    - Clean stdout/stderr capture
  - **HypothesisEngine**: TDD cycle automation
    - RED phase: Test should fail
    - GREEN phase: Implementation makes test pass
    - REFACTOR phase: Validate with Gatekeeper
    - Automatic cycle orchestration

- **Phase 4: MCP Interface** - Protocol integration
  - 6 MCP tools exposed to Claude Code/Desktop
  - 7 CLI commands for direct usage
  - Unified entry point (auto-detects MCP vs CLI mode)
  - Dual-mode operation: MCP server or CLI

#### MCP Tools

1. **`analyze_dependency`** - AST-based dependency analysis
   - Entry point specification
   - Max recursion depth control
   - node_modules inclusion option
   - Returns: dependency graph, stats, circular dependencies

2. **`validate_code`** - Gatekeeper validation
   - ESLint validation with auto-fix option
   - TypeScript type checking with project config
   - Multiple validator support
   - Returns: validation results with errors/warnings

3. **`execute_sandbox`** - Isolated command execution
   - Process isolation for safety
   - Configurable timeout and working directory
   - Clean stdout/stderr capture
   - Returns: exit code, output, duration

4. **`manage_task`** - Persistent task DAG
   - Actions: create, update, list, tree, status
   - SQLite persistence (crash-resistant)
   - Hierarchical task organization
   - Context storage (JSON blob for tool outputs)

5. **`run_tdd`** - Automated TDD cycles
   - Hypothesis: test code + implementation code
   - RED-GREEN-REFACTOR automation
   - Gatekeeper integration in refactor phase
   - Returns: phase result and test output

6. **`find_symbol`** - Symbol search across codebase
   - Function, class, method search
   - Entry point specification
   - Returns: file locations with line numbers and types

#### CLI Commands

1. **`/help`** - Show available commands and usage
2. **`/plan <action> [options]`** - Task management
   - `create`: Create new task (root or subtask)
   - `update <id> <status>`: Update task status
   - `list`: Show all tasks with status
   - `tree`: Visual task hierarchy
   - `status <id>`: Get task details

3. **`/deps <entryPoint> [options]`** - Dependency analysis
   - `--depth N`: Limit recursion depth
   - `--no-node-modules`: Exclude node_modules
   - Shows: files, symbols, imports, circular deps

4. **`/check <path> [options]`** - Code validation
   - `--fix`: Auto-fix ESLint issues
   - Runs ESLint + TypeScript validation
   - Shows errors and warnings with locations

5. **`/test [options]`** - Run tests in sandbox
   - `--all`: Run all tests
   - `--file <path>`: Run specific test file
   - `--command <cmd>`: Custom test command
   - `--timeout <ms>`: Execution timeout

6. **`/find <symbol> <path>`** - Symbol search
   - Searches for functions, classes, methods
   - Shows all occurrences with context

7. **`/nuke --confirm`** - Reset state
   - Clears task database
   - Requires explicit confirmation

#### Self-Hosting Validation

Seu-claude built Phase 4 using its own infrastructure - proving the architecture works:

- **TaskManager**: Created 24-task Phase 4 plan
- **RecursiveScout**: Analyzed 21 files, 737 symbols, 66 dependencies
- **HypothesisEngine**: Validated TDD approach (RED→GREEN→REFACTOR)
- **Gatekeeper**: Found and fixed TypeScript bugs (11 downlevelIteration errors)
- **Test Suite**: 252 tests passing (119 v2 core + 133 other)

### Changed

- **Architecture**: From vector-based RAG to symbolic reasoning (AST, DAG, TDD)
- **Data Storage**: Project-local `.seu-claude/` instead of global `~/.seu-claude/`
- **Focus**: From code search to autonomous multi-step development
- **Binary Name**: `seu-claude` (added alias `seu` for convenience)
- **Entry Point**: Unified `dist/v2.js` for both MCP and CLI modes
- **Package Name**: Now just `seu-claude` (removed -v2 suffix)

### Deprecated

- Vector-based semantic search (replaced with AST-based analysis)
- Global data directory (now project-local for better task isolation)
- v1 analytics tools (token/memory/query analytics - not needed in symbolic architecture)

### Removed

- LanceDB vector database (replaced with SQLite task DAG)
- Embedding generation (AST-based symbolic reasoning instead)
- v1 tool names and interfaces (see [V2_MIGRATION.md](V2_MIGRATION.md))

### Fixed

- **Crash Recovery**: All state persists to SQLite - no more lost context
- **Import Resolution**: Handles ES modules with .js extensions for .ts files
- **TypeScript Validation**: Uses project tsconfig.json instead of hardcoded flags
- **Test Isolation**: ProcessSandbox prevents side effects
- **Circular Dependencies**: RecursiveScout detects and reports all cycles

### Security

- Process isolation for sandbox execution
- No network access in ProcessSandbox
- SQLite injection prevention via prepared statements
- Path traversal prevention in file operations

### Performance

| Operation | Latency | Notes |
|-----------|---------|-------|
| Task CRUD | < 1ms | SQLite in-memory + disk |
| AST Parse (1000 LOC) | ~50ms | Tree-sitter WASM |
| Dependency Graph (50 files) | ~500ms | Recursive parsing |
| ESLint Validation | ~200ms | Per file |
| TypeScript Check | ~1s | Per project |
| Sandbox Execution | ~100ms + runtime | Process spawn overhead |

### Documentation

#### New Documentation

- [README.md](README.md) - Main documentation (rewritten for v2)
- [USER_GUIDE.md](USER_GUIDE.md) - Comprehensive user manual
- [QUICKSTART.md](QUICKSTART.md) - 5-minute setup guide
- [V2_MIGRATION.md](V2_MIGRATION.md) - v1 → v2 migration guide
- [PHASE4_COMPLETE.md](PHASE4_COMPLETE.md) - Phase 4 completion report
- [PHASE4_SUMMARY.md](PHASE4_SUMMARY.md) - Concise release summary

#### Updated Documentation

- [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) - Complete hexagonal architecture
- [CHANGELOG.md](CHANGELOG.md) - This file
- [package.json](package.json) - Updated name and bin configuration

#### Legacy Documentation

- [README_V1_LEGACY.md](README_V1_LEGACY.md) - Original v1 documentation (archived)

### Technical Details

- **Test Coverage**: 252 tests passing
  - Core layer: 95%+ (229 tests)
  - Adapters: 80%+ (22 tests)
  - MCP/CLI: 70%+ (27 tests)
- **Code Quality**: 0 ESLint errors, 0 TypeScript errors
- **Build**: TypeScript strict mode, ES modules
- **Node Version**: >= 20.0.0

### Breaking Changes

See [V2_MIGRATION.md](V2_MIGRATION.md) for detailed migration guide.

**Summary**:
- Tool names changed (search_codebase → find_symbol, etc.)
- Data directory moved from global to project-local
- Tool response formats updated (more structured)
- Vector-based search removed (use AST-based analysis)

## [1.2.0] - 2026-01-19

### Added

- 🎉 **Phase 3: Enhanced Search** - Smarter, more accurate code search
- **Hybrid Search (BM25 + Semantic)**
  - New BM25 keyword search engine with inverted index
  - Configurable search modes: `semantic`, `keyword`, `hybrid`
  - Score fusion with adjustable weighting (default: 70% semantic, 30% keyword)
  - Reciprocal Rank Fusion (RRF) alternative combination method
  - BM25 index persisted to `~/.seu-claude/bm25-index.json`
- **Scoped Search**
  - Limit searches to specific directories with `include_paths`
  - Exclude files/directories with `exclude_paths`
  - Full glob pattern support (e.g., `src/**/*.ts`, `!**/*.test.ts`)
- **Fuzzy Symbol Search** (`search_symbols` tool)
  - Typo-tolerant function/class name search using Levenshtein distance
  - CamelCase/snake_case normalization for cross-format matching
  - Configurable similarity threshold
  - Filter by symbol types (function, class, method, interface, etc.)
  - Symbol index built during codebase indexing
- **Search Ranking Improvements**
  - Multi-factor ranking combining semantic score, keyword match, git recency, export status, and entry point detection
  - Configurable ranking weights (default: 50% semantic, 20% keyword, 10% each for recency/exports/entry points)
  - Entry point detection for index/main/app/server files across multiple languages
  - Export detection for TypeScript/JavaScript, Python (`__all__`), Go (uppercase), and Rust (`pub`)
  - New `use_ranking` option to enable/disable improved ranking (default: enabled)
- **Claude Code Sub-agents** (contributed by @EliasdeJonge)
  - `seu-researcher` - Locate implementations and explain "where/how"
  - `seu-context-summarizer` - Summarize files/symbols with minimal context
  - `seu-xref-explorer` - Map callers/callees and key call paths
  - Install with `npx seu-claude setup --subagents`

### Changed

- **MCP Tools increased from 8 to 9** - New `search_symbols` tool added
- `search_codebase` tool now supports `mode`, `semantic_weight`, and `use_ranking` parameters

### Technical Details

- **Test Coverage**: 539 tests passing (95+ new tests for search features)
- **New Modules**: `BM25Engine`, `HybridSearcher`, `FuzzyMatcher`, `SearchRanker`
- **New Files**: `src/search/bm25.ts`, `src/search/hybrid.ts`, `src/search/fuzzy.ts`, `src/search/ranker.ts`, `src/tools/search-symbols.ts`
- **Sub-agent Files**: `agents/seu-researcher.md`, `agents/seu-context-summarizer.md`, `agents/seu-xref-explorer.md`
- **Performance**: BM25 search < 50ms, fuzzy search < 50ms, hybrid mode maintains < 100ms p95 latency

## [1.1.1] - 2026-01-16

### Fixed

- **Removed unused `@anthropic-ai/sdk` dependency** - Reduces install size and eliminates `node-domexception` deprecation warning from this source
- Fixed release workflow to work with npm 2FA (local publish with interactive authentication)

### Changed

- Release workflow now validates build/tests in CI, npm publish done locally via `scripts/release.sh`
- Added documentation checklist to release script

### Notes

- Remaining deprecation warnings (`boolean`, `node-domexception`) are from transitive dependencies in `@huggingface/transformers` and `@lancedb/lancedb` - will be resolved when upstream packages update

## [1.1.0] - 2026-01-16

### Added

- 🎉 **Phase 2: Observability & Metrics** - Complete analytics suite for understanding usage
- **Token Analytics** (`get_token_analytics` tool)
  - Track token consumption per query and session
  - Estimate cost savings vs naive file reading
  - Export analytics (JSON format)
- **Memory Profiling** (`get_memory_profile` tool)
  - Real-time memory monitoring with operation tracking
  - Peak memory tracking during indexing
  - Memory sampling at configurable intervals
  - Persist profiles to disk for analysis
- **Query Analytics** (`get_query_analytics` tool)
  - Search latency histograms (p50/p90/p95/p99)
  - Cache hit rate tracking
  - Query pattern analysis
  - Per-query-type performance breakdown

### Changed

- **MCP Tools increased from 5 to 8** - New analytics tools added
- Server now tracks query analytics automatically on every search
- Improved analytics integration in search handler

### Technical Details

- **Test Coverage**: 370 tests passing (67 new tests for analytics)
- **New Modules**: `TokenAnalyticsCollector`, `MemoryProfiler`, `QueryAnalyticsCollector`
- **New Tools**: `GetTokenAnalytics`, `GetMemoryProfile`, `GetQueryAnalytics`

## [1.0.2] - 2026-01-16

### Added

- **Incremental Indexing** - New `FileIndex` class tracks file hashes and mtimes to skip unchanged files during re-indexing
- **Progress Reporting** - Callback-based progress reporting during indexing with phase tracking (crawling, analyzing, embedding, saving)
- CLI now shows real-time progress during `seu-claude index` command
- `IndexResult` now includes `filesSkipped`, `filesUpdated`, and `filesDeleted` counts

### Changed

- `index_codebase` MCP tool output now shows incremental statistics
- Improved indexing performance by only processing changed files
- Better memory efficiency during large codebase indexing

### Technical Details

- **Test Coverage**: 301 tests passing
- **New Classes**: `FileIndex` for persistent file tracking
- **New Types**: `IndexProgress`, `IndexPhase`, `ProgressCallback`

## [1.0.1] - 2026-01-15

### Changed

- 📚 Updated documentation to reflect complete v1.0 feature set
- Updated README roadmap with completed feature indicators
- Updated FEATURE_AUDIT with `search_xrefs` tool documentation
- Added cross-reference tracking and git-aware indexing sections
- Corrected test counts and coverage metrics across all docs
- Applied Prettier formatting to all markdown files

### Fixed

- Fixed project structure in README to include `search-xrefs.ts`
- Corrected tool count from 3 to 4 in documentation

## [1.0.0] - 2026-01-15

### Added

- 🎉 Initial stable release
- **MCP Server** - Full Model Context Protocol implementation for Claude Code/Desktop
- **Semantic Indexing** - AST-based code chunking using Tree-sitter
- **Vector Search** - LanceDB-powered similarity search with 384-dimension embeddings
- **Multi-language Support** - TypeScript, JavaScript, Python, Java, C/C++, Go, Rust
- **Cross-Reference Tracking** - Callers/callees graph powered by AST analysis
- **Git-Aware Indexing** - Track file changes and prioritize recent modifications
- **Four MCP Tools**:
  - `index_codebase` - Index entire codebase with incremental updates
  - `search_codebase` - Semantic search across indexed code
  - `read_semantic_context` - Read code with AST-aware context
  - `search_xrefs` - Query cross-references (who calls this? what does this call?)
- **CLI Commands**:
  - `seu-claude doctor` - Diagnose environment and index health
  - `seu-claude-setup` - Configure MCP settings

### Technical Details

- **Embedding Model**: `Xenova/all-MiniLM-L6-v2` (no authentication required)
- **Vector Dimensions**: 384
- **Test Coverage**: 78%+ (285 tests)
- **Memory Usage**: ~100MB idle, ~500MB during indexing

### Performance

- Indexed 26-file TypeScript project in 5.39 seconds
- Created 359 semantic chunks
- Query latency ~50ms

## [0.1.0] - 2026-01-14

### Added

- Initial development release
- Core indexing and search functionality
- Basic MCP integration
