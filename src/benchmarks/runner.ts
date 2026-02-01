/**
 * Benchmark Runner - Measures AI agent performance on coding tasks
 *
 * Metrics tracked:
 * - Task completion rate
 * - Execution time
 * - Token efficiency
 * - Context retention (for multi-step tasks)
 */

export type BenchmarkCategory = 'bug-fix' | 'feature' | 'refactor' | 'multi-step';
export type BenchmarkDifficulty = 'easy' | 'medium' | 'hard';

export interface BenchmarkCase {
  id: string;
  name: string;
  category: BenchmarkCategory;
  difficulty: BenchmarkDifficulty;
  setup: () => Promise<void>;
  prompt: string;
  validate: () => Promise<boolean>;
  expectedFiles: string[];
  tokenBudget?: number;
}

export interface BenchmarkMetrics {
  completionRate: number; // 0-1
  executionTimeMs: number;
  tokensUsed?: number;
  contextRetention?: number; // 0-1, for multi-step tasks
  filesModified: number;
  testsPassRate?: number;
}

export interface BenchmarkResult {
  caseId: string;
  caseName: string;
  category: BenchmarkCategory;
  difficulty: BenchmarkDifficulty;
  completed: boolean;
  metrics: BenchmarkMetrics;
  error?: string;
  timestamp: string;
}

export interface SuiteResult {
  cases: BenchmarkResult[];
  summary: SuiteSummary;
  runId: string;
  startedAt: string;
  completedAt: string;
}

export interface SuiteSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  overallCompletionRate: number;
  averageExecutionTimeMs: number;
  totalTokensUsed: number;
  byCategory: Record<BenchmarkCategory, CategorySummary>;
  byDifficulty: Record<BenchmarkDifficulty, DifficultySummary>;
}

export interface CategorySummary {
  total: number;
  passed: number;
  completionRate: number;
}

export interface DifficultySummary {
  total: number;
  passed: number;
  completionRate: number;
}

export class BenchmarkRunner {
  private tokenCounter: number = 0;

  async run(benchmarkCase: BenchmarkCase): Promise<BenchmarkResult> {
    const startTime = Date.now();

    try {
      // Setup the test environment
      await benchmarkCase.setup();

      // Simulate execution (in real implementation, this calls the agent)
      // For now, we just track that execution happened
      this.tokenCounter = benchmarkCase.tokenBudget || 0;

      // Validate the result
      const completed = await benchmarkCase.validate();

      const executionTimeMs = Date.now() - startTime;

      return {
        caseId: benchmarkCase.id,
        caseName: benchmarkCase.name,
        category: benchmarkCase.category,
        difficulty: benchmarkCase.difficulty,
        completed,
        metrics: {
          completionRate: completed ? 1 : 0,
          executionTimeMs,
          tokensUsed: this.tokenCounter,
          filesModified: benchmarkCase.expectedFiles.length,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      return {
        caseId: benchmarkCase.id,
        caseName: benchmarkCase.name,
        category: benchmarkCase.category,
        difficulty: benchmarkCase.difficulty,
        completed: false,
        metrics: {
          completionRate: 0,
          executionTimeMs,
          filesModified: 0,
        },
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  async runSuite(cases: BenchmarkCase[]): Promise<SuiteResult> {
    const runId = this.generateRunId();
    const startedAt = new Date().toISOString();
    const results: BenchmarkResult[] = [];

    for (const benchmarkCase of cases) {
      const result = await this.run(benchmarkCase);
      results.push(result);
    }

    const completedAt = new Date().toISOString();

    return {
      cases: results,
      summary: this.calculateSummary(results),
      runId,
      startedAt,
      completedAt,
    };
  }

  private calculateSummary(results: BenchmarkResult[]): SuiteSummary {
    const totalCases = results.length;
    const passedCases = results.filter((r) => r.completed).length;
    const failedCases = totalCases - passedCases;

    const overallCompletionRate = totalCases > 0 ? passedCases / totalCases : 0;

    const averageExecutionTimeMs =
      totalCases > 0
        ? results.reduce((sum, r) => sum + r.metrics.executionTimeMs, 0) / totalCases
        : 0;

    const totalTokensUsed = results.reduce(
      (sum, r) => sum + (r.metrics.tokensUsed || 0),
      0
    );

    // Calculate by category
    const byCategory = this.calculateByCategory(results);

    // Calculate by difficulty
    const byDifficulty = this.calculateByDifficulty(results);

    return {
      totalCases,
      passedCases,
      failedCases,
      overallCompletionRate,
      averageExecutionTimeMs,
      totalTokensUsed,
      byCategory,
      byDifficulty,
    };
  }

  private calculateByCategory(
    results: BenchmarkResult[]
  ): Record<BenchmarkCategory, CategorySummary> {
    const categories: BenchmarkCategory[] = ['bug-fix', 'feature', 'refactor', 'multi-step'];

    const byCategory: Record<BenchmarkCategory, CategorySummary> = {} as any;

    for (const category of categories) {
      const categoryResults = results.filter((r) => r.category === category);
      const total = categoryResults.length;
      const passed = categoryResults.filter((r) => r.completed).length;

      byCategory[category] = {
        total,
        passed,
        completionRate: total > 0 ? passed / total : 0,
      };
    }

    return byCategory;
  }

  private calculateByDifficulty(
    results: BenchmarkResult[]
  ): Record<BenchmarkDifficulty, DifficultySummary> {
    const difficulties: BenchmarkDifficulty[] = ['easy', 'medium', 'hard'];

    const byDifficulty: Record<BenchmarkDifficulty, DifficultySummary> = {} as any;

    for (const difficulty of difficulties) {
      const difficultyResults = results.filter((r) => r.difficulty === difficulty);
      const total = difficultyResults.length;
      const passed = difficultyResults.filter((r) => r.completed).length;

      byDifficulty[difficulty] = {
        total,
        passed,
        completionRate: total > 0 ? passed / total : 0,
      };
    }

    return byDifficulty;
  }

  private generateRunId(): string {
    return `run-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}
