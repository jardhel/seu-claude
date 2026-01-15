# Marketing Assets for seu-claude

## 📁 Assets to Create

### 1. Demo GIF (Most Important!)
Record a 30-60 second demo showing:
- `npx seu-claude` installation
- Indexing a codebase
- Searching with Claude Code

**Tools:**
- macOS: Use built-in Screenshot app (Cmd+Shift+5) or [Kap](https://getkap.co)
- Convert to GIF: `ffmpeg -i demo.mov -vf "fps=10,scale=800:-1" demo.gif`

### 2. Social Preview Image (1280x640)
For GitHub repo and social shares.

**Quick option:** Use [Canva](https://canva.com) or [Figma](https://figma.com)

Template text:
```
seu-claude
━━━━━━━━━━━━━━━━━━━━━━━
Local Codebase RAG for Claude Code

🧠 AST-Based Semantic Chunking
💾 90MB RAM (not 35GB)
🔒 100% Local & Private
⚡ <100ms Query Latency

github.com/jardhel/seu-claude
```

### 3. Architecture Diagram
Show: Files → Tree-sitter → Chunks → Embeddings → LanceDB → Claude

### 4. Benchmark Charts
Create using any tool (Excel, Google Sheets, chart.js):

**RAM Comparison:**
| Tool | RAM Usage |
|------|-----------|
| seu-claude | 90 MB |
| claude-mem (ChromaDB) | 35,000 MB |

**Performance:**
| Metric | Value |
|--------|-------|
| Index 5000 files | < 5 min |
| Query latency | < 100ms |
| Incremental update | < 1 sec |

---

## 🎬 Demo Video Script

### Option A: Terminal Recording (Easy)
Use [asciinema](https://asciinema.org) to record terminal:

```bash
# Install
brew install asciinema

# Record
asciinema rec demo.cast

# Upload (optional)
asciinema upload demo.cast
```

### Option B: Screen Recording with Claude Code (Better)

**Scene 1: Installation (10s)**
```bash
npx seu-claude
```
Show it starting up.

**Scene 2: Configure Claude (10s)**
Show adding to Claude Code settings.

**Scene 3: Index Codebase (15s)**
In Claude Code chat:
> "Index this codebase"

Show progress output.

**Scene 4: Search Demo (20s)**
> "Find the authentication logic"
> "Where is the database connection?"
> "Show error handling patterns"

Show results appearing.

**Scene 5: Outro (5s)**
Show GitHub URL: github.com/jardhel/seu-claude

---

## 📱 Ready-to-Post Content

### LinkedIn (copy from MARKETING_KIT.md)
Best time to post: Tuesday-Thursday, 2-3 PM local time

### Twitter/X Thread
Best time: Weekday mornings, 9-11 AM

### Hacker News
Best time: Tuesday-Thursday, 8-10 AM ET
Title: `Show HN: seu-claude – Local codebase RAG for Claude Code (90MB vs 35GB RAM)`

### Reddit
Subreddits:
- r/ClaudeAI
- r/LocalLLaMA  
- r/MachineLearning (Sunday "What are you working on?" thread)
- r/programming

---

## 🔗 Links to Include

- GitHub: https://github.com/jardhel/seu-claude
- npm: https://www.npmjs.com/package/seu-claude
- Release: https://github.com/jardhel/seu-claude/releases/tag/v1.0.0

---

## 📊 Tracking

After posting, track:
- GitHub stars
- npm downloads: `npm-stat.com/charts.html?package=seu-claude`
- Social engagement
