import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { createAdminProductStore } from '../db/admin-products.js';
import { findProductBySlug } from '../db/catalog.js';
import { productPatchSchema, productCreateSchema } from '../validators/admin.js';

/**
 * Product writes.
 *
 * Two properties matter more than any single field: a save built from a form
 * read before a sale must be refused rather than restoring sold stock, and two
 * administrators creating products with the same name must not collide on the
 * unique slug. Both are exercised here against a real database, because both
 * are decided by PostgreSQL locks rather than by JavaScript.
 */

const store = createAdminProductStore(testPool);

let categoryIds;
let brandIds;

/** The shape `productCreateSchema` produces, so the store sees what it will get. */
function input(overrides = {}) {
  return productCreateSchema.parse({
    name: 'Kursi Rotan',
    slug: undefined,
    categorySlug: 'kursi',
    brandSlug: 'badekor-workshop',
    price: 1_500_000,
    compareAtPrice: null,
    stock: 6,
    material: 'Rotan',
    dimensions: '50 × 55 × 80 cm',
    description: 'Kursi rotan untuk ruang tamu.',
    colors: ['Rotan natural'],
    sizes: ['Standar'],
    images: ['/images/products/product3.jpg'],
    isNew: false,
    isTrending: false,
    isActive: true,
    ...overrides,
  });
}

async function seedTaxonomy() {
  categoryIds = new Map();
  brandIds = new Map();

  for (const [slug, name] of [
    ['kursi', 'Kursi'],
    ['meja', 'Meja'],
  ]) {
    const { rows } = await testPool.query(
      `INSERT INTO tbl_kategori (slug, name) VALUES ($1, $2) RETURNING id`,
      [slug, name]
    );
    categoryIds.set(slug, rows[0].id);
  }

  for (const [slug, name] of [
    ['badekor-workshop', 'BaDekor Workshop'],
    ['ulin-kalsel', 'Ulin Kalsel'],
  ]) {
    const { rows } = await testPool.query(
      'INSERT INTO tbl_merek (slug, name) VALUES ($1, $2) RETURNING id',
      [slug, name]
    );
    brandIds.set(slug, rows[0].id);
  }
}

async function countProducts() {
  const { rows } = await testPool.query('SELECT count(*)::int AS total FROM tbl_produk');
  return rows[0].total;
}

beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  await seedTaxonomy();
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('create', () => {
  it('stores a product with the create defaults and returns the admin shape', async () => {
    const created = await store.create(
      input({
        name: '  Kursi Rotan  ',
        stock: undefined,
        sizes: undefined,
        isNew: undefined,
      })
    );

    expect(created).toMatchObject({
      name: 'Kursi Rotan',
      slug: 'kursi-rotan',
      price: 1_500_000,
      compareAtPrice: null,
      rating: 0,
      reviewCount: 0,
      stock: 0,
      colors: ['Rotan natural'],
      sizes: [],
      images: ['/images/products/product3.jpg'],
      isNew: false,
      isTrending: false,
      isActive: true,
      version: 1,
    });
    expect(created.category).toEqual({
      id: categoryIds.get('kursi'),
      slug: 'kursi',
      name: 'Kursi',
    });
    expect(created.brand).toEqual({
      id: brandIds.get('badekor-workshop'),
      slug: 'badekor-workshop',
      name: 'BaDekor Workshop',
    });

    expect(await countProducts()).toBe(1);
  });

  it('accepts an explicit slug and derives one when it is omitted', async () => {
    const explicit = await store.create(input({ slug: 'kursi-pilihan', name: 'Nama Lain' }));
    expect(explicit.slug).toBe('kursi-pilihan');

    const derived = await store.create(input({ slug: undefined, name: 'Meja Lipat' }));
    expect(derived.slug).toBe('meja-lipat');
  });

  it('suffixes a slug that is already taken, and the caller takes the answer', async () => {
    const first = await store.create(input({ slug: undefined }));
    const second = await store.create(input({ slug: undefined }));
    const third = await store.create(input({ slug: undefined }));

    expect([first.slug, second.slug, third.slug]).toEqual([
      'kursi-rotan',
      'kursi-rotan-2',
      'kursi-rotan-3',
    ]);
  });

  it('refuses an explicit slug that is already taken', async () => {
    // A slug the operator typed is theirs; silently renaming it to `-2` would
    // hand back a URL they did not ask for.
    await store.create(input({ slug: 'kursi-pilihan' }));

    await expect(
      store.create(input({ slug: 'kursi-pilihan', name: 'Nama Lain' }))
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR', details: { field: 'slug' } });

    expect(await countProducts()).toBe(1);
  });

  it('refuses an unknown category or brand without writing a row', async () => {
    await expect(store.create(input({ categorySlug: 'tidak-ada' }))).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: { field: 'categorySlug', message: 'Pilih kategori yang terdaftar.' },
    });

    await expect(store.create(input({ brandSlug: 'tidak-ada' }))).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: { field: 'brandSlug', message: 'Pilih merek yang terdaftar.' },
    });

    expect(await countProducts()).toBe(0);
  });

  it('stores no brand when the brand is explicitly cleared', async () => {
    const created = await store.create(input({ brandSlug: null }));

    expect(created.brand).toBeNull();

    const { rows } = await testPool.query('SELECT brand_id FROM tbl_produk WHERE id = $1', [
      created.id,
    ]);
    expect(rows[0].brand_id).toBeNull();
  });

  it('serialises two concurrent creates onto distinct slugs', async () => {
    // Without the advisory lock both transactions would read the same slug set
    // and one would fail on the unique constraint instead of getting `-2`.
    const [first, second] = await Promise.all([
      store.create(input({ slug: undefined, name: 'Kursi Anyam' })),
      store.create(input({ slug: undefined, name: 'Kursi Anyam' })),
    ]);

    expect([first.slug, second.slug].sort()).toEqual(['kursi-anyam', 'kursi-anyam-2']);
    expect(await countProducts()).toBe(2);
  });
});

