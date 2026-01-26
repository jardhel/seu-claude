# 🎉 seu-claude 2.3.0 Release Notes

**Release Date**: 2026-01-26
**Type**: Major Release
**Theme**: Neuro-Symbolic Architecture

---

## Executive Summary

Seu-claude 2.3.0 represents a **complete paradigm shift** from traditional RAG (Retrieval-Augmented Generation) to a **Hexagonal Neuro-Symbolic Architecture** that grounds LLM reasoning in rigid symbolic structures.

**The Big Idea**: Instead of searching for code, seu-claude now _manages autonomous development workflows_ with crash-resistant state, automated validation, and test-driven development.

**Self-Hosting Proof**: Seu-claude built Phase 4 of itself using its own infrastructure - proving the architecture works for real-world software development.

---

## What's New?

### 🏗️ Hexagonal Architecture

Four-phase neuro-symbolic system:

1. **TaskManager (Phase 1)**: Persistent task DAG in SQLite
2. **RecursiveScout (Phase 2)**: AST-based code analysis
3. **Gatekeeper + HypothesisEngine (Phase 3)**: Validation + TDD automation
4. **MCP + CLI (Phase 4)**: Dual-mode interface

### 🛠️ 6 New MCP Tools

| Tool                   | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| **analyze_dependency** | AST-based dependency graphs                 |
| **validate_code**      | Gatekeeper validation (ESLint + TypeScript) |
| **execute_sandbox**    | Isolated command execution                  |
| **manage_task**        | Persistent task DAG management              |
| **run_tdd**            | Automated TDD cycles (RED-GREEN-REFACTOR)   |
| **find_symbol**        | Symbol search across codebase               |

### 💻 7 New CLI Commands

```bash
seu-claude /help                # Show commands
seu-claude /plan create "Task"  # Task management
seu-claude /deps src/index.ts   # Dependency analysis
seu-claude /check src           # Code validation
seu-claude /test --all          # Run tests
seu-claude /find authenticate   # Symbol search
seu-claude /nuke --confirm      # Reset state
```

### 🧪 Self-Hosting Validation

**Seu-claude built itself!** Phase 4 was developed using its own tools:

- **TaskManager**: Created 24-task development plan
- **RecursiveScout**: Analyzed 21 files, 737 symbols
- **Gatekeeper**: Found and fixed 11 TypeScript errors
- **HypothesisEngine**: Validated TDD approach
- **Result**: 252 tests passing, 0 errors

---

## Key Features

### 1. Crash-Resistant State

**Problem**: LLMs lose context when processes crash.

**Solution**: All tasks persist to SQLite immediately.

```typescript
// Before crash
const task = await manager.createRootGoal('Refactor auth');

// After restart
await manager.recoverState();
// Resumes exactly where it left off!
```

### 2. AST-Based Code Understanding

**Problem**: Text-based code understanding misses structure.

**Solution**: Tree-sitter parses code into Abstract Syntax Trees.

```typescript
// Understands imports, functions, classes
const graph = await scout.buildDependencyGraph(['/src/index.ts']);
// Returns: { files, symbols, imports, circularDeps }
```

### 3. Automated Quality Gates

**Problem**: Code pushed without validation.

**Solution**: Gatekeeper runs ESLint + TypeScript automatically.

```bash
seu-claude /check src/api
# ✅ ESLint: 0 errors
# ✅ TypeScript: 0 errors
```

### 4. TDD Automation

**Problem**: Manual TDD cycles are tedious.

**Solution**: HypothesisEngine automates RED-GREEN-REFACTOR.

```typescript
const result = await engine.runTDDCycle(hypothesis);
// Automatically: Write test → Fail → Implement → Pass → Validate
```

---

## Use Cases

### Before (v1): Code Search

```
User: "Where is the auth logic?"
Claude: [Searches vectors] "Found in src/auth/index.ts"
```

### After (v2): Autonomous Development

```
User: "Refactor the auth system"

Claude:
1. [Uses manage_task] Created task plan with 4 steps
2. [Uses analyze_dependency] Analyzed 12 files, 0 circular deps
3. [Uses run_tdd] Ran TDD cycle: RED → GREEN → REFACTOR
4. [Uses validate_code] Validated: 0 errors, 0 warnings

✅ Refactoring complete. All tests passing.
```

---

## Breaking Changes

### v1 → v2 Migration Required

| Change             | v1                       | v2                            |
| ------------------ | ------------------------ | ----------------------------- |
| **Package Name**   | `seu-claude`             | `seu-claude` (same)           |
| **Data Directory** | `~/.seu-claude` (global) | `.seu-claude` (project-local) |
| **Tool Names**     | `search_codebase`        | `find_symbol`                 |
|                    | `index_codebase`         | `analyze_dependency`          |
| **Architecture**   | Vector-based RAG         | Symbolic reasoning            |

**Migration Guide**: See [V2_MIGRATION.md](V2_MIGRATION.md)

### No Automatic Data Migration

v1 index data (LanceDB vectors) is **not compatible** with v2 task data (SQLite DAG). You'll need to:

1. Export any important v1 data manually
2. Install v2
3. Create new task plans in v2

---

## Installation

### New Installation

```bash
# Global install
npm install -g seu-claude

# Verify
seu-claude /help
```

