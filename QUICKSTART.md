# Seu-Claude Quick Start Guide

**Get started in 5 minutes** | Version 2.3.0

---

## 1. Install

```bash
npm install -g seu-claude
```

Verify:

```bash
seu-claude /help
```

---

## 2. Choose Your Mode

### Option A: Claude Code/Desktop (MCP Server)

Add to `.claude/settings.json`:

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

Start Claude Code and you'll have access to 6 MCP tools.

### Option B: CLI (Direct Usage)

```bash
seu-claude /help                # Show commands
seu-claude /plan create "Task"  # Create task
seu-claude /deps src/index.ts   # Analyze dependencies
seu-claude /check src           # Validate code
```

---

## 3. Try Your First Command

### Create a Task Plan

```bash
seu-claude /plan create "Refactor authentication"
```

Output:

```
✓ Task created: Refactor authentication [abc-123]
```

### Analyze Dependencies

```bash
seu-claude /deps src/index.ts
```

Output:

```
Dependency Analysis:
- Total files: 12
- Total symbols: 89
- Circular dependencies: 0
```

### Validate Code

```bash
seu-claude /check src/api
```

Output:

```
✅ ESLint: 0 errors, 2 warnings
✅ TypeScript: 0 errors
```

---

## 4. Use With Claude Code

**Example Prompts:**

> "Create a task plan for implementing OAuth login with database schema, API endpoints, and tests as subtasks"

> "Analyze dependencies starting from src/api/index.ts and show any circular dependencies"

> "Validate src/auth/index.ts with Gatekeeper and fix any issues automatically"

> "Run a TDD cycle to implement email validation - write the test first, then the implementation"

> "Find all occurrences of the authenticate function in the codebase"

---

## 5. Common Workflows

### Workflow 1: Refactoring with Confidence

```bash
# 1. Analyze what you're changing
seu-claude /deps src/auth/index.ts

# 2. Create task plan
seu-claude /plan create "Refactor auth system"

# 3. Make your changes...

# 4. Validate before committing
seu-claude /check src/auth

# 5. Run tests
seu-claude /test --all

# 6. Mark complete
seu-claude /plan list
seu-claude /plan update <task-id> completed
```

### Workflow 2: Test-Driven Development

Via Claude Code:

```
User: "Implement password validation using TDD"

Claude: [Uses run_tdd tool]

Output:
✅ RED phase: Test fails (no implementation)
✅ GREEN phase: Test passes (implementation added)
✅ REFACTOR phase: Code validated with Gatekeeper
```

### Workflow 3: Code Quality Gates

```bash
# Add to .git/hooks/pre-commit
#!/bin/bash
FILES=$(git diff --cached --name-only | grep -E '\.(ts|js)$')
if [ -n "$FILES" ]; then
  seu-claude /check $FILES || exit 1
fi
```

---

## 6. Key Features

| Feature                 | Command/Tool                    | What It Does                           |
| ----------------------- | ------------------------------- | -------------------------------------- |
| **Task Management**     | `/plan` or `manage_task`        | Persistent task DAG (survives crashes) |
| **Dependency Analysis** | `/deps` or `analyze_dependency` | AST-based import graph                 |
| **Code Validation**     | `/check` or `validate_code`     | ESLint + TypeScript checks             |
| **Sandbox Execution**   | `/test` or `execute_sandbox`    | Run commands safely                    |
| **TDD Automation**      | `run_tdd`                       | RED-GREEN-REFACTOR cycle               |
| **Symbol Search**       | `/find` or `find_symbol`        | Find functions/classes                 |

---

## 7. Troubleshooting

### MCP Server Not Connecting

```bash
# Check installation
npx seu-claude /help

# Verify Node.js version
node --version  # Should be >= 20

# Check .claude/settings.json syntax
cat .claude/settings.json | jq .

# Restart Claude Code
```

### Command Not Found

```bash
# If global install didn't work, use npx
npx seu-claude /help

# Or install locally
npm install --save-dev seu-claude
npx seu-claude /help
```

### Database Locked Error

```bash
# Stop all seu-claude instances
pkill -f seu-claude

# Remove lock files
rm .seu-claude/tasks.db-wal .seu-claude/tasks.db-shm

# Restart
seu-claude
```

---

## 8. Next Steps

- **Full Documentation**: [README.md](README.md)
- **User Guide**: [USER_GUIDE.md](USER_GUIDE.md) - Comprehensive manual
- **Architecture**: [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) - System design
- **Migration**: [V2_MIGRATION.md](V2_MIGRATION.md) - If coming from v1

---

## 9. Examples

### Example 1: Multi-Step Refactor

```bash
# Create hierarchical plan
seu-claude /plan create "Migrate to new API"
# Copy the task ID, then:
seu-claude /plan create "Update endpoints" --parent <task-id>
seu-claude /plan create "Update tests" --parent <task-id>
seu-claude /plan create "Update documentation" --parent <task-id>

# View tree
seu-claude /plan tree

# Work on each subtask...
seu-claude /plan update <subtask-id> completed
```

### Example 2: Find and Fix Issues

```bash
# Find where a function is used
seu-claude /find handleRequest src

# Analyze its dependencies
seu-claude /deps src/api/handlers.ts

# Validate before changes
seu-claude /check src/api/handlers.ts

# Make changes...

# Validate after changes
seu-claude /check src/api/handlers.ts --fix
```

### Example 3: CI/CD Integration

```yaml
# .github/workflows/validate.yml
name: Code Validation

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm install -g seu-claude

      - name: Validate Code
        run: seu-claude /check src

      - name: Run Tests
        run: seu-claude /test --all
```

---

## 10. Getting Help

- **GitHub Issues**: [https://github.com/jardhel/seu-claude/issues](https://github.com/jardhel/seu-claude/issues)
- **Discussions**: [https://github.com/jardhel/seu-claude/discussions](https://github.com/jardhel/seu-claude/discussions)
- **Documentation**: Full guide in [USER_GUIDE.md](USER_GUIDE.md)

---

**You're ready to go!** Start with `/plan create` or ask Claude to use the MCP tools.
