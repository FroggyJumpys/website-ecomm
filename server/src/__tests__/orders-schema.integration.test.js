import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  testPool,
  migrateTestDatabase,
  resetDatabase,
  closeTestDatabase,
} from '../test/db.js';
import { migrationsDir, runMigrations } from '../db/migrations.js';
import { registerUser } from '../services/auth.js';

/**
 * Checkout schema invariants.
 *
 * The order row is the record of a promise made to a customer, so the database
 * — not only the service — refuses the states that would break that promise:
 * half a retry identity, an invented shipping method, or two orders carrying
 * the same idempotency key for one account.
 *
 * Order numbers get their own sequence. `MAX(order_number) + 1` would let two
 * concurrent checkouts draw the same number, and resetting it each year would
 * collide with the year's earlier orders, so the migration's starting point is
 * tested on isolated schemas rather than assumed.
 */

let sari;
let rani;

const MIGRATION_FILE = '007_order_checkout.sql';

function orderRow(overrides = {}) {
  return {
    order_number: 'BD-2026-9001',
    user_id: sari.id,
    subtotal: 100_000,
    shipping_cost: 0,
    discount: 0,
    total: 100_000,
    payment_method: 'Transfer bank BCA',
    shipping_recipient: 'Sari Wulandari',
    shipping_phone: '081234567890',
    shipping_street: 'Jl. Kayu Tangi 1',
    shipping_city: 'Banjarmasin',
    shipping_province: 'Kalimantan Selatan',
    ...overrides,
  };
}

async function insertOrder(overrides = {}) {
  const row = orderRow(overrides);
  const columns = Object.keys(row);
  const values = Object.values(row);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');

  const { rows } = await testPool.query(
    `INSERT INTO tbl_pesanan (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    values
  );

  return rows[0].id;
}

async function column(name) {
  const { rows } = await testPool.query(
    `SELECT is_nullable, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tbl_pesanan' AND column_name = $1`,
    [name]
  );

  return rows[0] ?? null;
}

/** Runs an arbitrary statement and returns the error it raised, if any. */
async function failure(sql, params) {
  try {
    await testPool.query(sql, params);
    return null;
  } catch (error) {
    return error;
  }
}

beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();

  sari = await registerUser(testPool, {
    name: 'Sari Wulandari',
    email: 'sari@badekor.id',
    phone: '081234567890',
    password: 'rahasia123',
  });
  rani = await registerUser(testPool, {
    name: 'Rani BaDekor',
    email: 'rani@badekor.id',
    phone: '081100000000',
    password: 'rahasia123',
  });
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('checkout metadata columns', () => {
  it('adds the three columns as nullable, so legacy orders stay valid', async () => {
    for (const name of ['shipping_method', 'idempotency_key', 'request_fingerprint']) {
      expect(await column(name)).toMatchObject({ is_nullable: 'YES' });
    }

    const id = await insertOrder();
    expect(id).toBeGreaterThan(0);
  });

  it('stores a complete checkout identity', async () => {
    const id = await insertOrder({
      shipping_method: 'reguler',
      idempotency_key: 'checkout-abcdef0123456789',
      request_fingerprint: 'a'.repeat(64),
    });

    const { rows } = await testPool.query(
      `SELECT shipping_method, idempotency_key, request_fingerprint
         FROM tbl_pesanan WHERE id = $1`,
      [id]
    );

    expect(rows[0]).toEqual({
      shipping_method: 'reguler',
      idempotency_key: 'checkout-abcdef0123456789',
      request_fingerprint: 'a'.repeat(64),
    });
  });

  it('refuses a key without its fingerprint', async () => {
    const error = await failure(
      `INSERT INTO tbl_pesanan (order_number, user_id, subtotal, total, shipping_recipient,
                                shipping_phone, shipping_street, shipping_city,
                                shipping_province, idempotency_key)
            VALUES ('BD-2026-9002', $1, 0, 0, 'Sari', '0812', 'Jl. 1', 'Banjarmasin', 'Kalsel',
                    'checkout-abcdef0123456789')`,
      [sari.id]
    );

    expect(error.code).toBe('23514');
  });

  it('refuses a fingerprint without its key', async () => {
    const error = await failure(
      `INSERT INTO tbl_pesanan (order_number, user_id, subtotal, total, shipping_recipient,
                                shipping_phone, shipping_street, shipping_city,
                                shipping_province, request_fingerprint)
            VALUES ('BD-2026-9003', $1, 0, 0, 'Sari', '0812', 'Jl. 1', 'Banjarmasin', 'Kalsel', $2)`,
      [sari.id, 'b'.repeat(64)]
    );

    expect(error.code).toBe('23514');
  });

  it('refuses a malformed idempotency key', async () => {
    for (const key of ['short', 'has space in the key', `${'a'.repeat(129)}`]) {
      const error = await failure(
        `INSERT INTO tbl_pesanan (order_number, user_id, subtotal, total, shipping_recipient,
                                  shipping_phone, shipping_street, shipping_city,
                                  shipping_province, idempotency_key, request_fingerprint)
              VALUES ('BD-2026-9004', $1, 0, 0, 'Sari', '0812', 'Jl. 1', 'Banjarmasin', 'Kalsel',
                      $2, $3)`,
        [sari.id, key, 'c'.repeat(64)]
      );

      expect(error.code).toBe('23514');
    }
  });

  it('refuses a malformed fingerprint', async () => {
    for (const fingerprint of ['too-short', 'D'.repeat(64), `${'e'.repeat(63)}Z`]) {
      const error = await failure(
        `INSERT INTO tbl_pesanan (order_number, user_id, subtotal, total, shipping_recipient,
                                  shipping_phone, shipping_street, shipping_city,
                                  shipping_province, idempotency_key, request_fingerprint)
              VALUES ('BD-2026-9005', $1, 0, 0, 'Sari', '0812', 'Jl. 1', 'Banjarmasin', 'Kalsel',
                      'checkout-abcdef01234567', $2)`,
        [sari.id, fingerprint]
      );

      expect(error.code).toBe('23514');
    }
  });

  it('refuses a shipping method outside the allowlist', async () => {
    const error = await failure(
      `INSERT INTO tbl_pesanan (order_number, user_id, subtotal, total, shipping_recipient,
                                shipping_phone, shipping_street, shipping_city,
                                shipping_province, shipping_method)
            VALUES ('BD-2026-9006', $1, 0, 0, 'Sari', '0812', 'Jl. 1', 'Banjarmasin', 'Kalsel',
                    'instan')`,
      [sari.id]
    );

    expect(error.code).toBe('23514');
  });

  it('accepts every allowed shipping method', async () => {
    let index = 0;
    for (const method of ['reguler', 'kargo', 'workshop']) {
      index += 1;
      await expect(
        insertOrder({ order_number: `BD-2026-91${String(index).padStart(2, '0')}`, shipping_method: method })
      ).resolves.toBeGreaterThan(0);
    }
  });
});

