// vitest.config.ts for VS Code extension
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
  provider: 'v8',
      reporter: ['text', 'lcov'],
  // Coverage thresholds are enforced via CLI, not config
      exclude: [
        'dist/**',
        'out/**',
        'test/**',
        '**/*.d.ts',
        '**/node_modules/**',
        '**/testUtils/**',
      ],
    },
  },
});
