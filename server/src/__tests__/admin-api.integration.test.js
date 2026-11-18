import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../app.js';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';

/**
 * The admin catalogue over HTTP.
 *
 * Three things are asserted here that no lower-level test can:
 *
 *  1. **The gate.** Every route is admin-only, and the role is re-read from the
 *     database on each request, so a session issued while the account was an
 *     admin stops working the moment the row is demoted. Rejected calls must
 *     leave no row and no file behind.
 *  2. **The contract.** Status codes, envelopes and the field names inside a
 *     `422` are what the step-05 panel will bind to, so they are pinned exactly
 *     — including that a create returns the slug and version the server chose.
 *  3. **Image existence.** A product may only reference a seeded picture that
 *     is really on disk or a file the upload endpoint produced; the check runs
 *     before the write, so a bad path cannot leave a half-valid row.
 */

const ADMIN = {
  name: 'Admin BaDekor',
  email: 'admin@badekor.id',
  phone: '081200000000',
  password: 'rahasia123',
};

const CUSTOMER = {
  name: 'Sari Wulandari',
  email: 'sari@badekor.id',
  phone: '081234567890',
  password: 'rahasia123',
};

let app;
let uploadDir;
let publicImageDir;

/** A PNG small enough to survive the real encoder. */
async function png() {
  return sharp({
    create: { width: 12, height: 8, channels: 3, background: { r: 90, g: 60, b: 30 } },
  })
    .png()
    .toBuffer();
}

function buildApp(overrides = {}) {
  return createApp({ pool: testPool, uploadDir, publicImageDir, ...overrides });
}

async function register(agent, as) {
  const response = await agent.post('/api/v1/auth/register').send(as).expect(201);
  return response.body.data;
}

/** Registers, then promotes the row — the cookie was issued before the role. */
async function signInAdmin(as = ADMIN) {
  const agent = request.agent(app);
  const user = await register(agent, as);
  await testPool.query(`UPDATE tbl_pengguna SET role = 'admin' WHERE id = $1`, [user.id]);

  return { agent, user };
}

async function seedCatalogue() {
  const category = await testPool.query(
    `INSERT INTO tbl_kategori (slug, name, description, image, sort_order)
          VALUES ('kursi', 'Kursi', '', '', 0) RETURNING id`
  );
  const brand = await testPool.query(
    `INSERT INTO tbl_merek (slug, name) VALUES ('badekor-workshop', 'BaDekor Workshop') RETURNING id`
  );

  async function insertProduct({ slug, name, price, isActive = true, stock = 6 }) {
    const { rows } = await testPool.query(
      `INSERT INTO tbl_produk (
              slug, name, category_id, brand_id, price, rating, review_count, stock,
              material, dimensions, description, colors, sizes, images,
              is_new, is_trending, is_active
            )
            VALUES ($1, $2, $3, $4, $5, 4.5, 12, $6, 'Rotan', '50 × 55 × 80 cm',
                    'Kursi rotan untuk ruang tamu.', ARRAY['Rotan natural'],
                    ARRAY['Standar'], ARRAY['/images/products/product1.jpg'],
                    false, false, $7)
         RETURNING id`,
      [slug, name, category.rows[0].id, brand.rows[0].id, price, stock, isActive]
    );

    return rows[0].id;
  }

  const visible = await insertProduct({
    slug: 'kursi-rotan',
    name: 'Kursi Rotan',
    price: 1_500_000,
  });
  const hidden = await insertProduct({
    slug: 'kursi-lama',
    name: 'Kursi Lama',
    price: 700_000,
    isActive: false,
  });

  return {
    categoryId: category.rows[0].id,
    brandId: brand.rows[0].id,
    visibleId: visible,
    hiddenId: hidden,
  };
}

function productBody(overrides = {}) {
  return {
    name: 'Kursi Anyam',
    categorySlug: 'kursi',
    brandSlug: 'badekor-workshop',
    price: 1_500_000,
    material: 'Rotan',
    dimensions: '50 × 55 × 80 cm',
    description: 'Kursi anyam untuk ruang tamu.',
    colors: ['Rotan natural'],
    images: ['/images/products/product1.jpg'],
    ...overrides,
  };
}

async function countRows(table) {
  const { rows } = await testPool.query(`SELECT count(*)::int AS total FROM ${table}`);
  return rows[0].total;
}

