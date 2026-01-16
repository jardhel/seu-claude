# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
