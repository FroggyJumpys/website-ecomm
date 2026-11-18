import { pool } from '../config/db.js';
import { runMigrations } from './migrations.js';

/**
 * CLI entry point: `npm run db:migrate`.
 *
 * The runner lives in `migrations.js` so the integration tests can apply the
 * same migrations to the test database.
 */
runMigrations(pool)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
