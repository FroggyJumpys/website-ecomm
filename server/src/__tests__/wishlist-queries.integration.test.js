import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { createWishlistStore } from '../db/wishlist.js';
import { registerUser } from '../services/auth.js';

/**
 * Wishlist storage rules, exercised without HTTP. Fixtures are inserted
 * directly so each assertion pins one thing: ownership, order, idempotency,
 * what a saved row contains, and what happens when a product is hidden.
 */

const store = createWishlistStore(testPool);

let sari;
let rani;

function product(overrides = {}) {
  return {
    slug: 'kursi-rotan',
    name: 'Kursi Rotan',
    price: 1_500_000,
    compareAtPrice: null,
    rating: 4.5,
    reviewCount: 12,
    stock: 4,
    material: 'Rotan',
    dimensions: '50 × 55 × 80 cm',
    description: 'Kursi rotan untuk ruang tamu.',
    colors: ['Rotan natural', 'Cokelat'],
    sizes: ['Standar'],
    images: ['/images/products/product3.jpg'],
    isNew: false,
    isTrending: true,
    isActive: true,
    ...overrides,
  };
}

let categoryId;

async function insertProduct(overrides = {}) {
  const item = product(overrides);
  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, price, compare_at_price, rating, review_count,
            stock, material, dimensions, description, colors, sizes, images,
            is_new, is_trending, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id`,
    [
      item.slug,
      item.name,
      categoryId,
      item.price,
      item.compareAtPrice,
      item.rating,
      item.reviewCount,
      item.stock,
      item.material,
      item.dimensions,
      item.description,
      item.colors,
      item.sizes,
      item.images,
      item.isNew,
      item.isTrending,
      item.isActive,
    ]
  );

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

describe('list', () => {
  it('returns an empty list for an account that saved nothing', async () => {
    expect(await store.list(sari.id)).toEqual([]);
  });

  it('returns the saved product with the fields the page needs', async () => {
    const id = await insertProduct();
    await store.save(sari.id, id);

    const [item] = await store.list(sari.id);

    expect(item).toMatchObject({
      id,
      slug: 'kursi-rotan',
      name: 'Kursi Rotan',
      price: 1_500_000,
      image: '/images/products/product3.jpg',
      material: 'Rotan',
      dimensions: '50 × 55 × 80 cm',
      category: { slug: 'kursi', name: 'Kursi' },
      brand: null,
    });
    // The row needs the variants to move a product into the cart.
    expect(item.colors).toEqual(['Rotan natural', 'Cokelat']);
    expect(item.sizes).toEqual(['Standar']);
  });

  it('lists the most recently saved first', async () => {
    const first = await insertProduct({ slug: 'pertama', name: 'Pertama' });
    const second = await insertProduct({ slug: 'kedua', name: 'Kedua' });
    const third = await insertProduct({ slug: 'ketiga', name: 'Ketiga' });

    await store.save(sari.id, first);
    await store.save(sari.id, second);
    await store.save(sari.id, third);

    const items = await store.list(sari.id);
    expect(items.map((item) => item.id)).toEqual([third, second, first]);
  });

  it('keeps the original position when a product is saved again', async () => {
    const first = await insertProduct({ slug: 'pertama', name: 'Pertama' });
    const second = await insertProduct({ slug: 'kedua', name: 'Kedua' });

    await store.save(sari.id, first);
    await store.save(sari.id, second);
    await store.save(sari.id, first);

    const items = await store.list(sari.id);
    expect(items.map((item) => item.id)).toEqual([second, first]);
  });

  it('shows current catalogue data, not a snapshot from save time', async () => {
    const id = await insertProduct({ price: 1_000_000 });
    await store.save(sari.id, id);

    await testPool.query('UPDATE tbl_produk SET price = 1_250_000, stock = 0 WHERE id = $1', [id]);

    const [item] = await store.list(sari.id);
    expect(item).toMatchObject({ price: 1_250_000, stock: 0 });
  });

  it('hides a product that the admin deactivated, keeping the saved row', async () => {
    const visible = await insertProduct({ slug: 'terlihat', name: 'Terlihat' });
    const hidden = await insertProduct({ slug: 'disembunyikan', name: 'Disembunyikan' });

    await store.save(sari.id, visible);
    await store.save(sari.id, hidden);
    await testPool.query('UPDATE tbl_produk SET is_active = false WHERE id = $1', [hidden]);

    const items = await store.list(sari.id);
    expect(items.map((item) => item.id)).toEqual([visible]);

    // Reactivating brings it back: the relationship was never destroyed.
    await testPool.query('UPDATE tbl_produk SET is_active = true WHERE id = $1', [hidden]);
    expect((await store.list(sari.id)).map((item) => item.id)).toEqual([hidden, visible]);
  });

  it('never shows another customer’s saves', async () => {
    const id = await insertProduct();
    await store.save(rani.id, id);

    expect(await store.list(sari.id)).toEqual([]);
    expect(await store.list(rani.id)).toHaveLength(1);
  });
});

describe('save', () => {
  it('stores the relationship and reports the product', async () => {
    const id = await insertProduct();

    const saved = await store.save(sari.id, id);
    expect(saved).toMatchObject({ id, name: 'Kursi Rotan' });

    const { rows } = await testPool.query(
      'SELECT count(*)::int AS count FROM tbl_favorit WHERE user_id = $1',
      [sari.id]
    );
    expect(rows[0].count).toBe(1);
  });

  it('is idempotent: saving twice leaves one row', async () => {
    const id = await insertProduct();

    await store.save(sari.id, id);
    await store.save(sari.id, id);

    const { rows } = await testPool.query(
      'SELECT count(*)::int AS count FROM tbl_favorit WHERE user_id = $1 AND product_id = $2',
      [sari.id, id]
    );
    expect(rows[0].count).toBe(1);
  });

  it('survives two concurrent saves of the same product', async () => {
    const id = await insertProduct();

    // Both requests pass any application-level check at the same time; only the
    // unique constraint can decide this, and the insert must not surface a 23505.
    const results = await Promise.allSettled([
      store.save(sari.id, id),
      store.save(sari.id, id),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);

    const { rows } = await testPool.query(
      'SELECT count(*)::int AS count FROM tbl_favorit WHERE user_id = $1 AND product_id = $2',
      [sari.id, id]
    );
    expect(rows[0].count).toBe(1);
  });

  it('lets two customers save the same product', async () => {
    const id = await insertProduct();

    await store.save(sari.id, id);
    await store.save(rani.id, id);

    expect(await store.list(sari.id)).toHaveLength(1);
    expect(await store.list(rani.id)).toHaveLength(1);
  });

  it('rejects a product that does not exist', async () => {
    await expect(store.save(sari.id, 999_999)).rejects.toMatchObject({
      status: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  });

  it('rejects an inactive product', async () => {
    const id = await insertProduct({ isActive: false });

    await expect(store.save(sari.id, id)).rejects.toMatchObject({
      status: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  });

  it('allows saving an active product with no stock', async () => {
    const id = await insertProduct({ stock: 0 });

    await expect(store.save(sari.id, id)).resolves.toMatchObject({ id, stock: 0 });
  });

  it('moves a re-saved product back to the top after it was removed', async () => {
    const first = await insertProduct({ slug: 'pertama', name: 'Pertama' });
    const second = await insertProduct({ slug: 'kedua', name: 'Kedua' });

    await store.save(sari.id, first);
    await store.save(sari.id, second);
    await store.remove(sari.id, first);
    await store.save(sari.id, first);

    const items = await store.list(sari.id);
    expect(items.map((item) => item.id)).toEqual([first, second]);
  });
});

describe('remove', () => {
  it('removes the saved product and returns null', async () => {
    const id = await insertProduct();
    await store.save(sari.id, id);

    await expect(store.remove(sari.id, id)).resolves.toBeNull();
    expect(await store.list(sari.id)).toEqual([]);
  });

  it('succeeds when the product was never saved', async () => {
    const id = await insertProduct();

    await expect(store.remove(sari.id, id)).resolves.toBeNull();
  });

  it('succeeds for a product that no longer exists', async () => {
    await expect(store.remove(sari.id, 999_999)).resolves.toBeNull();
  });

  it('succeeds for a product the admin has hidden', async () => {
    const id = await insertProduct();
    await store.save(sari.id, id);
    await testPool.query('UPDATE tbl_produk SET is_active = false WHERE id = $1', [id]);

    await expect(store.remove(sari.id, id)).resolves.toBeNull();
  });

  it('cannot remove another customer’s saved product', async () => {
    const id = await insertProduct();
    await store.save(rani.id, id);

    // Reported as success — there is nothing of the caller's to delete — but the
    // other customer's row must survive.
    await expect(store.remove(sari.id, id)).resolves.toBeNull();
    expect(await store.list(rani.id)).toHaveLength(1);
  });
});
