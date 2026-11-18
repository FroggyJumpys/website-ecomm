import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { listProducts, findProductBySlug } from '../db/catalog.js';

/**
 * Controlled fixtures rather than the ported seed, so each assertion pins one
 * rule: visibility, one filter, one sort. Ids come from the identity column and
 * are ordered by insertion.
 */

const CATEGORIES = [
  { slug: 'sofa', name: 'Sofa' },
  { slug: 'kursi', name: 'Kursi' },
  { slug: 'meja', name: 'Meja' },
];

const BRANDS = [
  { slug: 'ulin-kalsel', name: 'Ulin Kalsel' },
  { slug: 'rotan-sungai', name: 'Rotan Sungai' },
];

/** A product row with every column spelled out; overrides change one thing. */
function product(overrides = {}) {
  return {
    slug: 'produk-uji',
    name: 'Produk Uji',
    category: 'sofa',
    brand: 'ulin-kalsel',
    price: 5_000_000,
    compareAtPrice: null,
    rating: 4.5,
    reviewCount: 10,
    stock: 5,
    material: 'Kayu ulin',
    dimensions: '100 × 50 × 40 cm',
    description: 'Produk untuk pengujian katalog.',
    colors: ['Ulin natural'],
    sizes: ['180 cm'],
    images: ['/images/products/product1.jpg'],
    isNew: false,
    isTrending: false,
    isActive: true,
    ...overrides,
  };
}