async function listUploads() {
  try {
    return (await fs.readdir(uploadDir)).sort();
  } catch {
    return [];
  }
}

/** Every protected route, with the ids from a specific seed. */
function protectedRoutes(ids) {
  return [
    ['get', '/api/v1/admin/products', undefined],
    ['get', `/api/v1/admin/products/${ids.visibleId}`, undefined],
    ['post', '/api/v1/admin/products', productBody()],
    ['patch', `/api/v1/admin/products/${ids.visibleId}`, { expectedVersion: 1, name: 'Nama Baru' }],
    ['delete', `/api/v1/admin/products/${ids.visibleId}`, { expectedVersion: 1 }],
    ['get', '/api/v1/admin/categories', undefined],
    ['post', '/api/v1/admin/categories', { name: 'Dekorasi' }],
    ['patch', `/api/v1/admin/categories/${ids.categoryId}`, { name: 'Kursi Baru' }],
    ['delete', `/api/v1/admin/categories/${ids.categoryId}`, undefined],
    ['get', '/api/v1/admin/brands', undefined],
    ['post', '/api/v1/admin/brands', { name: 'Rotan Sungai' }],
    ['patch', `/api/v1/admin/brands/${ids.brandId}`, { name: 'Ulin Kalsel' }],
    ['delete', `/api/v1/admin/brands/${ids.brandId}`, undefined],
    ['post', '/api/v1/admin/uploads', undefined],
  ];
}

/** Dispatches one matrix entry, attaching an image for the upload route. */
async function send(agent, [method, url, body]) {
  const pending = agent[method](url);

  if (url.endsWith('/uploads')) {
    return pending.attach('image', await png(), {
      filename: 'kursi.png',
      contentType: 'image/png',
    });
  }

  return body === undefined ? pending : pending.send(body);
}

beforeAll(async () => {
  await migrateTestDatabase();

  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'badekor-admin-uploads-'));
  publicImageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'badekor-admin-public-'));
});

beforeEach(async () => {
  await resetDatabase();

  await fs.rm(uploadDir, { recursive: true, force: true });
  await fs.mkdir(uploadDir, { recursive: true });

  // The seeded storefront assets a product may point at.
  await fs.rm(publicImageDir, { recursive: true, force: true });
  await fs.mkdir(path.join(publicImageDir, 'products'), { recursive: true });
  await fs.writeFile(path.join(publicImageDir, 'products', 'product1.jpg'), Buffer.from('seeded'));

  // A fresh app per test: the upload limiter keeps its counter on the instance,
  // and `resetDatabase` reuses identity, so a shared app would share one budget.
  app = buildApp();
});

afterAll(async () => {
  await fs.rm(uploadDir, { recursive: true, force: true });
  await fs.rm(publicImageDir, { recursive: true, force: true });
  await closeTestDatabase();
});

describe('authorisation', () => {
  it('refuses a guest on every route and changes nothing', async () => {
    const ids = await seedCatalogue();
    const visitor = request(app);

    for (const route of protectedRoutes(ids)) {
      const response = await send(visitor, route);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }

    expect(await countRows('tbl_produk')).toBe(2);
    expect(await countRows('tbl_kategori')).toBe(1);
    expect(await countRows('tbl_merek')).toBe(1);
    expect(await listUploads()).toEqual([]);
  });

  it('refuses a signed-in customer on every route and changes nothing', async () => {
    const ids = await seedCatalogue();
    const agent = request.agent(app);
    await register(agent, CUSTOMER);

    for (const route of protectedRoutes(ids)) {
      const response = await send(agent, route);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }

    expect(await countRows('tbl_produk')).toBe(2);
    expect(await listUploads()).toEqual([]);
  });

  it('re-reads the role, so a demoted account loses access on its next call', async () => {
    await seedCatalogue();
    const { agent, user } = await signInAdmin();

    // The cookie was issued while the row said admin; only the database row
    // changes here, which is exactly what a role change in production does.
    await testPool.query(`UPDATE tbl_pengguna SET role = 'customer' WHERE id = $1`, [user.id]);

    await agent.get('/api/v1/admin/products').expect(403);
    await agent
      .patch('/api/v1/admin/products/1')
      .send({ expectedVersion: 1, name: 'Nama Baru' })
      .expect(403);
  });

  it('lets an admin reach every route', async () => {
    const { agent } = await signInAdmin();

    for (const build of [
      () => ['get', '/api/v1/admin/products', undefined],
      (ids) => ['get', `/api/v1/admin/products/${ids.visibleId}`, undefined],
      () => ['get', '/api/v1/admin/categories', undefined],
      () => ['get', '/api/v1/admin/brands', undefined],
      (ids) => ['post', '/api/v1/admin/products', productBody({ name: `Produk ${ids.visibleId}` })],
      (ids) => ['post', '/api/v1/admin/categories', { name: `Kategori ${ids.categoryId}` }],
      (ids) => ['post', '/api/v1/admin/brands', { name: `Merek ${ids.brandId}` }],
    ]) {
      const ids = await seedCatalogue();
      const response = await send(agent, build(ids));

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
      expect(response.status).toBeLessThan(300);

      // Only catalogue rows are cleared between iterations: the session must
      // survive, so the user table is left alone.
      await testPool.query('DELETE FROM tbl_produk');
      await testPool.query('DELETE FROM tbl_merek');
      await testPool.query('DELETE FROM tbl_kategori');
    }

    const upload = await send(agent, ['post', '/api/v1/admin/uploads', undefined]);
    expect(upload.status).toBe(201);
  });
});