describe('idempotency uniqueness', () => {
  it('refuses two orders with the same key for one account', async () => {
    await insertOrder({
      order_number: 'BD-2026-9200',
      idempotency_key: 'checkout-abcdef0123456789',
      request_fingerprint: 'a'.repeat(64),
    });

    const error = await failure(
      `INSERT INTO tbl_pesanan (order_number, user_id, subtotal, total, shipping_recipient,
                                shipping_phone, shipping_street, shipping_city,
                                shipping_province, idempotency_key, request_fingerprint)
            VALUES ('BD-2026-9201', $1, 0, 0, 'Sari', '0812', 'Jl. 1', 'Banjarmasin', 'Kalsel',
                    'checkout-abcdef0123456789', $2)`,
      [sari.id, 'a'.repeat(64)]
    );

    expect(error.code).toBe('23505');
  });

  it('lets two accounts use the same key', async () => {
    await insertOrder({
      order_number: 'BD-2026-9202',
      idempotency_key: 'checkout-abcdef0123456789',
      request_fingerprint: 'a'.repeat(64),
    });

    await expect(
      insertOrder({
        order_number: 'BD-2026-9203',
        user_id: rani.id,
        idempotency_key: 'checkout-abcdef0123456789',
        request_fingerprint: 'a'.repeat(64),
      })
    ).resolves.toBeGreaterThan(0);
  });

  it('lets one account hold many orders without a key', async () => {
    await expect(insertOrder({ order_number: 'BD-2026-9204' })).resolves.toBeGreaterThan(0);
    await expect(insertOrder({ order_number: 'BD-2026-9205' })).resolves.toBeGreaterThan(0);
  });
});

describe('order number sequence', () => {
  it('exists and hands out distinct values under concurrency', async () => {
    const values = await Promise.all(
      Array.from({ length: 20 }, () => testPool.query(`SELECT nextval('order_number_sequence') AS n`))
    );

    const allocated = values.map((result) => result.rows[0].n);
    expect(new Set(allocated).size).toBe(allocated.length);
  });

  it('starts above the seeded order numbers when the seed ran after migrating', async () => {
    // A clean checkout migrates first, then seeds the demo orders. Those static
    // numbers must never collide with a generated one.
    await insertOrder({ order_number: 'BD-2026-0417' });

    const { rows } = await testPool.query(`SELECT nextval('order_number_sequence') AS n`);
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(1000);
  });

  it('applies no further migrations on a second run', async () => {
    await expect(runMigrations(testPool)).resolves.toBe(0);
  });
});

/**
 * The sequence's starting point is only observable on a database where the
 * migration has not run yet, so these cases build a throwaway schema, put the
 * legacy orders in it, apply the migration there, and drop the schema again.
 * The development and test databases are never repaired or reseeded for this.
 */
describe('sequence initialisation', () => {
  const migrationPath = path.join(migrationsDir, MIGRATION_FILE);
  let schemaIndex = 0;

  async function initialSequence({ orderNumbers }) {
    schemaIndex += 1;
    const schema = `checkout_seq_${process.pid}_${schemaIndex}`;
    const client = await testPool.connect();

    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      await client.query(`
        CREATE TABLE tbl_pesanan (
          id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          order_number TEXT NOT NULL UNIQUE,
          user_id    BIGINT NOT NULL
        )
      `);

      for (const orderNumber of orderNumbers) {
        await client.query('INSERT INTO tbl_pesanan (order_number, user_id) VALUES ($1, 1)', [
          orderNumber,
        ]);
      }

      await client.query(await readFile(migrationPath, 'utf8'));

      const { rows } = await client.query(`SELECT nextval('order_number_sequence') AS n`);

      return Number(rows[0].n);
    } finally {
      try {
        await client.query('SET search_path TO public');
        await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        client.release();
      }
    }
  }

  it('starts at 1000 when there are no legacy orders', async () => {
    expect(await initialSequence({ orderNumbers: [] })).toBe(1000);
  });

  it('keeps the 1000 floor when the legacy suffixes are below it', async () => {
    expect(await initialSequence({ orderNumbers: ['BD-2026-0417'] })).toBe(1000);
  });

  it('starts just above the highest legacy suffix', async () => {
    expect(
      await initialSequence({ orderNumbers: ['BD-2026-0417', 'BD-2025-1234', 'BD-2026-0307'] })
    ).toBe(1235);
  });

  it('ignores order numbers that are not in the generated shape', async () => {
    expect(
      await initialSequence({ orderNumbers: ['BD-2026-0417', 'LEGACY-9000', 'BD-2026-ABC'] })
    ).toBe(1000);
  });
});
