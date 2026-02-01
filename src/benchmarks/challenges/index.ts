/**
 * Standardized Coding Challenges for Benchmarking
 *
 * Provides factory functions to create reproducible benchmark cases
 * for bug-fix, feature, and refactor scenarios.
 */

import type {
  BenchmarkCase,
  BenchmarkCategory,
  BenchmarkDifficulty,
} from '../runner.js';

// ============================================================================
// Bug Fix Challenge
// ============================================================================

export interface BugFixChallengeConfig {
  id: string;
  name: string;
  difficulty: BenchmarkDifficulty;
  prompt: string;
  targetFiles: string[];
  bugDescription: string;
  setupCode?: Record<string, string>;
  validationFn?: () => Promise<boolean>;
}

export function createBugFixChallenge(config: BugFixChallengeConfig): BenchmarkCase {
  return {
    id: config.id,
    name: config.name,
    category: 'bug-fix',
    difficulty: config.difficulty,
    prompt: config.prompt,
    expectedFiles: config.targetFiles,
    setup: async () => {
      // In real implementation, this would create files with buggy code
      if (config.setupCode) {
        // Write setup files (mocked for now)
      }
    },
    validate: config.validationFn || (async () => true),
  };
}

// ============================================================================
// Feature Challenge
// ============================================================================

export interface FeatureChallengeConfig {
  id: string;
  name: string;
  difficulty: BenchmarkDifficulty;
  prompt: string;
  targetFiles: string[];
  featureDescription: string;
  acceptanceCriteria: string[];
  setupCode?: Record<string, string>;
  validationFn?: () => Promise<boolean>;
}

export function createFeatureChallenge(config: FeatureChallengeConfig): BenchmarkCase {
  return {
    id: config.id,
    name: config.name,
    category: 'feature',
    difficulty: config.difficulty,
    prompt: config.prompt,
    expectedFiles: config.targetFiles,
    setup: async () => {
      if (config.setupCode) {
        // Write setup files
      }
    },
    validate: config.validationFn || (async () => true),
  };
}

// ============================================================================
// Refactor Challenge
// ============================================================================

export interface RefactorChallengeConfig {
  id: string;
  name: string;
  difficulty: BenchmarkDifficulty;
  prompt: string;
  targetFiles: string[];
  refactorGoal: string;
  constraints: string[];
  setupCode?: Record<string, string>;
  validationFn?: () => Promise<boolean>;
}

export function createRefactorChallenge(config: RefactorChallengeConfig): BenchmarkCase {
  return {
    id: config.id,
    name: config.name,
    category: 'refactor',
    difficulty: config.difficulty,
    prompt: config.prompt,
    expectedFiles: config.targetFiles,
    setup: async () => {
      if (config.setupCode) {
        // Write setup files
      }
    },
    validate: config.validationFn || (async () => true),
  };
}

// ============================================================================
// Challenge Factory
// ============================================================================

export class ChallengeFactory {
  private challenges: Map<string, BenchmarkCase> = new Map();

  register(challenge: BenchmarkCase): void {
    this.challenges.set(challenge.id, challenge);
  }

  get(id: string): BenchmarkCase | undefined {
    return this.challenges.get(id);
  }

  listChallenges(): BenchmarkCase[] {
    return Array.from(this.challenges.values());
  }

  filterByCategory(category: BenchmarkCategory): BenchmarkCase[] {
    return this.listChallenges().filter((c) => c.category === category);
  }

  filterByDifficulty(difficulty: BenchmarkDifficulty): BenchmarkCase[] {
    return this.listChallenges().filter((c) => c.difficulty === difficulty);
  }

  clear(): void {
    this.challenges.clear();
  }
}

// ============================================================================
// Pre-built Challenges (Examples)
// ============================================================================

export const BUILTIN_CHALLENGES: BenchmarkCase[] = [
  // Bug Fix: Pagination off-by-one
  createBugFixChallenge({
    id: 'pagination-off-by-one',
    name: 'Fix pagination off-by-one error',
    difficulty: 'easy',
    prompt: `The paginate() function in src/utils/paginate.ts has an off-by-one error.
When requesting page 1 with pageSize 10, it should return items 0-9, but it returns items 1-10.
Fix the bug and ensure all existing tests pass.`,
    targetFiles: ['src/utils/paginate.ts'],
    bugDescription: 'Pagination starts at index 1 instead of 0',
  }),

  // Bug Fix: Race condition
  createBugFixChallenge({
    id: 'async-race-condition',
    name: 'Fix async race condition',
    difficulty: 'medium',
    prompt: `The fetchUserData() function in src/api/users.ts has a race condition.
When called multiple times rapidly, it can return stale data.
Implement proper request cancellation or deduplication.`,
    targetFiles: ['src/api/users.ts'],
    bugDescription: 'Race condition causes stale data',
  }),

  // Feature: Add caching
  createFeatureChallenge({
    id: 'add-api-caching',
    name: 'Add API response caching',
    difficulty: 'medium',
    prompt: `Implement a caching layer for the API client in src/api/client.ts.
Requirements:
- Cache GET requests for 5 minutes
- Invalidate cache on POST/PUT/DELETE
- Use in-memory storage`,
    targetFiles: ['src/api/client.ts', 'src/api/cache.ts'],
    featureDescription: 'In-memory API response caching',
    acceptanceCriteria: [
      'GET requests are cached for 5 minutes',
      'Cache is invalidated on mutations',
      'Cache can be manually cleared',
    ],
  }),

  // Feature: Add authentication
  createFeatureChallenge({
    id: 'add-jwt-auth',
    name: 'Add JWT authentication',
    difficulty: 'hard',
    prompt: `Implement JWT authentication for the Express API.
Requirements:
- Login endpoint at POST /auth/login
- Middleware to protect routes
- Token refresh mechanism`,
    targetFiles: ['src/auth/jwt.ts', 'src/middleware/auth.ts', 'src/routes/auth.ts'],
    featureDescription: 'JWT-based authentication system',
    acceptanceCriteria: [
      'Login returns valid JWT',
      'Protected routes reject invalid tokens',
      'Tokens can be refreshed',
    ],
  }),

  // Refactor: Extract class
  createRefactorChallenge({
    id: 'extract-user-manager',
    name: 'Extract UserManager class',
    difficulty: 'medium',
    prompt: `The App class in src/app.ts has grown too large.
Extract all user-related functionality into a new UserManager class.
Maintain the existing public API.`,
    targetFiles: ['src/app.ts', 'src/managers/user-manager.ts'],
    refactorGoal: 'Improve separation of concerns',
    constraints: [
      'All existing tests must pass',
      'Public API must not change',
      'No new dependencies',
    ],
  }),

  // Refactor: Convert to async/await
  createRefactorChallenge({
    id: 'callbacks-to-async',
    name: 'Convert callbacks to async/await',
    difficulty: 'easy',
    prompt: `The database module in src/db/queries.ts uses callback-style async code.
Convert all functions to use async/await.
Maintain backward compatibility.`,
    targetFiles: ['src/db/queries.ts'],
    refactorGoal: 'Modernize async code',
    constraints: [
      'All functions must use async/await',
      'Error handling must be preserved',
      'Tests must pass',
    ],
  }),
];
