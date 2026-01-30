# Migration Guide: v1 → v2

**Last Updated**: 2026-01-26

---

## Overview

Seu-claude has evolved from a traditional RAG (Retrieval-Augmented Generation) MCP server (v1) to a **Neuro-Symbolic Autonomous Developer** architecture (v2).

This guide explains the differences and how to migrate.

---

## What Changed?

### v1 (Legacy - Traditional RAG)

**Focus**: Semantic code search and retrieval

**Architecture**:

```
Claude → MCP Server → Vector Database (LanceDB)
                   ↓
              Tree-sitter Parser → Embeddings
```

**Key Features**:

- 9 MCP tools for code search
- Semantic search with embeddings
- AST-based chunking
- Cross-reference tracking
- ~100MB RAM usage

**Use Cases**:

- Finding code snippets
- Understanding code structure
- Reading code with context

### v2 (Current - Neuro-Symbolic Architecture)

**Focus**: Autonomous development with persistent state

**Architecture**:

```
┌─────────────────────────────────────┐
│      MCP Protocol / CLI Layer       │
└─────────────────────────────────────┘
                 │
┌─────────────────────────────────────┐
│         Core Business Logic         │
│  • TaskManager (SQLite DAG)         │
│  • RecursiveScout (AST Analysis)    │
│  • Gatekeeper (Validation)          │
│  • HypothesisEngine (TDD)           │
└─────────────────────────────────────┘
                 │
┌─────────────────────────────────────┐
│            Adapters                 │
│  • SQLite • Tree-sitter • Process   │
└─────────────────────────────────────┘
```

**Key Features**:

- **Persistent Task DAG**: Survives crashes (SQLite)
- **AST-Based Perception**: Understands code structure
- **Gatekeeper**: Pre-flight validation (ESLint + TypeScript)
- **HypothesisEngine**: Automated TDD cycles
- **6 MCP Tools** + **7 CLI Commands**
- **Self-hosting**: Framework built itself

**Use Cases**:

- Multi-step refactoring with crash recovery
- Automated quality gates
- Test-driven development automation
- Complex task management

---

## Feature Comparison

| Feature                 | v1      | v2                            |
| ----------------------- | ------- | ----------------------------- |
| **Semantic Search**     | ✅      | ✅ (via RecursiveScout)       |
| **AST Parsing**         | ✅      | ✅ (Enhanced)                 |
| **Cross-References**    | ✅      | ✅ (Improved)                 |
| **Task Management**     | ❌      | ✅ **NEW** (Persistent DAG)   |
| **Crash Recovery**      | ❌      | ✅ **NEW** (SQLite state)     |
| **Code Validation**     | ❌      | ✅ **NEW** (Gatekeeper)       |
| **TDD Automation**      | ❌      | ✅ **NEW** (HypothesisEngine) |
| **CLI Interface**       | ❌      | ✅ **NEW** (7 commands)       |
| **Dependency Analysis** | Partial | ✅ **Enhanced**               |
| **Multi-Language**      | ✅      | ✅                            |

---

## Tool Changes

### v1 Tools → v2 Tools

| v1 Tool                 | v2 Equivalent        | Changes                         |
| ----------------------- | -------------------- | ------------------------------- |
| `index_codebase`        | `analyze_dependency` | Now AST-based, not vector-based |
| `search_codebase`       | `find_symbol`        | Simplified, focus on symbols    |
| `read_semantic_context` | `find_symbol`        | Merged functionality            |
| `search_xrefs`          | `analyze_dependency` | Enhanced with full graph        |
| `get_stats`             | CLI: `/deps`         | Now CLI command                 |
| `get_token_analytics`   | _Removed_            | Not needed in v2                |
| `get_memory_profile`    | _Removed_            | Not needed in v2                |
| `get_query_analytics`   | _Removed_            | Not needed in v2                |
| `search_symbols`        | `find_symbol`        | Renamed, same functionality     |

### NEW v2 Tools

| Tool              | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `manage_task`     | Persistent task DAG management              |
| `validate_code`   | Gatekeeper validation (ESLint + TypeScript) |
| `execute_sandbox` | Run commands in isolation                   |
| `run_tdd`         | Automated TDD cycles                        |

---

## Migration Steps

### Step 1: Understand the Paradigm Shift

**v1 Thinking**: "Search for code, read it, modify it"
**v2 Thinking**: "Plan tasks, validate changes, test automatically"

v2 is designed for **autonomous multi-step workflows**, not just retrieval.

### Step 2: Update Installation

```bash
# Uninstall v1 (if global)
npm uninstall -g seu-claude

# Install v2
npm install -g seu-claude
```

### Step 3: Update Configuration

**v1 Config** (`.claude/settings.json`):

```json
{
  "mcpServers": {
    "seu-claude": {
      "command": "npx",
      "args": ["seu-claude"],
      "env": {
        "PROJECT_ROOT": ".",
        "DATA_DIR": "~/.seu-claude"
      }
    }
  }
}
```

**v2 Config** (same file):

```json
{
  "mcpServers": {
    "seu-claude": {
      "command": "npx",
      "args": ["seu-claude"],
      "env": {
        "PROJECT_ROOT": ".",
        "DATA_DIR": ".seu-claude"
      }
    }
  }
}
```

**Changes**:

