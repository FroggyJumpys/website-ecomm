import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPool, testDatabaseUrl, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';

describe('test database harness', () => {
  beforeAll(async () => {
    await migrateTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('resolved a database whose name ends in _test', () => {
    expect(new URL(testDatabaseUrl).pathname).toMatch(/_test$/);
  });

  it('applies the migrations and leaves the domain tables empty after a reset', async () => {
    await resetDatabase();

    const { rows } = await testPool.query(
      `SELECT count(*)::int AS users FROM tbl_pengguna`
    );

    expect(rows[0].users).toBe(0);
  });

  it('can insert and read a row after the reset', async () => {
    await resetDatabase();

    await testPool.query(
      `INSERT INTO tbl_pengguna (name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4)`,
      ['Uji Coba', 'uji@badekor.id', '081200000000', 'hash']
    );

    const { rows } = await testPool.query('SELECT email, role FROM tbl_pengguna');
    expect(rows).toEqual([{ email: 'uji@badekor.id', role: 'customer' }]);
  });
});