describe('product list', () => {
  it('returns hidden products with the default paging meta', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    const response = await agent.get('/api/v1/admin/products').expect(200);

    expect(response.body.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    expect(response.body.data.map((item) => item.id)).toEqual([ids.hiddenId, ids.visibleId]);
    expect(response.body.data[0]).toMatchObject({
      slug: 'kursi-lama',
      isActive: false,
      version: 1,
      category: { id: ids.categoryId, slug: 'kursi', name: 'Kursi' },
      brand: { id: ids.brandId, slug: 'badekor-workshop', name: 'BaDekor Workshop' },
    });
  });

  it('filters by visibility and search', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const hidden = await agent.get('/api/v1/admin/products?visibility=hidden').expect(200);
    expect(hidden.body.data.map((item) => item.slug)).toEqual(['kursi-lama']);

    const searched = await agent.get('/api/v1/admin/products?search=rotan').expect(200);
    expect(searched.body.data.map((item) => item.slug)).toEqual(['kursi-rotan']);
  });

  it('pages and names an out-of-range limit', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const paged = await agent.get('/api/v1/admin/products?page=2&limit=1').expect(200);
    expect(paged.body.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
    expect(paged.body.data).toHaveLength(1);

    const rejected = await agent.get('/api/v1/admin/products?limit=101').expect(422);
    expect(rejected.body.error.details.field).toBe('limit');
  });
});

describe('product detail', () => {
  it('shows an inactive product to an admin', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    const response = await agent.get(`/api/v1/admin/products/${ids.hiddenId}`).expect(200);

    expect(response.body.data).toMatchObject({ slug: 'kursi-lama', isActive: false });
  });

  it('reports a missing product and a malformed id', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const missing = await agent.get('/api/v1/admin/products/999999').expect(404);
    expect(missing.body.error.code).toBe('PRODUCT_NOT_FOUND');

    const malformed = await agent.get('/api/v1/admin/products/abc').expect(422);
    expect(malformed.body.error.details.field).toBe('id');
  });
});

describe('product create', () => {
  it('returns the created row with the slug and version the server chose', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const response = await agent.post('/api/v1/admin/products').send(productBody()).expect(201);

    expect(response.body.data).toMatchObject({
      slug: 'kursi-anyam',
      name: 'Kursi Anyam',
      price: 1_500_000,
      compareAtPrice: null,
      rating: 0,
      reviewCount: 0,
      stock: 0,
      sizes: [],
      isNew: false,
      isTrending: false,
      isActive: true,
      version: 1,
    });
    expect(response.body.data.createdAt).toEqual(expect.any(String));
  });

  it('rejects read-only fields the panel must not send', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    for (const field of ['rating', 'id', 'version', 'total']) {
      const response = await agent
        .post('/api/v1/admin/products')
        .send({ ...productBody(), [field]: 1 })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain(field);
    }

    expect(await countRows('tbl_produk')).toBe(2);
  });

  it('names the offending field and writes nothing', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const cases = [
      [{ name: '' }, 'name'],
      [{ price: '1500000' }, 'price'],
      [{ stock: -1 }, 'stock'],
      [{ compareAtPrice: 100 }, 'compareAtPrice'],
      [{ colors: [] }, 'colors'],
      [{ images: [] }, 'images'],
      [{ categorySlug: '' }, 'categorySlug'],
      [{ categorySlug: 'tidak-ada' }, 'categorySlug'],
      [{ brandSlug: 'tidak-ada' }, 'brandSlug'],
    ];

    for (const [override, field] of cases) {
      const response = await agent
        .post('/api/v1/admin/products')
        .send(productBody(override))
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.field).toBe(field);
    }

    expect(await countRows('tbl_produk')).toBe(2);
  });
});

