import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { createCartStore } from '../db/cart.js';
import { mergeGuestCart } from '../db/cart-merge.js';
import { registerUser } from '../services/auth.js';
import { createGuestToken, hashGuestToken } from '../lib/guestCart.js';
import { createWithTransaction } from '../config/db.js';

/**
 * Guest-to-account cart merge.
 *
 * The policy the reviewer chose is "keep what stock allows, and report the
 * rest". These tests pin that policy: the account's own lines are kept first,
 * the guest's lines are layered on top in the order they were added, and every
 * reduction comes back as an adjustment the client can show.
 */

const store = createCartStore(testPool);
const withTransaction = createWithTransaction(testPool);

let sari;
let categoryId;

function guestOwner() {
  return { guestTokenHash: hashGuestToken(createGuestToken()) };
}

async function insertProduct(overrides = {}) {
  const item = {
    slug: 'kursi-rotan',
    name: 'Kursi Rotan',
    price: 1_500_000,
    stock: 6,
    colors: ['Rotan natural', 'Cokelat'],
    sizes: ['Standar'],
    isActive: true,
    ...overrides,
  };

  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, price, rating, review_count, stock, material,
            dimensions, description, colors, sizes, images, is_new, is_trending, is_active
          )
          VALUES ($1, $2, $3, $4, 4.5, 12, $5, 'Rotan', '50 × 55 × 80 cm',
                  'Kursi rotan untuk ruang tamu.', $6, $7,
                  ARRAY['/images/products/product3.jpg'], false, true, $8)
       RETURNING id`,
    [item.slug, item.name, categoryId, item.price, item.stock, item.colors, item.sizes, item.isActive]
  );

  return rows[0].id;
}

function merge(guestTokenHash) {
  return withTransaction((client) => mergeGuestCart(client, { userId: sari.id, guestTokenHash }));
}

/**
 * Inserts a guest cart with lines directly.
 *
 * Some states must be seeded rather than reached through `store.add`: a cart
 * built when stock was higher, or two variants that between them now exceed it.
 * `created_at` is staggered so the "oldest first" rule has something to order.
 */
async function seedCart(guestTokenHash, lines) {
  const { rows } = await testPool.query(
    `INSERT INTO tbl_keranjang (guest_token) VALUES ($1) RETURNING id`,
    [guestTokenHash]
  );

  for (const [index, line] of lines.entries()) {
    await testPool.query(
      `INSERT INTO tbl_item_keranjang (cart_id, product_id, quantity, color, size, created_at)
            VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' seconds')::interval)`,
      [rows[0].id, line.productId, line.quantity, line.color, line.size, String(index)]
    );
  }

  return rows[0].id;
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
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('mergeGuestCart', () => {
  it('does nothing when the visitor never had a cart', async () => {
    const result = await merge(hashGuestToken(createGuestToken()));

    expect(result).toEqual({ consumed: false, merged: false, adjustments: [] });
  });

  it('consumes an empty guest cart without claiming it merged anything', async () => {
    const guest = guestOwner();
    // A cart row exists but holds no items, e.g. the customer emptied it.
    await testPool.query('INSERT INTO tbl_keranjang (guest_token) VALUES ($1)', [
      guest.guestTokenHash,
    ]);

    const result = await merge(guest.guestTokenHash);

    expect(result).toMatchObject({ consumed: true, merged: false });
    expect((await store.read({ userId: sari.id })).items).toEqual([]);
  });

  it('moves the guest lines into the account cart', async () => {
    const productId = await insertProduct();
    const guest = guestOwner();
    await store.add(guest, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });

    const result = await merge(guest.guestTokenHash);

    expect(result).toMatchObject({ consumed: true, merged: true, adjustments: [] });

    const snapshot = await store.read({ userId: sari.id });
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({ productId, quantity: 2 });
  });

  it('empties the guest cart, so it cannot be merged twice', async () => {
    const productId = await insertProduct();
    const guest = guestOwner();
    await store.add(guest, { productId, color: 'Rotan natural', size: 'Standar' });

    await merge(guest.guestTokenHash);

    expect((await store.read(guest)).items).toEqual([]);
  });

  it('reports an already-consumed cart instead of merging it again', async () => {
    const productId = await insertProduct();
    const guest = guestOwner();
    await store.add(guest, { productId, color: 'Rotan natural', size: 'Standar' });
    await merge(guest.guestTokenHash);

    const again = await merge(guest.guestTokenHash);

    expect(again).toMatchObject({ consumed: false, merged: false });
    expect((await store.read({ userId: sari.id })).items[0].quantity).toBe(1);
  });

  it('combines the same variant and adds up the quantities', async () => {
    const productId = await insertProduct({ stock: 10 });
    await store.add({ userId: sari.id }, { productId, color: 'Cokelat', size: 'Standar', quantity: 2 });

    const guest = guestOwner();
    await store.add(guest, { productId, color: 'Cokelat', size: 'Standar', quantity: 3 });

    const result = await merge(guest.guestTokenHash);

    expect(result.adjustments).toEqual([]);
    const snapshot = await store.read({ userId: sari.id });
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].quantity).toBe(5);
  });

  it('keeps a different variant as its own line', async () => {
    const productId = await insertProduct({ stock: 10 });
    await store.add({ userId: sari.id }, { productId, color: 'Cokelat', size: 'Standar' });

    const guest = guestOwner();
    await store.add(guest, { productId, color: 'Rotan natural', size: 'Standar' });

    await merge(guest.guestTokenHash);

    const snapshot = await store.read({ userId: sari.id });
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items.map((item) => item.color).sort()).toEqual(['Cokelat', 'Rotan natural']);
  });

  it('keeps what stock allows and reports the rest', async () => {
    // The reviewer's example: two in the account, two in the guest cart, three
    // in stock. The account keeps its two and the guest gets the last one.
    const productId = await insertProduct({ stock: 3 });
    await store.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });

    const guest = guestOwner();
    await store.add(guest, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });

    const result = await merge(guest.guestTokenHash);

    expect(result.adjustments).toEqual([
      {
        productId,
        color: 'Rotan natural',
        size: 'Standar',
        requestedQuantity: 2,
        quantity: 1,
        code: 'INSUFFICIENT_STOCK',
        message: 'Stok tersisa 3 unit. Jumlah disesuaikan menjadi 1.',
      },
    ]);

    const snapshot = await store.read({ userId: sari.id });
    expect(snapshot.items[0].quantity).toBe(3);
    expect(snapshot.canCheckout).toBe(true);
  });

  it('allocates the shared stock across variants in the order they were added', async () => {
    const productId = await insertProduct({ stock: 3 });

    // Seeded directly: a stock check at add time would have refused the second
    // variant, but both lines can already exist because stock can fall later.
    const guest = guestOwner();
    const guestCartId = await seedCart(guest.guestTokenHash, [
      { productId, quantity: 2, color: 'Rotan natural', size: 'Standar' },
      { productId, quantity: 2, color: 'Cokelat', size: 'Standar' },
    ]);
    expect(guestCartId).toBeGreaterThan(0);

    await merge(guest.guestTokenHash);

    const snapshot = await store.read({ userId: sari.id });
    const natural = snapshot.items.find((item) => item.color === 'Rotan natural');
    const brown = snapshot.items.find((item) => item.color === 'Cokelat');

    expect(natural.quantity).toBe(2);
    expect(brown.quantity).toBe(1);
    expect(snapshot.count).toBe(3);
  });

  it('drops a guest line the stock cannot cover at all', async () => {
    const productId = await insertProduct({ stock: 1 });
    await store.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    const guest = guestOwner();
    await seedCart(guest.guestTokenHash, [
      { productId, quantity: 2, color: 'Cokelat', size: 'Standar' },
    ]);

    const result = await merge(guest.guestTokenHash);

    expect(result.adjustments).toEqual([
      {
        productId,
        color: 'Cokelat',
        size: 'Standar',
        requestedQuantity: 2,
        quantity: 0,
        code: 'INSUFFICIENT_STOCK',
        message: 'Stok tidak mencukupi. Barang ini tidak bisa digabungkan.',
      },
    ]);

    const snapshot = await store.read({ userId: sari.id });
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].color).toBe('Rotan natural');
  });

  it('reports a guest line whose product is no longer sold', async () => {
    const productId = await insertProduct();
    const guest = guestOwner();
    await store.add(guest, { productId, color: 'Rotan natural', size: 'Standar' });

    await testPool.query('UPDATE tbl_produk SET is_active = false WHERE id = $1', [productId]);

    const result = await merge(guest.guestTokenHash);

    expect(result.adjustments).toEqual([
      {
        productId,
        color: 'Rotan natural',
        size: 'Standar',
        requestedQuantity: 1,
        quantity: 0,
        code: 'PRODUCT_UNAVAILABLE',
        message: 'Produk ini sedang tidak dijual, jadi tidak ikut digabungkan.',
      },
    ]);
    expect((await store.read({ userId: sari.id })).items).toEqual([]);
  });

  it('reports a guest line whose variant the catalogue no longer offers', async () => {
    const productId = await insertProduct();
    const guest = guestOwner();
    await store.add(guest, { productId, color: 'Cokelat', size: 'Standar' });

    await testPool.query(`UPDATE tbl_produk SET colors = ARRAY['Rotan natural'] WHERE id = $1`, [
      productId,
    ]);

    const result = await merge(guest.guestTokenHash);

    expect(result.adjustments[0]).toMatchObject({
      code: 'INVALID_VARIANT',
      quantity: 0,
      requestedQuantity: 1,
    });
  });

  it('trims a stale account line to the stock and reports it, leaving no room for the guest', async () => {
    // The agreement is "the account keeps what stock allows, guest lines get
    // the remainder". Two chairs worth of stock already spoken for by the
    // account's own line means the guest line cannot be merged, and both
    // reductions are reported rather than silent.
    const productId = await insertProduct({ stock: 3 });
    await store.add({ userId: sari.id }, {
      productId,
      color: 'Rotan natural',
      size: 'Standar',
      quantity: 2,
    });

    const { rows } = await testPool.query('SELECT id FROM tbl_keranjang WHERE user_id = $1', [
      sari.id,
    ]);
    // Pretend the line was saved when five were available.
    await testPool.query('UPDATE tbl_item_keranjang SET quantity = 5 WHERE cart_id = $1', [
      rows[0].id,
    ]);

    const guest = guestOwner();
    await seedCart(guest.guestTokenHash, [
      { productId, quantity: 1, color: 'Cokelat', size: 'Standar' },
    ]);

    const result = await merge(guest.guestTokenHash);

    const snapshot = await store.read({ userId: sari.id });
    expect(snapshot.count).toBe(3);
    expect(snapshot.items.find((item) => item.color === 'Rotan natural').quantity).toBe(3);
    expect(snapshot.items.find((item) => item.color === 'Cokelat')).toBeUndefined();
    expect(result.adjustments).toEqual([
      expect.objectContaining({ color: 'Rotan natural', quantity: 3, requestedQuantity: 5 }),
      expect.objectContaining({ color: 'Cokelat', quantity: 0, requestedQuantity: 1 }),
    ]);
  });

  it('shares stock with the guest after trimming an account line that only partly fits', async () => {
    const productId = await insertProduct({ stock: 3 });
    await store.add({ userId: sari.id }, {
      productId,
      color: 'Rotan natural',
      size: 'Standar',
      quantity: 1,
    });

    const { rows } = await testPool.query('SELECT id FROM tbl_keranjang WHERE user_id = $1', [
      sari.id,
    ]);
    await testPool.query('UPDATE tbl_item_keranjang SET quantity = 2 WHERE cart_id = $1', [
      rows[0].id,
    ]);

    const guest = guestOwner();
    await seedCart(guest.guestTokenHash, [
      { productId, quantity: 4, color: 'Cokelat', size: 'Standar' },
    ]);

    await merge(guest.guestTokenHash);

    const snapshot = await store.read({ userId: sari.id });
    expect(snapshot.count).toBe(3);
    expect(snapshot.items.find((item) => item.color === 'Rotan natural').quantity).toBe(2);
    expect(snapshot.items.find((item) => item.color === 'Cokelat').quantity).toBe(1);
  });

  it('leaves the account cart alone when the guest cart is empty', async () => {
    const productId = await insertProduct();
    await store.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    const guest = guestOwner();
    await testPool.query('INSERT INTO tbl_keranjang (guest_token) VALUES ($1)', [
      guest.guestTokenHash,
    ]);

    const result = await merge(guest.guestTokenHash);

    expect(result.merged).toBe(false);
    expect((await store.read({ userId: sari.id })).items[0].quantity).toBe(1);
  });

  it('never merges another guest’s cart', async () => {
    const productId = await insertProduct();
    const mine = guestOwner();
    const theirs = guestOwner();
    await store.add(mine, { productId, color: 'Rotan natural', size: 'Standar' });
    await store.add(theirs, { productId, color: 'Cokelat', size: 'Standar' });

    await merge(mine.guestTokenHash);

    expect((await store.read({ userId: sari.id })).items).toHaveLength(1);
    expect((await store.read(theirs)).items).toHaveLength(1);
  });

  it('marks the guest cart as spend, so a racing write is refused', async () => {
    const productId = await insertProduct();
    const guest = guestOwner();
    await store.add(guest, { productId, color: 'Rotan natural', size: 'Standar' });

    await merge(guest.guestTokenHash);

    // A request that started before the merge finished must not bring the cart
    // back to life under the spent token.
    await expect(
      store.add(guest, { productId, color: 'Cokelat', size: 'Standar' })
    ).rejects.toMatchObject({ status: 409, code: 'CART_MERGED' });
  });

  it('rolls back everything when the merge fails mid-way', async () => {
    const productId = await insertProduct();
    const guest = guestOwner();
    await store.add(guest, { productId, color: 'Rotan natural', size: 'Standar' });

    // A zero-user id violates the owner CHECK constraint inside the merge's own
    // insert; the guest row and its items must survive untouched.
    await expect(
      withTransaction((client) => mergeGuestCart(client, { userId: 0, guestTokenHash: guest.guestTokenHash }))
    ).rejects.toBeTruthy();

    expect((await store.read(guest)).items).toHaveLength(1);
  });
});