async function seedCatalog(products) {
  const categoryIds = new Map();
  const brandIds = new Map();

  for (const [index, category] of CATEGORIES.entries()) {
    const { rows } = await testPool.query(
      `INSERT INTO tbl_kategori (slug, name, description, image, sort_order)
            VALUES ($1, $2, '', '', $3) RETURNING id`,
      [category.slug, category.name, index]
    );
    categoryIds.set(category.slug, rows[0].id);
  }

  for (const brand of BRANDS) {
    const { rows } = await testPool.query(
      `INSERT INTO tbl_merek (slug, name) VALUES ($1, $2) RETURNING id`,
      [brand.slug, brand.name]
    );
    brandIds.set(brand.slug, rows[0].id);
  }

  for (const item of products) {
    await testPool.query(
      `INSERT INTO tbl_produk (
              slug, name, category_id, brand_id, price, compare_at_price, rating,
              review_count, stock, material, dimensions, description, colors,
              sizes, images, is_new, is_trending, is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                    $16, $17, $18)`,
      [
        item.slug,
        item.name,
        categoryIds.get(item.category),
        item.brand ? brandIds.get(item.brand) : null,
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
  }
}

async function productIdBySlug(slug) {
  const { rows } = await testPool.query('SELECT id FROM tbl_produk WHERE slug = $1', [slug]);
  return rows[0].id;
}

const defaults = {
  search: '',
  category: '',
  brand: '',
  color: '',
  size: '',
  minPrice: undefined,
  maxPrice: undefined,
  sort: 'newest',
  page: 1,
  limit: 9,
};

// The database lifecycle lives at file level: the pool is shared by every
// block, so ending it inside one block would break the next.
beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('listProducts', () => {
  it('returns only active products, with the summary shape the storefront renders', async () => {
    await seedCatalog([
      product({ slug: 'aktif', name: 'Produk Aktif' }),
      product({ slug: 'nonaktif', name: 'Produk Nonaktif', isActive: false }),
    ]);

    const result = await listProducts(testPool, defaults);

    expect(result.meta).toEqual({ page: 1, limit: 9, total: 1, totalPages: 1 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      slug: 'aktif',
      name: 'Produk Aktif',
      price: 5_000_000,
      compareAtPrice: null,
      rating: 4.5,
      reviewCount: 10,
      stock: 5,
      material: 'Kayu ulin',
      dimensions: '100 × 50 × 40 cm',
      image: '/images/products/product1.jpg',
      isNew: false,
      isTrending: false,
      category: { slug: 'sofa', name: 'Sofa' },
      brand: { slug: 'ulin-kalsel', name: 'Ulin Kalsel' },
    });
    expect(result.data[0]).not.toHaveProperty('description');
    expect(result.data[0]).not.toHaveProperty('colors');
    expect(result.data[0].id).toBeTypeOf('number');
  });

  it('keeps an active product with zero stock visible', async () => {
    await seedCatalog([product({ slug: 'habis', stock: 0 })]);

    const result = await listProducts(testPool, defaults);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].stock).toBe(0);
  });

  it('returns a nullable brand when the product has none', async () => {
    await seedCatalog([product({ slug: 'tanpa-merek', brand: null })]);

    const result = await listProducts(testPool, defaults);

    expect(result.data[0].brand).toBeNull();
  });

  it('searches name, material and description case-insensitively', async () => {
    await seedCatalog([
      product({ slug: 'cocok-nama', name: 'Sofa Rotan' }),
      product({
        slug: 'cocok-bahan',
        name: 'Kursi Makan',
        material: 'Rotan sintetis',
      }),
      product({
        slug: 'cocok-deskripsi',
        name: 'Meja',
        description: 'Cocok dipadukan dengan rotan alami.',
      }),
      product({ slug: 'tidak-cocok', name: 'Lemari', material: 'Ulin solid' }),
    ]);

    const result = await listProducts(testPool, { ...defaults, search: 'rotan' });

    expect(result.data.map((item) => item.slug).sort()).toEqual([
      'cocok-bahan',
      'cocok-deskripsi',
      'cocok-nama',
    ]);
  });

  it('treats % and _ in the search term as literal characters', async () => {
    await seedCatalog([
      product({ slug: 'diskon', name: 'Sofa Diskon 50%' }),
      product({ slug: 'biasa', name: 'Sofa Biasa' }),
      product({ slug: 'garis', name: 'Kursi A_B' }),
      product({ slug: 'tanpa-garis', name: 'Kursi AXB' }),
    ]);

    const percent = await listProducts(testPool, { ...defaults, search: '%' });
    const underscore = await listProducts(testPool, { ...defaults, search: 'A_B' });

    expect(percent.data.map((item) => item.slug)).toEqual(['diskon']);
    expect(underscore.data.map((item) => item.slug)).toEqual(['garis']);
  });

  it('filters by category, brand, colour and size together', async () => {
    await seedCatalog([
      product({ slug: 'cocok' }),
      product({ slug: 'beda-kategori', category: 'kursi' }),
      product({ slug: 'beda-merek', brand: 'rotan-sungai' }),
      product({ slug: 'beda-warna', colors: ['Hitam'] }),
      product({ slug: 'beda-ukuran', sizes: ['120 cm'] }),
    ]);

    const result = await listProducts(testPool, {
      ...defaults,
      category: 'sofa',
      brand: 'ulin-kalsel',
      color: 'Ulin natural',
      size: '180 cm',
    });

    expect(result.data.map((item) => item.slug)).toEqual(['cocok']);
  });

  it('treats the price bounds as inclusive', async () => {
    await seedCatalog([
      product({ slug: 'murah', price: 1_000_000 }),
      product({ slug: 'tengah', price: 5_000_000 }),
      product({ slug: 'mahal', price: 9_000_000 }),
    ]);

    const result = await listProducts(testPool, {
      ...defaults,
      minPrice: 1_000_000,
      maxPrice: 5_000_000,
    });

    expect(result.data.map((item) => item.slug).sort()).toEqual(['murah', 'tengah']);
  });

  it('returns an empty page, not an error, for an unknown category slug', async () => {
    await seedCatalog([product({ slug: 'sofa-ulin' })]);

    const result = await listProducts(testPool, { ...defaults, category: 'tidak-ada' });

    expect(result.meta).toMatchObject({ total: 0, totalPages: 1 });
    expect(result.data).toEqual([]);
  });

  it('sorts newest by the new flag first, then by newest id', async () => {
    await seedCatalog([
      product({ slug: 'lama', isNew: false }),
      product({ slug: 'baru', isNew: true }),
      product({ slug: 'lama-terbaru', isNew: false }),
    ]);

    const result = await listProducts(testPool, defaults);

    expect(result.data.map((item) => item.slug)).toEqual(['baru', 'lama-terbaru', 'lama']);
  });

  it('sorts by price in both directions with a stable id tie-break', async () => {
    await seedCatalog([
      product({ slug: 'sedang', price: 5_000_000 }),
      product({ slug: 'murah-pertama', price: 1_000_000 }),
      product({ slug: 'murah-kedua', price: 1_000_000 }),
    ]);

    const ascending = await listProducts(testPool, { ...defaults, sort: 'price-asc' });
    const descending = await listProducts(testPool, { ...defaults, sort: 'price-desc' });

    expect(ascending.data.map((item) => item.slug)).toEqual([
      'murah-pertama',
      'murah-kedua',
      'sedang',
    ]);
    expect(descending.data.map((item) => item.slug)).toEqual([
      'sedang',
      'murah-kedua',
      'murah-pertama',
    ]);
  });

  it('sorts by rating, highest first', async () => {
    await seedCatalog([
      product({ slug: 'tiga', rating: 3.5 }),
      product({ slug: 'lima', rating: 5.0 }),
      product({ slug: 'empat', rating: 4.2 }),
    ]);

    const result = await listProducts(testPool, { ...defaults, sort: 'rating' });

    expect(result.data.map((item) => item.slug)).toEqual(['lima', 'empat', 'tiga']);
  });

  it('paginates and reports the total for the whole filtered set', async () => {
    await seedCatalog([
      product({ slug: 'satu' }),
      product({ slug: 'dua' }),
      product({ slug: 'tiga' }),
      product({ slug: 'empat' }),
      product({ slug: 'lima' }),
    ]);

    const second = await listProducts(testPool, { ...defaults, page: 2, limit: 2 });

    expect(second.meta).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
    expect(second.data).toHaveLength(2);
  });

  it('returns an empty page past the end while keeping the real total', async () => {
    await seedCatalog([product({ slug: 'satu' }), product({ slug: 'dua' })]);

    const result = await listProducts(testPool, { ...defaults, page: 9, limit: 9 });

    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({ page: 9, limit: 9, total: 2, totalPages: 1 });
  });
});