describe('product update', () => {
  it('applies a partial patch and advances the version', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    const response = await agent
      .patch(`/api/v1/admin/products/${ids.visibleId}`)
      .send({ expectedVersion: 1, name: 'Kursi Rotan Besar', isTrending: true })
      .expect(200);

    expect(response.body.data).toMatchObject({
      name: 'Kursi Rotan Besar',
      isTrending: true,
      version: 2,
      // Omitted by the patch, therefore untouched.
      price: 1_500_000,
      stock: 6,
      material: 'Rotan',
    });
  });

  it('refuses a stale form with a reload instruction', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    await agent
      .patch(`/api/v1/admin/products/${ids.visibleId}`)
      .send({ expectedVersion: 1, name: 'Diubah Sekali' })
      .expect(200);

    const stale = await agent
      .patch(`/api/v1/admin/products/${ids.visibleId}`)
      .send({ expectedVersion: 1, name: 'Diubah Dua Kali' })
      .expect(409);

    expect(stale.body.error).toMatchObject({
      code: 'PRODUCT_CONFLICT',
      message: 'Produk sudah diubah di tempat lain. Muat ulang lalu simpan kembali.',
    });
  });

  it('requires expectedVersion and names it when it is missing', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    const response = await agent
      .patch(`/api/v1/admin/products/${ids.visibleId}`)
      .send({ name: 'Tanpa Versi' })
      .expect(422);

    expect(response.body.error.details.field).toBe('expectedVersion');
  });

  it('reports a missing product', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const response = await agent
      .patch('/api/v1/admin/products/999999')
      .send({ expectedVersion: 1, name: 'Tidak Ada' })
      .expect(404);

    expect(response.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });
});

describe('product delete', () => {
  it('deletes the row and answers with a null data envelope', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    const response = await agent
      .delete(`/api/v1/admin/products/${ids.visibleId}`)
      .send({ expectedVersion: 1 })
      .expect(200);

    expect(response.body).toEqual({ data: null });
    expect(await countRows('tbl_produk')).toBe(1);
  });

  it('refuses while a cart holds the product', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    const cart = await testPool.query(
      `INSERT INTO tbl_keranjang (guest_token) VALUES ('guest-admin-api') RETURNING id`
    );
    await testPool.query(
      `INSERT INTO tbl_item_keranjang (cart_id, product_id, quantity, color, size)
            VALUES ($1, $2, 1, 'Rotan natural', 'Standar')`,
      [cart.rows[0].id, ids.visibleId]
    );

    const response = await agent
      .delete(`/api/v1/admin/products/${ids.visibleId}`)
      .send({ expectedVersion: 1 })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: 'PRODUCT_IN_USE',
      details: { productId: ids.visibleId },
    });
    expect(await countRows('tbl_produk')).toBe(2);
  });

  it('refuses a stale version and a missing product', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    await agent
      .patch(`/api/v1/admin/products/${ids.visibleId}`)
      .send({ expectedVersion: 1, name: 'Sudah Berubah' })
      .expect(200);

    const stale = await agent
      .delete(`/api/v1/admin/products/${ids.visibleId}`)
      .send({ expectedVersion: 1 })
      .expect(409);
    expect(stale.body.error.code).toBe('PRODUCT_CONFLICT');

    const missing = await agent
      .delete('/api/v1/admin/products/999999')
      .send({ expectedVersion: 1 })
      .expect(404);
    expect(missing.body.error.code).toBe('PRODUCT_NOT_FOUND');

    const noVersion = await agent
      .delete(`/api/v1/admin/products/${ids.hiddenId}`)
      .send({})
      .expect(422);
    expect(noVersion.body.error.details.field).toBe('expectedVersion');
  });
});

