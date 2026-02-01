# Seu-Claude v3.0 Implementation Plan
## Authority Building Roadmap

**Root Task ID:** `98b03f65-7932-4c47-ad28-b2d029d99be3`
**Created:** 2026-01-31
**Goal:** Establish seu-claude as the leading AI development framework, build authority, attract sponsorship

---

## How to Resume This Plan

```bash
# View task tree
node dist/v2.js /plan

# Or via MCP
claude --mcp seu-claude "manage_task action=tree"

# Update a task status
claude --mcp seu-claude "manage_task action=update taskId=<ID> status=running"
```

---

## Phase Overview

| Phase | Focus | Authority Impact | Sponsorship Appeal |
|-------|-------|------------------|-------------------|
| **1** | Competitive Benchmarks | Shareable proof, viral potential | Data-driven credibility |
| **2** | VSCode Extension | Marketplace visibility, daily use | User growth metrics |
| **3** | Multi-Agent Orchestration | Thought leadership, cutting-edge | Enterprise interest |
| **4** | Enterprise Security | Production-ready | Direct sponsor value |
| **5** | Content & Community | Social proof, reach | Audience for sponsors |

---

## Phase 1: Competitive Benchmark Suite
**Phase ID:** `12605187-79f9-45ae-8b9b-6cc3afa8cc5a`

### Why This Matters
Benchmarks are **shareable proof**. When you can show "seu-claude completes tasks 3x faster with 90% less context loss", that's a tweet, a blog post, a conference slide.

### Task 1.1: Design Benchmark Methodology
**ID:** `c5c81445-51f1-4268-a07f-5ed4a02e5378`

**Metrics to measure:**
- Task completion rate (% of tasks fully completed)
- Context retention (can agent recall earlier decisions?)
- Crash recovery time (time to resume after simulated failure)
- Token efficiency (tokens used per successful task)
- Code quality (tests pass, no lint errors)

**Test case structure:**
```typescript
// src/benchmarks/types.ts
interface BenchmarkCase {
  id: string;
  name: string;
  category: 'bug-fix' | 'feature' | 'refactor' | 'multi-step';
  difficulty: 'easy' | 'medium' | 'hard';
  setup: () => Promise<void>;      // Create test repo state
  prompt: string;                   // What to ask the agent
  validate: () => Promise<boolean>; // Check if task succeeded
  expectedFiles: string[];          // Files that should be modified
}
```

**TDD Test:**
```typescript
// src/benchmarks/methodology.test.ts
describe('BenchmarkRunner', () => {
  it('should measure task completion rate', async () => {
    const runner = new BenchmarkRunner();
    const results = await runner.run(simpleBugFixCase);
    expect(results.completionRate).toBeDefined();
    expect(results.completionRate).toBeGreaterThanOrEqual(0);
    expect(results.completionRate).toBeLessThanOrEqual(1);
  });

  it('should measure context retention after interruption', async () => {
    const runner = new BenchmarkRunner();
    const results = await runner.runWithInterruption(multiStepCase);
    expect(results.contextRetention).toBeDefined();
  });
});
```

---

### Task 1.2: Create Standardized Coding Challenges
**ID:** `4ecd49e3-6a20-470e-baa8-ac0a8d651e84`

**Challenge categories:**

1. **Bug Fix Challenges**
   - Off-by-one error in pagination
   - Race condition in async code
   - Null pointer in nested object access

2. **Feature Addition Challenges**
   - Add authentication to existing API
   - Implement caching layer
   - Add WebSocket support

3. **Refactoring Challenges**
   - Extract class from god object
   - Convert callbacks to async/await
   - Implement dependency injection

**File structure:**
```
src/benchmarks/
  challenges/
    bug-fix/
      pagination-off-by-one/
        setup.ts
        prompt.txt
        expected/
        validate.ts
    feature/
      add-auth/
        ...
    refactor/
      extract-class/
        ...
```

---

### Task 1.3: Crash Recovery Benchmark
**ID:** `6d626403-79fd-48d0-b96a-3da5837c70b0`

