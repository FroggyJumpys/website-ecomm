import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The integration suites share one PostgreSQL database and truncate it
    // between tests, so they must not run in parallel with each other.
    // Unit suites run in their own pass.
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/__tests__/**/*.test.js', '!src/__tests__/**/*.integration.test.js'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/__tests__/**/*.integration.test.js'],
          fileParallelism: false,
          // bcrypt hashing and a real database make these slower than the units.
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