describe('categories', () => {
  it('creates, renames and deletes a category', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    const created = await agent
      .post('/api/v1/admin/categories')
      .send({ name: 'Dekorasi', description: 'Aksesori ruangan.' })
      .expect(201);

    expect(created.body.data).toMatchObject({
      slug: 'dekorasi',
      name: 'Dekorasi',
      description: 'Aksesori ruangan.',
      image: '',
      sortOrder: 0,
      productCount: 0,
    });

    const renamed = await agent
      .patch(`/api/v1/admin/categories/${ids.categoryId}`)
      .send({ name: 'Kursi Rotan' })
      .expect(200);

    expect(renamed.body.data).toMatchObject({
      slug: 'kursi',
      name: 'Kursi Rotan',
      productCount: 2,
    });

    const removed = await agent
      .delete(`/api/v1/admin/categories/${created.body.data.id}`)
      .expect(200);
    expect(removed.body).toEqual({ data: null });
  });

  it('suffixes a duplicate name and returns the final slug', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const response = await agent
      .post('/api/v1/admin/categories')
      .send({ name: 'Kursi' })
      .expect(201);

    expect(response.body.data.slug).toBe('kursi-2');
  });

  it('refuses to delete a category that still has products', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    const response = await agent.delete(`/api/v1/admin/categories/${ids.categoryId}`).expect(409);

    expect(response.body.error).toMatchObject({
      code: 'TAXONOMY_IN_USE',
      details: { taxonomy: 'category', id: ids.categoryId },
    });
    expect(await countRows('tbl_kategori')).toBe(1);
  });

  it('reports a missing category on update and delete', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const patched = await agent
      .patch('/api/v1/admin/categories/999999')
      .send({ name: 'Tidak Ada' })
      .expect(404);
    expect(patched.body.error.code).toBe('CATEGORY_NOT_FOUND');

    const removed = await agent.delete('/api/v1/admin/categories/999999').expect(404);
    expect(removed.body.error.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('refuses a category image that is not on disk, naming the field', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const missing = await agent
      .post('/api/v1/admin/categories')
      .send({ name: 'Dekorasi', image: '/images/category/tidak-ada.jpg' })
      .expect(422);

    expect(missing.body.error.details.field).toBe('image');
    expect(await countRows('tbl_kategori')).toBe(1);

    const accepted = await agent
      .post('/api/v1/admin/categories')
      .send({ name: 'Dekorasi', image: '/images/products/product1.jpg' })
      .expect(201);

    expect(accepted.body.data.image).toBe('/images/products/product1.jpg');
  });
});

describe('brands', () => {
  it('creates, renames and deletes a brand', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    const created = await agent
      .post('/api/v1/admin/brands')
      .send({ name: 'Rotan Sungai' })
      .expect(201);

    expect(created.body.data).toMatchObject({
      slug: 'rotan-sungai',
      name: 'Rotan Sungai',
      productCount: 0,
    });

    const renamed = await agent
      .patch(`/api/v1/admin/brands/${ids.brandId}`)
      .send({ name: 'Ulin Kalsel' })
      .expect(200);

    expect(renamed.body.data).toMatchObject({
      slug: 'badekor-workshop',
      name: 'Ulin Kalsel',
      productCount: 2,
    });

    const removed = await agent.delete(`/api/v1/admin/brands/${created.body.data.id}`).expect(200);
    expect(removed.body).toEqual({ data: null });
  });

  it('refuses to delete a brand a product still points at', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    const response = await agent.delete(`/api/v1/admin/brands/${ids.brandId}`).expect(409);

    expect(response.body.error).toMatchObject({
      code: 'TAXONOMY_IN_USE',
      details: { taxonomy: 'brand', id: ids.brandId },
    });
    expect(await countRows('tbl_merek')).toBe(1);
  });

  it('reports a missing brand', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const removed = await agent.delete('/api/v1/admin/brands/999999').expect(404);
    expect(removed.body.error.code).toBe('BRAND_NOT_FOUND');
  });
});

describe('image path existence', () => {
  it('accepts a seeded file that is on disk', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    await agent.post('/api/v1/admin/products').send(productBody()).expect(201);
  });

  it('refuses a seeded path whose file is missing, naming images', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const response = await agent
      .post('/api/v1/admin/products')
      .send(productBody({ images: ['/images/products/tidak-ada.jpg'] }))
      .expect(422);

    expect(response.body.error.details.field).toBe('images');
    expect(await countRows('tbl_produk')).toBe(2);
  });

  it('trusts an upload path by its generated filename', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();
    const generated = `/api/v1/media/catalog/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}.webp`;

    const response = await agent
      .patch(`/api/v1/admin/products/${ids.visibleId}`)
      .send({ expectedVersion: 1, images: [generated] })
      .expect(200);

    expect(response.body.data.images).toEqual([generated]);
  });
});

