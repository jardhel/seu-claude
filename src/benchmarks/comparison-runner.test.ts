import { describe, it, expect, beforeEach } from 'vitest';
import {
  ComparisonRunner,
  MockAdapter,
  SeuClaudeAdapter,
  RawClaudeAdapter,
  AiderAdapter,
  ContinueAdapter,
  ComparisonReportGenerator,
  BadgeGenerator,
} from './comparison-runner.js';
import { createBugFixChallenge } from './challenges/index.js';
import type { BenchmarkCase } from './runner.js';

describe('ComparisonRunner', () => {
  let runner: ComparisonRunner;

  beforeEach(() => {
    runner = new ComparisonRunner();
  });

  describe('adapter management', () => {
    it('should register adapters', () => {
      const adapter = new MockAdapter('test-agent', '1.0.0');
      runner.registerAdapter(adapter);

      expect(runner.listAdapters()).toContain('test-agent');
    });

    it('should get adapter by name', () => {
      const adapter = new MockAdapter('test-agent', '1.0.0');
      runner.registerAdapter(adapter);

      const retrieved = runner.getAdapter('test-agent');
      expect(retrieved?.name).toBe('test-agent');
    });

    it('should list all registered adapters', () => {
      runner.registerAdapter(new MockAdapter('agent-1', '1.0'));
      runner.registerAdapter(new MockAdapter('agent-2', '2.0'));

      const adapters = runner.listAdapters();
      expect(adapters).toHaveLength(2);
      expect(adapters).toContain('agent-1');
      expect(adapters).toContain('agent-2');
    });
  });

  describe('runComparison()', () => {
    it('should compare multiple adapters on a single case', async () => {
      runner.registerAdapter(new MockAdapter('fast-agent', '1.0', 1.0, 500));
      runner.registerAdapter(new MockAdapter('slow-agent', '1.0', 1.0, 1000));

      const testCase: BenchmarkCase = {
        id: 'comparison-test',
        name: 'Comparison Test',
        category: 'bug-fix',
        difficulty: 'easy',
        setup: async () => {},
        prompt: 'Fix the bug',
        validate: async () => true,
        expectedFiles: ['test.ts'],
      };

      const result = await runner.runComparison(testCase);

      expect(result.caseId).toBe('comparison-test');
      expect(result.results.size).toBe(2);
      expect(result.results.has('fast-agent')).toBe(true);
      expect(result.results.has('slow-agent')).toBe(true);
    });

    it('should determine winner based on fastest successful completion', async () => {
      // Mock adapter that always succeeds quickly
      const fastAdapter = new MockAdapter('fast', '1.0', 1.0, 100);
      // Mock adapter that always succeeds but is slower
      const slowAdapter = new MockAdapter('slow', '1.0', 1.0, 500);

      runner.registerAdapter(fastAdapter);
      runner.registerAdapter(slowAdapter);

      const testCase = createBugFixChallenge({
        id: 'winner-test',
        name: 'Winner Test',
        difficulty: 'easy',
        prompt: 'Test',
        targetFiles: [],
        bugDescription: 'Test',
      });

      const result = await runner.runComparison(testCase);

      // Winner should be one of the successful agents
      expect(result.winner).not.toBeNull();
      expect(['fast', 'slow']).toContain(result.winner);
    });

    it('should handle adapter that is not available', async () => {
      const unavailableAdapter = {
        name: 'unavailable',
        version: '1.0',
        initialize: async () => {},
        execute: async () => ({
          success: false,
          filesModified: [],
          tokensUsed: 0,
          executionTimeMs: 0,
          output: '',
        }),
        cleanup: async () => {},
        isAvailable: async () => false,
      };

      runner.registerAdapter(unavailableAdapter);
      runner.registerAdapter(new MockAdapter('available', '1.0'));

      const testCase = createBugFixChallenge({
        id: 'availability-test',
        name: 'Availability Test',
        difficulty: 'easy',
        prompt: 'Test',
        targetFiles: [],
        bugDescription: 'Test',
      });

      const result = await runner.runComparison(testCase);

      const unavailableResult = result.results.get('unavailable');
      expect(unavailableResult?.success).toBe(false);
      expect(unavailableResult?.error).toBe('Agent not available');
    });
  });

  describe('runSuite()', () => {
    it('should run comparison across multiple cases', async () => {
      runner.registerAdapter(new MockAdapter('agent-a', '1.0', 0.9));
      runner.registerAdapter(new MockAdapter('agent-b', '1.0', 0.8));

      const cases: BenchmarkCase[] = [
        createBugFixChallenge({
          id: 'case-1',
          name: 'Case 1',
          difficulty: 'easy',
          prompt: 'Fix 1',
          targetFiles: [],
          bugDescription: 'Bug 1',
        }),
        createBugFixChallenge({
          id: 'case-2',
          name: 'Case 2',
          difficulty: 'medium',
          prompt: 'Fix 2',
          targetFiles: [],
          bugDescription: 'Bug 2',
        }),
      ];

      const result = await runner.runSuite(cases);

      expect(result.cases).toHaveLength(2);
      expect(result.summary.totalCases).toBe(2);
      expect(result.runId).toContain('comparison-');
    });

    it('should calculate agent stats across suite', async () => {
      runner.registerAdapter(new MockAdapter('consistent', '1.0', 1.0, 500));
      runner.registerAdapter(new MockAdapter('variable', '1.0', 0.5, 800));

      const cases: BenchmarkCase[] = [
        createBugFixChallenge({
          id: 'stats-1',
          name: 'Stats 1',
          difficulty: 'easy',
          prompt: 'Test',
          targetFiles: [],
          bugDescription: 'Test',
        }),
        createBugFixChallenge({
          id: 'stats-2',
          name: 'Stats 2',
          difficulty: 'easy',
          prompt: 'Test',
          targetFiles: [],
          bugDescription: 'Test',
        }),
      ];

      const result = await runner.runSuite(cases);

      const consistentStats = result.summary.agentStats.get('consistent');
      expect(consistentStats?.totalCases).toBe(2);
      expect(consistentStats?.successRate).toBe(1);

      const variableStats = result.summary.agentStats.get('variable');
      expect(variableStats?.totalCases).toBe(2);
    });

    it('should determine overall winner', async () => {
      runner.registerAdapter(new MockAdapter('winner', '1.0', 1.0, 100));
      runner.registerAdapter(new MockAdapter('loser', '1.0', 0.0, 1000));

      const cases: BenchmarkCase[] = [
        createBugFixChallenge({
          id: 'final-1',
          name: 'Final 1',
          difficulty: 'easy',
          prompt: 'Test',
          targetFiles: [],
          bugDescription: 'Test',
        }),
      ];

      const result = await runner.runSuite(cases);

      expect(result.summary.overallWinner).toBe('winner');
    });
  });
});

