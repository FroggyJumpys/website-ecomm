import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { createAdminProductStore } from '../db/admin-products.js';
import { createCheckoutStore } from '../db/checkout.js';
import { createCartStore } from '../db/cart.js';
import { registerUser } from '../services/auth.js';

/**
 * Admin writes against live customer traffic.
 *
 * The three races here are the ones a real shop actually hits:
 *
 *  1. an administrator saves a stock figure from a form filled in before a sale;
 *  2. an administrator deletes a product while a customer adds it to a cart;
 *  3. an administrator deletes a product while a checkout is mid-flight.
 *
 * Each test parks the real customer transaction on a gate (a trigger that waits
 * on a row the test holds) and asserts on `pg_blocking_pids` that the admin
 * write actually queued. A sleep would prove nothing: the failure these tests
 * look for is a write that never waited at all.
 */

const adminProducts = createAdminProductStore(testPool);
const checkout = createCheckoutStore(testPool);
const cart = createCartStore(testPool);

let sari;
let categoryId;

const GATE_TABLE = 'admin_gate';
const GATE_FUNCTION = 'admin_gate_fn';
const CHECKOUT_GATE = 'admin_checkout_gate';
const CART_GATE = 'admin_cart_gate';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkoutInput(user) {
  return {
    addressId: user.addressId,
    shippingMethod: 'reguler',
    paymentMethod: 'bca',
  };
}

async function insertProduct(overrides = {}) {
  const item = {
    slug: 'kursi-rotan',
    name: 'Kursi Rotan',
    price: 1_500_000,
    stock: 6,
    ...overrides,
  };

  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, price, rating, review_count, stock, material,
            dimensions, description, colors, sizes, images, is_new, is_trending, is_active
          )
          VALUES ($1, $2, $3, $4, 4.5, 12, $5, 'Rotan', '50 × 55 × 80 cm',
                  'Kursi rotan untuk ruang tamu.', ARRAY['Rotan natural', 'Cokelat'],
                  ARRAY['Standar'], ARRAY['/images/products/product3.jpg'], false, true, true)
       RETURNING id`,
    [item.slug, item.name, categoryId, item.price, item.stock]
  );

  return rows[0].id;
}

async function insertAddress(userId) {
  const { rows } = await testPool.query(
    `INSERT INTO tbl_alamat (user_id, label, recipient, phone, street, district, city,
                             province, postal_code, notes, is_default)
          VALUES ($1, 'Rumah', 'Pemilik', '081234567890', 'Jl. Kayu Tangi 1',
                  'Banjarmasin Utara', 'Banjarmasin', 'Kalimantan Selatan', '70123',
                  '', true)
       RETURNING id`,
    [userId]
  );

  return rows[0].id;
}

async function stockOf(productId) {
  const { rows } = await testPool.query('SELECT stock FROM tbl_produk WHERE id = $1', [productId]);
  return rows[0]?.stock ?? null;
}

async function count(table) {
  const { rows } = await testPool.query(`SELECT count(*)::int AS count FROM ${table}`);
  return rows[0].count;
}

/** Backends whose current statement mentions `fragment` and wait on a lock. */
async function blockedBackends(fragment, attempts = 150) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { rows } = await testPool.query(
      `SELECT pid, pg_blocking_pids(pid) AS blockers, state
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND state = 'active'
          AND query ILIKE $1`,
      [`%${fragment}%`]
    );

    const blocked = rows.filter((row) => row.blockers.length > 0);
    if (blocked.length > 0) return blocked;

    await sleep(20);
  }

  return [];
}

/** Backends waiting on `holderPid` right now. */
async function waitersOn(holderPid, attempts = 150) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { rows } = await testPool.query(
      `SELECT pid FROM pg_stat_activity WHERE $1 = ANY (pg_blocking_pids(pid))`,
      [holderPid]
    );

    if (rows.length > 0) return rows;
    await sleep(20);
  }

  return [];
}

/**
 * Two gates on one table: checkouts park at the order insert, cart writes park
 * at the cart-line insert. Both wait on the same locked row, so one holder can
 * freeze either kind of transaction.
 */
async function openGate() {
  await testPool.query(`CREATE TABLE IF NOT EXISTS ${GATE_TABLE} (id int PRIMARY KEY)`);
  await testPool.query(`INSERT INTO ${GATE_TABLE} (id) VALUES (1) ON CONFLICT DO NOTHING`);
  await testPool.query(`
    CREATE OR REPLACE FUNCTION ${GATE_FUNCTION}() RETURNS trigger AS $$
    BEGIN
      PERFORM 1 FROM ${GATE_TABLE} WHERE id = 1 FOR UPDATE;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await testPool.query(`
    CREATE TRIGGER ${CHECKOUT_GATE}
      BEFORE INSERT ON tbl_pesanan
      FOR EACH ROW EXECUTE FUNCTION ${GATE_FUNCTION}()
  `);
  await testPool.query(`
    CREATE TRIGGER ${CART_GATE}
      BEFORE INSERT ON tbl_item_keranjang
      FOR EACH ROW EXECUTE FUNCTION ${GATE_FUNCTION}()
  `);
}

