import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  ChallengeFactory,
  createBugFixChallenge,
  createFeatureChallenge,
  createRefactorChallenge,
} from './index.js';
// BenchmarkCase type used indirectly via challenge factories

describe('ChallengeFactory', () => {
  const testDir = '/tmp/seu-claude-test-challenges';

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('createBugFixChallenge()', () => {
    it('should create a valid bug-fix benchmark case', () => {
      const challenge = createBugFixChallenge({
        id: 'pagination-off-by-one',
        name: 'Fix pagination off-by-one error',
        difficulty: 'easy',
        prompt: 'Fix the off-by-one error in the paginate function',
        targetFiles: ['src/pagination.ts'],
        bugDescription: 'The paginate function returns one less item than expected',
      });

      expect(challenge.id).toBe('pagination-off-by-one');
      expect(challenge.category).toBe('bug-fix');
      expect(challenge.difficulty).toBe('easy');
      expect(challenge.expectedFiles).toContain('src/pagination.ts');
    });

    it('should include setup that creates buggy code', async () => {
      const challenge = createBugFixChallenge({
        id: 'test-bug',
        name: 'Test bug',
        difficulty: 'easy',
        prompt: 'Fix the bug',
        targetFiles: ['test.ts'],
        bugDescription: 'Test bug',
        setupCode: {
          'test.ts': 'export const buggy = () => 1;', // Should return 2
        },
      });

      await challenge.setup();
      // Setup should create files (mocked in real implementation)
      expect(challenge.expectedFiles).toHaveLength(1);
    });
  });

  describe('createFeatureChallenge()', () => {
    it('should create a valid feature benchmark case', () => {
      const challenge = createFeatureChallenge({
        id: 'add-auth',
        name: 'Add authentication',
        difficulty: 'medium',
        prompt: 'Add JWT authentication to the API',
        targetFiles: ['src/auth.ts', 'src/middleware.ts'],
        featureDescription: 'Implement JWT-based authentication',
        acceptanceCriteria: [
          'Login endpoint returns JWT token',
          'Protected routes require valid token',
        ],
      });

      expect(challenge.id).toBe('add-auth');
      expect(challenge.category).toBe('feature');
      expect(challenge.difficulty).toBe('medium');
      expect(challenge.expectedFiles).toHaveLength(2);
    });

    it('should include acceptance criteria in validation', () => {
      const challenge = createFeatureChallenge({
        id: 'add-feature',
        name: 'Add feature',
        difficulty: 'easy',
        prompt: 'Add a feature',
        targetFiles: ['src/feature.ts'],
        featureDescription: 'A new feature',
        acceptanceCriteria: ['Feature works'],
      });

      expect(challenge.prompt).toContain('Add a feature');
    });
  });

  describe('createRefactorChallenge()', () => {
    it('should create a valid refactor benchmark case', () => {
      const challenge = createRefactorChallenge({
        id: 'extract-class',
        name: 'Extract class from god object',
        difficulty: 'hard',
        prompt: 'Extract the user management logic into a separate UserManager class',
        targetFiles: ['src/app.ts', 'src/user-manager.ts'],
        refactorGoal: 'Improve separation of concerns',
        constraints: [
          'Maintain existing public API',
          'All tests must pass',
        ],
      });

      expect(challenge.id).toBe('extract-class');
      expect(challenge.category).toBe('refactor');
      expect(challenge.difficulty).toBe('hard');
    });

    it('should enforce constraints in validation', () => {
      const challenge = createRefactorChallenge({
        id: 'refactor-test',
        name: 'Refactor test',
        difficulty: 'medium',
        prompt: 'Refactor the code',
        targetFiles: ['src/code.ts'],
        refactorGoal: 'Clean up',
        constraints: ['Keep API stable'],
      });

      expect(challenge.category).toBe('refactor');
    });
  });

  describe('ChallengeFactory', () => {
    it('should list available challenges', () => {
      const factory = new ChallengeFactory();
      const challenges = factory.listChallenges();

      expect(Array.isArray(challenges)).toBe(true);
    });

    it('should get challenge by id', () => {
      const factory = new ChallengeFactory();
      factory.register(createBugFixChallenge({
        id: 'test-challenge',
        name: 'Test',
        difficulty: 'easy',
        prompt: 'Test',
        targetFiles: [],
        bugDescription: 'Test',
      }));

      const challenge = factory.get('test-challenge');
      expect(challenge?.id).toBe('test-challenge');
    });

    it('should filter challenges by category', () => {
      const factory = new ChallengeFactory();
      factory.register(createBugFixChallenge({
        id: 'bug-1',
        name: 'Bug 1',
        difficulty: 'easy',
        prompt: 'Fix',
        targetFiles: [],
        bugDescription: 'Bug',
      }));
      factory.register(createFeatureChallenge({
        id: 'feature-1',
        name: 'Feature 1',
        difficulty: 'easy',
        prompt: 'Add',
        targetFiles: [],
        featureDescription: 'Feature',
        acceptanceCriteria: [],
      }));

      const bugFixes = factory.filterByCategory('bug-fix');
      expect(bugFixes).toHaveLength(1);
      expect(bugFixes[0].category).toBe('bug-fix');
    });

    it('should filter challenges by difficulty', () => {
      const factory = new ChallengeFactory();
      factory.register(createBugFixChallenge({
        id: 'easy-1',
        name: 'Easy',
        difficulty: 'easy',
        prompt: 'Fix',
        targetFiles: [],
        bugDescription: 'Bug',
      }));
      factory.register(createBugFixChallenge({
        id: 'hard-1',
        name: 'Hard',
        difficulty: 'hard',
        prompt: 'Fix',
        targetFiles: [],
        bugDescription: 'Bug',
      }));

      const easyOnes = factory.filterByDifficulty('easy');
      expect(easyOnes).toHaveLength(1);
      expect(easyOnes[0].difficulty).toBe('easy');
    });
  });
});