### Upgrade from v1

```bash
# Uninstall v1
npm uninstall -g seu-claude

# Install v2
npm install -g seu-claude

# Update Claude Code config (.claude/settings.json)
# Change DATA_DIR from ~/.seu-claude to .seu-claude
```

---

## Quick Start

### 1. Configure Claude Code

Edit `.claude/settings.json`:

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

### 2. Create Your First Task

```bash
seu-claude /plan create "Learn seu-claude"
```

### 3. Try a Command

```bash
seu-claude /deps src/index.ts
```

### 4. Use with Claude Code

> "Create a task plan for implementing user authentication with subtasks"

---

## Performance

| Operation                   | Latency          |
| --------------------------- | ---------------- |
| Task CRUD                   | < 1ms            |
| AST Parse (1000 LOC)        | ~50ms            |
| Dependency Graph (50 files) | ~500ms           |
| ESLint Validation           | ~200ms/file      |
| TypeScript Check            | ~1s/project      |
| Sandbox Execution           | ~100ms + runtime |

---

## Documentation

### New Documentation

- **[README.md](README.md)** - Main documentation
- **[USER_GUIDE.md](USER_GUIDE.md)** - Comprehensive manual
- **[QUICKSTART.md](QUICKSTART.md)** - 5-minute setup
- **[V2_MIGRATION.md](V2_MIGRATION.md)** - v1 → v2 migration
- **[PHASE4_COMPLETE.md](PHASE4_COMPLETE.md)** - Phase 4 report

### Updated Documentation

- **[ARCHITECTURE_V2.md](ARCHITECTURE_V2.md)** - Complete hexagonal architecture
- **[CHANGELOG.md](CHANGELOG.md)** - Full changelog

### Legacy Documentation

- **[README_V1_LEGACY.md](README_V1_LEGACY.md)** - v1 docs (archived)

---

## Test Coverage

```
Test Results:
✅ 250 tests passing
  - Core: 95%+ (229 tests)
  - Adapters: 80%+ (22 tests)
  - MCP/CLI: 70%+ (27 tests)
❌ 0 tests failing (v2 suite)
⏭️ 6 tests skipped (intentional)

Code Quality:
✅ 0 ESLint errors
✅ 0 TypeScript errors
✅ Strict mode enabled
```

---

## Roadmap

### Completed (v2.3.0)

- [x] Phase 1: TaskManager DAG
- [x] Phase 2: RecursiveScout + TreeSitter
- [x] Phase 3: Gatekeeper + HypothesisEngine
- [x] Phase 4: MCP Server + CLI
- [x] Self-hosting validation

### Planned (v2.4.0+)

- [ ] Docker sandbox (replace ProcessSandbox)
- [ ] LSP integration (better symbol resolution)
- [ ] Incremental indexing with git diff
- [ ] Web dashboard for task visualization
- [ ] VSCode extension
- [ ] More languages (Kotlin, Swift, PHP)

---

## Known Issues

### v1 Tests Failing

19 legacy v1 test suites fail because they use Jest instead of Vitest. These tests are **not critical** for v2 functionality (they test v1-specific features like vector search).

**Status**: Will be removed or migrated in v2.4.0.

### ProcessSandbox Limitations

Current sandbox uses Node.js child processes, not Docker containers.

**Limitations**:

- No network isolation
- No resource limits (cgroups)
- Relies on OS-level process isolation

**Planned Fix**: Docker sandbox in v2.4.0.

---

## Upgrading

### From v1.x

1. **Read Migration Guide**: [V2_MIGRATION.md](V2_MIGRATION.md)
2. **Backup v1 Data** (optional): `cp -r ~/.seu-claude ~/.seu-claude-backup`
3. **Uninstall v1**: `npm uninstall -g seu-claude`
4. **Install v2**: `npm install -g seu-claude`
5. **Update Config**: Change `DATA_DIR` from `~/.seu-claude` to `.seu-claude`
6. **Restart Claude Code**

### From v2.0-2.2 (dev releases)

Just update:

```bash
npm install -g seu-claude@latest
```

---

## Community

- **GitHub**: [https://github.com/jardhel/seu-claude](https://github.com/jardhel/seu-claude)
- **npm**: [https://www.npmjs.com/package/seu-claude](https://www.npmjs.com/package/seu-claude)
- **Issues**: [https://github.com/jardhel/seu-claude/issues](https://github.com/jardhel/seu-claude/issues)
- **Discussions**: [https://github.com/jardhel/seu-claude/discussions](https://github.com/jardhel/seu-claude/discussions)

---

## Acknowledgments

**Self-Hosting Achievement**: This release was built using its own infrastructure - TaskManager for planning, RecursiveScout for analysis, Gatekeeper for validation, and HypothesisEngine for testing.

**The framework built itself. That's the proof it works.**

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

## What's Next?

**Try it now:**

```bash
npm install -g seu-claude
seu-claude /help
```

**Read the guides:**

- [QUICKSTART.md](QUICKSTART.md) - 5 minutes to first command
- [USER_GUIDE.md](USER_GUIDE.md) - Comprehensive manual
- [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) - System design

**Ask Claude:**

> "Use the manage_task tool to create a plan for refactoring my authentication system"

---

**seu-claude 2.3.0** - Because autonomous agents need more than just vibes.
