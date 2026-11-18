import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { createCheckoutStore } from '../db/checkout.js';
import { createCartStore } from '../db/cart.js';
import { mergeGuestCart } from '../db/cart-merge.js';
import { registerUser } from '../services/auth.js';
import { createGuestToken, hashGuestToken } from '../lib/guestCart.js';

/**
 * Checkout under contention.
 *
 * Each case starts real work on separate pool connections and asserts on what
 * the database holds afterwards, not on scheduling guesses: a checkout that
 * loses the race for the last unit must not leave the stock negative, a retry
 * that arrives while the first request is still running must not charge twice,
 * and a delete that arrives mid-checkout must queue rather than empty the cart
 * underneath the snapshot.
 *
 * Blocking is observed with `pg_blocking_pids` rather than with a sleep: a
 * backend that never queued is exactly the failure these tests are looking for.
 */

const checkout = createCheckoutStore(testPool);
const cart = createCartStore(testPool);

let sari;
let rani;
let categoryId;

const GATE_TABLE = 'checkout_test_gate';
const GATE_FUNCTION = 'checkout_test_gate_fn';
const GATE_TRIGGER = 'checkout_test_gate';

function checkoutInput(user, overrides = {}) {
  return { addressId: user.addressId, shippingMethod: 'reguler', paymentMethod: 'bca', ...overrides };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function insertProduct(overrides = {}) {
  const item = {
    slug: 'kursi-rotan',
    name: 'Kursi Rotan',
    price: 1_500_000,
    stock: 6,
    colors: ['Rotan natural', 'Cokelat'],
    sizes: ['Standar'],
    ...overrides,
  };

  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, price, rating, review_count, stock, material,
            dimensions, description, colors, sizes, images, is_new, is_trending, is_active
          )
          VALUES ($1, $2, $3, $4, 4.5, 12, $5, 'Rotan', '50 × 55 × 80 cm',
                  'Kursi rotan untuk ruang tamu.', $6, $7,
                  ARRAY['/images/products/product3.jpg'], false, true, true)
       RETURNING id`,
    [item.slug, item.name, categoryId, item.price, item.stock, item.colors, item.sizes]
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
  return rows[0].stock;
}

async function count(table) {
  const { rows } = await testPool.query(`SELECT count(*)::int AS count FROM ${table}`);
  return rows[0].count;
}

/** Backends whose current statement mentions `fragment` and are waiting on a lock. */
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
 * A gate that parks a checkout after it has locked the cart and read everything
 * it needs, but before it has written anything.
 *
 * A trigger on the order insert waits on a row this test locks, which is the
 * only way to hold a real checkout mid-transaction without reaching into its
 * internals: the transaction is a genuine one, started by `create`.
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
    CREATE TRIGGER ${GATE_TRIGGER}
      BEFORE INSERT ON tbl_pesanan
      FOR EACH ROW EXECUTE FUNCTION ${GATE_FUNCTION}()
  `);
}

async function closeGate() {
  await testPool.query(`DROP TRIGGER IF EXISTS ${GATE_TRIGGER} ON tbl_pesanan`);
  await testPool.query(`DROP FUNCTION IF EXISTS ${GATE_FUNCTION}()`);
  await testPool.query(`DROP TABLE IF EXISTS ${GATE_TABLE}`);
}