describe('Built-in Adapters', () => {
  describe('SeuClaudeAdapter', () => {
    it('should have correct name and version', () => {
      const adapter = new SeuClaudeAdapter();
      expect(adapter.name).toBe('seu-claude');
      expect(adapter.version).toBeDefined();
    });

    it('should be available', async () => {
      const adapter = new SeuClaudeAdapter();
      expect(await adapter.isAvailable()).toBe(true);
    });
  });

  describe('RawClaudeAdapter', () => {
    it('should have correct name', () => {
      const adapter = new RawClaudeAdapter();
      expect(adapter.name).toBe('raw-claude');
    });

    it('should check for API key availability', async () => {
      const adapter = new RawClaudeAdapter();
      const available = await adapter.isAvailable();
      // Will be false unless ANTHROPIC_API_KEY is set
      expect(typeof available).toBe('boolean');
    });
  });

  describe('AiderAdapter', () => {
    it('should have correct name', () => {
      const adapter = new AiderAdapter();
      expect(adapter.name).toBe('aider');
      expect(adapter.version).toBe('latest');
    });

    it('should accept custom aider path', () => {
      const adapter = new AiderAdapter('/custom/path/aider');
      expect(adapter.name).toBe('aider');
    });

    it('should check for aider availability', async () => {
      const adapter = new AiderAdapter();
      const available = await adapter.isAvailable();
      // Will be false unless aider is installed
      expect(typeof available).toBe('boolean');
    });
  });

  describe('ContinueAdapter', () => {
    it('should have correct name', () => {
      const adapter = new ContinueAdapter();
      expect(adapter.name).toBe('continue');
      expect(adapter.version).toBe('latest');
    });

    it('should accept custom API endpoint', () => {
      const adapter = new ContinueAdapter('http://custom:8080');
      expect(adapter.name).toBe('continue');
    });

    it('should check for Continue server availability', async () => {
      const adapter = new ContinueAdapter();
      const available = await adapter.isAvailable();
      // Will be false unless Continue server is running
      expect(typeof available).toBe('boolean');
    });
  });
});