async function closeGate() {
  await testPool.query(`DROP TRIGGER IF EXISTS ${CHECKOUT_GATE} ON tbl_pesanan`);
  await testPool.query(`DROP TRIGGER IF EXISTS ${CART_GATE} ON tbl_item_keranjang`);
  await testPool.query(`DROP FUNCTION IF EXISTS ${GATE_FUNCTION}()`);
  await testPool.query(`DROP TABLE IF EXISTS ${GATE_TABLE}`);
}

async function holdGate() {
  const client = await testPool.connect();
  await client.query('BEGIN');
  await client.query(`SELECT 1 FROM ${GATE_TABLE} WHERE id = 1 FOR UPDATE`);
  return client;
}

/** Settles `promise` into a plain result object so assertions never throw early. */
function settle(promise) {
  return promise.then(
    (value) => ({ value }),
    (error) => ({ error })
  );
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

  sari = await registerUser(testPool, {
    name: 'Sari Wulandari',
    email: 'sari@badekor.id',
    phone: '081234567890',
    password: 'rahasia123',
  });
  sari.addressId = await insertAddress(sari.id);
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('stale stock save after checkout', () => {
  it('refuses a form saved before the sale instead of restoring sold stock', async () => {
    // Review Focus #1: the customer checkouts out while the admin form is open.
    const productId = await insertProduct({ stock: 6 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    await openGate();
    const gate = await holdGate();

    const attempt = checkout.create(sari.id, checkoutInput(sari), 'checkout-admin-0001');
    let adminSave;

    try {
      const [parked] = await blockedBackends('INSERT INTO tbl_pesanan');
      expect(parked).toBeDefined();

      // The form was read at version 1 and still shows 6 units.
      adminSave = settle(adminProducts.update(productId, { stock: 6 }, 1));

      // The checkout holds the product row FOR UPDATE, so the admin write has
      // to queue behind it rather than read the pre-sale stock.
      expect(await waitersOn(parked.pid)).not.toEqual([]);
    } finally {
      await gate.query('ROLLBACK');
      gate.release();
      await closeGate();
    }

    const [order, saved] = await Promise.all([attempt, adminSave]);

    expect(order.replayed).toBe(false);
    expect(saved.error).toMatchObject({ status: 409, code: 'PRODUCT_CONFLICT' });
    expect(await stockOf(productId)).toBe(5);
    expect(await count('tbl_pesanan')).toBe(1);
  });

  it('lets a save that read the post-sale version through', async () => {
    const productId = await insertProduct({ stock: 6 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    await checkout.create(sari.id, checkoutInput(sari), 'checkout-admin-0002');

    const { rows } = await testPool.query('SELECT version FROM tbl_produk WHERE id = $1', [
      productId,
    ]);

    // The admin reloaded, so the version now reflects the sale.
    const saved = await adminProducts.update(productId, { stock: 9 }, rows[0].version);

    expect(saved.stock).toBe(9);
    expect(saved.version).toBe(rows[0].version + 1);
  });
});

describe('delete against a live cart', () => {
  it('queues behind a cart add and then refuses because the line exists', async () => {
    const productId = await insertProduct({ stock: 6 });
    await cart.add({ userId: sari.id }, { productId, color: 'Cokelat', size: 'Standar' });

    // A second, separate cart line is what the delete will find.
    await openGate();
    const gate = await holdGate();

    let addition;
    let removal;

    try {
      // Park a real cart write, which holds the product row FOR UPDATE.
      addition = settle(
        cart.add(
          { guestTokenHash: 'a'.repeat(64) },
          { productId, color: 'Rotan natural', size: 'Standar' }
        )
      );

      const [parked] = await blockedBackends('INSERT INTO tbl_item_keranjang');
      expect(parked).toBeDefined();

      // The line the user already owns makes the delete refuse; the pending
      // add is why it has to wait for the product lock first.
      removal = settle(adminProducts.remove(productId, 1));

      expect(await waitersOn(parked.pid)).not.toEqual([]);
    } finally {
      await gate.query('ROLLBACK');
      gate.release();
      await closeGate();
    }

    const [added, removed] = await Promise.all([addition, removal]);

    expect(added.error).toBeUndefined();
    expect(removed.error).toMatchObject({
      status: 409,
      code: 'PRODUCT_IN_USE',
      details: { productId },
    });

    expect(await stockOf(productId)).toBe(6);
    const lines = await testPool.query(
      'SELECT count(*)::int AS total FROM tbl_item_keranjang WHERE product_id = $1',
      [productId]
    );
    expect(lines.rows[0].total).toBe(2);
    // Nothing is left pointing at a product that no longer exists.
    const orphan = await testPool.query(
      `SELECT 1 FROM tbl_item_keranjang i
         LEFT JOIN tbl_produk p ON p.id = i.product_id
        WHERE p.id IS NULL`
    );
    expect(orphan.rows).toEqual([]);
  });
});

describe('delete against an in-flight checkout', () => {
  it('waits for the checkout, then refuses because the sale bumped the version', async () => {
    const productId = await insertProduct({ stock: 6 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    await openGate();
    const gate = await holdGate();

    const attempt = checkout.create(sari.id, checkoutInput(sari), 'checkout-admin-0003');
    let removal;

    try {
      const [parked] = await blockedBackends('INSERT INTO tbl_pesanan');
      expect(parked).toBeDefined();

      removal = settle(adminProducts.remove(productId, 1));

      expect(await waitersOn(parked.pid)).not.toEqual([]);
    } finally {
      await gate.query('ROLLBACK');
      gate.release();
      await closeGate();
    }

    const [order, removed] = await Promise.all([attempt, removal]);

    // Deterministic: the delete queues on the product row the checkout holds,
    // and the sale has already advanced the version by the time it gets in. A
    // delete built from the pre-sale form is therefore refused as stale rather
    // than removing a product the customer has just bought.
    expect(order.replayed).toBe(false);
    expect(removed.error).toMatchObject({ status: 409, code: 'PRODUCT_CONFLICT' });
    expect(await stockOf(productId)).toBe(5);

    const item = await testPool.query(
      `SELECT i.product_id, i.product_name, i.unit_price, i.color, i.size
         FROM tbl_item_pesanan i
         JOIN tbl_pesanan o ON o.id = i.order_id
        WHERE o.order_number = $1`,
      [order.order.orderNumber]
    );
    expect(item.rows[0]).toMatchObject({
      product_id: productId,
      product_name: 'Kursi Rotan',
      unit_price: 1_500_000,
      color: 'Rotan natural',
      size: 'Standar',
    });
    expect(await count('tbl_pesanan')).toBe(1);
  });

  it('deletes the product after the checkout when the admin reloads first', async () => {
    const productId = await insertProduct({ stock: 6 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    const order = await checkout.create(sari.id, checkoutInput(sari), 'checkout-admin-0004');

    const { rows } = await testPool.query('SELECT version FROM tbl_produk WHERE id = $1', [
      productId,
    ]);

    // The cart is empty now, so the only thing standing in the way was the
    // stale version the administrator had on screen.
    await expect(adminProducts.remove(productId, rows[0].version)).resolves.toBeNull();

    const item = await testPool.query(
      `SELECT i.product_id, i.product_name, i.unit_price, i.image
         FROM tbl_item_pesanan i
         JOIN tbl_pesanan o ON o.id = i.order_id
        WHERE o.order_number = $1`,
      [order.order.orderNumber]
    );
    expect(item.rows[0]).toMatchObject({
      product_id: null,
      product_name: 'Kursi Rotan',
      unit_price: 1_500_000,
    });
  });
});