/** Holds the gate row, so a checkout parks at its order insert. */
async function holdGate() {
  const client = await testPool.connect();
  await client.query('BEGIN');
  await client.query(`SELECT 1 FROM ${GATE_TABLE} WHERE id = 1 FOR UPDATE`);
  return client;
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

  rani = await registerUser(testPool, {
    name: 'Rani BaDekor',
    email: 'rani@badekor.id',
    phone: '081100000000',
    password: 'rahasia123',
  });
  rani.addressId = await insertAddress(rani.id);
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('stock contention', () => {
  it('sells the last unit once when two customers check out at the same time', async () => {
    const productId = await insertProduct({ stock: 1 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });
    await cart.add({ userId: rani.id }, { productId, color: 'Cokelat', size: 'Standar' });

    const results = await Promise.allSettled([
      checkout.create(sari.id, checkoutInput(sari), 'checkout-cccccccccccccc01'),
      checkout.create(rani.id, checkoutInput(rani), 'checkout-cccccccccccccc02'),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      details: { productId, available: 0, requested: 1 },
    });

    expect(await stockOf(productId)).toBe(0);
    expect(await count('tbl_pesanan')).toBe(1);
  });

  it('serialises checkouts that lock two shared products in opposite cart order', async () => {
    const first = await insertProduct({ slug: 'pertama', name: 'Pertama', stock: 5 });
    const second = await insertProduct({ slug: 'kedua', name: 'Kedua', stock: 5 });

    await cart.add({ userId: sari.id }, { productId: first, color: 'Rotan natural', size: 'Standar' });
    await cart.add({ userId: sari.id }, { productId: second, color: 'Cokelat', size: 'Standar' });

    await cart.add({ userId: rani.id }, { productId: second, color: 'Cokelat', size: 'Standar' });
    await cart.add({ userId: rani.id }, { productId: first, color: 'Rotan natural', size: 'Standar' });

    const results = await Promise.allSettled([
      checkout.create(sari.id, checkoutInput(sari), 'checkout-cccccccccccccc03'),
      checkout.create(rani.id, checkoutInput(rani), 'checkout-cccccccccccccc04'),
    ]);

    // Both succeed: the product rows are always locked in id order, so the
    // second request queues instead of deadlocking on the first's lock.
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await stockOf(first)).toBe(3);
    expect(await stockOf(second)).toBe(3);
    expect(await count('tbl_pesanan')).toBe(2);
  });
});

