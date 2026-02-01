# Building an AI Agent Architecture Using Itself: The Seu-Claude Story

_How we used AI-powered code tools to build AI-powered code tools_

---

## Introduction

What if you could use the very tool you're building to help build it? That's exactly what we did with **seu-claude** — a neuro-symbolic AI agent architecture for Claude Code. This article tells the story of developing seu-claude v3.0 while using seu-claude's own features to navigate, understand, and improve the codebase.

This is the ultimate form of dogfooding.

---

## What is seu-claude?

**seu-claude** (Semantic Embedding Utilities for Claude) is an MCP (Model Context Protocol) server that gives Claude Code superpowers:

- **Task DAG Management**: Persistent task tracking with dependency graphs and checkpoint recovery
- **TDD Workflow**: Red-green-refactor cycles with automatic validation
- **Dependency Analysis**: Understand who calls what — trace imports across your entire codebase
- **Multi-Agent Orchestration**: Coordinate specialized agents (Coder, Reviewer, Tester) for complex tasks
- **Enterprise Security**: Docker sandboxing, RBAC, encrypted secrets, and audit trails

Think of it as giving Claude Code a brain, memory, and security layer.

---

## The Journey: From Prototype to v3.0

Our roadmap evolved through five major phases:

| Phase | Feature Set | Status |
|-------|-------------|--------|
| Phase 1 | Competitive Benchmark Suite | Complete |
| Phase 2 | VS Code Extension | Complete |
| Phase 3 | Multi-Agent Orchestration | Complete |
| Phase 4 | Enterprise Security | Complete |
| Phase 5 | Content & Community | In Progress |

But before we could add features, we had a problem: **test coverage had slipped** during rapid early development. Before scaling up, we needed a solid foundation.

---

## Phase 0: Fixing the Foundation

### The Coverage Crisis

Running `npm run test:coverage` revealed concerning gaps:

```
index-codebase.ts  | 11.45% statements
embed.ts           | 50.45% statements
crawler.ts         | 77.21% statements
```

The core indexing tool at 11% coverage? That's a ticking time bomb.

### Using seu-claude to Fix seu-claude

Here's where it gets meta. We used our own tools to find the problematic test:

```typescript
// Query: "empty directory test embedder"
// Result: tools.test.ts:64-82

it('should handle empty directory', async () => {
  await store.initialize();
  try {
    await embedder.initialize(); // ← This hangs!
  } catch {
    return;
  }
  // ...
});
```

The test was trying to initialize a real HuggingFace embedder, which either downloaded models (slow) or hung indefinitely (broken).

**The Fix**: Create a mock embedder that doesn't require network access:

```typescript
const createMockEmbedder = () => ({
  embed: (text: string): Promise<number[]> => {
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const vector = new Array(384).fill(0).map((_, i) => Math.sin(hash + i) * 0.5 + 0.5);
    return Promise.resolve(normalize(vector));
  },
  // ... other methods
});
```

---

## Feature Highlight: Multi-Agent Orchestration

Phase 3 introduced Kubernetes-style agent pool management:

```typescript
import { orchestrate_agents } from 'seu-claude';

// Create agent pools
await orchestrate_agents({
  action: 'create_pool',
  role: 'coder',
  poolSpec: { replicas: 3, autoscaling: { enabled: true } }
});

// Execute coordinated workflow
await orchestrate_agents({
  action: 'execute_workflow',
  workflowId: 'feature-development',
  workflowInput: { feature: 'Add user authentication' }
});
```

The system coordinates specialized agents:
- **Coder**: Writes implementation code
- **Reviewer**: Checks for bugs and style issues
- **Tester**: Writes and runs tests
- **Documenter**: Generates documentation

Each agent operates independently but shares context through the task DAG.

---

## Feature Highlight: Enterprise Security

Phase 4 added the security layer enterprises need:

### Docker Sandbox Isolation

```typescript
const sandbox = new DockerSandbox({
  image: 'node:20-alpine',
  memoryLimit: '256m',
  networkEnabled: false, // Complete isolation
});

await sandbox.execute({
  command: 'npm',
  args: ['test'],
  timeout: 30000,
});
```

### Role-Based Access Control

```typescript
rbac.createRole('developer', [
  'file:read:/src/*',
  'file:write:/src/*',
  'tool:execute:validate_code',
]);

rbac.hasPermission('user-123', 'file:write:/etc/passwd'); // false
```

### Encrypted Secrets

