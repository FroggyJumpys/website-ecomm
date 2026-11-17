import { defineConfig } from 'vitest/config';

/**
 * Default suite: everything except the database-backed integration tests, so
 * `npm test` passes without PostgreSQL running.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    exclude: ['**/node_modules/**', 'src/**/*.integration.test.js'],
  },
});