- `DATA_DIR`: Now uses project-local `.seu-claude` instead of global `~/.seu-claude`
- This allows per-project task management

### Step 4: Update Workflows

#### v1 Workflow: Code Search

```
User: "Where is the authentication logic?"
Claude: [Uses search_codebase tool]
Claude: "Found in src/auth/index.ts"
```

#### v2 Equivalent:

```
User: "Where is the authentication logic?"
Claude: [Uses find_symbol tool]
Claude: "Found authenticate function in src/auth/index.ts:42"

User: "Analyze its dependencies"
Claude: [Uses analyze_dependency tool]
Claude: "authenticate depends on 5 files, no circular dependencies"
```

#### v1 Workflow: Refactoring

```
User: "Refactor the auth system"
Claude: [Manually searches, reads files, makes changes]
Claude: "Done. Please test manually."
```

#### v2 Equivalent:

```
User: "Refactor the auth system"
Claude: [Uses manage_task to create plan]
Claude: "Created task plan with 4 steps:
  1. Analyze dependencies
  2. Create test cases
  3. Implement changes
  4. Validate"

[Uses analyze_dependency, run_tdd, validate_code]

Claude: "✅ All steps complete:
  - Dependencies analyzed (12 files)
  - Tests passing (RED → GREEN)
  - Validation passed (0 errors)"
```

### Step 5: Leverage New Features

#### Persistent Tasks

```bash
# Create task plan
seu-claude /plan create "Implement OAuth"
seu-claude /plan create "Add database schema"
seu-claude /plan create "Create API endpoints"

# Even after crash/restart, tasks are preserved
seu-claude /plan tree
# Shows full task hierarchy
```

#### Automated Validation

```bash
# Before committing
seu-claude /check src/auth

# Output:
# ✅ ESLint: 0 errors
# ✅ TypeScript: 0 errors
```

#### TDD Automation

```typescript
// Via Claude Code
User: "Implement email validation with TDD"

Claude: [Uses run_tdd tool]
// Automatically:
// 1. Writes test (RED)
// 2. Implements solution (GREEN)
// 3. Validates with Gatekeeper (REFACTOR)
```

---

## Breaking Changes

### 1. Data Storage Location

**v1**: `~/.seu-claude/` (global)
**v2**: `.seu-claude/` (project-local)

**Why**: Per-project task management requires local storage.

**Migration**: No automatic migration. v1 index data is not compatible with v2 task data.

### 2. Tool Names

| Old (v1)          | New (v2)             |
| ----------------- | -------------------- |
| `search_codebase` | `find_symbol`        |
| `index_codebase`  | `analyze_dependency` |

**Migration**: Update prompts to use new tool names.

### 3. Tool Responses

v2 tools return more structured data:

**v1 search_codebase**:

```json
{
  "results": [{ "file": "...", "line": 42, "content": "..." }]
}
```

**v2 find_symbol**:

```json
{
  "found": true,
  "occurrences": [
    {
      "file": "...",
      "line": 42,
      "type": "function",
      "name": "authenticate"
    }
  ]
}
```

### 4. CLI Interface

v1 had no CLI. v2 has 7 CLI commands.

**New in v2**:

```bash
seu-claude /help
seu-claude /plan create "Task"
seu-claude /deps src/index.ts
seu-claude /check src
seu-claude /test --all
seu-claude /find symbol src
seu-claude /nuke --confirm
```

---

## When to Use v1 vs v2

### Use v1 (Legacy) If:

- You only need semantic code search
- You want minimal features
- You're on a resource-constrained environment
- You don't need task management

### Use v2 (Current) If:

- You need crash-resistant workflows
- You want automated quality gates
- You're doing complex multi-step refactors
- You need TDD automation
- You want CLI tools
- You're building autonomous agents

---

## FAQ

### Q: Can I run v1 and v2 simultaneously?

**A**: Not recommended. They use different data formats and tool names. Choose one.

### Q: Will my v1 index data migrate to v2?

**A**: No. v2 uses a different architecture (SQLite task DAG vs LanceDB vectors). You'll need to re-index with v2.

### Q: Is v2 slower than v1?

**A**: No. Dependency analysis in v2 is faster than vector search in v1 for structural queries.

### Q: Can I disable new v2 features and use it like v1?

**A**: Yes. Simply don't use the new tools (`manage_task`, `validate_code`, `run_tdd`, `execute_sandbox`). Use only `find_symbol` and `analyze_dependency`.

### Q: What happened to the vector database?

**A**: v2 focuses on symbolic reasoning (AST, DAG) over stochastic methods (embeddings, vectors). For semantic search, v1 is still available.

### Q: Will v1 receive updates?

**A**: No. v1 is in maintenance mode. All new features are in v2.

---

## Support

- **v2 Documentation**: [README.md](README.md), [USER_GUIDE.md](USER_GUIDE.md)
- **Architecture**: [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md)
- **GitHub Issues**: [https://github.com/jardhel/seu-claude/issues](https://github.com/jardhel/seu-claude/issues)

---

## Timeline

| Date       | Event                             |
| ---------- | --------------------------------- |
| 2026-01-15 | v1.0.0 launched (traditional RAG) |
| 2026-01-26 | v2.3.0 completed (neuro-symbolic) |
| 2026-02-01 | v2 becomes default (planned)      |

---

**Recommendation**: If starting fresh, use v2. It's more powerful and production-ready.
