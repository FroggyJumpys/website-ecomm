import { defineConfig } from 'vitest/config';

/**
 * Database-backed suite. Requires TEST_DATABASE_URL, pointing at a disposable
 * database whose name contains "test"; the test file refuses anything else.
 *
 *   TEST_DATABASE_URL=postgres://ba_dekor:ba_dekor@localhost:5432/ba_dekor_test \
 *     npm run test:integration
 */
export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.js'],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
