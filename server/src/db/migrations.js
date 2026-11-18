import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations'
);

/**
 * Applies every pending `*.sql` migration, in filename order, inside its own
 * transaction, recording each file in `tbl_skema_migrasi`. A file that is
 * already recorded is never re-run.
 *
 * Takes a `pg` Pool so the CLI and the integration tests share one
 * implementation. Returns the number of migrations applied.
 */
export async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_skema_migrasi (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.log('[db] no migrations found');
    return 0;
  }

  const { rows } = await pool.query('SELECT name FROM tbl_skema_migrasi');
  const applied = new Set(rows.map((row) => row.name));

  let count = 0;

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO tbl_skema_migrasi (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      count += 1;
      console.log(`[db] applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[db] failed ${file}`);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(`[db] ${count} migration(s) applied, ${files.length - count} already up to date`);
  return count;
}
