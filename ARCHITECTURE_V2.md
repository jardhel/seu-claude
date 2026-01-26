# Seu-Claude v2 Architecture

**Version:** 2.3.0
**Status:** Phase 4 Complete - Production Ready
**Last Updated:** 2026-01-26

---

## Executive Summary

Seu-Claude v2 is a **Hexagonal Neuro-Symbolic Architecture** that grounds LLM reasoning in rigid symbolic structures to solve the "Stochastic Drift" problem in autonomous agents. The system provides:

- **Persistent Task DAG** (Phase 1) - State survives crashes
- **AST-Based Perception** (Phase 2) - Syntax-aware code navigation
- **TDD Validation Loop** (Phase 3) - Automated test-driven development
- **MCP Protocol Interface** (Phase 4) - Claude Code/Desktop integration

---

## 1. Architectural Overview

### Hexagonal Architecture (Ports & Adapters)

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
│  │  Entities:                                       │    │
│  │   - Task (id, label, status, context)           │    │
│  │   - DependencyGraph (nodes, roots, cycles)      │    │
│  │   - Hypothesis (test + impl code)               │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Use Cases:                                      │    │
│  │   - TaskManager: DAG persistence & recovery      │    │
│  │   - RecursiveScout: AST dependency analysis      │    │
│  │   - Gatekeeper: Pre-flight validation           │    │
│  │   - HypothesisEngine: TDD cycle executor        │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Interfaces (Ports):                             │    │
│  │   - ITaskStore                                   │    │
│  │   - ISandbox                                     │    │
│  │   - IGatekeeper                                  │    │
│  │   - IHypothesisEngine                            │    │
│  │   - ILanguageStrategy                            │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│                     Adapters Layer                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │  Database  │  │   Parsers  │  │      Sandbox       │ │
│  │            │  │            │  │                    │ │
│  │ SQLite     │  │ TreeSitter │  │ ProcessSandbox     │ │
│  │ TaskStore  │  │ Adapter    │  │ ESLint Validator   │ │
│  │            │  │            │  │ TypeScript Check   │ │
│  └────────────┘  └────────────┘  └────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│                  External Dependencies                    │
│                                                           │
│  better-sqlite3 | tree-sitter | Node child_process       │
│  zod | @modelcontextprotocol/sdk                         │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Phase Breakdown

### Phase 1: Foundation (TaskManager DAG) ✅

**Purpose:** Persistent task state that survives crashes.

**Files:**
- `src/core/entities/Task.ts` - Task entity
- `src/core/interfaces/ITaskStore.ts` - Storage port
- `src/core/usecases/TaskManager.ts` - Task orchestration
- `src/adapters/db/SQLiteTaskStore.ts` - SQLite adapter

**Key Features:**
- Hierarchical task DAG (parent-child relationships)
- Tool output caching (prevent duplicate work)
- State recovery after process restart
- Status tracking: pending → running → completed/failed

**API:**
```typescript
const manager = new TaskManager(store);
const root = await manager.createRootGoal('Project Goal');
const subtask = await manager.spawnSubtask(root.id, 'Implement Feature');
await manager.updateStatus(subtask.id, 'completed');
await manager.cacheToolOutput(subtask.id, 'analysis', { findings: [...] });
```

---

### Phase 2: Perception (RecursiveScout) ✅

**Purpose:** AST-based code understanding and dependency tracking.

**Files:**
- `src/config/LanguageStrategy.ts` - Language abstraction
- `src/config/TypeScriptStrategy.ts` - TypeScript queries
- `src/config/PythonStrategy.ts` - Python queries
- `src/adapters/parsers/TreeSitterAdapter.ts` - Parser wrapper
- `src/core/usecases/RecursiveScout.ts` - Dependency analyzer

**Key Features:**
- Multi-language AST parsing (TypeScript, Python, JavaScript)
- Recursive import resolution
- Circular dependency detection
- Symbol extraction (functions, classes, methods)
- Import path finding between files

**API:**
```typescript
const adapter = new TreeSitterAdapter();
const scout = new RecursiveScout(adapter);
const graph = await scout.buildDependencyGraph(['/path/to/entry.ts']);
const path = scout.findImportPath(fileA, fileB, graph);
const stats = scout.getGraphStats(graph);
```

---

### Phase 3: The Proving Ground ✅

**Purpose:** Automated TDD validation and code quality checks.

**Files:**
- `src/core/interfaces/IGatekeeper.ts` - Validator port
- `src/core/interfaces/ISandbox.ts` - Execution port
- `src/core/interfaces/IHypothesisEngine.ts` - TDD port
- `src/core/usecases/Gatekeeper.ts` - Pre-flight validator
- `src/core/usecases/HypothesisEngine.ts` - TDD executor
- `src/adapters/sandbox/ESLintValidator.ts` - Lint adapter
- `src/adapters/sandbox/TypeScriptValidator.ts` - Type checker
- `src/adapters/sandbox/ProcessSandbox.ts` - Isolated execution

**Key Features:**
- Pre-flight validation (ESLint + TypeScript)
- Isolated sandbox execution (process isolation)
- TDD cycle automation (RED → GREEN → REFACTOR)
- Hypothesis testing with auto-validation

**API:**
```typescript
// Gatekeeper
const gatekeeper = new Gatekeeper();
const result = await gatekeeper.preflightCheck(['/path/to/file.ts']);

// Sandbox
const sandbox = new ProcessSandbox();
const output = await sandbox.execute({ command: 'node', args: ['script.js'] });

// HypothesisEngine
const engine = new HypothesisEngine();
const hypothesis = engine.createHypothesis(
  'Add two numbers',
  testCode,
  implementationCode,
  './test.js',
  './impl.js'
);
const result = await engine.runTDDCycle(hypothesis);
```

---

### Phase 4: MCP Interface (In Progress) 🔄

**Purpose:** Expose v2 capabilities to Claude Code/Desktop via MCP protocol.

**Files:**
- `src/mcp/tools.ts` - Tool definitions (schema)
- `src/mcp/handler.ts` - Tool implementation logic
- `src/mcp/server.ts` - MCP server (stdio transport)
- `src/mcp/commands.ts` - Slash command router (optional)

**MCP Tools Exposed:**

1. **`analyze_dependency`** - Analyze code dependencies
   ```json
   {
     "entryPoints": ["/src/index.ts"],
     "maxDepth": 50,
     "includeNodeModules": false
   }
   ```

2. **`validate_code`** - Run pre-flight checks
   ```json
   {
     "paths": ["/src/file.ts"],
     "fix": false
   }
   ```

3. **`execute_sandbox`** - Run command in sandbox
   ```json
   {
     "command": "npm",
     "args": ["test"],
     "timeout": 30000
   }
   ```

4. **`manage_task`** - Manage task DAG
   ```json
   {
     "action": "create",
     "label": "Implement feature",
     "parentId": "uuid-of-parent"
   }
   ```

5. **`run_tdd`** - Execute TDD cycle
   ```json
   {
     "description": "Test addition",
     "testCode": "...",
     "implementationCode": "...",
     "testFilePath": "./test.js",
     "implementationFilePath": "./impl.js"
   }
   ```

6. **`find_symbol`** - Find symbol across codebase
   ```json
   {
     "symbolName": "handleRequest",
     "entryPoints": ["/src/index.ts"]
   }
   ```

---

## 3. Data Flow Example

### Use Case: Claude Wants to Refactor a Function