describe('ComparisonReportGenerator', () => {
  let generator: ComparisonReportGenerator;
  let runner: ComparisonRunner;

  beforeEach(() => {
    generator = new ComparisonReportGenerator();
    runner = new ComparisonRunner([
      new MockAdapter('agent-a', '1.0', 0.9),
      new MockAdapter('agent-b', '1.0', 0.8),
    ]);
  });

  describe('generateMarkdown()', () => {
    it('should generate valid markdown report', async () => {
      const cases: BenchmarkCase[] = [
        createBugFixChallenge({
          id: 'report-test',
          name: 'Report Test',
          difficulty: 'easy',
          prompt: 'Test',
          targetFiles: [],
          bugDescription: 'Test',
        }),
      ];

      const result = await runner.runSuite(cases);
      const markdown = generator.generateMarkdown(result);

      expect(markdown).toContain('# Benchmark Comparison Report');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('## Detailed Results');
      expect(markdown).toContain('agent-a');
      expect(markdown).toContain('agent-b');
    });

    it('should include summary table', async () => {
      const cases: BenchmarkCase[] = [
        createBugFixChallenge({
          id: 'table-test',
          name: 'Table Test',
          difficulty: 'easy',
          prompt: 'Test',
          targetFiles: [],
          bugDescription: 'Test',
        }),
      ];

      const result = await runner.runSuite(cases);
      const markdown = generator.generateMarkdown(result);

      expect(markdown).toContain('| Agent | Wins | Success Rate |');
      expect(markdown).toContain('|-------|------|');
    });
  });

  describe('generateJSON()', () => {
    it('should generate valid JSON', async () => {
      const cases: BenchmarkCase[] = [
        createBugFixChallenge({
          id: 'json-test',
          name: 'JSON Test',
          difficulty: 'easy',
          prompt: 'Test',
          targetFiles: [],
          bugDescription: 'Test',
        }),
      ];

      const result = await runner.runSuite(cases);
      const json = generator.generateJSON(result);

      const parsed = JSON.parse(json);
      expect(parsed.runId).toContain('comparison-');
      expect(parsed.cases).toHaveLength(1);
      expect(parsed.summary.totalCases).toBe(1);
    });
  });

  describe('generateHTML()', () => {
    it('should generate valid HTML with chart.js', async () => {
      const cases: BenchmarkCase[] = [
        createBugFixChallenge({
          id: 'html-test',
          name: 'HTML Test',
          difficulty: 'easy',
          prompt: 'Test',
          targetFiles: [],
          bugDescription: 'Test',
        }),
      ];

      const result = await runner.runSuite(cases);
      const html = generator.generateHTML(result);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Benchmark Comparison Report');
      expect(html).toContain('chart.js');
      expect(html).toContain('winsChart');
      expect(html).toContain('successChart');
      expect(html).toContain('agent-a');
      expect(html).toContain('agent-b');
    });

    it('should include winner badge when there is a winner', async () => {
      runner = new ComparisonRunner([
        new MockAdapter('winner', '1.0', 1.0, 100),
        new MockAdapter('loser', '1.0', 0.0, 1000),
      ]);

      const cases: BenchmarkCase[] = [
        createBugFixChallenge({
          id: 'winner-html-test',
          name: 'Winner HTML Test',
          difficulty: 'easy',
          prompt: 'Test',
          targetFiles: [],
          bugDescription: 'Test',
        }),
      ];

      const result = await runner.runSuite(cases);
      const html = generator.generateHTML(result);

      expect(html).toContain('winner-badge');
      expect(html).toContain('Winner: winner');
    });
  });
});

