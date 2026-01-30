# MCP Configurations for Agentic AI Tools

Pre-built MCP (Model Context Protocol) configurations for integrating seu-claude with various AI coding assistants.

## Supported Tools

| Tool                  | Config File     | Target Location            |
| --------------------- | --------------- | -------------------------- |
| Claude Code / Desktop | `claude.json`   | `.claude/settings.json`    |
| GitHub Copilot        | `copilot.json`  | `.github/mcp.json`         |
| OpenAI Codex          | `codex.json`    | `.codex/mcp-servers.json`  |
| Continue.dev          | `continue.json` | `.continue/config.json`    |
| Cursor                | `cursor.json`   | `.cursor/mcp.json`         |
| Cline                 | `cline.json`    | `.cline/mcp_settings.json` |
| Windsurf              | `windsurf.json` | `.windsurf/mcp.json`       |
| Aider                 | `aider.json`    | `.aider.mcp.json`          |

## Quick Setup

### Option 1: Use the CLI (Recommended)

```bash
# Install seu-claude
npm install -g seu-claude

# Generate config for your tool
npx seu-claude /setup claude    # For Claude Code
npx seu-claude /setup copilot   # For GitHub Copilot
npx seu-claude /setup cursor    # For Cursor
npx seu-claude /setup --all     # For all tools
```

### Option 2: Manual Copy

1. Copy the appropriate config file to your project
2. Rename and place in the correct location (see table above)
3. Restart your AI tool

## Configuration Options

All configs use the same base structure:

```json
{
  "mcpServers": {
    "seu-claude": {
      "type": "stdio",
      "command": "npx",
      "args": ["seu-claude"],
      "env": {
        "PROJECT_ROOT": "."
      }
    }
  }
}
```

### Environment Variables

| Variable       | Description                   | Default           |
| -------------- | ----------------------------- | ----------------- |
| `PROJECT_ROOT` | Root directory for analysis   | Current directory |
| `DATA_DIR`     | Directory for persistent data | `.seu-claude-v2`  |

### Alternative Commands

**Using global install:**

```json
{
  "command": "seu-claude",
  "args": []
}
```

**Using node directly:**

```json
{
  "command": "node",
  "args": ["/path/to/seu-claude/dist/v2.js"]
}
```

## Available MCP Tools

Once configured, these tools become available to your AI assistant:

| Tool                 | Description                              |
| -------------------- | ---------------------------------------- |
| `analyze_dependency` | Build import graph, detect circular deps |
| `validate_code`      | Run ESLint and TypeScript checks         |
| `execute_sandbox`    | Run commands in isolated sandbox         |
| `manage_task`        | Create and track tasks                   |
| `run_tdd`            | Execute TDD cycles (red-green-refactor)  |
| `find_symbol`        | Find symbol definitions and call sites   |

## Troubleshooting

### Server not starting

1. Ensure `npx seu-claude` works from command line
2. Check that the config file is in the correct location
3. Restart your AI tool

### Tools not appearing

1. Verify the MCP server is enabled in your tool's settings
2. Check logs for connection errors
3. Ensure `PROJECT_ROOT` points to a valid directory

### Permission issues

Some tools may require additional permissions for:

- File system access
- Running shell commands
- Network access (if enabled)

Consult your AI tool's documentation for permission configuration.