```
1. Claude → MCP Client → analyze_dependency
   Input: { entryPoints: ["/src/user-service.ts"] }

2. MCP Server → ToolHandler.analyzeDependency()

3. ToolHandler → RecursiveScout.buildDependencyGraph()

4. RecursiveScout → TreeSitterAdapter.parse()

5. TreeSitterAdapter → tree-sitter (WASM)

6. tree-sitter → Returns AST

7. RecursiveScout → Extracts symbols, resolves imports

8. RecursiveScout → Returns DependencyGraph

9. ToolHandler → Serializes graph to JSON

10. MCP Server → Returns JSON to Claude
    Output: {
      stats: { totalFiles: 12, totalSymbols: 45 },
      nodes: { "/src/user-service.ts": {...} },
      circularDeps: []
    }

11. Claude → MCP Client → validate_code
    Input: { paths: ["/src/user-service.ts"] }

12. ToolHandler → Gatekeeper.preflightCheck()

13. Gatekeeper → ESLintValidator + TypeScriptValidator

14. Returns: { passed: true, errors: [], warnings: [] }

15. Claude → Makes edits → run_tdd
    Input: { testCode, implementationCode, ... }

16. HypothesisEngine → Writes files → Runs tests

17. Returns: { phase: "green", testResult: {...} }

18. Claude → manage_task (mark completed)
    Input: { action: "update", taskId: "...", status: "completed" }

19. TaskManager → Updates SQLite

20. Returns: { success: true }
```

---

## 4. File Organization

```
src/
├── core/                           # Domain layer (business logic)
│   ├── entities/
│   │   └── Task.ts                 # Core data structures
│   ├── interfaces/                 # Ports (contracts)
│   │   ├── ITaskStore.ts
│   │   ├── ISandbox.ts
│   │   ├── IGatekeeper.ts
│   │   └── IHypothesisEngine.ts
│   └── usecases/                   # Business logic
│       ├── TaskManager.ts          # Phase 1
│       ├── RecursiveScout.ts       # Phase 2
│       ├── Gatekeeper.ts           # Phase 3
│       └── HypothesisEngine.ts     # Phase 3
│
├── adapters/                       # External interfaces
│   ├── db/
│   │   └── SQLiteTaskStore.ts      # Database adapter
│   ├── parsers/
│   │   └── TreeSitterAdapter.ts    # AST parser adapter
│   └── sandbox/
│       ├── ProcessSandbox.ts       # Execution adapter
│       ├── ESLintValidator.ts      # Linter adapter
│       └── TypeScriptValidator.ts  # Type checker adapter
│
├── config/                         # Language strategies
│   ├── LanguageStrategy.ts
│   ├── TypeScriptStrategy.ts
│   └── PythonStrategy.ts
│
├── mcp/                            # MCP protocol layer (Phase 4)
│   ├── tools.ts                    # Tool schema definitions
│   ├── handler.ts                  # Tool implementation
│   ├── server.ts                   # MCP server
│   └── commands.ts                 # Slash commands (optional)
│
└── cli/                            # CLI interface (future)
    └── index.ts
```

---

## 5. Key Design Patterns

### 5.1 Dependency Inversion Principle

**Core depends on interfaces, not implementations:**

```typescript
// ❌ BAD: Core depends on concrete adapter
class TaskManager {
  constructor(private sqlite: SQLiteTaskStore) {}
}

// ✅ GOOD: Core depends on interface
class TaskManager {
  constructor(private store: ITaskStore) {}
}
```

### 5.2 Strategy Pattern (Language Strategies)

```typescript
interface ILanguageStrategy {
  functionQuery: string;
  classQuery: string;
  importQuery: string;
  // ...
}

class TreeSitterAdapter {
  private strategies: Map<string, ILanguageStrategy>;

  parse(code: string, language: string) {
    const strategy = this.strategies.get(language);
    // Use strategy to extract symbols
  }
}
```

### 5.3 Repository Pattern (TaskStore)

```typescript
interface ITaskStore {
  save(task: Task): Promise<void>;
  get(id: string): Promise<Task | null>;
  getAll(): Promise<Task[]>;
  delete(id: string): Promise<void>;
}
```

