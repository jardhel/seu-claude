# seu-claude

**S**elf-**E**volving **U**nderstanding for Claude - A Local Codebase RAG MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![npm version](https://img.shields.io/npm/v/seu-claude.svg)](https://www.npmjs.com/package/seu-claude)
[![CI Status](https://github.com/jardhel/seu-claude/workflows/CI/badge.svg)](https://github.com/jardhel/seu-claude/actions)
[![GitHub issues](https://img.shields.io/github/issues/jardhel/seu-claude)](https://github.com/jardhel/seu-claude/issues)
[![GitHub stars](https://img.shields.io/github/stars/jardhel/seu-claude)](https://github.com/jardhel/seu-claude/stargazers)

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

# Or use npx directly
npx seu-claude
```

### Automatic Configuration

After installing, run the setup command from your project directory:

```bash
# With npx (recommended)
npx seu-claude setup

# Or if installed globally
seu-claude setup

# Optional (Claude Code): also install helper subagents
npx seu-claude setup --subagents
```

This will automatically:

- Detect your project root
- Create `.claude/settings.json` for Claude Code
- Configure `claude_desktop_config.json` for Claude Desktop
- Set up the MCP server connection

### Verify Installation

Check if everything is configured correctly:

```bash
npx seu-claude doctor
```

### Manual Configuration

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

Once configured, Claude will have access to **9 powerful tools**:

**Core Tools:**

1. **Index your codebase** (run once, then incremental):

   > "Index this codebase for semantic search"

2. **Search semantically**:

   > "Where is the user authentication logic?"
   > "Find all database connection handling code"

3. **Read with context**:

   > "Read the AuthService.login method with its surrounding context"

4. **Search cross-references** (find callers/callees):

   > "Who calls the validateUser function?"
   > "What functions does processOrder call?"

5. **Fuzzy symbol search** (v1.2.0+):
   > "Find the getUser function" (handles typos!)
   > "Search for UserService class"

**Analytics Tools (v1.1.0+):** 6. **Get index statistics**:

> "Show me the codebase statistics"

7. **Token analytics**:

   > "How many tokens are we saving with semantic search?"

8. **Memory profiling**:

   > "What's the memory usage profile?"

9. **Query analytics**:
   > "Show me search performance metrics"

### Optional: Claude Code Subagents (Recommended)

To further reduce main-context clutter, install project-scoped Claude Code subagents into `.claude/agents/` by running `seu-claude setup --subagents` (it won't overwrite existing files):

- `seu-researcher` - Locate implementations and explain "where/how" with concise pointers
- `seu-context-summarizer` - Summarize a file/symbol with minimal quoting
- `seu-xref-explorer` - Map callers/callees and key call paths

**Example prompts:**

> "Use the seu-researcher subagent to find where auth tokens are validated"
> "Use the seu-xref-explorer subagent to show who calls handleRequest"

Note: Claude Code background subagents cannot use MCP tools, so run these in the foreground.

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
│                   │  - 384-dim vectors  │                   │
│                   └─────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### Semantic Chunking (cAST)

Unlike naive text splitting that breaks code mid-function, seu-claude uses Abstract Syntax Tree analysis to create semantically meaningful chunks:

| Code Structure | Chunking Logic                      | Metadata                |
| -------------- | ----------------------------------- | ----------------------- |
| Function       | Complete function with signature    | Type, Name, Scope       |
| Class          | Header + methods as separate chunks | Type, Name, Methods     |
| Interface      | Complete definition                 | Type, Module            |
| Method         | Full body with context              | Parent Class, Signature |

### Technology Stack

| Component  | Technology      | Why                        |
| ---------- | --------------- | -------------------------- |
| Runtime    | Node.js 20+     | Native MCP compatibility   |
| Parser     | web-tree-sitter | WASM-based, multi-language |
| Vector DB  | LanceDB         | Disk-based, <100MB RAM     |
| Embeddings | Transformers.js | Local, GPU-accelerated     |

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

Search across your indexed code with multiple modes.

```typescript
{
  query: string;           // Natural language query
  limit?: number;          // Max results (default: 10)
  mode?: string;           // "semantic" | "keyword" | "hybrid" (default: "semantic")
  semantic_weight?: number; // For hybrid mode: 0-1 (default: 0.7)
  filter_type?: string;    // "function" | "class" | "method" | etc.
  filter_language?: string; // "typescript" | "python" | etc.
  scope?: {                // Limit search to specific paths
    include_paths?: string[];  // e.g., ["src/**", "lib/**"]
    exclude_paths?: string[];  // e.g., ["**/*.test.ts"]
  };
  use_ranking?: boolean;   // Enable improved ranking (default: true)
}
```

**Search Modes (v1.2.0+):**

- `semantic` - Vector-based similarity search (default)
- `keyword` - BM25 keyword search for exact matches
- `hybrid` - Combines both for best accuracy

**Search Ranking (v1.2.0+):**
When `use_ranking` is enabled (default), results are re-ranked using multiple factors:

- Semantic/keyword score (weighted based on mode)
- Export/public symbol detection (boosts exported functions/classes)
- Entry point file detection (boosts index.ts, main.py, app.ts, etc.)

### `read_semantic_context`

Read code with AST-aware context.

```typescript
{
  file_path: string;      // Absolute file path
  symbol?: string;        // Focus on specific function/class
  context_lines?: number; // Lines of context (default: 5)
}
```

### `search_xrefs`

Find callers and callees of functions/methods. Understand code dependencies and call graphs.

```typescript
{
  symbol: string;           // Function/method name to search for
  direction?: string;       // "callers" | "callees" | "both" (default)
  max_results?: number;     // Max results (default: 20)
}
```

**Example prompts:**

> "Who calls the authenticate function?"
> "What does processPayment call?"
> "Show me the cross-references for handleRequest"

### `get_stats`

Get index statistics including file counts, chunk counts, and language distribution.

```typescript
{
} // No parameters required
```

### `get_token_analytics`

Track token consumption and estimate savings vs naive file reading.

```typescript
{
  reset?: boolean;  // Reset analytics after retrieval (default: false)
}
```

### `get_memory_profile`

Get real-time memory profiling data.

```typescript
{
  include_samples?: boolean;  // Include memory samples (default: false)
}
```

### `get_query_analytics`

Get search performance metrics including latency percentiles.

```typescript
{
  reset?: boolean;  // Reset analytics after retrieval (default: false)
}
```

### `search_symbols`

Search for functions, classes, and other symbols with fuzzy matching. Handles typos, case variations, and CamelCase/snake_case differences.

```typescript
{
  pattern: string;           // Symbol to search for (e.g., "getUser", "UserService")
  fuzzy_threshold?: number;  // Minimum similarity (0-1), default: 0.4
  types?: string[];          // Filter by types (e.g., ["function", "class"])
  limit?: number;            // Maximum results, default: 10
}
```

**Example prompts:**

> "Find the getUser function" (even with typos like "gtUser")
> "Search for UserService class"
> "Find all functions matching 'validate'"

## Configuration

### Environment Variables

| Variable               | Default                   | Description               |
| ---------------------- | ------------------------- | ------------------------- |
| `PROJECT_ROOT`         | Current directory         | Root of codebase to index |
| `DATA_DIR`             | `~/.seu-claude`           | Where to store index data |
| `EMBEDDING_MODEL`      | `Xenova/all-MiniLM-L6-v2` | HuggingFace model         |
| `EMBEDDING_DIMENSIONS` | `384`                     | Vector dimensions         |
| `LOG_LEVEL`            | `info`                    | debug, info, warn, error  |

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

### Token Savings Benchmark

seu-claude dramatically reduces token consumption by returning only semantically relevant code chunks instead of entire files.

| Metric           | Without seu-claude | With seu-claude | Savings |
| ---------------- | ------------------ | --------------- | ------- |
| Tokens per query | ~22,000            | ~1,500          | **91%** |
| Cost per session | $0.52              | $0.05           | **91%** |
| Context accuracy | N/A                | 95%+            | -       |

Run the benchmark yourself:

```bash
npx tsx scripts/benchmark-tokens.ts
```

### Indexing Performance (seu-claude codebase - 34 files)

| Metric            | Result |
| ----------------- | ------ |
| Indexing time     | ~6s    |
| Files processed   | 34     |
| Chunks created    | 406    |
| Memory (idle)     | ~100MB |
| Memory (indexing) | ~500MB |
| Query latency     | ~5ms   |

### Comparison

| Metric                | seu-claude   | Traditional RAG |
| --------------------- | ------------ | --------------- |
| RAM (idle)            | ~100MB       | 35GB+           |
| RAM (indexing)        | ~500MB       | N/A             |
| Index time (26 files) | ~5s          | Minutes         |
| Query latency         | ~50ms        | <10ms           |
| Startup time          | <2s          | 30s+            |
| Dependencies          | Node.js only | Python + CUDA   |

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
│   ├── search/               # Search engines (v1.2.0+)
│   │   ├── bm25.ts           # BM25 keyword search
│   │   └── hybrid.ts         # Hybrid search combiner
│   └── tools/
│       ├── index-codebase.ts
│       ├── search-codebase.ts
│       ├── read-context.ts
│       └── search-xrefs.ts
├── languages/                # Tree-sitter WASM grammars
└── models/                   # Downloaded embedding models
```

### Running Tests

```bash
npm test
```

## Roadmap

- [ ] Language Server Protocol integration for better symbol resolution
- [x] Git-aware indexing (prioritize recent changes)
- [x] Cross-reference graph (callers/callees) - via `search_xrefs` tool
- [ ] VSCode extension for index management
- [ ] Support for more languages (Kotlin, Swift, PHP)

See [ROADMAP.md](ROADMAP.md) for detailed plans.

## Contributing

We welcome contributions! Please see:

- [Contributing Guidelines](CONTRIBUTING.md) - How to contribute code
- [Code of Conduct](CODE_OF_CONDUCT.md) - Community standards
- [Support](.github/SUPPORT.md) - Getting help
- [GitHub Discussions](https://github.com/jardhel/seu-claude/discussions) - Ask questions

### Quick Start for Contributors

```bash
git clone https://github.com/jardhel/seu-claude.git
cd seu-claude
npm install
npm run build
npm test
```

## Community

- 💬 [GitHub Discussions](https://github.com/jardhel/seu-claude/discussions) - Ask questions, share ideas
- 🐛 [Issue Tracker](https://github.com/jardhel/seu-claude/issues) - Report bugs or request features
- 🌟 [Star the repo](https://github.com/jardhel/seu-claude) - Show your support!

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

# seu-claude v2: The Neuro-Symbolic Autonomous Developer

[![NPM Version](https://img.shields.io/npm/v/seu-claude/next)](https://www.npmjs.com/package/seu-claude)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **"It’s no longer a chat bot. It’s a compiler with an imagination."**

Seu-Claude v2 is a domain-agnostic agentic framework designed to solve the "Stochastic Drift" problem in autonomous agents. By grounding LLM reasoning in rigid symbolic structures (ASTs, SQL Task Managers, and Docker Sandboxes), we provide scale-invariant intelligence for repository-level engineering and knowledge management.

## 🚀 The Pivot: From Assistant to Employee

While v1 proved that agents could garden code and notes, v2 industrializes that logic into a **Hexagonal Neuro-Symbolic Architecture**.

### Key Innovations:

- **Symbolic Memory:** A persistent SQLite Task DAG. If the agent crashes, it resumes exactly where it left off.
- **Syntax Perception:** Powered by **Tree-Sitter**. The agent "sees" your code's Abstract Syntax Tree (AST), navigating imports and call sites with 100% precision.
- **Speculative Execution:** The "Proving Ground." Every fix is verified in an isolated Docker Sandbox before it reaches your eyes.
- **The Gatekeeper:** A deterministic validation layer that forces LLMs to self-correct syntax and linting errors autonomously.

## 🗺️ v2 Development Strategy

We follow a **Prerelease Flow** to maintain stability.

- **`main`**: Stable v1.x (Hotfixes only).
- **`v2-develop`**: Bleeding edge development of the Janus architecture.

**Install the latest alpha:**

```bash
npm install -g seu-claude@next
```
