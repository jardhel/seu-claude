# seu-claude

**S**elf-**E**volving **U**nderstanding for Claude - A Local Codebase RAG MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)

> Give Claude Code deep, proactive understanding of your entire codebase - not just the files it has touched.

## The Problem

Current memory plugins for Claude Code suffer from "goldfish memory":
- They only remember files the AI has explicitly accessed
- Heavy resource usage (35GB+ RAM with in-memory vector databases)
- Complex Python dependencies that conflict with your environment
- Zombie processes that accumulate over time

**seu-claude** solves this by implementing **proactive semantic indexing** - your entire codebase is parsed, understood, and made searchable before Claude even asks.

## Features

- 🧠 **AST-Based Semantic Chunking** - Uses Tree-sitter to understand code structure, not just text
- 💾 **Minimal Resource Usage** - LanceDB's zero-copy architecture keeps RAM under 200MB
- 🔒 **100% Local** - All processing happens on your machine, no data leaves
- ⚡ **Incremental Indexing** - Only re-processes changed files
- 🌐 **Multi-Language Support** - TypeScript, JavaScript, Python, Rust, Go, Java, C/C++, and more
- 🔌 **Native MCP Integration** - Works with Claude Code and Claude Desktop

## Quick Start

### Installation

```bash
# Install globally
npm install -g seu-claude

# Or use npx
npx seu-claude
```

### Configuration

#### Claude Code

Add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "seu-claude": {
      "command": "npx",
      "args": ["seu-claude"],
      "env": {
        "PROJECT_ROOT": "."
      }
    }
  }
}
```

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "seu-claude": {
      "command": "npx",
      "args": ["seu-claude"],
      "env": {
        "PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

### First Run

Once configured, Claude will have access to three new tools:

1. **Index your codebase** (run once, then incremental):
   > "Index this codebase for semantic search"

2. **Search semantically**:
   > "Where is the user authentication logic?"
   > "Find all database connection handling code"
   > "Show me how API rate limiting is implemented"

3. **Read with context**:
   > "Read the AuthService.login method with its surrounding context"

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code / Desktop                    │
└─────────────────────────────────────────────────────────────┘
                              │ MCP Protocol (stdio)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    seu-claude MCP Server                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Tools     │  │  Indexer    │  │   Vector Store      │  │
│  │ - search    │  │ - crawler   │  │   (LanceDB)         │  │
│  │ - index     │  │ - parser    │  │   - zero-copy       │  │
│  │ - context   │  │ - chunker   │  │   - disk-based      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                              │                               │
│                   ┌──────────┴──────────┐                   │
│                   │  Embedding Engine   │                   │
│                   │  (Transformers.js)  │                   │
│                   │  - local inference  │                   │
│                   │  - 256-dim vectors  │                   │
│                   └─────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### Semantic Chunking (cAST)

Unlike naive text splitting that breaks code mid-function, seu-claude uses Abstract Syntax Tree analysis to create semantically meaningful chunks:

| Code Structure | Chunking Logic | Metadata |
|----------------|----------------|----------|
| Function | Complete function with signature | Type, Name, Scope |
| Class | Header + methods as separate chunks | Type, Name, Methods |
| Interface | Complete definition | Type, Module |
| Method | Full body with context | Parent Class, Signature |

### Technology Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Runtime | Node.js 20+ | Native MCP compatibility |
| Parser | web-tree-sitter | WASM-based, multi-language |
| Vector DB | LanceDB | Disk-based, <100MB RAM |
| Embeddings | Transformers.js | Local, GPU-accelerated |

## MCP Tools

### `index_codebase`

Scans and indexes your entire codebase for semantic search.

```typescript
{
  path?: string;    // Project root (defaults to PROJECT_ROOT env)
  force?: boolean;  // Force full re-index (default: incremental)
}
```

### `search_codebase`

Semantic search across your indexed code.

```typescript
{
  query: string;           // Natural language query
  limit?: number;          // Max results (default: 10)
  filter_type?: string;    // "function" | "class" | "method" | etc.
  filter_language?: string; // "typescript" | "python" | etc.
}
```

### `read_semantic_context`

Read code with AST-aware context.

```typescript
{
  file_path: string;      // Absolute file path
  symbol?: string;        // Focus on specific function/class
  context_lines?: number; // Lines of context (default: 5)
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROJECT_ROOT` | Current directory | Root of codebase to index |
| `DATA_DIR` | `~/.seu-claude` | Where to store index data |
| `EMBEDDING_MODEL` | `Xenova/nomic-embed-text-v1.5` | HuggingFace model |
| `EMBEDDING_DIMENSIONS` | `256` | Vector dimensions (Matryoshka) |
| `LOG_LEVEL` | `info` | debug, info, warn, error |

### Ignore Patterns

Create a `.claudeignore` file in your project root to exclude files:

```
# Ignore test fixtures
**/fixtures/**

# Ignore generated code
**/generated/**

# Ignore specific large files
path/to/large/file.ts
```

## Performance

| Metric | seu-claude | claude-mem |
|--------|------------|------------|
| RAM (idle) | ~100MB | 35GB+ |
| RAM (indexing) | ~500MB | N/A |
| Index time (5k files) | ~3 min | Hours |
| Query latency | ~50ms | <10ms |
| Startup time | <2s | 30s+ |

## Development

### Building from Source

```bash
git clone https://github.com/jardhel/seu-claude.git
cd seu-claude
npm install
npm run build
```

### Project Structure

```
seu-claude/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # MCP server
│   ├── indexer/
│   │   ├── crawler.ts        # File enumeration
│   │   ├── parser.ts         # Tree-sitter AST
│   │   └── chunker.ts        # Semantic chunking
│   ├── vector/
│   │   ├── store.ts          # LanceDB operations
│   │   └── embed.ts          # Transformers.js
│   └── tools/
│       ├── index-codebase.ts
│       ├── search-codebase.ts
│       └── read-context.ts
├── languages/                # Tree-sitter WASM grammars
└── models/                   # Downloaded embedding models
```

### Running Tests

```bash
npm test
```

## Roadmap

- [ ] Language Server Protocol integration for better symbol resolution
- [ ] Git-aware indexing (prioritize recent changes)
- [ ] Cross-reference graph (callers/callees)
- [ ] VSCode extension for index management
- [ ] Support for more languages (Kotlin, Swift, PHP)

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting PRs.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Inspired by the challenges documented in [claude-mem](https://github.com/anthropics/claude-mem) discussions
- Built on the excellent [Model Context Protocol](https://modelcontextprotocol.io/)
- AST parsing powered by [Tree-sitter](https://tree-sitter.github.io/tree-sitter/)
- Vector search by [LanceDB](https://lancedb.com/)
- Local embeddings via [Transformers.js](https://huggingface.co/docs/transformers.js)

---

**seu-claude** - Because your AI coding assistant should know your codebase as well as you do.