describe('update', () => {
  it('writes only the submitted columns and bumps the version', async () => {
    const created = await store.create(input());

    const updated = await store.update(
      created.id,
      { name: 'Kursi Rotan Besar', isTrending: true },
      1
    );

    expect(updated.name).toBe('Kursi Rotan Besar');
    expect(updated.isTrending).toBe(true);
    expect(updated.version).toBe(2);
    // Untouched by the patch, and therefore still whatever checkout left there.
    expect(updated.stock).toBe(6);
    expect(updated.slug).toBe(created.slug);
    expect(updated.material).toBe('Rotan');
  });

  it('refuses a save built from a stale version and changes nothing', async () => {
    const created = await store.create(input());
    await store.update(created.id, { name: 'Diubah Sekali' }, 1);

    await expect(store.update(created.id, { name: 'Diubah Dua Kali' }, 1)).rejects.toMatchObject({
      status: 409,
      code: 'PRODUCT_CONFLICT',
      message: 'Produk sudah diubah di tempat lain. Muat ulang lalu simpan kembali.',
    });

    const { rows } = await testPool.query('SELECT name, version FROM tbl_produk WHERE id = $1', [
      created.id,
    ]);
    expect(rows[0]).toMatchObject({ name: 'Diubah Sekali', version: 2 });
  });

  it('checks the compare-at price against the stored price', async () => {
    const created = await store.create(input({ price: 1_000_000 }));

    await expect(store.update(created.id, { compareAtPrice: 100 }, 1)).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: { field: 'compareAtPrice' },
    });

    const { rows } = await testPool.query(
      'SELECT price, compare_at_price FROM tbl_produk WHERE id = $1',
      [created.id]
    );
    expect(rows[0]).toMatchObject({ price: 1_000_000, compare_at_price: null });
  });

  it('re-resolves a new category and brand by slug, and clears one with null', async () => {
    const created = await store.create(input());

    const moved = await store.update(
      created.id,
      { categorySlug: 'meja', brandSlug: 'ulin-kalsel' },
      1
    );
    expect(moved.category.slug).toBe('meja');
    expect(moved.brand.slug).toBe('ulin-kalsel');

    const cleared = await store.update(created.id, { brandSlug: null }, 2);
    expect(cleared.brand).toBeNull();

    await expect(store.update(created.id, { categorySlug: 'tidak-ada' }, 3)).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: { field: 'categorySlug' },
    });
  });

  it('reports a missing product', async () => {
    await expect(store.update(999_999, { name: 'Tidak Ada' }, 1)).rejects.toMatchObject({
      status: 404,
      code: 'PRODUCT_NOT_FOUND',
      message: 'Produk ini tidak ditemukan.',
    });
  });

  it('refuses a legacy price above the safe range without changing the row', async () => {
    const { rows } = await testPool.query(
      `INSERT INTO tbl_produk (slug, name, category_id, price, rating, review_count, stock,
                              material, dimensions, description, colors, sizes, images,
                              is_new, is_trending, is_active)
            VALUES ('harga-raksasa', 'Harga Raksasa', $1, $2::bigint, 0, 0, 0, '', '', '',
                    '{}', '{}', '{}', false, false, true)
         RETURNING id`,
      [categoryIds.get('kursi'), '9007199254740993']
    );

    await expect(store.update(rows[0].id, { name: 'Nama Baru' }, 1)).rejects.toMatchObject({
      status: 409,
      code: 'CATALOG_VALUE_TOO_LARGE',
    });

    const after = await testPool.query('SELECT name FROM tbl_produk WHERE id = $1', [rows[0].id]);
    expect(after.rows[0].name).toBe('Harga Raksasa');
  });
});

describe('hide', () => {
  it('keeps the row but removes it from the storefront', async () => {
    const created = await store.create(input());

    const hidden = await store.hide(created.id, 1);

    expect(hidden.isActive).toBe(false);
    expect(hidden.version).toBe(2);
    expect(await countProducts()).toBe(1);
    expect(await findProductBySlug(testPool, created.slug)).toBeNull();
  });
});