**Implementation:**
```typescript
// src/benchmarks/crash-recovery.ts
export class CrashRecoveryBenchmark {
  async run(case: BenchmarkCase): Promise<CrashRecoveryResult> {
    // 1. Start task
    const taskId = await this.taskManager.createRootGoal(case.prompt);

    // 2. Execute until 50% complete
    await this.executeUntilProgress(taskId, 0.5);

    // 3. Simulate crash (kill process, clear memory)
    await this.simulateCrash();

    // 4. Measure recovery
    const recoveryStart = Date.now();
    const recovered = await this.taskManager.recoverTask(taskId);
    const recoveryTime = Date.now() - recoveryStart;

    // 5. Complete task and validate
    await this.executeToCompletion(taskId);
    const success = await case.validate();

    return {
      recoveryTimeMs: recoveryTime,
      statePreserved: recovered.progress >= 0.5,
      taskCompleted: success
    };
  }
}
```

---

### Task 1.4: Automated Comparison Runner
**ID:** `23c33021-9e6c-489e-91ce-68580707d7ac`

**Competitors to benchmark against:**
- Raw Claude Code (no MCP tools)
- Aider (if API available)
- Continue.dev
- Cursor (manual comparison)

**Runner architecture:**
```typescript
// src/benchmarks/comparison-runner.ts
export class ComparisonRunner {
  private adapters: Map<string, AgentAdapter> = new Map([
    ['seu-claude', new SeuClaudeAdapter()],
    ['raw-claude', new RawClaudeAdapter()],
    ['aider', new AiderAdapter()],
  ]);

  async runComparison(cases: BenchmarkCase[]): Promise<ComparisonReport> {
    const results: Map<string, BenchmarkResult[]> = new Map();

    for (const [name, adapter] of this.adapters) {
      results.set(name, await this.runAllCases(adapter, cases));
    }

    return this.generateReport(results);
  }
}
```

---

### Task 1.5: Shareable Benchmark Reports
**ID:** `23871bc2-5a3f-4db1-b655-65d9beb1f471`

**Output formats:**
- JSON (machine-readable)
- Markdown (GitHub README)
- HTML (standalone page with charts)
- SVG badge (for README)

**Chart library:** Use `chart.js` or `d3` for visualizations

**Badge generator:**
```typescript
// src/benchmarks/badge-generator.ts
export function generateBadge(score: number): string {
  const color = score >= 90 ? 'brightgreen' : score >= 70 ? 'yellow' : 'red';
  return `![Benchmark](https://img.shields.io/badge/benchmark-${score}%25-${color})`;
}
```

---

### Task 1.6: Publish to GitHub Pages
**ID:** `aa8b1b65-3a07-46f1-a4cc-ba7d60a5643c`

**Setup:**
```yaml
# .github/workflows/benchmark.yml
name: Run Benchmarks
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly
  push:
    branches: [main]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run benchmark
      - uses: peaceiris/actions-gh-pages@v3
        with:
          publish_dir: ./benchmark-results
```

---

## Phase 2: VSCode Extension
**Phase ID:** `36dfa697-a684-4d7d-adb1-3540966cff11`

### Why This Matters
VSCode Marketplace has **millions of developers**. A well-made extension gets discovered organically.

### Task 2.1: Scaffold Extension
**ID:** `9d71dc68-0db7-4606-85ec-2d538a7e3a6f`

```bash
# Create extension
npx yo code
# Select: New Extension (TypeScript)
# Name: seu-claude-vscode
```

**File structure:**
```
vscode-extension/
  src/
    extension.ts
    providers/
      TaskTreeProvider.ts
      DependencyGraphProvider.ts
    views/
      TaskWebview.ts
    commands/
      index.ts
  package.json
