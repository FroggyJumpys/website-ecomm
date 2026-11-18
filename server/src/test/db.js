import pg from '../db/types.js';
import { env } from '../config/env.js';
import { resolveTestDatabaseUrl } from '../config/testDatabase.js';
import { runMigrations } from '../db/migrations.js';

/**
 * Integration-test harness. The suite talks to a real PostgreSQL database, so
 * it must never be pointed at development data:
 *
 *  - the URL comes from `TEST_DATABASE_URL`, or `DATABASE_URL` with a `_test`
 *    suffix, and `resolveTestDatabaseUrl` refuses anything not named `_test`;
 *  - migrations are applied once per run;
 *  - `resetDatabase()` truncates every domain table between tests.
 */

export const testDatabaseUrl = resolveTestDatabaseUrl(
  process.env.DATABASE_URL ?? env.DATABASE_URL,
  process.env.TEST_DATABASE_URL
);

export const testPool = new pg.Pool({
  connectionString: testDatabaseUrl,
  max: 5,
  connectionTimeoutMillis: 5_000,
});

let migrated = false;

export async function migrateTestDatabase() {
  if (migrated) return;
  await runMigrations(testPool);
  migrated = true;
}

/** Empties every domain table and restarts identity counters. */
export async function resetDatabase() {
  await testPool.query(`
    TRUNCATE TABLE
      tbl_riwayat_status_pesanan,
      tbl_item_pesanan,
      tbl_pesanan,
      tbl_item_keranjang,
      tbl_keranjang,
      tbl_favorit,
      tbl_produk,
      tbl_merek,
      tbl_kategori,
      tbl_alamat,
      tbl_pengguna
    RESTART IDENTITY CASCADE
  `);
}

export async function closeTestDatabase() {
  await testPool.end();
}
