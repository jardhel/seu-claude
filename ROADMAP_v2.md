---

### File 2: `ROADMAP.md`

_Purpose: The master instruction set for Claude Code._

```markdown
# ROADMAP: Project Janus (Seu-Claude v2)

## 1. Core Principles

- **Offload Cognitive Load:** Use Databases for memory, not prompts.
- **Trust, But Verify:** Every change must pass a Sandbox test.
- **Context Nuke:** Periodically wipe LLM history and rely on the Task DB to prevent drift.

## 2. Implementation Phases

### Phase 1: Foundation (Branch: `v2-foundation`)

- [ ] **TaskManager:** SQLite-backed DAG for task persistence.
- [ ] **Indexer:** Incremental Vector Indexing using Git Diffs and AST-based chunking.
- [ ] **Tests:** Resilience proof-of-concept (State recovery after crash).

### Phase 2: Perception (Branch: `v2-scout`)

- [ ] **RecursiveScout:** Tree-Sitter integration for multi-language AST navigation.
- [ ] **Symbol Resolution:** Mapping function calls to file paths across the repo.

### Phase 3: The Proving Ground (Branch: `v2-sandbox`)

- [ ] **The Gatekeeper:** Automated pre-commit linting and syntax validation.
- [ ] **DockerSandbox:** Execution of reproduction tests in isolated microVMs.

### Phase 4: Interface & DX (Branch: `v2-mcp`)

- [ ] **MCP Server:** Exposing deep-reasoning tools to Claude/Cursor.
- [ ] **Slash Commands:** `/plan`, `/test`, `/nuke` CLI interactions.

## 3. Vector Sync Flow

- **Trigger:** `git diff --name-only`
- **Logic:** Delete-then-Insert (Upsert) on file modification.
- **Granularity:** Symbol-level (Functions/Classes) via AST.
```