```

---

### Task 2.2: Task DAG TreeView
**ID:** `ae816ecb-81f4-4828-96a4-973f38e6ba93`

```typescript
// src/providers/TaskTreeProvider.ts
export class TaskTreeProvider implements vscode.TreeDataProvider<TaskItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private seuClaude: SeuClaudeClient) {}

  async getChildren(element?: TaskItem): Promise<TaskItem[]> {
    if (!element) {
      const tree = await this.seuClaude.getTaskTree();
      return tree.map(t => new TaskItem(t));
    }
    return element.children.map(c => new TaskItem(c));
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return {
      label: element.label,
      collapsibleState: element.children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      iconPath: this.getStatusIcon(element.status),
      contextValue: 'task'
    };
  }
}
```

---

### Task 2.3: CodeLens for Symbols
**ID:** `9adf224e-8fef-4bd7-9a74-8c35e229b78e`

```typescript
// src/providers/SymbolCodeLensProvider.ts
export class SymbolCodeLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const symbols = await this.seuClaude.findSymbols(document.uri.fsPath);

    return symbols.map(sym => new vscode.CodeLens(
      new vscode.Range(sym.line, 0, sym.line, 0),
      {
        title: `${sym.references.length} references`,
        command: 'seu-claude.showReferences',
        arguments: [sym]
      }
    ));
  }
}
```

---

### Task 2.4: TDD Status Bar
**ID:** `71d630e4-c9a4-472a-a820-b257da9b7d4c`

```typescript
// src/views/TDDStatusBar.ts
export class TDDStatusBar {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
  }

  update(phase: 'RED' | 'GREEN' | 'REFACTOR') {
    const icons = { RED: '$(error)', GREEN: '$(check)', REFACTOR: '$(tools)' };
    const colors = { RED: '#ff6b6b', GREEN: '#51cf66', REFACTOR: '#ffd43b' };

    this.statusBarItem.text = `${icons[phase]} TDD: ${phase}`;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(colors[phase]);
    this.statusBarItem.show();
  }
}
```

---

### Task 2.5: Dependency Graph Webview
**ID:** `e3d5a839-748b-4c18-9d04-ecfc72b58438`

```typescript
// src/views/DependencyGraphWebview.ts
export class DependencyGraphWebview {
  async show(entryPoint: string) {
    const panel = vscode.window.createWebviewPanel(
      'dependencyGraph',
      'Dependency Graph',
      vscode.ViewColumn.Two,
      { enableScripts: true }
    );

    const deps = await this.seuClaude.analyzeDependencies([entryPoint]);
    panel.webview.html = this.generateD3Graph(deps);
  }

