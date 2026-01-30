# seu-claude User Guide

**Version**: 2.3.0
**Last Updated**: 2026-01-26

---

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Getting Started](#getting-started)
4. [MCP Tools Guide](#mcp-tools-guide)
5. [CLI Commands Guide](#cli-commands-guide)
6. [Core Concepts](#core-concepts)
7. [Workflow Examples](#workflow-examples)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)
10. [Advanced Usage](#advanced-usage)

---

## Introduction

### What is seu-claude?

Seu-claude v2 is a **Neuro-Symbolic Architecture** that provides Claude (and other LLMs) with:

- **Persistent Memory**: Tasks and context survive crashes via SQLite
- **Code Understanding**: AST-based dependency analysis with Tree-sitter
- **Quality Assurance**: Automated validation (ESLint + TypeScript)
- **Test Automation**: TDD cycle execution (RED → GREEN → REFACTOR)

### Who is it for?

- **Software Developers** using Claude Code/Desktop
- **AI Engineers** building autonomous agents
- **DevOps Teams** automating code quality checks
- **Researchers** studying neuro-symbolic systems

### Key Benefits

| Traditional LLM Assistants    | seu-claude                           |
| ----------------------------- | ------------------------------------ |
| Loses context on crash        | ✅ Persistent state (SQLite)         |
| Text-based code understanding | ✅ AST-aware (Tree-sitter)           |
| No quality guarantees         | ✅ Automated validation (Gatekeeper) |
| Manual testing                | ✅ TDD automation (HypothesisEngine) |
| Stochastic drift              | ✅ Symbolic task DAG                 |

---

## Installation

### Prerequisites

- **Node.js**: >= 20.0.0
- **npm**: >= 9.0.0
- **Operating Systems**: macOS, Linux, Windows (WSL recommended)

### Method 1: Global Installation (Recommended)

```bash
npm install -g seu-claude
```

Verify installation:

```bash
seu-claude /help
```

### Method 2: npx (No Installation)

```bash
npx seu-claude /help
```

### Method 3: Local Project Installation

```bash
cd your-project
npm install --save-dev seu-claude
npx seu-claude /help
```

---

## Getting Started

### Quick Start: 5-Minute Setup

#### 1. Start MCP Server

```bash
# Terminal 1: Start the MCP server
seu-claude
```

This starts the MCP server listening on stdio for Claude Code/Desktop.

#### 2. Configure Claude Code

Add to `.claude/settings.json` in your project:

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

#### 3. Reload Claude Code

Restart Claude Code to load the MCP server.

#### 4. Verify Connection

In Claude Code, ask:

> "Use the manage_task tool to list all tasks"

If successful, you'll see the task list (initially empty).

### First Steps: Create Your First Task

```bash
# CLI method
seu-claude /plan create "Learn seu-claude"

# Or via Claude Code with manage_task tool
```

---

## MCP Tools Guide

### 1. `analyze_dependency`

**Purpose**: Understand code structure and dependencies

**When to use**:

- Before refactoring to see impact
- Finding circular dependencies
- Understanding import chains
- Mapping file relationships

**Parameters**:

```typescript
{
  entryPoints: string[];           // Starting files to analyze
  maxDepth?: number;               // Max recursion depth (default: 50)
  includeNodeModules?: boolean;    // Include node_modules (default: false)
}
```

**Example**:

```json
{
  "entryPoints": ["/src/index.ts"],
  "maxDepth": 20,
  "includeNodeModules": false
}
```

**Returns**:

```typescript
{
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalDependencies: number;
  },
  nodes: {
    [filePath: string]: {
      symbols: Array<{ type, name, line }>;
      imports: Array<{ source, imported }>;
    }
  },
  circularDeps: string[][];
}
```

**Claude Code Prompt**:

> "Analyze dependencies starting from src/api/index.ts and show me any circular dependencies"

### 2. `validate_code`

**Purpose**: Run pre-flight quality checks

**When to use**:

- Before committing code
- After making changes
- As part of CI/CD pipeline
- To enforce code standards

**Parameters**:

```typescript
{
  paths: string[];        // Files/directories to validate
  fix?: boolean;          // Auto-fix issues (default: false)
}
```

**Example**:

```json
{
  "paths": ["/src/api/routes.ts", "/src/api/handlers.ts"],
  "fix": false
}
```

**Returns**:

```typescript
{
  passed: boolean;
  validatorResults: {
    [validatorId: string]: {
      passed: boolean;
      errors: Array<{ file, line, message }>;
      warnings: Array<{ file, line, message }>;
      durationMs: number;
    }
  }
}
```

**Claude Code Prompt**:

> "Validate src/api/routes.ts and fix any ESLint errors automatically"

### 3. `execute_sandbox`

**Purpose**: Run commands in isolated environment

**When to use**:

- Running tests
- Building projects
- Linting with specific configs
- Executing scripts safely

**Parameters**:

```typescript
{
  command: string;        // Command to execute
  args?: string[];        // Command arguments
  timeout?: number;       // Timeout in ms (default: 30000)
  cwd?: string;           // Working directory
}
```

**Example**:

```json
{
  "command": "npm",
  "args": ["test", "--", "auth.test.ts"],
  "timeout": 60000
}
```

**Returns**:

```typescript
{
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}
```

**Claude Code Prompt**:

> "Run npm test in a sandbox and show me the results"

### 4. `manage_task`

**Purpose**: Manage persistent task DAG

**When to use**:

- Planning multi-step work
- Tracking progress across sessions
- Recovering from crashes
- Organizing complex refactors

**Actions**:

#### Create Task

```json
{
  "action": "create",
  "label": "Refactor authentication system",
  "parentId": null // or parent task ID for subtask
}
```

#### Update Task

```json
{
  "action": "update",
  "taskId": "uuid-here",
  "status": "completed" // or "pending", "running", "failed"
}
```

#### List Tasks

```json
{
  "action": "list"
}
```

#### Show Task Tree

```json
{
  "action": "tree"
}
```

#### Get Task Status

```json
{
  "action": "status",
  "taskId": "uuid-here"
}
```

**Claude Code Prompt**:

> "Create a task plan for implementing user authentication with subtasks for: database schema, API endpoints, and frontend integration"

### 5. `run_tdd`

**Purpose**: Automate Test-Driven Development cycle

**When to use**:

- Implementing new features with TDD
- Validating hypothesis about code changes
- Ensuring tests fail first (RED)
- Confirming implementation passes (GREEN)

**Parameters**:

```typescript
{
  description: string; // What you're testing
  testCode: string; // Test file content
  implementationCode: string; // Implementation file content
  testFilePath: string; // Where to write test
  implementationFilePath: string; // Where to write implementation
}
```

**Example**:

```json
{
  "description": "User authentication",
  "testCode": "import { authenticate } from './auth';\n\ntest('valid credentials', () => {\n  expect(authenticate('user', 'pass')).toBe(true);\n});",
  "implementationCode": "export function authenticate(u: string, p: string) {\n  return u === 'user' && p === 'pass';\n}",
  "testFilePath": "./auth.test.ts",
  "implementationFilePath": "./auth.ts"
}
```

**Returns**:

```typescript
{
  phase: "red" | "green" | "refactor";
  testResult: {
    passed: boolean;
    output: string;
  };
  validationResult?: {
    passed: boolean;
    errors: Array<any>;
  }
}
```

**Claude Code Prompt**:

> "Run a TDD cycle to implement a function that validates email addresses. Start with a test that should fail."

### 6. `find_symbol`

**Purpose**: Locate functions, classes, methods across codebase

**When to use**:

- Finding where a function is defined
- Locating all usages of a class
- Understanding code organization
- Navigating large codebases

**Parameters**:

```typescript
{
  symbolName: string;         // Symbol to find
  entryPoints: string[];      // Where to start search
}
```

**Example**:

```json
{
  "symbolName": "UserService",
  "entryPoints": ["/src"]
}
```

**Returns**:

```typescript
{
  found: boolean;
  occurrences: Array<{
    file: string;
    line: number;
    type: 'function' | 'class' | 'method' | etc;
    name: string;
  }>;
}
```

**Claude Code Prompt**:

> "Find all occurrences of the handleRequest function starting from src/api"

---

## CLI Commands Guide

### `/help`

Show available commands and usage.

```bash
seu-claude /help
```

**Output**: List of all commands with brief descriptions

### `/plan <action> [options]`

Manage task plans.

#### Create Task

```bash
seu-claude /plan create "Implement OAuth login"
```

#### Create Subtask

```bash
# Create root first
seu-claude /plan create "Authentication System"

# Then add subtasks (prompts for parent ID)
seu-claude /plan create "Database schema"
```

#### List All Tasks

```bash
seu-claude /plan list
```

**Output**:

```
Tasks:
- [pending] abc-123: Authentication System
  - [pending] def-456: Database schema
  - [running] ghi-789: API endpoints
```

#### Show Task Tree

```bash
seu-claude /plan tree
```

**Output**: Visual tree structure

#### Update Task Status

```bash
seu-claude /plan update abc-123 completed
```

**Statuses**: pending, running, completed, failed

### `/deps <entryPoint> [options]`

Analyze code dependencies.

```bash
# Basic usage
seu-claude /deps src/index.ts

# With depth limit
seu-claude /deps src/api/index.ts --depth 10

# Exclude node_modules
seu-claude /deps src/app.ts --no-node-modules

# Multiple entry points
seu-claude /deps src/index.ts src/cli.ts
```

**Output**:

```
Dependency Analysis:
- Total files: 42
- Total symbols: 387
- Circular dependencies: 0

Files analyzed:
  src/index.ts → 23 imports
  src/api/index.ts → 8 imports
  ...
```

### `/check <path> [options]`

Validate code quality with Gatekeeper.

```bash
# Check single file
seu-claude /check src/api/routes.ts

# Check directory
seu-claude /check src/api

# Auto-fix issues
seu-claude /check src/api/routes.ts --fix

# Multiple paths
seu-claude /check src/api src/core
```

**Output**:

```
Validation Results:
✅ ESLint: 0 errors, 2 warnings
✅ TypeScript: 0 errors

Warnings:
  src/api/routes.ts:42 - Missing JSDoc comment
```

### `/test [options]`

Run tests in ProcessSandbox.

```bash
# Run all tests
seu-claude /test --all

# Run specific test file
seu-claude /test --file src/__tests__/auth.test.ts

# Run with custom command
seu-claude /test --command "npm run test:unit"

# With timeout
seu-claude /test --all --timeout 60000
```

**Output**:

```
Test Results:
✅ 23 passing
❌ 1 failing

Failed:
  auth.test.ts:42 - Expected true, got false
```

### `/find <symbol> <path>`

Find symbols across codebase.

```bash
# Find function
seu-claude /find authenticate src

# Find class
seu-claude /find UserService src/core

# Case-sensitive
seu-claude /find handleRequest src/api
```

**Output**:

```
Found 'authenticate' in 3 locations:
  src/auth/index.ts:42 (function)
  src/auth/helpers.ts:18 (function)
  src/__tests__/auth.test.ts:12 (import)
```

### `/nuke [options]`

Reset state (clear task database).

```bash
# Requires confirmation
seu-claude /nuke --confirm
```

**Warning**: This deletes all tasks and cached data!

---

## Core Concepts

### 1. Task DAG (Directed Acyclic Graph)

Tasks are organized in a hierarchical tree:

```
Root Task
├── Subtask 1
│   ├── Subtask 1.1
│   └── Subtask 1.2
└── Subtask 2
```

**Properties**:

- Each task has an ID, label, status, and optional parent
- Tasks can have context (JSON blob for tool outputs)
- Status transitions: pending → running → completed/failed
- Persisted to SQLite (`${DATA_DIR}/tasks.db`)

**Crash Recovery**:

```typescript
// Before crash
const task = await manager.createRootGoal('Big refactor');
// *crash*

// After restart
await manager.recoverState();
const tasks = await manager.getAllTasks();
// All tasks restored!
```

### 2. AST-Based Perception

Instead of treating code as text, v2 parses it into an Abstract Syntax Tree:

```typescript
// Text-based: "import { foo } from './bar';"
// AST-based:
{
  type: "import_statement",
  source: "./bar",
  imported: ["foo"],
  line: 1
}
```

**Benefits**:

- Understands code structure (functions, classes, imports)
- Resolves import paths accurately
- Detects circular dependencies
- Extracts symbols with context

### 3. Validation Pipeline (Gatekeeper)

Multi-stage validation before code changes:

```
Code → ESLint → TypeScript → ProcessSandbox → ✅ Approved
```

**Validators**:

- **ESLintValidator**: Linting rules, style checks
- **TypeScriptValidator**: Type errors, strict mode
- **ProcessSandbox**: Isolated test execution

### 4. TDD Cycle (HypothesisEngine)

Automates the Test-Driven Development flow:

```
1. RED: Write test → Run → Should fail
2. GREEN: Write implementation → Run → Should pass
3. REFACTOR: Validate with Gatekeeper → Clean code
```

**Hypothesis**:

```typescript
interface Hypothesis {
  description: string;
  testCode: string;
  implementationCode: string;
  testFilePath: string;
  implementationFilePath: string;
}
```

---

## Workflow Examples

### Example 1: Refactoring with Dependency Analysis

**Scenario**: Refactor authentication system

```bash
# Step 1: Analyze current dependencies
seu-claude /deps src/auth/index.ts --depth 20

# Output shows:
# - 12 files depend on auth/index.ts
# - 1 circular dependency found

# Step 2: Create task plan
seu-claude /plan create "Refactor auth system"

# Step 3: Validate before changes
seu-claude /check src/auth --fix

# Step 4: Make changes...

# Step 5: Validate after changes
seu-claude /check src/auth

# Step 6: Run tests
seu-claude /test --file src/auth/__tests__/auth.test.ts

# Step 7: Mark complete
seu-claude /plan update <task-id> completed
```

### Example 2: TDD Feature Development

**Scenario**: Implement email validation

**Via Claude Code**:

```
User: "Implement email validation using TDD"

Claude: "I'll use the run_tdd tool to implement this with Test-Driven Development."

[Calls run_tdd with test and implementation code]

Claude: "✅ RED phase: Test failed as expected (no implementation yet)
        ✅ GREEN phase: Implementation passes all tests
        ✅ REFACTOR phase: Code passes Gatekeeper validation"
```

### Example 3: Crash Recovery

**Scenario**: Complex multi-step task interrupted

```bash
# Day 1: Start complex refactor
seu-claude /plan create "Migrate to new API"
seu-claude /plan create "Update endpoints"
seu-claude /plan create "Update tests"
# ... work in progress ...
# *computer crashes*

# Day 2: Resume work
seu-claude /plan tree
# Output shows all tasks restored with correct status

# Continue from where you left off
seu-claude /plan list
# Shows: Migrate to new API [running]
#        Update endpoints [completed]
#        Update tests [pending]
```

### Example 4: Quality Gate Enforcement

**Scenario**: Enforce code quality before merge

```bash
# Pre-commit hook (add to .git/hooks/pre-commit)
#!/bin/bash

echo "Running seu-claude validation..."

# Get staged files
FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$')

if [ -z "$FILES" ]; then
  echo "No files to validate"
  exit 0
fi

# Run Gatekeeper
seu-claude /check $FILES

# Exit with validation result
if [ $? -ne 0 ]; then
  echo "❌ Validation failed. Fix errors before committing."
  exit 1
fi

echo "✅ Validation passed"
exit 0
```

---

## Best Practices

### 1. Task Management

**DO**:

- ✅ Create task plans for multi-step work
- ✅ Update task status as you progress
- ✅ Use descriptive task labels
- ✅ Keep task tree shallow (3-4 levels max)

**DON'T**:

- ❌ Create tasks for trivial operations
- ❌ Let tasks stay "running" indefinitely
- ❌ Create deep nested hierarchies (>5 levels)
- ❌ Forget to mark tasks complete

### 2. Dependency Analysis

**DO**:

- ✅ Analyze before major refactors
- ✅ Check for circular dependencies regularly
- ✅ Limit depth to avoid analysis paralysis
- ✅ Exclude node_modules unless necessary

**DON'T**:

- ❌ Analyze entire monorepos at once
- ❌ Include node_modules by default
- ❌ Use maxDepth > 50 (performance impact)

### 3. Code Validation

**DO**:

- ✅ Validate before committing
- ✅ Use --fix for auto-fixable issues
- ✅ Run Gatekeeper in CI/CD pipeline
- ✅ Fix errors before warnings

**DON'T**:

- ❌ Skip validation "just this once"
- ❌ Commit with validation errors
- ❌ Disable validators without reason

### 4. TDD Workflow

**DO**:

- ✅ Write test first (RED phase)
- ✅ Implement minimal solution (GREEN phase)
- ✅ Refactor with validation (REFACTOR phase)
- ✅ Keep tests focused and isolated

**DON'T**:

- ❌ Write implementation before test
- ❌ Skip refactor phase
- ❌ Write tests that always pass

### 5. Performance

**DO**:

- ✅ Use specific entry points for dependency analysis
- ✅ Set reasonable timeouts for sandbox execution
- ✅ Clear old tasks periodically with /nuke
- ✅ Monitor ${DATA_DIR} size

**DON'T**:

- ❌ Analyze entire codebase every time
- ❌ Set infinite timeouts
- ❌ Accumulate thousands of completed tasks

---

## Troubleshooting

### MCP Server Not Connecting

**Symptom**: Claude Code shows "MCP server failed to start"

**Solution**:

1. Check Node.js version: `node --version` (must be >= 20)
2. Verify installation: `npx seu-claude /help`
3. Check `.claude/settings.json` syntax (valid JSON)
4. Restart Claude Code
5. Check logs in `.claude/mcp-logs/`

### Task Database Locked

**Symptom**: "Database is locked" error

**Solution**:

1. Close all seu-claude instances
2. Delete `${DATA_DIR}/tasks.db-wal` and `${DATA_DIR}/tasks.db-shm`
3. Restart seu-claude

### Dependency Analysis Timeout

**Symptom**: "Dependency analysis timed out"

**Solution**:

1. Reduce maxDepth: `--depth 10`
2. Exclude node_modules: `--no-node-modules`
3. Use more specific entry points
4. Check for infinite import loops

### Validation Errors

**Symptom**: Gatekeeper shows errors that IDE doesn't

**Solution**:

1. Verify tsconfig.json is correct
2. Check ESLint config (.eslintrc.js)
3. Ensure dependencies are installed: `npm install`
4. Run tsc manually to see raw TypeScript errors

### Tests Failing in Sandbox

**Symptom**: Tests pass locally but fail in sandbox

**Solution**:

1. Check working directory: `--cwd` option
2. Verify test command: `--command` option
3. Increase timeout: `--timeout 60000`
4. Check environment variables

---

## Advanced Usage

### Custom Validators

Extend Gatekeeper with custom validators:

```typescript
import { IGatekeeper } from 'seu-claude';

class CustomValidator implements IGatekeeper {
  id = 'custom-validator';

  async validate(options) {
    // Your validation logic
    return {
      passed: true,
      errors: [],
      warnings: [],
      durationMs: 100,
    };
  }

  async isAvailable() {
    return true;
  }

  canValidate(filePath: string) {
    return filePath.endsWith('.custom');
  }
}
```

### Custom Language Strategies

Add support for new languages:

```typescript
import { ILanguageStrategy } from 'seu-claude';

export const KotlinStrategy: ILanguageStrategy = {
  extensions: ['.kt', '.kts'],
  functionQuery: '(function_declaration) @function',
  classQuery: '(class_declaration) @class',
  importQuery: '(import_header) @import',
  // ... other queries
};
```

### Programmatic API

Use v2 as a library:

```typescript
import { TaskManager, RecursiveScout, Gatekeeper, HypothesisEngine } from 'seu-claude';

// Task management
const manager = new TaskManager(store);
const task = await manager.createRootGoal('My goal');

// Dependency analysis
const scout = new RecursiveScout(adapter);
const graph = await scout.buildDependencyGraph(['/src/index.ts']);

// Validation
const gatekeeper = new Gatekeeper();
const result = await gatekeeper.preflightCheck(['/src/api.ts']);

// TDD automation
const engine = new HypothesisEngine();
const result = await engine.runTDDCycle(hypothesis);
```

### CI/CD Integration

#### GitHub Actions

```yaml
name: seu-claude Validation

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install seu-claude
        run: npm install -g seu-claude

      - name: Validate changed files
        run: |
          FILES=$(git diff --name-only ${{ github.event.before }} ${{ github.sha }} | grep -E '\.(ts|tsx|js|jsx)$')
          if [ -n "$FILES" ]; then
            seu-claude /check $FILES
          fi

      - name: Run tests
        run: seu-claude /test --all
```

#### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$')

if [ -n "$FILES" ]; then
  npx seu-claude /check $FILES || exit 1
fi

exit 0
```

---

## Additional Resources

- [Architecture Documentation](ARCHITECTURE_V2.md) - System design deep dive
- [Phase 4 Summary](PHASE4_SUMMARY.md) - Latest release notes
- [Contributing Guide](CONTRIBUTING.md) - How to contribute
- [GitHub Repository](https://github.com/jardhel/seu-claude) - Source code

---

## Support

- **Issues**: [GitHub Issues](https://github.com/jardhel/seu-claude/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jardhel/seu-claude/discussions)
- **Security**: See [SECURITY.md](SECURITY.md)

---

**Last Updated**: 2026-01-26
**Version**: 2.3.0