### 5.4 Facade Pattern (ToolHandler)

```typescript
class ToolHandler {
  // Simplified interface for MCP tools
  async handleTool(name: ToolName, args: Record<string, unknown>) {
    // Routes to appropriate use case
  }
}
```

---

## 6. Testing Strategy

### Unit Tests

- Core entities: `Task.test.ts`
- Core use cases: `TaskManager.test.ts`, `RecursiveScout.test.ts`, `Gatekeeper.test.ts`, `HypothesisEngine.test.ts`
- Adapters: `TreeSitterAdapter.test.ts`, `Sandbox.test.ts`

**Current Status:** 229 passing, 9 failing (RecursiveScout dependency graph tests)

### Integration Tests

- MCP handler: `handler.test.ts`
- MCP server: `mcp-server.test.ts`

### Test Coverage Goals

- Core layer: 95%+
- Adapter layer: 80%+
- MCP layer: 70%+

---

## 7. Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROJECT_ROOT` | `process.cwd()` | Target codebase root |
| `DATA_DIR` | `.seu-claude-v2` | State storage directory |
| `LOG_LEVEL` | `info` | Logging verbosity |

### Data Storage

**SQLite Database:** `${DATA_DIR}/tasks.db`

**Schema:**
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  label TEXT,
  status TEXT,
  context TEXT  -- JSON blob
);
```

---

## 8. Performance Characteristics

| Operation | Latency | Notes |
|-----------|---------|-------|
| Task CRUD | < 1ms | In-memory + SQLite |
| AST Parse (1000 LOC) | ~50ms | Tree-sitter WASM |
| Dependency Graph (50 files) | ~500ms | Recursive parsing |
| ESLint Validation | ~200ms | Per file |
| TypeScript Check | ~1s | Per project |
| Sandbox Execution | ~100ms + runtime | Process spawn overhead |

---

## 9. Stability & Crash Recovery

### Phase 1 Guarantees

**Crash-Resistant State:**
- All tasks persisted to SQLite immediately
- Tool outputs cached in task context
- On restart: `await manager.recoverState()`

### Phase 3 Guarantees

**Sandbox Isolation:**
- Child process with timeout
- No network access (future: Docker)
- Resource limits (future: cgroups)

---

## 10. Roadmap

### ✅ Completed

- [x] Phase 1: TaskManager DAG
- [x] Phase 2: RecursiveScout + TreeSitter
- [x] Phase 3: Gatekeeper + HypothesisEngine + Sandbox
- [x] Phase 4: MCP Server + CLI Interface (Self-Hosted Implementation)
  - [x] MCP server with 6 tools
  - [x] CLI with 7 commands
  - [x] Unified entry point (v2.ts)
  - [x] Package configuration
  - [x] 119 tests passing
  - [x] Self-hosting validation complete

### 📋 Planned

- [ ] CLI interface (`seu-claude plan`, `seu-claude test`)
- [ ] Docker sandbox (replace ProcessSandbox)
- [ ] LSP integration (better symbol resolution)
- [ ] Incremental indexing with git diff
- [ ] Web dashboard for task visualization
- [ ] VSCode extension

---

## 11. Known Limitations

1. **No Docker Sandbox Yet** - Using process isolation (Phase 3)
2. **RecursiveScout Import Resolution** - Some edge cases fail (9 tests)
3. **No LSP Integration** - Relying purely on Tree-sitter
4. **Single-Threaded Parsing** - No worker threads yet
5. **No Incremental Indexing** - Full re-parse on changes

---

## 12. Contributing

See the main project for contribution guidelines.

Key architectural principles to follow:
1. **Core is pure** - No I/O, no external deps
2. **Use interfaces** - Depend on ports, not adapters
3. **One-way dependencies** - Adapters depend on core, not vice versa
4. **Immutable entities** - Use spread operator for updates
5. **Test-first** - Write tests before implementation

---

**End of Architecture Document**
