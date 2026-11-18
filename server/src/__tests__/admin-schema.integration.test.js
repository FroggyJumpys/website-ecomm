import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { runMigrations } from '../db/migrations.js';

/**
 * Product versions.
 *
 * An administrator edits a product from a form that was filled minutes ago. In
 * that time a checkout may have sold the last units, and saving the form's
 * older `stock` would put stock back on the shelf that no longer exists. The
 * version is what makes that form stale, so it has to advance on every write —
 * including the stock decrement checkout performs.
 */

let categoryId;

async function insertProduct() {
  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, price, rating, review_count, stock, material,
            dimensions, description, colors, sizes, images, is_new, is_trending, is_active
          )
          VALUES ('kursi-rotan', 'Kursi Rotan', $1, 1500000, 4.5, 12, 6, 'Rotan',
                  '50 × 55 × 80 cm', 'Kursi rotan.', ARRAY['Rotan natural'],
                  ARRAY['Standar'], ARRAY['/images/products/product3.jpg'], false, true, true)
       RETURNING id, version`,
    [categoryId]
  );

  return rows[0];
}

async function versionOf(productId) {
  const { rows } = await testPool.query('SELECT version FROM tbl_produk WHERE id = $1', [
    productId,
  ]);
  return rows[0].version;
}

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

  const { rows } = await testPool.query(
    `INSERT INTO tbl_kategori (slug, name, description, image, sort_order)
          VALUES ('kursi', 'Kursi', '', '', 0) RETURNING id`
  );
  categoryId = rows[0].id;
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('tbl_produk.version', () => {
  it('exists as a non-null bigint that defaults to 1', async () => {
    const { rows } = await testPool.query(
      `SELECT is_nullable, data_type, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tbl_produk' AND column_name = 'version'`
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ is_nullable: 'NO', data_type: 'bigint' });
    expect(rows[0].column_default).toContain('1');
  });

  it('starts a new product at version 1', async () => {
    expect((await insertProduct()).version).toBe(1);
  });

  it('advances on every ordinary update', async () => {
    const { id } = await insertProduct();

    await testPool.query(`UPDATE tbl_produk SET name = 'Kursi Rotan Baru' WHERE id = $1`, [id]);
    expect(await versionOf(id)).toBe(2);

    await testPool.query(`UPDATE tbl_produk SET material = 'Rotan sintetis' WHERE id = $1`, [id]);
    expect(await versionOf(id)).toBe(3);
  });

  it('advances when checkout decrements stock', async () => {
    // Checkout runs `SET stock = stock - $1`; a version that ignored it would
    // let a stale admin form restore the sold unit.
    const { id } = await insertProduct();

    await testPool.query('UPDATE tbl_produk SET stock = stock - 1 WHERE id = $1', [id]);

    expect(await versionOf(id)).toBe(2);
  });

  it('refuses a version below 1 written directly', async () => {
    const inserted = await failure(
      `INSERT INTO tbl_produk (
         slug, name, category_id, price, rating, review_count, stock, material,
         dimensions, description, colors, sizes, images, is_new, is_trending,
         is_active, version
       )
       VALUES ('kursi-rendah', 'Kursi Rendah', $1, 1000, 0, 0, 0, '', '', '', '{}', '{}',
               '{}', false, false, true, 0)`,
      [categoryId]
    );

    expect(inserted.code).toBe('23514');
  });

  it('owns the value even when an update tries to set it', async () => {
    const { id } = await insertProduct();

    await testPool.query('UPDATE tbl_produk SET version = 99 WHERE id = $1', [id]);

    // The trigger ignores the attempted value and increments the old one.
    expect(await versionOf(id)).toBe(2);
  });

  it('does not reapply itself on a second migration run', async () => {
    await expect(runMigrations(testPool)).resolves.toBe(0);
  });
});