describe('BadgeGenerator', () => {
  describe('successRateBadge()', () => {
    it('should generate green badge for high success rate', () => {
      const url = BadgeGenerator.successRateBadge(0.95);
      expect(url).toContain('brightgreen');
      expect(url).toContain('95%25');
    });

    it('should generate yellow badge for medium success rate', () => {
      const url = BadgeGenerator.successRateBadge(0.75);
      expect(url).toContain('yellow');
      expect(url).toContain('75%25');
    });

    it('should generate red badge for low success rate', () => {
      const url = BadgeGenerator.successRateBadge(0.5);
      expect(url).toContain('red');
      expect(url).toContain('50%25');
    });

    it('should accept custom label', () => {
      const url = BadgeGenerator.successRateBadge(0.9, { label: 'seu-claude' });
      expect(url).toContain('seu-claude');
    });

    it('should accept custom style', () => {
      const url = BadgeGenerator.successRateBadge(0.9, { style: 'for-the-badge' });
      expect(url).toContain('style=for-the-badge');
    });
  });

  describe('markdownBadge()', () => {
    it('should generate markdown image syntax', () => {
      const md = BadgeGenerator.markdownBadge(0.9);
      expect(md).toMatch(/!\[Benchmark\]\(https:\/\/img\.shields\.io/);
    });
  });

  describe('svgBadge()', () => {
    it('should generate valid SVG', () => {
      const svg = BadgeGenerator.svgBadge('test', '100%', '#4ade80');
      expect(svg).toContain('<svg');
      expect(svg).toContain('test');
      expect(svg).toContain('100%');
      expect(svg).toContain('#4ade80');
    });
  });

  describe('winnerBadge()', () => {
    it('should generate winner badge URL', () => {
      const url = BadgeGenerator.winnerBadge('seu-claude');
      expect(url).toContain('winner');
      expect(url).toContain('seu-claude');
      expect(url).toContain('gold');
    });
  });

  describe('rankBadge()', () => {
    it('should generate gold badge for rank 1', () => {
      const svg = BadgeGenerator.rankBadge('agent', 1, 4);
      expect(svg).toContain('gold');
      expect(svg).toContain('#1/4');
    });

    it('should generate silver badge for rank 2', () => {
      const svg = BadgeGenerator.rankBadge('agent', 2, 4);
      expect(svg).toContain('silver');
    });

    it('should generate bronze badge for rank 3', () => {
      const svg = BadgeGenerator.rankBadge('agent', 3, 4);
      expect(svg).toContain('#cd7f32');
    });
  });

  describe('fromSuiteResult()', () => {
    it('should generate all badge formats from suite result', async () => {
      const runner = new ComparisonRunner([
        new MockAdapter('agent-a', '1.0', 0.9),
        new MockAdapter('agent-b', '1.0', 0.8),
      ]);

      const cases: BenchmarkCase[] = [
        createBugFixChallenge({
          id: 'badge-test',
          name: 'Badge Test',
          difficulty: 'easy',
          prompt: 'Test',
          targetFiles: [],
          bugDescription: 'Test',
        }),
      ];

      const result = await runner.runSuite(cases);
      const badges = BadgeGenerator.fromSuiteResult(result);

      expect(badges.markdown).toContain('![Benchmark]');
      expect(badges.html).toContain('<img src=');
      expect(badges.urls.successRate).toContain('img.shields.io');
    });
  });
});
