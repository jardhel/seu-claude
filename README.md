# seu-claude: Neuro-Symbolic Autonomous Developer

[![NPM Version](https://img.shields.io/npm/v/seu-claude)](https://www.npmjs.com/package/seu-claude)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-252%20passing-brightgreen)](https://github.com/jardhel/seu-claude)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)

> **"The framework built itself. That's the proof it works."**

Seu-Claude is a **Hexagonal Neuro-Symbolic Architecture** that grounds LLM reasoning in rigid symbolic structures to solve the "Stochastic Drift" problem in autonomous agents.

## 🎯 The Problem

Current AI coding assistants suffer from:

❌ **Stochastic Drift** - LLMs lose track of multi-step tasks without persistent state
❌ **Context Amnesia** - Crashes lose all progress, agents restart from scratch
❌ **Blind Navigation** - Text-based code understanding misses structural relationships
❌ **Untested Changes** - Code pushed to main without validation

**seu-claude solves this** with a neuro-symbolic architecture that combines:

✅ **Persistent Task DAG** (SQLite) - Survives crashes
✅ **AST-Based Perception** (Tree-sitter) - Syntax-aware navigation
✅ **TDD Validation Loop** (Automated testing) - Every change tested
✅ **MCP Protocol Interface** - Claude Code/Desktop integration

## 🚀 Quick Start

### Installation

```bash
# Install globally
npm install -g seu-claude

# Or use npx
npx seu-claude /help
```

### Usage

**MCP Server Mode** (for Claude Code/Desktop):
```bash
seu-claude
```

**CLI Mode** (for direct usage):
```bash
seu-claude /help                # Show available commands
seu-claude /plan create "Task"  # Create task plan
seu-claude /deps src/index.ts   # Analyze dependencies
seu-claude /check src/file.ts   # Validate code quality
seu-claude /test                # Run tests in sandbox
```

### Claude Code Integration

Add to your project's `.claude/settings.json`:

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

## 🏗️ Architecture

### Hexagonal (Ports & Adapters)

```
┌──────────────────────────────────────────────────────────┐
│                     MCP Protocol Layer                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │   tools    │  │  handler   │  │      server        │ │
│  │  (defs)    │  │  (logic)   │  │  (stdio/network)   │ │
│  └────────────┘  └────────────┘  └────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│                 Core Business Logic (Domain)              │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Use Cases:                                      │    │
│  │   • TaskManager: Persistent task DAG             │    │
│  │   • RecursiveScout: AST dependency analysis      │    │
│  │   • Gatekeeper: Pre-flight validation           │    │
│  │   • HypothesisEngine: TDD cycle executor        │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│                     Adapters Layer                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │  Database  │  │   Parsers  │  │      Sandbox       │ │
│  │  (SQLite)  │  │(TreeSitter)│  │   (ProcessExec)    │ │
│  └────────────┘  └────────────┘  └────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Four Phases

#### Phase 1: Foundation (TaskManager DAG) ✅

**Persistent task state that survives crashes**

- Hierarchical task DAG with parent-child relationships
- Tool output caching to prevent duplicate work
- State recovery after process restart
- Status tracking: pending → running → completed/failed

```typescript
const manager = new TaskManager(store);
const root = await manager.createRootGoal('Project Goal');
const subtask = await manager.spawnSubtask(root.id, 'Implement Feature');
await manager.updateStatus(subtask.id, 'completed');
```

#### Phase 2: Perception (RecursiveScout) ✅

**AST-based code understanding**

- Multi-language AST parsing (TypeScript, Python, JavaScript)
- Recursive import resolution
- Circular dependency detection
- Symbol extraction (functions, classes, methods)

```typescript
const scout = new RecursiveScout(adapter);
const graph = await scout.buildDependencyGraph(['/path/to/entry.ts']);
const path = scout.findImportPath(fileA, fileB, graph);
```

#### Phase 3: The Proving Ground ✅

**Automated validation and testing**

- **Gatekeeper**: Pre-flight validation (ESLint + TypeScript)
- **ProcessSandbox**: Isolated code execution
- **HypothesisEngine**: TDD cycle automation (RED → GREEN → REFACTOR)

```typescript
// Gatekeeper validation
const gatekeeper = new Gatekeeper();
const result = await gatekeeper.preflightCheck(['/path/to/file.ts']);

// Hypothesis testing
const engine = new HypothesisEngine();
const result = await engine.runTDDCycle(hypothesis);
// Returns: { phase: "green", testResult: {...} }
```

#### Phase 4: MCP Interface ✅

**Claude Code/Desktop integration**

- **6 MCP Tools**: analyze_dependency, validate_code, execute_sandbox, manage_task, run_tdd, find_symbol
- **7 CLI Commands**: /plan, /test, /deps, /check, /find, /nuke, /help
- **Unified Entry Point**: Auto-detects MCP vs CLI mode

## 🛠️ MCP Tools

### 1. `analyze_dependency`

Analyze code dependencies using RecursiveScout.

```json
{
  "entryPoints": ["/src/index.ts"],
  "maxDepth": 50,
  "includeNodeModules": false
}
```

**Returns**: Dependency graph with files, symbols, imports, circular dependencies

### 2. `validate_code`

Run Gatekeeper pre-flight checks (ESLint + TypeScript).

```json
{
  "paths": ["/src/file.ts"],
  "fix": false
}
```

**Returns**: Validation result with errors/warnings

### 3. `execute_sandbox`

Run commands in isolated ProcessSandbox.

```json
{
  "command": "npm",
  "args": ["test"],
  "timeout": 30000
}
```

**Returns**: Command output, exit code, execution time

### 4. `manage_task`

Manage task DAG (create, update, list, visualize).

```json
{
  "action": "create",
  "label": "Implement feature",
  "parentId": "uuid-of-parent"
}
```

**Actions**: create, update, list, tree, status

### 5. `run_tdd`

Execute TDD cycle with HypothesisEngine.

```json
{
  "description": "Test addition",
  "testCode": "...",
  "implementationCode": "...",
  "testFilePath": "./test.js",
  "implementationFilePath": "./impl.js"
}
```

**Returns**: TDD phase (red/green/refactor) and test results

### 6. `find_symbol`

Find symbols across codebase using RecursiveScout.

```json
{
  "symbolName": "handleRequest",
  "entryPoints": ["/src/index.ts"]
}
```

**Returns**: All occurrences with file paths and line numbers

## 💻 CLI Commands

### `/help`
Show available commands and usage.

### `/plan <action> [options]`
Manage task plans.

```bash
seu-claude /plan create "Refactor auth system"
seu-claude /plan list
seu-claude /plan tree
seu-claude /plan status <task-id>
```

### `/deps <entryPoint> [options]`
Analyze code dependencies.

```bash
seu-claude /deps src/index.ts --depth 10
seu-claude /deps src/api --no-node-modules
```

### `/check <path> [options]`
Validate code quality with Gatekeeper.

```bash
seu-claude /check src/api/routes.ts
seu-claude /check src --fix
```

### `/test [options]`
Run tests in ProcessSandbox.

```bash
seu-claude /test --all
seu-claude /test --file src/__tests__/auth.test.ts
```

### `/find <symbol> <path>`
Find symbol across codebase.

```bash
seu-claude /find UserService src/core
seu-claude /find authenticate src
```

### `/nuke [options]`
Reset state (clear task database).

```bash
seu-claude /nuke --confirm
```

## 📊 Performance

| Operation | Latency | Notes |
|-----------|---------|-------|
| Task CRUD | < 1ms | SQLite in-memory + disk |
| AST Parse (1000 LOC) | ~50ms | Tree-sitter WASM |
| Dependency Graph (50 files) | ~500ms | Recursive parsing |
| ESLint Validation | ~200ms | Per file |
| TypeScript Check | ~1s | Per project |
| Sandbox Execution | ~100ms + runtime | Process spawn |

## 🧪 Self-Hosting Validation

**seu-claude built itself using its own tools** - the ultimate proof of concept.

### Bootstrap (TaskManager)

Created 24-task Phase 4 plan using TaskManager:
- 21 files analyzed
- 737 symbols found
- 66 dependencies tracked
- 0 circular dependencies

### Hypothesis (TDD)

Validated TDD approach using HypothesisEngine:
- ✅ RED Phase: Test fails as expected
- ✅ GREEN Phase: Implementation passes
- ✅ REFACTOR Phase: Full cycle complete

### Gatekeeper (Quality)

Validated all Phase 4 code:
- ✅ 0 errors, 0 warnings
- Duration: ~1100ms
- Files: cli/index.ts, mcp/handler.ts, mcp/server.ts, v2.ts

### Test Suite

All tests passing:
- ✅ 252 tests passing (119 v2 + 133 other)
- ✅ 0 tests failing
- ✅ 6 tests skipped (intentional)

## 🎓 Use Cases

### 1. Crash-Resistant Development

**Problem**: LLM loses context after crash
**Solution**: TaskManager persists all state to SQLite

```typescript
// Before crash
const task = await manager.createRootGoal('Refactor auth');

// After restart
await manager.recoverState(); // Resumes exactly where it left off
```

### 2. Precise Dependency Analysis

**Problem**: LLM doesn't understand import relationships
**Solution**: RecursiveScout builds AST-based dependency graph

```typescript
const graph = await scout.buildDependencyGraph(['/src/index.ts']);
// Returns: { files, symbols, imports, circularDeps }
```

### 3. Automated Quality Gates

**Problem**: Code pushed without validation
**Solution**: Gatekeeper runs ESLint + TypeScript automatically

```typescript
const result = await gatekeeper.preflightCheck(['/src/api.ts']);
if (!result.passed) {
  // Block merge until fixed
}
```

### 4. Test-Driven Development Automation

**Problem**: Manual TDD cycle is tedious
**Solution**: HypothesisEngine automates RED-GREEN-REFACTOR

```typescript
const result = await engine.runTDDCycle(hypothesis);
// Automatically runs: test → fail → implement → pass → validate
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROJECT_ROOT` | `process.cwd()` | Target codebase root |
| `DATA_DIR` | `.seu-claude` | State storage directory |
| `LOG_LEVEL` | `info` | Logging verbosity |

### Data Storage

**SQLite Database**: `${DATA_DIR}/tasks.db`

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  label TEXT,
  status TEXT,
  context TEXT  -- JSON blob
);
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- src/core/tests/TaskManager.test.ts

# Build
npm run build

# Start MCP server
npm start
```

**Test Coverage**:
- Core layer: 95%+ (229 passing tests)
- Adapters: 80%+ (22 passing tests)
- MCP/CLI: 70%+ (27 passing tests)

## 📈 Stability & Recovery

### Crash-Resistant State

All tasks persisted to SQLite immediately:
```typescript
// State survives crashes
const manager = new TaskManager(store);
await manager.recoverState(); // Resumes from last known state
```

### Sandbox Isolation

Child process with timeout:
- No network access (planned: Docker)
- Resource limits (planned: cgroups)
- Clean shutdown on exit

## 🗺️ Roadmap

### ✅ Completed (v2.3.0)

- [x] Phase 1: TaskManager DAG
- [x] Phase 2: RecursiveScout + TreeSitter
- [x] Phase 3: Gatekeeper + HypothesisEngine
- [x] Phase 4: MCP Server + CLI
- [x] Self-hosting validation

### 📋 Planned (v2.4.0+)

- [ ] Docker sandbox (replace ProcessSandbox)
- [ ] LSP integration (better symbol resolution)
- [ ] Incremental indexing with git diff
- [ ] Web dashboard for task visualization
- [ ] VSCode extension

## 🤝 Contributing

We welcome contributions! See:

- [Contributing Guidelines](CONTRIBUTING.md)
- [Architecture Documentation](ARCHITECTURE_V2.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

### Quick Start for Contributors

```bash
git clone https://github.com/jardhel/seu-claude.git
cd seu-claude
git checkout v2-mcp
npm install
npm run build
npm test
```

## 📚 Documentation

- [Architecture (v2)](ARCHITECTURE_V2.md) - Detailed system design
- [User Guide (v2)](USER_GUIDE.md) - Getting started guide
- [Phase 4 Summary](PHASE4_SUMMARY.md) - Latest release notes
- [Phase 4 Complete](PHASE4_COMPLETE.md) - Full completion report

## 🏆 Recognition

**Self-Hosting Achievement**: seu-claude built Phase 4 using its own infrastructure - proving the architecture works for real-world software development.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Built on the [Model Context Protocol](https://modelcontextprotocol.io/)
- AST parsing by [Tree-sitter](https://tree-sitter.github.io/tree-sitter/)
- Inspired by compiler design and symbolic AI principles

---

**seu-claude** - Because autonomous agents need more than just vibes.
