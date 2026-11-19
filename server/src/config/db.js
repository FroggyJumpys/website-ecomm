import pg from '../db/types.js';
import { env } from './env.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error) => {
  console.error('[db] unexpected idle client error', error);
});

/**
 * Run a parameterised query. Always pass values through `params`, never
 * interpolate them into the SQL string.
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Builds a `withTransaction` bound to a specific pool.
 *
 * The seed script uses the module-level default, while the account tests pass
 * the test pool; without this, a transaction opened in a test would run against
 * the development database.
 */
export function createWithTransaction(pool) {
  return async function withTransaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
}

/**
 * Run `fn` inside a transaction on the default pool, rolling back on any
 * thrown error.
 */
export const withTransaction = createWithTransaction(pool);

/** Cheap liveness probe used by the health endpoint. */
export async function ping() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

export async function closePool() {
  await pool.end();
}
