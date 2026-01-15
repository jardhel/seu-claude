# seu-claude Marketing & Social Media Kit

## 🎯 Key Messages

### The Problem (Pain Points)

1. **Goldfish Memory**: Claude Code only remembers files it explicitly opened
2. **Resource Hog**: Current solutions consume 35GB+ RAM
3. **Dependency Hell**: Python venvs, conflicting packages
4. **Zombie Apocalypse**: Orphan processes accumulate over time

### The Solution (Value Props)

1. **Proactive Understanding**: Index your entire codebase BEFORE Claude needs it
2. **Lightweight**: < 200MB RAM (vs 35GB)
3. **Pure Node.js**: No Python, no venv, no conflicts
4. **Clean**: No zombie processes, graceful shutdown

---

## 📱 LinkedIn Post (Primary Launch)

```
🚀 Introducing seu-claude: The Memory Claude Code Deserves

I've been using AI coding assistants daily for the past year.

And I noticed something frustrating:

They have "goldfish memory."

❌ They only remember files they've explicitly opened
❌ They consume 35GB+ RAM with in-memory vector databases
❌ They require complex Python dependencies
❌ They leave zombie processes everywhere

So I built seu-claude - a local RAG server that gives Claude Code
proactive understanding of your ENTIRE codebase.

Here's what's different:

🧠 AST-Based Semantic Chunking
Not naive text splitting. Tree-sitter parses your code structure.
Functions, classes, interfaces - all semantically understood.

💾 90MB RAM (not 35GB)
LanceDB's zero-copy architecture keeps it lightweight.
Your machine isn't a server farm.

🔒 100% Local
All processing happens on YOUR machine.
No data leaves. No API calls. Complete privacy.

⚡ Incremental Indexing
Only re-processes changed files.
Index once, update forever.

The results speak for themselves:
→ 90MB idle RAM vs 35GB+ competitors
→ 5,000 files indexed in under 5 minutes
→ Query latency < 100ms
→ Zero zombie processes after 100 start/stop cycles

Try it now:
npx seu-claude

Configure in Claude Code:
{
  "mcpServers": {
    "seu-claude": {
      "command": "npx",
      "args": ["seu-claude"]
    }
  }
}

Link: github.com/jardhel/seu-claude

The project is MIT licensed and I'd love your feedback.

What features would make this more useful for your workflow?

#OpenSource #AI #DeveloperTools #ClaudeCode #Coding #SoftwareEngineering
```

---

## 🐦 Twitter/X Thread

**Tweet 1 (Hook):**

```
I got tired of Claude Code forgetting everything.

So I built seu-claude: local RAG that gives Claude proactive understanding of your ENTIRE codebase.

90MB RAM. No Python. No zombies.

🧵 Thread on why existing solutions suck and how I fixed it:
```

**Tweet 2:**

```
The problem with Claude Code's memory:

It only knows about files it explicitly opened.

Ask "where's the auth logic?" and it's clueless unless you already showed it.

That's like having a colleague who forgets everything you discussed yesterday.
```

**Tweet 3:**

```
Existing solutions (like claude-mem) tried to fix this with vector databases.

But they:
- Consume 35GB+ RAM (ChromaDB's in-memory HNSW)
- Require Python venvs that conflict with your projects
- Leave zombie processes everywhere

Not exactly lightweight.
```

**Tweet 4:**

```
seu-claude takes a different approach:

1. Tree-sitter parses AST (not naive text splitting)
2. LanceDB stores vectors on disk (zero-copy)
3. Transformers.js runs embeddings locally
4. Pure Node.js (no Python needed)

Result: 90MB RAM. Works everywhere.
```

**Tweet 5:**

```
The numbers:

📊 90MB idle RAM (vs 35GB)
⚡ 5,000 files in < 5 minutes
🎯 < 100ms query latency
🧹 0 zombie processes

All 100% local. Your code never leaves your machine.
```

**Tweet 6:**

```
Get started in 60 seconds:

1. npx seu-claude
2. Add to .claude/settings.json
3. Tell Claude: "Index this codebase"
4. Search: "Find the user authentication logic"

That's it.

github.com/jardhel/seu-claude

MIT licensed. PRs welcome.
```