describe('remove', () => {
  async function seedUser(email = 'sari@badekor.id') {
    const { rows } = await testPool.query(
      `INSERT INTO tbl_pengguna (name, email, phone, password_hash)
            VALUES ('Sari Wulandari', $1, '081234567890', 'hash')
         RETURNING id`,
      [email]
    );

    return rows[0].id;
  }

  async function seedOrderWithItem(userId) {
    const order = await testPool.query(
      `INSERT INTO tbl_pesanan (
         order_number, user_id, subtotal, shipping_cost, discount, total,
         shipping_method, payment_method, shipping_recipient, shipping_phone,
         shipping_street, shipping_city, shipping_province
       )
       VALUES ('BD-2026-0417', $1, 1500000, 85000, 0, 1585000, 'reguler', 'Transfer bank BCA',
               'Sari Wulandari', '081234567890', 'Jl. Kayu Tangi 1', 'Banjarmasin',
               'Kalimantan Selatan')
       RETURNING id`,
      [userId]
    );

    const item = await testPool.query(
      `INSERT INTO tbl_item_pesanan (order_id, product_name, product_slug, image, unit_price,
                                     quantity, color, size)
            VALUES ($1, 'Kursi Rotan', 'kursi-rotan', '/images/products/product3.jpg',
                    1500000, 1, 'Rotan natural', 'Standar')
         RETURNING id`,
      [order.rows[0].id]
    );

    return { orderId: order.rows[0].id, itemId: item.rows[0].id };
  }

  async function addCartLine(productId) {
    const cart = await testPool.query(
      `INSERT INTO tbl_keranjang (guest_token) VALUES ('guest-' || floor(random() * 1e9))
         RETURNING id`
    );
    await testPool.query(
      `INSERT INTO tbl_item_keranjang (cart_id, product_id, quantity, color, size)
            VALUES ($1, $2, 1, 'Rotan natural', 'Standar')`,
      [cart.rows[0].id, productId]
    );

    return cart.rows[0].id;
  }

  it('deletes an unreferenced product and keeps history intact', async () => {
    const created = await store.create(input());
    const userId = await seedUser();
    const { orderId, itemId } = await seedOrderWithItem(userId);

    // Point the historical line at the product, and save it in a wishlist.
    await testPool.query('UPDATE tbl_item_pesanan SET product_id = $1 WHERE id = $2', [
      created.id,
      itemId,
    ]);
    await testPool.query('INSERT INTO tbl_favorit (user_id, product_id) VALUES ($1, $2)', [
      userId,
      created.id,
    ]);

    await expect(store.remove(created.id, 1)).resolves.toBeNull();

    expect(await countProducts()).toBe(0);

    const item = await testPool.query(
      `SELECT product_id, product_name, unit_price, color, size
         FROM tbl_item_pesanan WHERE id = $1`,
      [itemId]
    );
    // The snapshot is what the customer's order page renders; only the link
    // back to the catalogue goes away.
    expect(item.rows[0]).toMatchObject({
      product_id: null,
      product_name: 'Kursi Rotan',
      unit_price: 1_500_000,
      color: 'Rotan natural',
      size: 'Standar',
    });

    const favourites = await testPool.query('SELECT 1 FROM tbl_favorit WHERE product_id = $1', [
      created.id,
    ]);
    expect(favourites.rows).toEqual([]);
    expect(orderId).toBeGreaterThan(0);
  });

  it('refuses while any cart still holds the product', async () => {
    const created = await store.create(input());
    const userId = await seedUser();
    await addCartLine(created.id);

    const accountCart = await testPool.query(
      'INSERT INTO tbl_keranjang (user_id) VALUES ($1) RETURNING id',
      [userId]
    );
    await testPool.query(
      `INSERT INTO tbl_item_keranjang (cart_id, product_id, quantity, color, size)
            VALUES ($1, $2, 2, 'Cokelat', 'Standar')`,
      [accountCart.rows[0].id, created.id]
    );

    await expect(store.remove(created.id, 1)).rejects.toMatchObject({
      status: 409,
      code: 'PRODUCT_IN_USE',
      message: 'Produk ini masih ada di keranjang pembeli. Kosongkan keranjangnya dulu.',
      details: { productId: created.id },
    });

    expect(await countProducts()).toBe(1);
    const lines = await testPool.query(
      'SELECT count(*)::int AS total FROM tbl_item_keranjang WHERE product_id = $1',
      [created.id]
    );
    expect(lines.rows[0].total).toBe(2);
  });

  it('refuses a delete built from a stale version', async () => {
    const created = await store.create(input());
    await store.update(created.id, { name: 'Kursi Rotan Baru' }, 1);

    await expect(store.remove(created.id, 1)).rejects.toMatchObject({
      status: 409,
      code: 'PRODUCT_CONFLICT',
    });

    expect(await countProducts()).toBe(1);
  });

  it('reports a missing product', async () => {
    await expect(store.remove(999_999, 1)).rejects.toMatchObject({
      status: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  });
});

describe('patch contract', () => {
  it('is rejected before it reaches the store when nothing changes', () => {
    const result = productPatchSchema.safeParse({ expectedVersion: 1 });

    expect(result.success).toBe(false);
    expect(result.error.issues[0]).toMatchObject({
      message: 'Tidak ada data yang diubah.',
    });
  });
});
