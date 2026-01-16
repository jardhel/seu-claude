/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  // Force exit after tests complete - needed for LanceDB native bindings (CustomGC)
  forceExit: true,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        diagnostics: {
          ignoreCodes: [151002],
        },
      },
    ],
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts', // Entry point
    '!src/cli-index.ts', // CLI - requires process interaction
    '!src/cli-stats.ts', // CLI - requires process interaction
    '!src/doctor.ts', // CLI - requires process interaction
    '!src/setup.ts', // CLI - requires process interaction
    '!src/lsp/client.ts', // Requires running tsserver
    '!src/server.ts', // MCP server glue code - tested via integration
    '!src/tools/get-stats.ts', // Tool wrapper - tested via integration
    '!src/tools/get-token-analytics.ts', // Tool wrapper - tested via integration
    '!src/tools/get-memory-profile.ts', // Tool wrapper - tested via integration
    '!src/tools/get-query-analytics.ts', // Tool wrapper - tested via integration
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 90,
      lines: 76,
      statements: 76,
    },
  },
};