describe('upload integration', () => {
  it('stores an image and lets the returned path be saved on a product', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const upload = await agent
      .post('/api/v1/admin/uploads')
      .attach('image', await png(), { filename: 'kursi.png', contentType: 'image/png' })
      .expect(201);

    const created = await agent
      .post('/api/v1/admin/products')
      .send(productBody({ images: [upload.body.data.path] }))
      .expect(201);

    expect(created.body.data.images).toEqual([upload.body.data.path]);
    await request(app).get(upload.body.data.path).expect(200);
  });

  it('accepts a path uploaded by another app instance over the same directory', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    const upload = await agent
      .post('/api/v1/admin/uploads')
      .attach('image', await png(), { filename: 'kursi.png', contentType: 'image/png' })
      .expect(201);

    // A restart rebuilds the process but not the disk; the second instance has
    // its own service object and must still accept the stored file.
    const restarted = buildApp();
    const admin = request.agent(restarted);
    const user = await register(admin, { ...ADMIN, email: 'admin2@badekor.id' });
    await testPool.query(`UPDATE tbl_pengguna SET role = 'admin' WHERE id = $1`, [user.id]);

    const created = await admin
      .post('/api/v1/admin/products')
      .send(productBody({ name: 'Kursi Kedua', images: [upload.body.data.path] }))
      .expect(201);

    expect(created.body.data.images).toEqual([upload.body.data.path]);
  });
});

describe('cross-site writes', () => {
  it('refuses a patch from another origin and leaves the row alone', async () => {
    const ids = await seedCatalogue();
    const { agent } = await signInAdmin();

    const response = await agent
      .patch(`/api/v1/admin/products/${ids.visibleId}`)
      .set('Origin', 'http://evil.test')
      .send({ expectedVersion: 1, name: 'Dibajak' })
      .expect(403);

    expect(response.body.error.code).toBe('CROSS_SITE_REQUEST');

    const { rows } = await testPool.query('SELECT name, version FROM tbl_produk WHERE id = $1', [
      ids.visibleId,
    ]);
    expect(rows[0]).toEqual({ name: 'Kursi Rotan', version: 1 });
  });

  it('refuses an upload from another origin and writes no file', async () => {
    await seedCatalogue();
    const { agent } = await signInAdmin();

    await agent
      .post('/api/v1/admin/uploads')
      .set('Sec-Fetch-Site', 'cross-site')
      .attach('image', await png(), { filename: 'kursi.png', contentType: 'image/png' })
      .expect(403);

    expect(await listUploads()).toEqual([]);
  });
});

