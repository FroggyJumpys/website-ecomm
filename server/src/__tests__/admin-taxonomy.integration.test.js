import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { createAdminTaxonomyStore } from '../db/admin-taxonomy.js';
import { createAdminCatalogStore } from '../db/admin-catalog.js';
import { createAdminProductStore } from '../db/admin-products.js';

/**
 * Categories and brands.
 *
 * The rule that matters is not the CRUD: it is that deleting a taxonomy row
 * cannot silently detach products from it. The schema's own
 * `ON DELETE SET NULL` on `tbl_produk.brand_id` would do exactly that, turning a
 * brand filter into a silent "no results" for every product that used it, so
 * this layer refuses instead and forces the operator to move the products
 * first. Hidden products count too: a hidden product is still an edited product
 * somebody is about to publish.
 */

const taxonomy = createAdminTaxonomyStore(testPool);
const catalog = createAdminCatalogStore(testPool);
const products = createAdminProductStore(testPool);

let categoryIds;
let brandIds;

async function seedTaxonomy() {
  categoryIds = new Map();
  brandIds = new Map();

  for (const [slug, name, sortOrder] of [
    ['kursi', 'Kursi', 0],
    ['meja', 'Meja', 1],
  ]) {
    const { rows } = await testPool.query(
      `INSERT INTO tbl_kategori (slug, name, sort_order) VALUES ($1, $2, $3) RETURNING id`,
      [slug, name, sortOrder]
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

async function seedProduct({
  category = 'kursi',
  brand = 'badekor-workshop',
  isActive = true,
  slug = 'kursi-rotan',
} = {}) {
  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, brand_id, price, rating, review_count, stock,
            material, dimensions, description, colors, sizes, images,
            is_new, is_trending, is_active
          )
          VALUES ($1, 'Kursi Rotan', $2, $3, 1500000, 0, 0, 6, 'Rotan', '50 cm',
                  'Kursi.', '{}', '{}', '{}', false, false, $4)
       RETURNING id`,
    [slug, categoryIds.get(category), brand === null ? null : brandIds.get(brand), isActive]
  );

  return rows[0].id;
}

async function countRows(table) {
  const { rows } = await testPool.query(`SELECT count(*)::int AS total FROM ${table}`);
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

describe('createCategory', () => {
  it('applies the defaults and derives a free slug', async () => {
    const created = await taxonomy.createCategory({
      name: 'Dekorasi',
      slug: undefined,
      description: '',
      image: '',
      sortOrder: 0,
    });

    expect(created).toEqual({
      id: expect.any(Number),
      slug: 'dekorasi',
      name: 'Dekorasi',
      description: '',
      image: '',
      sortOrder: 0,
      productCount: 0,
    });
  });

  it('suffixes a duplicate name instead of failing', async () => {
    const duplicate = await taxonomy.createCategory({
      name: 'Kursi',
      slug: undefined,
      description: 'Kursi lagi.',
      image: '',
      sortOrder: 5,
    });

    expect(duplicate.slug).toBe('kursi-2');
    expect(await countRows('tbl_kategori')).toBe(3);
  });

  it('keeps a requested image path', async () => {
    const created = await taxonomy.createCategory({
      name: 'Dekorasi',
      slug: undefined,
      description: '',
      image: '/images/category/category-1.jpg',
      sortOrder: 0,
    });

    expect(created.image).toBe('/images/category/category-1.jpg');
  });
});

describe('createBrand', () => {
  it('derives a slug and suffixes a duplicate', async () => {
    const first = await taxonomy.createBrand({ name: 'Rotan Sungai', slug: undefined });
    const second = await taxonomy.createBrand({ name: 'Rotan Sungai', slug: undefined });

    expect(first).toEqual({
      id: expect.any(Number),
      slug: 'rotan-sungai',
      name: 'Rotan Sungai',
      productCount: 0,
    });
    expect(second.slug).toBe('rotan-sungai-2');
  });
});

describe('updateCategory', () => {
  it('renames without touching the slug or the products', async () => {
    const productId = await seedProduct();

    const updated = await taxonomy.updateCategory(categoryIds.get('kursi'), {
      name: 'Kursi Rotan',
    });

    expect(updated.slug).toBe('kursi');
    expect(updated.name).toBe('Kursi Rotan');
    expect(updated.productCount).toBe(1);

    const stored = await testPool.query('SELECT category_id FROM tbl_produk WHERE id = $1', [
      productId,
    ]);
    expect(stored.rows[0].category_id).toBe(categoryIds.get('kursi'));

    // The catalogue read joins the row, so the new name shows up on the product.
    const product = await catalog.getProduct(productId);
    expect(product.category).toMatchObject({ id: categoryIds.get('kursi'), name: 'Kursi Rotan' });
  });

  it('applies an explicit new slug', async () => {
    const updated = await taxonomy.updateCategory(categoryIds.get('meja'), { slug: 'meja-makan' });

    expect(updated.slug).toBe('meja-makan');
  });

  it('reorders the category list', async () => {
    await taxonomy.updateCategory(categoryIds.get('kursi'), { sortOrder: 9 });

    const list = await catalog.listCategories();
    expect(list.map((category) => category.slug)).toEqual(['meja', 'kursi']);
  });

  it('reports a missing category', async () => {
    await expect(taxonomy.updateCategory(999_999, { name: 'Tidak Ada' })).rejects.toMatchObject({
      status: 404,
      code: 'CATEGORY_NOT_FOUND',
      message: 'Kategori ini tidak ditemukan.',
    });
  });

  it('turns a duplicate slug into a 422 rather than a 500', async () => {
    // `meja` already holds this slug; the unique index is the final guard when
    // two operators pick the same slug at once.
    await expect(
      taxonomy.updateCategory(categoryIds.get('kursi'), { slug: 'meja' })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
  });
});

describe('updateBrand', () => {
  it('renames and re-slugs', async () => {
    const updated = await taxonomy.updateBrand(brandIds.get('ulin-kalsel'), {
      name: 'Ulin Kalimantan',
      slug: 'ulin-kalimantan',
    });

    expect(updated).toMatchObject({
      slug: 'ulin-kalimantan',
      name: 'Ulin Kalimantan',
      productCount: 0,
    });
  });

  it('reports a missing brand', async () => {
    await expect(taxonomy.updateBrand(999_999, { name: 'Tidak Ada' })).rejects.toMatchObject({
      status: 404,
      code: 'BRAND_NOT_FOUND',
      message: 'Merek ini tidak ditemukan.',
    });
  });
});

describe('removeCategory', () => {
  it('deletes an unused category', async () => {
    const created = await taxonomy.createCategory({
      name: 'Dekorasi',
      slug: undefined,
      description: '',
      image: '',
      sortOrder: 0,
    });

    await expect(taxonomy.removeCategory(created.id)).resolves.toBeNull();
    expect(await countRows('tbl_kategori')).toBe(2);
  });

  it('refuses while an active product uses it', async () => {
    await seedProduct({ isActive: true });

    await expect(taxonomy.removeCategory(categoryIds.get('kursi'))).rejects.toMatchObject({
      status: 409,
      code: 'TAXONOMY_IN_USE',
      message: 'Kategori ini masih dipakai produk. Pindahkan produknya dulu sebelum menghapus.',
      details: { taxonomy: 'category', id: categoryIds.get('kursi') },
    });

    expect(await countRows('tbl_kategori')).toBe(2);
  });

  it('refuses while only a hidden product uses it', async () => {
    await seedProduct({ isActive: false });

    await expect(taxonomy.removeCategory(categoryIds.get('kursi'))).rejects.toMatchObject({
      status: 409,
      code: 'TAXONOMY_IN_USE',
    });
  });

  it('reports a missing category', async () => {
    await expect(taxonomy.removeCategory(999_999)).rejects.toMatchObject({
      status: 404,
      code: 'CATEGORY_NOT_FOUND',
    });
  });
});

describe('removeBrand', () => {
  it('refuses while a product still points at the brand', async () => {
    // The schema's FK is ON DELETE SET NULL, which would silently unbrand the
    // product; the admin layer refuses instead.
    await seedProduct({ brand: 'badekor-workshop', isActive: false });

    await expect(taxonomy.removeBrand(brandIds.get('badekor-workshop'))).rejects.toMatchObject({
      status: 409,
      code: 'TAXONOMY_IN_USE',
      message: 'Merek ini masih dipakai produk. Pindahkan produknya dulu sebelum menghapus.',
      details: { taxonomy: 'brand', id: brandIds.get('badekor-workshop') },
    });

    expect(await countRows('tbl_merek')).toBe(2);
  });

  it('deletes a brand no product references', async () => {
    await expect(taxonomy.removeBrand(brandIds.get('ulin-kalsel'))).resolves.toBeNull();
    expect(await countRows('tbl_merek')).toBe(1);
  });

  it('reports a missing brand', async () => {
    await expect(taxonomy.removeBrand(999_999)).rejects.toMatchObject({
      status: 404,
      code: 'BRAND_NOT_FOUND',
    });
  });
});

describe('deletion against a concurrent assignment', () => {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

  async function pidOf(client) {
    const { rows } = await client.query('SELECT pg_backend_pid() AS pid');
    return rows[0].pid;
  }

  it('makes a delete wait for a product that has share-locked the category', async () => {
    // The product write holds `FOR SHARE` on the category until it commits, so
    // the delete cannot slip in between the lookup and the insert.
    const holder = await testPool.connect();
    let removal;
    let created;

    await holder.query('BEGIN');

    try {
      await holder.query('SELECT id FROM tbl_kategori WHERE id = $1 FOR SHARE', [
        categoryIds.get('kursi'),
      ]);

      removal = taxonomy.removeCategory(categoryIds.get('kursi')).then(
        (value) => ({ value }),
        (error) => ({ error })
      );

      expect(await waitersOn(await pidOf(holder))).not.toEqual([]);

      created = await products.create({
        name: 'Kursi Anyam',
        slug: undefined,
        categorySlug: 'kursi',
        brandSlug: null,
        price: 1_000_000,
        compareAtPrice: null,
        stock: 1,
        material: 'Rotan',
        dimensions: '50 cm',
        description: 'Kursi anyam.',
        colors: ['Rotan'],
        sizes: [],
        images: ['/images/products/product1.jpg'],
        isNew: false,
        isTrending: false,
        isActive: true,
      });

      await holder.query('COMMIT');
    } finally {
      holder.release();
    }

    const removed = await removal;

    // The product landed first, so the delete finds it and refuses.
    expect(created.category.slug).toBe('kursi');
    expect(removed.error).toMatchObject({ status: 409, code: 'TAXONOMY_IN_USE' });

    const orphans = await testPool.query(
      `SELECT 1 FROM tbl_produk p LEFT JOIN tbl_kategori c ON c.id = p.category_id
        WHERE c.id IS NULL`
    );
    expect(orphans.rows).toEqual([]);
  });
});
