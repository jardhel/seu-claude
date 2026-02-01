# seu-claude

[![NPM Version](https://img.shields.io/npm/v/seu-claude)](https://www.npmjs.com/package/seu-claude)
[![Tests](https://img.shields.io/badge/tests-1041%2B%20passing-brightgreen)](https://github.com/jardhel/seu-claude)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**MCP server that gives Claude Code persistent memory, task tracking, and code validation.**

Claude forgets everything when it crashes. seu-claude fixes that.

## Install

```bash
npm install -g seu-claude
```

## Setup (Claude Code)

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "seu-claude": {
      "command": "npx",
      "args": ["seu-claude"]
    }
  }
}
```

## What You Get

| Tool | What it does |
|------|--------------|
| `manage_task` | Persistent task tracking that survives crashes |
| `analyze_dependency` | Find imports, exports, and circular deps |
| `validate_code` | ESLint + TypeScript checks before commit |
| `execute_sandbox` | Run commands in isolated environment |
| `run_tdd` | Automated RED-GREEN-REFACTOR cycle |
| `find_symbol` | Locate function/class definitions |
| `orchestrate_agents` | Multi-agent coordination (Coder, Reviewer, Tester) |

## CLI Mode

```bash
seu-claude /help              # Show commands
seu-claude /plan create "X"   # Create task
seu-claude /deps src/index.ts # Analyze deps
seu-claude /check src/        # Validate code
seu-claude /find MyClass src/ # Find symbol
```

## Why

- **Crash recovery**: Tasks persist to SQLite. Restart and continue.
- **Code understanding**: AST-based analysis, not text matching.
- **Quality gates**: Validate before Claude commits broken code.
- **Enterprise ready**: Docker sandbox, RBAC, audit logs, secrets encryption.

## Docs

- [Quick Start](QUICKSTART.md)
- [User Guide](USER_GUIDE.md)
- [Architecture](ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT
