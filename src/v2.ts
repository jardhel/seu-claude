#!/usr/bin/env node
/**
 * Seu-Claude v2 Entry Point
 *
 * Handles both MCP server mode and CLI commands:
 * - MCP Server: node v2.ts (default, stdio MCP protocol)
 * - CLI:        node v2.ts /plan | /test | /deps | /check | /find | /nuke
 */

const args = process.argv.slice(2);

// Check if running as CLI command (starts with /)
if (args.length > 0 && args[0].startsWith('/')) {
  // CLI mode - delegate to CLI handler
  import('./cli/index.js').catch(err => {
    console.error('CLI error:', err);
    process.exit(1);
  });
} else {
  // MCP Server mode (default)
  import('./mcp/server.js')
    .then(module => {
      return module.startServer();
    })
    .catch(err => {
      console.error('MCP Server error:', err);
      process.exit(1);
    });
}