---

## 📰 Hacker News (Show HN)

**Title:**

```
Show HN: seu-claude – Local codebase RAG for Claude Code (90MB vs 35GB RAM)
```

**Post:**

```
I built seu-claude because I was frustrated with Claude Code's "goldfish memory" - it only knows about files it explicitly opened.

Existing memory solutions like claude-mem use ChromaDB which can consume 35GB+ RAM for large codebases. They also require Python venvs and leave zombie processes.

seu-claude is a different approach:
- Tree-sitter AST parsing (semantic chunking, not naive text splits)
- LanceDB disk-based vectors (zero-copy, <100MB RAM)
- Transformers.js local embeddings (no API calls)
- Pure Node.js (no Python dependencies)

Performance:
- 90MB idle RAM
- 5,000 files indexed in <5 minutes
- <100ms query latency
- Zero zombie processes

It's an MCP server that gives Claude three tools:
1. index_codebase - semantic indexing with AST analysis
2. search_codebase - natural language code search
3. read_semantic_context - AST-aware file reading

Setup:
```

npx seu-claude

```

Add to your Claude Code config and tell Claude to index your project. Then ask questions like "where is the authentication logic?" and it'll find relevant code even in files Claude hasn't opened.

GitHub: https://github.com/jardhel/seu-claude
MIT licensed

Would love feedback on:
- Performance on large monorepos (>50k files)
- Additional languages to support
- Features that would make this more useful

```

---

## 📝 Dev.to Article Outline

**Title:** "How I Built a 90MB Alternative to 35GB Memory Plugins for Claude Code"

**Sections:**

1. The Problem: AI Coding Assistants Have Goldfish Memory
2. Why Existing Solutions Failed Me
3. The Architecture: AST + LanceDB + Transformers.js
4. Benchmark Results (with graphs)
5. How to Use It
6. What's Next
7. Contributing

---

## 📊 Benchmark Graphics to Create

1. **RAM Comparison Bar Chart**
   - seu-claude: 90MB
   - claude-mem: 35GB+
   - (other tools if data available)

2. **Index Performance Line Graph**
   - X-axis: Number of files
   - Y-axis: Time (seconds)
   - Show linear scaling

3. **Query Latency Histogram**
   - Distribution of response times
   - Highlight p99 < 100ms

4. **Architecture Diagram**
   - Already in README, update with cleaner design

---

## 🎬 Demo Video Script (2 min)

**[0:00-0:15] Hook**
"What if Claude Code could understand your entire codebase - not just the files you've opened?"

**[0:15-0:45] Problem**

- Show Claude failing to find code it hasn't seen
- Show Activity Monitor with 35GB RAM usage from competitors
- Show zombie processes accumulating

**[0:45-1:15] Solution**

- Install: `npx seu-claude`
- Configure in 10 seconds
- "Index this codebase" - show progress
- Show RAM at ~90MB

**[1:15-1:45] Demo**

- "Find the authentication logic" - instant results
- "Where's the database connection handling?" - finds it
- "Show me error handling patterns" - multiple files

**[1:45-2:00] CTA**

- GitHub link on screen
- "Star if you find it useful"
- "MIT licensed - contributions welcome"

---

## 📋 Launch Day Checklist

### Pre-Launch (Day 13)

- [ ] Final version tagged (v1.0.0)
- [ ] npm package published
- [ ] README final review
- [ ] Demo GIF created
- [ ] Social preview image uploaded

### Launch (Day 14 - Morning)

- [ ] GitHub Release published
- [ ] Verify npm install works globally

### Launch (Day 14 - Afternoon)

- [ ] LinkedIn post published (2-3 PM for best reach)
- [ ] Twitter thread published
- [ ] Cross-post to relevant communities

### Launch (Day 15)

- [ ] Hacker News Show HN
- [ ] Reddit posts (r/MachineLearning, r/LocalLLaMA)
- [ ] Dev.to article published

### Post-Launch (Week 1)

- [ ] Respond to all GitHub issues within 24h
- [ ] Engage with all social media comments
- [ ] Track metrics daily
- [ ] Plan v1.1.0 based on feedback