  private generateD3Graph(deps: DependencyGraph): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="https://d3js.org/d3.v7.min.js"></script>
          <style>
            .node { fill: #69b3a2; }
            .link { stroke: #999; stroke-opacity: 0.6; }
          </style>
        </head>
        <body>
          <svg width="800" height="600"></svg>
          <script>
            const data = ${JSON.stringify(deps)};
            // D3 force-directed graph code here
          </script>
        </body>
      </html>
    `;
  }
}
```

---

### Task 2.6: Command Palette Commands
**ID:** `746df45d-a8fd-42c6-b3f1-fb04963fecbc`

```json
// package.json (contributes section)
{
  "commands": [
    { "command": "seu-claude.createTask", "title": "Seu-Claude: Create Task" },
    { "command": "seu-claude.runTDD", "title": "Seu-Claude: Run TDD Cycle" },
    { "command": "seu-claude.analyzeDeps", "title": "Seu-Claude: Analyze Dependencies" },
    { "command": "seu-claude.validateCode", "title": "Seu-Claude: Validate Code" },
    { "command": "seu-claude.findSymbol", "title": "Seu-Claude: Find Symbol" },
    { "command": "seu-claude.showTaskTree", "title": "Seu-Claude: Show Task Tree" }
  ]
}
```

---

### Task 2.7: Publish to Marketplace
**ID:** `72a8038d-71da-46ed-b861-6096dc45dc6b`

```bash
# Install vsce
npm install -g @vscode/vsce

# Package
vsce package

# Publish (requires Personal Access Token)
vsce publish
```

---

## Phase 3: Multi-Agent Orchestration
**Phase ID:** `9b54910c-156a-44a4-b7ce-645c4ddf3575`

### Why This Matters
Multi-agent is the **hottest topic in AI**. Being early with a solid implementation establishes thought leadership.

### Task 3.1: Agent Communication Protocol
**ID:** `8e645154-ea51-49d3-a645-fb95623d0057`

```typescript
// src/core/agents/protocol.ts
interface AgentMessage {
  from: AgentId;
  to: AgentId | 'broadcast';
  type: 'task-assignment' | 'task-complete' | 'request-review' | 'conflict';
  payload: unknown;
  timestamp: number;
}

interface SharedState {
  tasks: TaskDAG;
  fileLocksMap<string, AgentId>;
  completedWork: Map<TaskId, WorkResult>;
}

export class MessageBus {
  private subscribers: Map<AgentId, (msg: AgentMessage) => void> = new Map();

  publish(message: AgentMessage): void {
    if (message.to === 'broadcast') {
      this.subscribers.forEach(handler => handler(message));
    } else {
      this.subscribers.get(message.to)?.(message);
    }
  }

  subscribe(agentId: AgentId, handler: (msg: AgentMessage) => void): void {
    this.subscribers.set(agentId, handler);
  }
}
```

---

### Task 3.2: AgentPool Manager
**ID:** `589a755b-de52-42a9-bbc9-1e79a6e31eab`

```typescript
// src/core/agents/AgentPool.ts
export class AgentPool {
  private agents: Map<AgentId, Agent> = new Map();
  private messageBus: MessageBus;

  async spawn(type: AgentType, config?: AgentConfig): Promise<Agent> {
    const agent = AgentFactory.create(type, {
      messageBus: this.messageBus,
      taskManager: this.taskManager,
      ...config
    });

    this.agents.set(agent.id, agent);
    await agent.start();
    return agent;
  }

  async terminate(agentId: AgentId): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      await agent.stop();
      this.agents.delete(agentId);
    }
  }

  getAvailableAgent(capability: string): Agent | undefined {
    return Array.from(this.agents.values())
      .filter(a => a.capabilities.includes(capability) && a.status === 'idle')
      .sort((a, b) => a.workload - b.workload)[0];
  }
}
```

---

### Task 3.3: Specialized Agent Types
**ID:** `f23d4c79-6d9f-4d0f-b305-ed26b4881db5`

```typescript
// src/core/agents/types/
export class CoderAgent extends BaseAgent {
  capabilities = ['write-code', 'fix-bugs', 'implement-features'];

  async execute(task: Task): Promise<WorkResult> {
    // Use RecursiveScout for code understanding
    // Use HypothesisEngine for TDD
    // Return implemented code
  }
}

export class ReviewerAgent extends BaseAgent {
  capabilities = ['code-review', 'security-audit', 'style-check'];

  async execute(task: Task): Promise<WorkResult> {
    // Analyze code changes
    // Check for issues
    // Return review comments
  }
}

export class TesterAgent extends BaseAgent {
  capabilities = ['write-tests', 'run-tests', 'coverage-analysis'];
}

export class DocumenterAgent extends BaseAgent {
  capabilities = ['write-docs', 'generate-api-docs', 'update-readme'];
}
```

---

### Task 3.4: Task Distribution System
**ID:** `65262d7a-a410-40a7-80de-a508404e1753`

```typescript
// src/core/agents/TaskDistributor.ts
export class TaskDistributor {
  constructor(
    private pool: AgentPool,
    private taskManager: TaskManager
  ) {}

  async distribute(rootTaskId: TaskId): Promise<void> {
    const pendingTasks = await this.taskManager.getPendingTasks(rootTaskId);

    for (const task of pendingTasks) {
      const requiredCapability = this.inferCapability(task);
      const agent = this.pool.getAvailableAgent(requiredCapability);

      if (agent) {
        await this.assignTask(task, agent);
      }
    }
  }

  private inferCapability(task: Task): string {
    // Use keywords in task label to infer required capability
    if (task.label.match(/test|spec/i)) return 'write-tests';
    if (task.label.match(/review|check/i)) return 'code-review';
    if (task.label.match(/doc|readme/i)) return 'write-docs';
    return 'write-code';
  }
}
```

---

### Task 3.5: Conflict Resolution
**ID:** `9f48816a-8e1c-46ce-8ac7-fb3d3df15a8f`

```typescript
// src/core/agents/ConflictResolver.ts
export class ConflictResolver {
  async resolveFileConflict(
    file: string,
    changes: Map<AgentId, FileChange>
  ): Promise<FileChange> {
    // Strategy 1: Last-write-wins (simple)
    // Strategy 2: Merge (git-style)
    // Strategy 3: Escalate to human

    const sorted = Array.from(changes.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp);

    // Try auto-merge first
    try {
      return await this.threeWayMerge(file, sorted.map(s => s[1]));
    } catch (e) {
      // Escalate to coordinator agent
      this.messageBus.publish({
        type: 'conflict',
        payload: { file, changes: sorted }
      });
      throw new ConflictError(file);
    }
  }
}
```

---

### Task 3.6: Agent Observability
**ID:** `e094bbd8-a327-4184-b053-fc3493b283ea`

```typescript
// src/core/agents/Observability.ts
export class AgentObserver {
  private traces: Trace[] = [];

  trace(agentId: AgentId, event: TraceEvent): void {
    this.traces.push({
      agentId,
      event,
      timestamp: Date.now()
    });
  }

  getAgentTimeline(agentId: AgentId): TraceEvent[] {
    return this.traces
      .filter(t => t.agentId === agentId)
      .map(t => t.event);
  }

  getMetrics(): AgentMetrics {
    return {
      totalTasks: this.countTasks(),
      avgCompletionTime: this.avgCompletionTime(),
      agentUtilization: this.calculateUtilization(),
      conflictRate: this.conflictRate()
    };
  }
}
```

---

### Task 3.7: MCP Tool for Orchestration
**ID:** `d0f61b53-88f7-448b-9d15-155b9faea4d3`

```typescript
// src/mcp/tools.ts (addition)
{
  name: 'orchestrate_agents',
  description: 'Spawn and coordinate multiple specialized agents to complete a complex task',
  inputSchema: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'The high-level goal to achieve' },
      agents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { enum: ['coder', 'reviewer', 'tester', 'documenter'] },
            count: { type: 'number', default: 1 }
          }
        }
      },
      strategy: { enum: ['parallel', 'pipeline', 'swarm'], default: 'parallel' }
    },
    required: ['goal']
  }
}
```

---

## Phase 4: Enterprise Security Features
**Phase ID:** `80d6b1d8-7873-4849-be7e-190fd5ccae1b`

### Why This Matters
Enterprise features = **enterprise sponsors**. Companies pay for security, compliance, and audit trails.

### Task 4.1: Docker Sandbox
**ID:** `cc759299-9864-42bb-91e5-4193e2f1fccd`

```typescript
// src/adapters/sandbox/DockerSandbox.ts
export class DockerSandbox implements ISandbox {
  async execute(command: string, options: SandboxOptions): Promise<SandboxResult> {
    const container = await docker.createContainer({
      Image: 'seu-claude-sandbox:latest',
      Cmd: ['sh', '-c', command],
      HostConfig: {
        Memory: options.memoryLimit || 512 * 1024 * 1024, // 512MB
        CpuPeriod: 100000,
        CpuQuota: options.cpuLimit || 50000, // 50% CPU
        NetworkMode: options.network ? 'bridge' : 'none',
        ReadonlyRootfs: true,
        AutoRemove: true
      },
      WorkingDir: '/workspace'
    });

    // Mount workspace read-only, output dir read-write
    await container.start();

    const timeout = setTimeout(() => container.kill(), options.timeout || 30000);
    const result = await container.wait();
    clearTimeout(timeout);

    return {
      exitCode: result.StatusCode,
      stdout: await this.getStdout(container),
      stderr: await this.getStderr(container)
    };
  }
}
```

---

### Task 4.2: Resource Limits (cgroups)
**ID:** `a45f476d-f2f1-4b8b-9ff8-cb1326e0dab3`

```typescript
// src/adapters/sandbox/ResourceLimiter.ts
export class ResourceLimiter {
  async createCgroup(name: string, limits: ResourceLimits): Promise<void> {
    const cgroupPath = `/sys/fs/cgroup/${name}`;

    await fs.mkdir(cgroupPath, { recursive: true });

    if (limits.memory) {
      await fs.writeFile(`${cgroupPath}/memory.max`, String(limits.memory));
    }
    if (limits.cpu) {
      await fs.writeFile(`${cgroupPath}/cpu.max`, `${limits.cpu} 100000`);
    }
    if (limits.io) {
      await fs.writeFile(`${cgroupPath}/io.max`, limits.io);
    }
  }

  async attachProcess(cgroupName: string, pid: number): Promise<void> {
    await fs.writeFile(`/sys/fs/cgroup/${cgroupName}/cgroup.procs`, String(pid));
  }
}
```

---

### Task 4.3: Audit Trail System
**ID:** `ca8c7b08-1248-4a51-99fb-51c2775cfbe7`

```typescript
// src/core/security/AuditLogger.ts
export class AuditLogger {
  constructor(private store: IAuditStore) {}

  async log(event: AuditEvent): Promise<void> {
    await this.store.insert({
      ...event,
      timestamp: new Date().toISOString(),
      hash: this.computeHash(event) // Tamper detection
    });
  }

  async getAuditTrail(filter: AuditFilter): Promise<AuditEvent[]> {
    return this.store.query(filter);
  }

  async exportForCompliance(format: 'json' | 'csv'): Promise<string> {
    const events = await this.store.getAll();
    return format === 'json'
      ? JSON.stringify(events, null, 2)
      : this.toCsv(events);
  }
}

// Hook into all tool invocations
export function withAudit<T>(
  tool: Tool<T>,
  logger: AuditLogger
): Tool<T> {
  return {
    ...tool,
    async execute(input: T): Promise<ToolResult> {
      await logger.log({
        type: 'tool-invocation',
        tool: tool.name,
        input: sanitize(input), // Remove secrets
        user: getCurrentUser()
      });

      const result = await tool.execute(input);

      await logger.log({
        type: 'tool-result',
        tool: tool.name,
        success: result.success,
        error: result.error
      });

      return result;
    }
  };
}
```

---

### Task 4.4: RBAC (Role-Based Access Control)
**ID:** `7b3e3e90-781c-4824-b643-7d22093d3197`

```typescript
// src/core/security/RBAC.ts
interface Permission {
  tool: string;
  actions: ('read' | 'write' | 'execute')[];
  resourcePattern?: string; // e.g., "src/**" or "!node_modules/**"
}

interface Role {
  name: string;
  permissions: Permission[];
}

export class RBACManager {
  private roles: Map<string, Role> = new Map([
    ['developer', {
      name: 'developer',
      permissions: [
        { tool: '*', actions: ['read', 'execute'] },
        { tool: 'execute_sandbox', actions: ['execute'], resourcePattern: 'src/**' }
      ]
    }],
    ['admin', {
      name: 'admin',
      permissions: [
        { tool: '*', actions: ['read', 'write', 'execute'] }
      ]
    }]
  ]);

  checkPermission(user: User, tool: string, action: string): boolean {
    const role = this.roles.get(user.role);
    if (!role) return false;

    return role.permissions.some(p =>
      (p.tool === '*' || p.tool === tool) &&
      p.actions.includes(action as any)
    );
  }
}
```

---

### Task 4.5: Secrets Management
**ID:** `4f031535-611c-40e5-aeb1-eea4e0e6e9e2`

```typescript
// src/core/security/SecretsManager.ts
export class SecretsManager {
  constructor(
    private vault?: VaultClient,
    private encryptionKey?: Buffer
  ) {}

  async getSecret(key: string): Promise<string> {
    if (this.vault) {
      return this.vault.read(`secret/data/${key}`);
    }

    // Fallback to encrypted local storage
    const encrypted = await fs.readFile(`.secrets/${key}.enc`);
    return this.decrypt(encrypted);
  }

  async setSecret(key: string, value: string): Promise<void> {
    if (this.vault) {
      await this.vault.write(`secret/data/${key}`, { data: { value } });
    } else {
      const encrypted = this.encrypt(value);
      await fs.writeFile(`.secrets/${key}.enc`, encrypted);
    }
  }

  // Inject secrets into sandbox environment
  prepareEnvironment(secrets: string[]): Record<string, string> {
    return Object.fromEntries(
      secrets.map(s => [s, this.getSecretSync(s)])
    );
  }
}
```

---

### Task 4.6: Compliance Reports
**ID:** `3ac6ed03-5486-4a68-83e1-733081ae9a41`

```typescript
// src/core/security/ComplianceReporter.ts
export class ComplianceReporter {
  async generateSOC2Report(period: DateRange): Promise<ComplianceReport> {
    const auditEvents = await this.auditLogger.getAuditTrail({
      startDate: period.start,
      endDate: period.end
    });

    return {
      period,
      generatedAt: new Date().toISOString(),
      sections: {
        accessControl: this.analyzeAccessControl(auditEvents),
        changeManagement: this.analyzeChangeManagement(auditEvents),
        incidentResponse: this.analyzeIncidents(auditEvents),
        riskAssessment: this.assessRisks(auditEvents)
      },
      summary: {
        totalEvents: auditEvents.length,
        failedOperations: auditEvents.filter(e => e.error).length,
        uniqueUsers: new Set(auditEvents.map(e => e.user)).size
      }
    };
  }

  async exportAsPDF(report: ComplianceReport): Promise<Buffer> {
    // Use puppeteer or pdfkit to generate PDF
  }
}
```

---

## Phase 5: Content & Community Strategy
**Phase ID:** `e8c8accb-3edb-4d07-a5d3-9b282365e570`

### Why This Matters
Technical excellence alone doesn't build authority. You need **visibility**. Content is how you reach people.

### Task 5.1: Demo Video Series
**ID:** `cce60bd4-3867-45f4-9343-88c3baaca6aa`

**Video topics:**
1. "Seu-Claude in 5 Minutes" - Overview
2. "Never Lose Context Again" - Task DAG demo
3. "TDD Automation with seu-claude" - HypothesisEngine demo
4. "Understanding Code Structure" - RecursiveScout demo
5. "Multi-Agent Development" - Phase 3 demo
6. "Enterprise Security" - Phase 4 demo

**Tools:** OBS Studio, Descript for editing

---

### Task 5.2: Technical Blog Posts
**ID:** `ab72c308-4240-43f0-a41c-34997d7fec64`

**Blog post ideas:**
1. "Why AI Agents Lose Context (And How We Fixed It)"
2. "Building a Self-Hosting AI Framework"
3. "AST-Based Code Understanding for AI Agents"
4. "The Case for Symbolic Grounding in LLM Agents"
5. "Benchmark Results: seu-claude vs The Competition"

**Platforms:** Dev.to, Medium, personal blog

---

### Task 5.3: Case Studies
**ID:** `40080237-347e-47fb-972f-92b82dea7f6e`

**Case study structure:**
1. **The Challenge** - What problem was being solved?
2. **The Approach** - How seu-claude was used
3. **The Results** - Metrics, time saved, quality improvements
4. **Lessons Learned** - What worked, what didn't

---

### Task 5.4: Twitter/X Templates
**ID:** `ec7b61ca-4955-4bc6-8916-e0f92475efe5`

**Thread templates:**

```
Thread 1: "I built an AI framework that doesn't forget"

1/ AI coding agents have a fatal flaw: they forget.

Mid-task crashes = start over. Long sessions = context drift.

I spent 6 months solving this. Here's what I learned 🧵

2/ The problem is "stochastic drift"...

[continue with technical insights]
```

---

### Task 5.5: GitHub Sponsors / Open Collective
**ID:** `09368b10-23b1-47f1-a685-ba903a9cd837`

**Setup checklist:**
- [ ] Create FUNDING.yml in .github/
- [ ] Set up GitHub Sponsors profile
- [ ] Create Open Collective page
- [ ] Define sponsor tiers with benefits
- [ ] Add sponsor recognition to README

**Sponsor tiers:**
- $5/mo: Name in README
- $25/mo: Logo in README + priority issues
- $100/mo: Logo + direct support channel
- $500/mo: Custom feature priority + consulting call

---

### Task 5.6: Community Submissions
**ID:** `fff8d721-56ae-4a94-a650-5e80bfa0f129`

**Submission checklist:**
- [ ] Hacker News (Show HN post)
- [ ] Reddit r/programming
- [ ] Reddit r/MachineLearning
- [ ] Dev.to
- [ ] Lobsters
- [ ] Product Hunt (when VSCode extension ready)

**Timing:** Post on Tuesday/Wednesday morning (US time) for best visibility

---

### Task 5.7: Conference Talk Proposal
**ID:** `f0db2947-45f6-40de-bd07-4407644ea112`

**Target conferences:**
- AI Engineer Summit
- Strange Loop
- QCon
- local meetups (faster acceptance)

**Talk abstract template:**
```
Title: Grounding LLM Agents in Symbolic Structures

Abstract:
Large language models are powerful but forgetful. In autonomous
development tasks, they lose context, repeat work, and drift
from goals. This talk presents a neuro-symbolic architecture
that combines the flexibility of LLMs with the rigor of
symbolic task management, TDD validation, and AST-based
code understanding. We'll show benchmarks demonstrating 3x
faster task completion and 90% reduction in context loss.
```

---

## Execution Order & Dependencies

```
Phase 1 (Benchmarks) ──┬──> Phase 5.2 (Blog posts with benchmark data)
                       │
                       └──> Phase 5.6 (Submit with benchmark results)

Phase 2 (VSCode) ──────────> Phase 5.1 (Demo videos)
                              │
                              └──> Product Hunt launch

Phase 3 (Multi-Agent) ─────> Phase 5.7 (Conference talk)

Phase 4 (Enterprise) ──────> Sponsor outreach (with compliance features)
```

**Recommended order:**
1. **Phase 1.1-1.3** first (get benchmark infrastructure)
2. **Phase 5.5** in parallel (set up funding early)
3. **Phase 1.4-1.6** (complete benchmarks)
4. **Phase 5.2, 5.6** (publish and share)
5. **Phase 2** (VSCode extension)
6. **Phase 3** (multi-agent, highest visibility)
7. **Phase 4** (enterprise, for sponsors)
8. **Phase 5.7** (conference, after proven results)

---

## Quick Reference: Task IDs

| Task | ID |
|------|-----|
| Root Goal | `98b03f65-7932-4c47-ad28-b2d029d99be3` |
| Phase 1 | `12605187-79f9-45ae-8b9b-6cc3afa8cc5a` |
| Phase 2 | `36dfa697-a684-4d7d-adb1-3540966cff11` |
| Phase 3 | `9b54910c-156a-44a4-b7ce-645c4ddf3575` |
| Phase 4 | `80d6b1d8-7873-4849-be7e-190fd5ccae1b` |
| Phase 5 | `e8c8accb-3edb-4d07-a5d3-9b282365e570` |

---

## How to Continue

When you return to this project:

```bash
# 1. View current task state
node dist/v2.js /plan

# 2. Pick a task to work on
# Update status to running:
claude "use seu-claude manage_task to update task <ID> status to running"

# 3. Implement using TDD
claude "use seu-claude run_tdd to implement <feature>"

# 4. Validate code
node dist/v2.js /check src/

# 5. Mark complete
claude "use seu-claude manage_task to update task <ID> status to completed"
```

---

**This plan persists in SQLite.** Even if you close the terminal, the task DAG survives.

Good luck building your authority!
