import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations'
);

/**
 * Minimal forward-only migration runner.
 *
 * Every `*.sql` file in server/db/migrations runs once, in filename order,
 * inside its own transaction. Applied migrations are recorded in
 * `tbl_skema_migrasi`, and a file that has already been applied is never
 * re-run or edited.
 */
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_skema_migrasi (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.log('[db] no migrations found');
    return;
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
}

migrate()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