```typescript
const secrets = new SecretsManager();
await secrets.set('production/api-key', 'sk-...', {
  versioned: true,
  description: 'OpenAI API key',
});
```

AES-256-GCM encryption with PBKDF2 key derivation. Version history for rotation. Export encrypted backups.

---

## Dogfooding: Using seu-claude to Build seu-claude

Throughout development, we used seu-claude's own features:

### Task DAG for Project Management

```
Query: manage_task({ action: 'tree' })
Result:
├── Phase 1: Benchmark Suite ✅
├── Phase 2: VSCode Extension ✅
├── Phase 3: Multi-Agent Orchestration ✅
├── Phase 4: Enterprise Security ✅
└── Phase 5: Content & Community 🔄
    ├── 5.1 Demo videos ⏸️
    ├── 5.2 Blog posts ✅
    └── ...
```

We tracked every feature, every subtask, every dependency.

### TDD Workflow

```typescript
await run_tdd({
  description: 'RBAC permission check',
  testCode: `it('denies access to unauthorized paths', ...`,
  implementationCode: `hasPermission(user, permission) { ...`,
  testFilePath: 'src/security/rbac.test.ts',
  implementationFilePath: 'src/security/rbac.ts',
});
// RED → GREEN → REFACTOR, automatically
```

### Dependency Analysis

```
Symbol: "DockerSandbox"
Callers:
  - sandbox.test.ts (28 tests)
  - execute-sandbox.ts (tool)
  - orchestrator.ts (agent pool)
```

We could see exactly where our new classes were being used.

---

## Engineering Standards Applied

### Test-Driven Development (TDD)

- Write failing tests first
- Implement until tests pass
- Refactor with confidence

### Coverage Thresholds

```javascript
// vitest.config.js
coverageThreshold: {
  global: {
    statements: 76,
    branches: 70,
    functions: 90,
    lines: 76,
  },
}
```

CI fails if coverage drops below these thresholds.

### Documentation as Code

Every public method has JSDoc comments. The MCP tool schemas serve as API documentation.

---

## Results

### The Numbers

| Metric | Value |
|--------|-------|
| Source Files | 104 |
| Test Files | 56 |
| Tests Passing | 1,041+ |
| Statement Coverage | 87%+ |
| MCP Tools | 7 |

### Feature Summary

- **Task Management**: Persistent DAG with caching and checkpoints
- **TDD Workflow**: Automated red-green-refactor cycles
- **Dependency Analysis**: Cross-file import tracing
- **Code Validation**: ESLint + TypeScript checking
- **Sandbox Execution**: Isolated command execution
- **Multi-Agent Orchestration**: Kubernetes-style agent pools
- **Enterprise Security**: RBAC, secrets, audit trails, compliance

---

## Lessons Learned

### 1. Dogfooding Reveals Real UX Issues

Using your own tool surfaces pain points you'd never find otherwise. We discovered task dependencies were essential when trying to manage our own growing feature set.

### 2. TDD + AI = Powerful Combination

Claude Code writes tests, then implements features to make them pass. The test suite becomes a specification.

### 3. Coverage Matters (But So Does Velocity)

We found the sweet spot: 76-80% coverage with thresholds. High enough to catch regressions, low enough to not slow down development.

### 4. Security Can't Be an Afterthought

Enterprise adoption requires isolation, access control, and audit trails from the start. We added them in Phase 4, but wish we'd started earlier.

---

## Try It Yourself

```bash
# Install
npm install seu-claude

# Or use with Claude Code
npx seu-claude setup
```

Configure in your Claude Code MCP settings and start using semantic tools immediately.

---

## Conclusion

Building a tool using itself isn't just dogfooding — it's a development superpower. Every feature we add makes the next feature easier to build. Every bug we find makes the tool more robust.

Seu-claude started as an experiment: "What if Claude Code could understand codebases semantically?" Today, it's a production-ready v3.0 with:

- 1,041+ passing tests
- Enterprise security features
- Multi-agent orchestration
- VS Code extension
- Competitive benchmarks

And we're just getting started.

---

_Seu-claude is open source. Star us on GitHub and join the journey._

**GitHub**: [github.com/jardhel/seu-claude](https://github.com/jardhel/seu-claude)

**Tags**: #AI #DeveloperTools #TypeScript #ClaudeCode #MCP #AgentArchitecture #TDD

---

_Written with assistance from Claude, using seu-claude to navigate the seu-claude codebase._
