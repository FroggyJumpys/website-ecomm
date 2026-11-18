import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { createCartStore } from '../db/cart.js';
import { registerUser } from '../services/auth.js';
import { createGuestToken, hashGuestToken } from '../lib/guestCart.js';

/**
 * Cart storage rules, exercised without HTTP.
 *
 * The cart has two kinds of owner — an account and an anonymous guest token —
 * and three rules that are easy to get subtly wrong, so each gets its own test:
 * stock is per product across all variants, the same variant merges while a
 * different one is a new line, and one owner can never see another's cart.
 */

const store = createCartStore(testPool);

let sari;
let rani;
let guestA;
let guestB;
let categoryId;

function guestOwner() {
  return { guestTokenHash: hashGuestToken(createGuestToken()) };
}

function product(overrides = {}) {
  return {
    slug: 'kursi-rotan',
    name: 'Kursi Rotan',
    price: 1_500_000,
    stock: 6,
    colors: ['Rotan natural', 'Cokelat'],
    sizes: ['Standar'],
    images: ['/images/products/product3.jpg'],
    isActive: true,
    ...overrides,
  };
}

async function insertProduct(overrides = {}) {
  const item = product(overrides);
  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, price, rating, review_count, stock, material,
            dimensions, description, colors, sizes, images, is_new, is_trending, is_active
          )
          VALUES ($1, $2, $3, $4, 4.5, 12, $5, 'Rotan', '50 × 55 × 80 cm',
                  'Kursi rotan untuk ruang tamu.', $6, $7, $8, false, true, $9)
       RETURNING id`,
    [
      item.slug,
      item.name,
      categoryId,
      item.price,
      item.stock,
      item.colors,
      item.sizes,
      item.images,
      item.isActive,
    ]
  );

  return rows[0].id;
}

async function countCarts() {
  const { rows } = await testPool.query('SELECT count(*)::int AS count FROM tbl_keranjang');
  return rows[0].count;
}

/**
 * Which backends are waiting on `holderPid` right now.
 *
 * Polled rather than slept on: the second connection has to travel through the
 * pool and reach the lock, and a fixed sleep would either be flaky or slow.
 * An empty result after the attempt budget means the statement never queued —
 * which is the failure mode an unlocked delete produces.
 */
async function waitersOn(holderPid, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { rows } = await testPool.query(
      `SELECT pid FROM pg_stat_activity WHERE $1 = ANY (pg_blocking_pids(pid))`,
      [holderPid]
    );

    if (rows.length > 0) return rows.map((row) => row.pid);

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return [];
}

/** Opens a transaction that holds the owner's cart row and reports its pid. */
async function lockCartRow(owner) {
  const client = await testPool.connect();
  await client.query('BEGIN');

  const { rows } = await client.query(
    `SELECT id FROM tbl_keranjang WHERE guest_token = $1 FOR UPDATE`,
    [owner.guestTokenHash]
  );

  if (rows.length === 0) throw new Error('the test expected the owner to have a cart row');

  const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;

  return { client, cartId: rows[0].id, pid };
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
  rani = await registerUser(testPool, {
    name: 'Rani BaDekor',
    email: 'rani@badekor.id',
    phone: '081100000000',
    password: 'rahasia123',
  });

  guestA = guestOwner();
  guestB = guestOwner();
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('read', () => {
  it('returns an empty snapshot for a guest who saved nothing', async () => {
    expect(await store.read(guestA)).toEqual({
      items: [],
      count: 0,
      subtotal: 0,
      canCheckout: false,
    });
  });

  it('does not create a cart row just because a guest read the cart', async () => {
    // Every page load reads the cart; creating a row for every visitor would
    // fill the table with carts that were never used.
    await store.read(guestA);
    expect(await countCarts()).toBe(0);
  });

  it('returns an empty snapshot for an account with no cart', async () => {
    const snapshot = await store.read({ userId: sari.id });

    expect(snapshot).toEqual({ items: [], count: 0, subtotal: 0, canCheckout: false });
    expect(await countCarts()).toBe(0);
  });

  it('returns one line with everything the cart page renders', async () => {
    const productId = await insertProduct();
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });

    const [item] = (await store.read(guestA)).items;

    expect(item).toMatchObject({
      productId,
      key: `${productId}::Rotan natural::Standar`,
      slug: 'kursi-rotan',
      name: 'Kursi Rotan',
      image: '/images/products/product3.jpg',
      price: 1_500_000,
      stock: 6,
      color: 'Rotan natural',
      size: 'Standar',
      quantity: 2,
      lineTotal: 3_000_000,
      isAvailable: true,
      issues: [],
    });
    expect(item.id).toBeGreaterThan(0);
  });

  it('keeps insertion order, so changing a quantity does not reorder the cart', async () => {
    const first = await insertProduct({ slug: 'pertama', name: 'Pertama' });
    const second = await insertProduct({ slug: 'kedua', name: 'Kedua' });

    await store.add(guestA, { productId: first, color: 'Rotan natural', size: 'Standar' });
    await store.add(guestA, { productId: second, color: 'Rotan natural', size: 'Standar' });

    const before = (await store.read(guestA)).items.map((item) => item.productId);
    expect(before).toEqual([first, second]);

    const line = (await store.read(guestA)).items[0];
    await store.updateQuantity(guestA, line.id, 3);

    const after = (await store.read(guestA)).items.map((item) => item.productId);
    expect(after).toEqual([first, second]);
  });

  it('shows current catalogue data, not a snapshot from add time', async () => {
    const productId = await insertProduct({ price: 1_500_000, stock: 6 });
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar' });

    await testPool.query('UPDATE tbl_produk SET price = 1_750_000, stock = 2 WHERE id = $1', [
      productId,
    ]);

    const [item] = (await store.read(guestA)).items;
    expect(item).toMatchObject({ price: 1_750_000, stock: 2, lineTotal: 1_750_000 });
  });

  it('totals the quantity and the money', async () => {
    const first = await insertProduct({ slug: 'pertama', price: 1_000_000 });
    const second = await insertProduct({ slug: 'kedua', price: 250_000 });

    await store.add(guestA, {
      productId: first,
      color: 'Rotan natural',
      size: 'Standar',
      quantity: 2,
    });
    await store.add(guestA, {
      productId: second,
      color: 'Cokelat',
      size: 'Standar',
      quantity: 3,
    });

    const snapshot = await store.read(guestA);
    expect(snapshot.count).toBe(5);
    expect(snapshot.subtotal).toBe(2_750_000);
    expect(snapshot.canCheckout).toBe(true);
  });

  it('keeps a deactivated product in the cart but blocks checkout', async () => {
    const productId = await insertProduct();
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar' });

    await testPool.query('UPDATE tbl_produk SET is_active = false WHERE id = $1', [productId]);

    const snapshot = await store.read(guestA);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].isAvailable).toBe(false);
    expect(snapshot.items[0].issues).toEqual([
      { code: 'PRODUCT_UNAVAILABLE', message: 'Produk ini sedang tidak dijual.' },
    ]);
    expect(snapshot.canCheckout).toBe(false);
  });

  it('flags a variant the catalogue no longer offers', async () => {
    const productId = await insertProduct();
    await store.add(guestA, { productId, color: 'Cokelat', size: 'Standar' });

    await testPool.query(`UPDATE tbl_produk SET colors = ARRAY['Rotan natural'] WHERE id = $1`, [
      productId,
    ]);

    const [item] = (await store.read(guestA)).items;
    expect(item.issues.map((issue) => issue.code)).toEqual(['INVALID_VARIANT']);
  });

  it('flags a line whose quantity now exceeds the stock', async () => {
    const productId = await insertProduct({ stock: 6 });
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar', quantity: 4 });

    await testPool.query('UPDATE tbl_produk SET stock = 2 WHERE id = $1', [productId]);

    const [item] = (await store.read(guestA)).items;
    expect(item.issues).toEqual([
      { code: 'INSUFFICIENT_STOCK', message: 'Stok tersisa 2 unit.' },
    ]);
    expect((await store.read(guestA)).canCheckout).toBe(false);
  });

  it('refuses to report a total it cannot represent exactly', async () => {
    // Seeded directly: a line whose price x quantity exceeds 2^53 is not a
    // number a customer can be charged, and rounding it silently would be
    // worse than refusing to render the cart.
    const productId = await insertProduct({ price: Number.MAX_SAFE_INTEGER, stock: 2 });
    const { rows } = await testPool.query(
      `INSERT INTO tbl_keranjang (guest_token) VALUES ($1) RETURNING id`,
      [guestA.guestTokenHash]
    );
    await testPool.query(
      `INSERT INTO tbl_item_keranjang (cart_id, product_id, quantity, color, size)
            VALUES ($1, $2, 2, 'Rotan natural', 'Standar')`,
      [rows[0].id, productId]
    );

    await expect(store.read(guestA)).rejects.toMatchObject({
      status: 409,
      code: 'CART_TOTAL_TOO_LARGE',
    });
  });

  it('never shows one owner another owner’s cart', async () => {
    const productId = await insertProduct();
    await store.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    expect((await store.read({ userId: rani.id })).items).toEqual([]);
    expect((await store.read(guestA)).items).toEqual([]);
    expect((await store.read(guestB)).items).toEqual([]);
    expect((await store.read({ userId: sari.id })).items).toHaveLength(1);
  });
});

describe('add', () => {
  it('creates the cart on the first add', async () => {
    const productId = await insertProduct();

    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar' });

    expect(await countCarts()).toBe(1);
  });

  it('increments the quantity when the same variant is added again', async () => {
    const productId = await insertProduct();

    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });
    const snapshot = await store.add(guestA, {
      productId,
      color: 'Rotan natural',
      size: 'Standar',
      quantity: 1,
    });

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].quantity).toBe(3);
  });

  it('creates a second line for a different colour', async () => {
    const productId = await insertProduct();

    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar' });
    const snapshot = await store.add(guestA, { productId, color: 'Cokelat', size: 'Standar' });

    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items.map((item) => item.color).sort()).toEqual(['Cokelat', 'Rotan natural']);
  });

  it('defaults the quantity to one', async () => {
    const productId = await insertProduct();
    const snapshot = await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar' });

    expect(snapshot.items[0].quantity).toBe(1);
  });

  it('rejects a product that does not exist', async () => {
    await expect(
      store.add(guestA, { productId: 999_999, color: '', size: '' })
    ).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
  });

  it('rejects an inactive product', async () => {
    const productId = await insertProduct({ isActive: false });

    await expect(
      store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar' })
    ).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
  });

  it('rejects a colour the product does not offer', async () => {
    const productId = await insertProduct();

    await expect(
      store.add(guestA, { productId, color: 'Ungu', size: 'Standar' })
    ).rejects.toMatchObject({ status: 422, code: 'INVALID_VARIANT' });
  });

  it('rejects a size the product does not offer', async () => {
    const productId = await insertProduct();

    await expect(
      store.add(guestA, { productId, color: 'Cokelat', size: 'Jumbo' })
    ).rejects.toMatchObject({ status: 422, code: 'INVALID_VARIANT' });
  });

  it('rejects a choice when the product offers no options at all', async () => {
    const productId = await insertProduct({ colors: [], sizes: [] });

    await expect(
      store.add(guestA, { productId, color: 'Cokelat', size: '' })
    ).rejects.toMatchObject({ code: 'INVALID_VARIANT' });

    // The same product with no variant is fine.
    await expect(
      store.add(guestA, { productId, color: '', size: '' })
    ).resolves.toMatchObject({ count: 1 });
  });

  it('rejects an empty choice when the product asks the customer to pick one', async () => {
    const productId = await insertProduct();

    await expect(
      store.add(guestA, { productId, color: '', size: 'Standar' })
    ).rejects.toMatchObject({ code: 'INVALID_VARIANT' });
  });

  it('counts stock across every variant of the same product', async () => {
    // Three in stock, two natural chairs already saved: a second brown chair
    // would make four, so the request must fail even though neither variant
    // alone reaches the limit.
    const productId = await insertProduct({ stock: 3 });
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });

    await expect(
      store.add(guestA, { productId, color: 'Cokelat', size: 'Standar', quantity: 2 })
    ).rejects.toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      details: { available: 1, requested: 2 },
    });
  });

  it('allows a request that lands exactly on the stock', async () => {
    const productId = await insertProduct({ stock: 3 });
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });

    await expect(
      store.add(guestA, { productId, color: 'Cokelat', size: 'Standar', quantity: 1 })
    ).resolves.toMatchObject({ count: 3, canCheckout: true });
  });

  it('refuses a product with no stock, and says it is sold out', async () => {
    const productId = await insertProduct({ stock: 0 });

    const error = await store
      .add(guestA, { productId, color: 'Rotan natural', size: 'Standar' })
      .catch((caught) => caught);

    expect(error).toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK' });
    expect(error.message).toBe('Stok tidak mencukupi. Produk ini sedang habis.');
  });

  it('cannot exceed stock when two adds race', async () => {
    const productId = await insertProduct({ stock: 3 });

    // Both requests read the same "2 left" before either writes; only the cart
    // lock can decide this, and the loser must get a 409 rather than a cart
    // that quietly holds more than the workshop has.
    const results = await Promise.allSettled([
      store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 }),
      store.add(guestA, { productId, color: 'Cokelat', size: 'Standar', quantity: 2 }),
    ]);

    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    const snapshot = await store.read(guestA);
    expect(snapshot.count).toBe(2);
  });

  it('gives two guests separate carts', async () => {
    const productId = await insertProduct();

    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar' });
    await store.add(guestB, { productId, color: 'Cokelat', size: 'Standar' });

    expect((await store.read(guestA)).items[0].color).toBe('Rotan natural');
    expect((await store.read(guestB)).items[0].color).toBe('Cokelat');
    expect(await countCarts()).toBe(2);
  });
});

describe('updateQuantity', () => {
  it('sets an absolute quantity', async () => {
    const productId = await insertProduct({ stock: 6 });
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });
    const line = (await store.read(guestA)).items[0];

    const snapshot = await store.updateQuantity(guestA, line.id, 5);

    expect(snapshot.items[0].quantity).toBe(5);
    expect(snapshot.count).toBe(5);
  });

  it('rejects a quantity above the stock and leaves the line untouched', async () => {
    const productId = await insertProduct({ stock: 3 });
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });
    const line = (await store.read(guestA)).items[0];

    await expect(store.updateQuantity(guestA, line.id, 4)).rejects.toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
    });
    expect((await store.read(guestA)).items[0].quantity).toBe(2);
  });

  it('lets a customer reduce a line the catalogue shrank below', async () => {
    const productId = await insertProduct({ stock: 6 });
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar', quantity: 5 });
    await testPool.query('UPDATE tbl_produk SET stock = 2 WHERE id = $1', [productId]);

    const line = (await store.read(guestA)).items[0];
    const snapshot = await store.updateQuantity(guestA, line.id, 2);

    expect(snapshot.items[0].quantity).toBe(2);
    expect(snapshot.canCheckout).toBe(true);
  });

  it('counts the other variants when checking stock', async () => {
    const productId = await insertProduct({ stock: 3 });
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });
    await store.add(guestA, { productId, color: 'Cokelat', size: 'Standar', quantity: 1 });

    const brown = (await store.read(guestA)).items.find((item) => item.color === 'Cokelat');

    await expect(store.updateQuantity(guestA, brown.id, 2)).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
    });
  });

  it('rejects a line that belongs to someone else', async () => {
    const productId = await insertProduct();
    await store.add({ userId: rani.id }, { productId, color: 'Rotan natural', size: 'Standar' });
    const theirs = (await store.read({ userId: rani.id })).items[0];

    await expect(
      store.updateQuantity({ userId: sari.id }, theirs.id, 1)
    ).rejects.toMatchObject({ status: 404, code: 'CART_ITEM_NOT_FOUND' });

    expect((await store.read({ userId: rani.id })).items[0].quantity).toBe(1);
  });

  it('rejects a line that does not exist', async () => {
    await expect(store.updateQuantity(guestA, 999_999, 1)).rejects.toMatchObject({
      status: 404,
      code: 'CART_ITEM_NOT_FOUND',
    });
  });
});

describe('remove', () => {
  it('removes the line and returns the remaining cart', async () => {
    const productId = await insertProduct();
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar' });
    await store.add(guestA, { productId, color: 'Cokelat', size: 'Standar' });
    const natural = (await store.read(guestA)).items.find(
      (item) => item.color === 'Rotan natural'
    );

    const snapshot = await store.remove(guestA, natural.id);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].color).toBe('Cokelat');
  });

  it('succeeds when the line was already gone', async () => {
    await expect(store.remove(guestA, 999_999)).resolves.toMatchObject({ items: [] });
  });

  it('succeeds for a guest who never had a cart', async () => {
    await expect(store.remove(guestA, 1)).resolves.toMatchObject({ items: [] });
    expect(await countCarts()).toBe(0);
  });

  it('cannot remove another owner’s line', async () => {
    const productId = await insertProduct();
    await store.add({ userId: rani.id }, { productId, color: 'Rotan natural', size: 'Standar' });
    const theirs = (await store.read({ userId: rani.id })).items[0];

    await store.remove({ userId: sari.id }, theirs.id);
    await store.remove(guestA, theirs.id);

    expect((await store.read({ userId: rani.id })).items).toHaveLength(1);
  });

  it('queues behind a transaction holding the cart row', async () => {
    // Checkout holds the cart row while it snapshots the lines. A delete that
    // skipped the lock would empty the cart underneath that snapshot.
    const productId = await insertProduct();
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar' });
    const line = (await store.read(guestA)).items[0];

    const holder = await lockCartRow(guestA);
    const attempt = store.remove(guestA, line.id).then(
      (snapshot) => ({ snapshot }),
      (error) => ({ error })
    );

    try {
      expect(await waitersOn(holder.pid)).not.toEqual([]);

      const { rows } = await testPool.query(
        'SELECT count(*)::int AS count FROM tbl_item_keranjang WHERE id = $1',
        [line.id]
      );
      expect(rows[0].count).toBe(1);
    } finally {
      await holder.client.query('ROLLBACK');
      holder.client.release();
    }

    const result = await attempt;
    expect(result.error).toBeUndefined();
    expect(result.snapshot.items).toEqual([]);
  });
});

describe('clear', () => {
  it('empties the cart', async () => {
    const productId = await insertProduct();
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar' });
    await store.add(guestA, { productId, color: 'Cokelat', size: 'Standar' });

    const snapshot = await store.clear(guestA);

    expect(snapshot).toEqual({ items: [], count: 0, subtotal: 0, canCheckout: false });
    expect((await store.read(guestA)).items).toEqual([]);
  });

  it('succeeds on an empty or missing cart', async () => {
    await expect(store.clear(guestA)).resolves.toMatchObject({ items: [] });
    expect(await countCarts()).toBe(0);
  });

  it('cannot empty another owner’s cart', async () => {
    const productId = await insertProduct();
    await store.add({ userId: rani.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    await store.clear({ userId: sari.id });
    await store.clear(guestA);

    expect((await store.read({ userId: rani.id })).items).toHaveLength(1);
  });

  it('queues behind a transaction holding the cart row', async () => {
    const productId = await insertProduct();
    await store.add(guestA, { productId, color: 'Rotan natural', size: 'Standar' });

    const holder = await lockCartRow(guestA);
    const attempt = store.clear(guestA).then(
      (snapshot) => ({ snapshot }),
      (error) => ({ error })
    );

    try {
      expect(await waitersOn(holder.pid)).not.toEqual([]);

      const { rows } = await testPool.query(
        'SELECT count(*)::int AS count FROM tbl_item_keranjang WHERE cart_id = $1',
        [holder.cartId]
      );
      expect(rows[0].count).toBe(1);
    } finally {
      await holder.client.query('ROLLBACK');
      holder.client.release();
    }

    const result = await attempt;
    expect(result.error).toBeUndefined();
    expect(result.snapshot.items).toEqual([]);
  });
});