describe('findProductBySlug', () => {
  it('returns the full product, including the fields the detail page renders', async () => {
    await seedCatalog([product({ slug: 'sofa-ulin', name: 'Sofa Ulin' })]);

    const found = await findProductBySlug(testPool, 'sofa-ulin');

    expect(found).toMatchObject({
      slug: 'sofa-ulin',
      name: 'Sofa Ulin',
      description: 'Produk untuk pengujian katalog.',
      material: 'Kayu ulin',
      dimensions: '100 × 50 × 40 cm',
      colors: ['Ulin natural'],
      sizes: ['180 cm'],
      images: ['/images/products/product1.jpg'],
      image: '/images/products/product1.jpg',
      stock: 5,
      reviewCount: 10,
      isNew: false,
      isTrending: false,
      category: { slug: 'sofa', name: 'Sofa' },
      brand: { slug: 'ulin-kalsel', name: 'Ulin Kalsel' },
    });
  });

  it('does not return an inactive product', async () => {
    await seedCatalog([product({ slug: 'disembunyikan', isActive: false })]);

    expect(await findProductBySlug(testPool, 'disembunyikan')).toBeNull();
  });

  it('returns null for an unknown slug', async () => {
    expect(await findProductBySlug(testPool, 'tidak-ada')).toBeNull();
  });

  it('exposes the numeric id, so the client can compare it', async () => {
    await seedCatalog([product({ slug: 'bernomor' })]);

    const found = await findProductBySlug(testPool, 'bernomor');

    expect(found.id).toBe(await productIdBySlug('bernomor'));
    expect(found.id).toBeTypeOf('number');
  });
});