describe('one catalogue lifecycle, end to end', () => {
  /**
   * The whole admin surface plus the public and customer surfaces it touches,
   * in the order a real shop hits them: upload a photo, publish a product, sell
   * it, hide it, rename its category, then delete it.
   *
   * The point is the seam. Every step here is covered in isolation elsewhere;
   * what this test proves is that the *outputs* join up — the upload path a
   * product stores is the one the media route serves, hiding a product removes
   * it from the storefront without touching an order that already references
   * it, and deleting it keeps that order readable while dropping the wishlist
   * row the FK cascades.
   */
  it('publishes, sells, hides, renames and deletes without breaking history', async () => {
    const ids = await seedCatalogue();
    const { agent: admin } = await signInAdmin();

    // 1. Upload the product photo.
    const upload = await admin
      .post('/api/v1/admin/uploads')
      .attach('image', await png(), { filename: 'kursi-anyam.png', contentType: 'image/png' })
      .expect(201);

    const imagePath = upload.body.data.path;
    expect(imagePath).toMatch(/^\/api\/v1\/media\/catalog\/[0-9a-f-]{36}\.webp$/);

    // 2. Publish it with that photo and the seeded category.
    const created = await admin
      .post('/api/v1/admin/products')
      .send(
        productBody({
          name: 'Kursi Anyam Baru',
          price: 2_000_000,
          stock: 4,
          images: [imagePath],
          colors: ['Rotan natural'],
          sizes: ['Standar'],
        })
      )
      .expect(201);

    expect(created.body.data).toMatchObject({ slug: 'kursi-anyam-baru', version: 1 });
    const productId = created.body.data.id;
    const { slug } = created.body.data;

    // 3. The storefront can see it, and its photo is served.
    const publicProduct = await request(app).get(`/api/v1/products/${slug}`).expect(200);
    expect(publicProduct.body.data).toMatchObject({
      name: 'Kursi Anyam Baru',
      price: 2_000_000,
      images: [imagePath],
    });
    await request(app).get(imagePath).expect(200);

    // 4. A customer buys one.
    const customer = request.agent(app);
    const buyer = await register(customer, CUSTOMER);

    const address = await customer
      .post('/api/v1/users/me/addresses')
      .send({
        label: 'Rumah',
        recipient: 'Sari Wulandari',
        phone: '081234567890',
        street: 'Jl. Kayu Tangi II No. 18',
        district: 'Banjarmasin Utara',
        city: 'Banjarmasin',
        province: 'Kalimantan Selatan',
        postalCode: '70123',
      })
      .expect(201);

    await customer
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar', quantity: 1 })
      .expect(200);

    const order = await customer
      .post('/api/v1/orders')
      .set('Idempotency-Key', 'e2e-admin-catalogue-0001')
      .send({ addressId: address.body.data.id, shippingMethod: 'reguler', paymentMethod: 'bca' })
      .expect(201);

    const orderNumber = order.body.data.orderNumber;
    expect(order.body.data.items[0]).toMatchObject({
      productId,
      name: 'Kursi Anyam Baru',
      image: imagePath,
      price: 2_000_000,
    });

    // The customer's wishlist also holds it, so the delete has something to cascade.
    await customer.post('/api/v1/users/me/wishlist').send({ productId }).expect(200);

    // 5. The sale advanced the version, so a form still showing version 1 is
    //    refused — the whole reason the version exists. The admin reloads.
    const stale = await admin
      .patch(`/api/v1/admin/products/${productId}`)
      .send({ expectedVersion: 1, isActive: false })
      .expect(409);
    expect(stale.body.error.code).toBe('PRODUCT_CONFLICT');

    const reloaded = await admin.get(`/api/v1/admin/products/${productId}`).expect(200);
    const { version } = reloaded.body.data;
    expect(version).toBe(2);

    const hidden = await admin
      .patch(`/api/v1/admin/products/${productId}`)
      .send({ expectedVersion: version, isActive: false })
      .expect(200);
    expect(hidden.body.data).toMatchObject({ isActive: false, version: 3 });

    const renamed = await admin
      .patch(`/api/v1/admin/categories/${ids.categoryId}`)
      .send({ name: 'Kursi Rotan' })
      .expect(200);
    expect(renamed.body.data).toMatchObject({ name: 'Kursi Rotan', productCount: 3 });

    // 6. Hidden means gone from the storefront, but not from the order.
    await request(app).get(`/api/v1/products/${slug}`).expect(404);

    const history = await customer.get(`/api/v1/users/me/orders/${orderNumber}`).expect(200);
    expect(history.body.data.items[0]).toMatchObject({
      productId,
      name: 'Kursi Anyam Baru',
      image: imagePath,
      price: 2_000_000,
    });
    await request(app).get(imagePath).expect(200);

    // 7. Delete it. The checkout emptied the cart, so nothing blocks the row.
    const deleted = await admin
      .delete(`/api/v1/admin/products/${productId}`)
      .send({ expectedVersion: 3 })
      .expect(200);
    expect(deleted.body).toEqual({ data: null });

    // 8. History survives the deletion with a null link and its snapshot intact.
    const afterDelete = await customer.get(`/api/v1/users/me/orders/${orderNumber}`).expect(200);
    expect(afterDelete.body.data.items[0]).toMatchObject({
      productId: null,
      slug,
      name: 'Kursi Anyam Baru',
      image: imagePath,
      price: 2_000_000,
      color: 'Rotan natural',
      size: 'Standar',
    });

    // The photo is not deleted with the product, so the order page still renders.
    await request(app).get(imagePath).expect(200);

    const wishlist = await customer.get('/api/v1/users/me/wishlist').expect(200);
    expect(wishlist.body.data).toEqual([]);

    // The customer was a real customer, not an accidental admin.
    expect(buyer.role).toBe('customer');
    await customer.get('/api/v1/admin/products').expect(403);
  });
});
