# seu-claude Demo Recording Script
# Run with: vhs demo.tape

Output assets/demo.gif
Set Shell zsh
Set FontFamily "SF Mono"
Set FontSize 16
Set Width 1200
Set Height 700
Set Padding 30
Set Framerate 30
Set TypingSpeed 50ms

# Dracula Pro Theme Colors
Set Theme "Dracula"

# Title frame
Type "# 🧠 seu-claude - Local Codebase RAG for Claude Code"
Enter
Sleep 1s

# Clear and show installation
Type "clear"
Enter
Sleep 500ms

# Show quick install
Type "# Quick Install"
Enter
Sleep 500ms
Type "npx seu-claude"
Enter
Sleep 3s

# Show the server starting message (simulated)
Type ""
Sleep 500ms

# Clear for config demo
Type "clear"
Enter
Sleep 500ms

# Show Claude Code config
Type "# Configure Claude Code (~/.claude/settings.json)"
Enter
Sleep 500ms
Type "cat << 'EOF'"
Enter
Type "{"
Enter
Type '  "mcpServers": {'
Enter
Type '    "seu-claude": {'
Enter
Type '      "command": "npx",'
Enter
Type '      "args": ["seu-claude"]'
Enter
Type '    }'
Enter
Type '  }'
Enter
Type "}"
Enter
Type "EOF"
Enter
Sleep 2s

# Clear for features
Type "clear"
Enter
Sleep 500ms

# Show features
Type "# ✨ Features"
Enter
Sleep 500ms
Type "echo '🧠 AST-Based Semantic Chunking (Tree-sitter)'"
Enter
Sleep 500ms
Type "echo '💾 LanceDB - Disk-based vectors (< 100MB RAM)'"
Enter
Sleep 500ms
Type "echo '🔒 100% Local - No API calls, complete privacy'"
Enter
Sleep 500ms
Type "echo '⚡ Incremental indexing - Only re-process changes'"
Enter
Sleep 2s

# Final frame
Type "clear"
Enter
Sleep 500ms
Type "# 🎉 Ready! Tell Claude: 'Index this codebase'"
Enter
Sleep 500ms
Type "echo ''"
Enter
Type "echo 'github.com/jardhel/seu-claude'"
Enter
Type "echo 'npm: seu-claude'"
Enter
Sleep 3s