describe('retry contention', () => {
  it('turns one request sent twice into one order and one deduction', async () => {
    const productId = await insertProduct({ stock: 6 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });

    const results = await Promise.allSettled([
      checkout.create(sari.id, checkoutInput(sari), 'checkout-cccccccccccccc05'),
      checkout.create(sari.id, checkoutInput(sari), 'checkout-cccccccccccccc05'),
    ]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);

    const replays = results.map((result) => result.value.replayed).sort();
    expect(replays).toEqual([false, true]);

    const [one, two] = results.map((result) => result.value.order);
    expect(one.orderNumber).toBe(two.orderNumber);

    expect(await count('tbl_pesanan')).toBe(1);
    expect(await stockOf(productId)).toBe(4);
  });

  it('lets only one of two different keys consume the cart', async () => {
    const productId = await insertProduct({ stock: 5 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    const results = await Promise.allSettled([
      checkout.create(sari.id, checkoutInput(sari), 'checkout-cccccccccccccc06'),
      checkout.create(sari.id, checkoutInput(sari), 'checkout-cccccccccccccc07'),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ status: 400, code: 'CART_EMPTY' });

    expect(await count('tbl_pesanan')).toBe(1);
    expect(await stockOf(productId)).toBe(4);
  });
});

describe('concurrent cart writes', () => {
  it('makes a delete wait for a checkout that holds the cart', async () => {
    const productId = await insertProduct({ stock: 6 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });
    const line = (await cart.read({ userId: sari.id })).items[0];

    await openGate();
    const gate = await holdGate();

    const attempt = checkout.create(sari.id, checkoutInput(sari), 'checkout-cccccccccccccc08');
    let removal;

    try {
      const [parked] = await blockedBackends('INSERT INTO tbl_pesanan');
      expect(parked).toBeDefined();

      removal = cart.remove({ userId: sari.id }, line.id).then(
        (snapshot) => ({ snapshot }),
        (error) => ({ error })
      );

      // The checkout holds the cart row, so the delete must queue rather than
      // empty the cart the checkout is in the middle of snapshotting.
      expect(await waitersOn(parked.pid)).not.toEqual([]);
    } finally {
      await gate.query('ROLLBACK');
      gate.release();
      await closeGate();
    }

    const [order, removed] = await Promise.all([attempt, removal]);

    expect(order.replayed).toBe(false);
    expect(order.order.items).toHaveLength(1);
    expect(removed.error).toBeUndefined();
    expect(removed.snapshot.items).toEqual([]);
    expect(await stockOf(productId)).toBe(5);
    expect(await count('tbl_pesanan')).toBe(1);
  });

  it('keeps an item added while a checkout is running', async () => {
    const bought = await insertProduct({ slug: 'dibeli', name: 'Dibeli', stock: 6 });
    const later = await insertProduct({ slug: 'nanti', name: 'Nanti', stock: 4 });
    await cart.add({ userId: sari.id }, { productId: bought, color: 'Rotan natural', size: 'Standar' });

    await openGate();
    const gate = await holdGate();

    const attempt = checkout.create(sari.id, checkoutInput(sari), 'checkout-cccccccccccccc09');
    let addition;

    try {
      const [parked] = await blockedBackends('INSERT INTO tbl_pesanan');
      expect(parked).toBeDefined();

      addition = cart.add({ userId: sari.id }, {
        productId: later,
        color: 'Cokelat',
        size: 'Standar',
      });

      expect(await waitersOn(parked.pid)).not.toEqual([]);
    } finally {
      await gate.query('ROLLBACK');
      gate.release();
      await closeGate();
    }

    const [order, snapshot] = await Promise.all([attempt, addition]);

    // The checkout emptied the cart it bought; the concurrent add ran after it
    // and survives, so the customer does not lose the item they just picked.
    expect(order.order.items.map((item) => item.productId)).toEqual([bought]);
    expect(snapshot.items.map((item) => item.productId)).toEqual([later]);
    expect(await stockOf(later)).toBe(4);
  });

  it('queues a guest merge behind the checkout for the same account', async () => {
    const bought = await insertProduct({ slug: 'dibeli', name: 'Dibeli', stock: 6 });
    const guestProduct = await insertProduct({ slug: 'tamu', name: 'Tamu', stock: 4 });
    await cart.add({ userId: sari.id }, { productId: bought, color: 'Rotan natural', size: 'Standar' });

    const guestTokenHash = hashGuestToken(createGuestToken());
    await cart.add({ guestTokenHash }, { productId: guestProduct, color: 'Cokelat', size: 'Standar' });

    await openGate();
    const gate = await holdGate();

    const attempt = checkout.create(sari.id, checkoutInput(sari), 'checkout-cccccccccccccc10');
    let merge;

    try {
      const [parked] = await blockedBackends('INSERT INTO tbl_pesanan');
      expect(parked).toBeDefined();

      merge = testPool
        .connect()
        .then(async (client) => {
          try {
            await client.query('BEGIN');
            const result = await mergeGuestCart(client, {
              userId: sari.id,
              guestTokenHash,
            });
            await client.query('COMMIT');
            return result;
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        });

      expect(await waitersOn(parked.pid)).not.toEqual([]);
    } finally {
      await gate.query('ROLLBACK');
      gate.release();
      await closeGate();
    }

    const [order, merged] = await Promise.all([attempt, merge]);

    // Serialised: the checkout bought what the cart held at that moment, and
    // the merge then landed in the now-empty account cart.
    expect(order.order.items.map((item) => item.productId)).toEqual([bought]);
    expect(merged.consumed).toBe(true);
    expect(merged.merged).toBe(true);

    const accountCart = await cart.read({ userId: sari.id });
    expect(accountCart.items.map((item) => item.productId)).toEqual([guestProduct]);
    expect(await stockOf(bought)).toBe(5);
    expect(await stockOf(guestProduct)).toBe(4);
  });
});
