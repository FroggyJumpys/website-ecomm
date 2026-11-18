import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import {
  listCategories,
  listBrands,
  listFilterOptions,
  listRelatedProducts,
} from '../db/catalog.js';

const CATEGORIES = [
  { slug: 'sofa', name: 'Sofa' },
  { slug: 'kursi', name: 'Kursi' },
  { slug: 'meja', name: 'Meja' },
];

const BRANDS = [
  { slug: 'ulin-kalsel', name: 'Ulin Kalsel' },
  { slug: 'rotan-sungai', name: 'Rotan Sungai' },
];

async function seedTaxonomy() {
  const categoryIds = new Map();
  const brandIds = new Map();

  for (const [index, category] of CATEGORIES.entries()) {
    const { rows } = await testPool.query(
      `INSERT INTO tbl_kategori (slug, name, description, image, sort_order)
            VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        category.slug,
        category.name,
        `${category.name} pilihan`,
        `/images/category/${category.slug}.jpg`,
        index,
      ]
    );
    categoryIds.set(category.slug, rows[0].id);
  }

  for (const brand of BRANDS) {
    const { rows } = await testPool.query(
      'INSERT INTO tbl_merek (slug, name) VALUES ($1, $2) RETURNING id',
      [brand.slug, brand.name]
    );
    brandIds.set(brand.slug, rows[0].id);
  }

  return { categoryIds, brandIds };
}

async function insertProduct({ categoryIds, brandIds }, overrides = {}) {
  const item = {
    slug: 'produk-uji',
    name: 'Produk Uji',
    category: 'sofa',
    brand: 'ulin-kalsel',
    price: 5_000_000,
    rating: 4.5,
    colors: ['Ulin natural'],
    sizes: ['180 cm'],
    isNew: false,
    isActive: true,
    ...overrides,
  };

  await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, brand_id, price, compare_at_price, rating,
            review_count, stock, material, dimensions, description, colors,
            sizes, images, is_new, is_trending, is_active
          )
          VALUES ($1, $2, $3, $4, $5, NULL, $6, 0, 1, '', '', '', $7, $8, $9, $10, false, $11)`,
    [
      item.slug,
      item.name,
      categoryIds.get(item.category),
      item.brand ? brandIds.get(item.brand) : null,
      item.price,
      item.rating,
      item.colors,
      item.sizes,
      ['/images/products/product1.jpg'],
      item.isNew,
      item.isActive,
    ]
  );
}

beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('listCategories', () => {
  it('counts only active products, and keeps an empty category listed with zero', async () => {
    const taxonomy = await seedTaxonomy();
    await insertProduct(taxonomy, { slug: 'sofa-1', category: 'sofa' });
    await insertProduct(taxonomy, { slug: 'sofa-2', category: 'sofa' });
    await insertProduct(taxonomy, { slug: 'sofa-mati', category: 'sofa', isActive: false });
    await insertProduct(taxonomy, { slug: 'kursi-1', category: 'kursi' });

    const categories = await listCategories(testPool);

    expect(categories.map((item) => [item.slug, item.productCount])).toEqual([
      ['sofa', 2],
      ['kursi', 1],
      ['meja', 0],
    ]);
  });

  it('returns the fields the home page and filter panel read, in sort order', async () => {
    await seedTaxonomy();

    const [first] = await listCategories(testPool);

    expect(first).toEqual({
      id: expect.any(Number),
      slug: 'sofa',
      name: 'Sofa',
      description: 'Sofa pilihan',
      image: '/images/category/sofa.jpg',
      productCount: 0,
    });
  });

  it('returns an empty list when there are no categories', async () => {
    expect(await listCategories(testPool)).toEqual([]);
  });
});

describe('listBrands', () => {
  it('returns every brand with its id and slug', async () => {
    await seedTaxonomy();

    const brands = await listBrands(testPool);

    expect(brands).toEqual([
      { id: expect.any(Number), slug: 'ulin-kalsel', name: 'Ulin Kalsel' },
      { id: expect.any(Number), slug: 'rotan-sungai', name: 'Rotan Sungai' },
    ]);
  });
});

describe('listFilterOptions', () => {
  it('derives colours, sizes and the price range from active products only', async () => {
    const taxonomy = await seedTaxonomy();
    await insertProduct(taxonomy, {
      slug: 'kecil',
      price: 1_000_000,
      colors: ['Ulin natural', 'Hitam'],
      sizes: ['120 cm'],
    });
    await insertProduct(taxonomy, {
      slug: 'besar',
      price: 9_000_000,
      colors: ['Ulin gelap'],
      sizes: ['180 cm', '120 cm'],
    });
    await insertProduct(taxonomy, {
      slug: 'nonaktif',
      price: 50_000_000,
      colors: ['Warna Rahasia'],
      sizes: ['999 cm'],
      isActive: false,
    });

    const options = await listFilterOptions(testPool);

    expect(options.priceRange).toEqual({ min: 1_000_000, max: 9_000_000 });
    expect([...options.colors].sort()).toEqual(['Hitam', 'Ulin gelap', 'Ulin natural']);
    expect([...options.sizes].sort()).toEqual(['120 cm', '180 cm']);
    expect(options.sortOptions).toEqual([
      { value: 'newest', label: 'Terbaru' },
      { value: 'price-asc', label: 'Harga termurah' },
      { value: 'price-desc', label: 'Harga tertinggi' },
      { value: 'rating', label: 'Rating tertinggi' },
    ]);
  });

  it('returns empty options and a zero range for an empty catalog', async () => {
    const options = await listFilterOptions(testPool);

    expect(options).toMatchObject({
      priceRange: { min: 0, max: 0 },
      colors: [],
      sizes: [],
    });
  });
});

describe('listRelatedProducts', () => {
  it('fills the rail with the same category first, then the same brand, then the best rated', async () => {
    const taxonomy = await seedTaxonomy();
    await insertProduct(taxonomy, { slug: 'sumber', category: 'sofa', brand: 'ulin-kalsel' });
    await insertProduct(taxonomy, {
      slug: 'kategori-sama',
      category: 'sofa',
      brand: 'rotan-sungai',
    });
    await insertProduct(taxonomy, { slug: 'merek-sama', category: 'kursi', brand: 'ulin-kalsel' });
    await insertProduct(taxonomy, {
      slug: 'rating-terbaik',
      category: 'meja',
      brand: 'rotan-sungai',
      rating: 5.0,
    });
    await insertProduct(taxonomy, {
      slug: 'rating-biasa',
      category: 'meja',
      brand: 'rotan-sungai',
      rating: 2.0,
    });

    const related = await listRelatedProducts(testPool, 'sumber', 4);

    expect(related).toHaveLength(4);
    expect(related.map((item) => item.slug)).toEqual([
      'kategori-sama',
      'merek-sama',
      'rating-terbaik',
      'rating-biasa',
    ]);
  });

  it('never includes the product itself', async () => {
    const taxonomy = await seedTaxonomy();
    await insertProduct(taxonomy, { slug: 'sumber' });
    await insertProduct(taxonomy, { slug: 'lain' });

    const related = await listRelatedProducts(testPool, 'sumber', 10);

    expect(related.map((item) => item.slug)).not.toContain('sumber');
  });

  it('honours the limit', async () => {
    const taxonomy = await seedTaxonomy();
    await insertProduct(taxonomy, { slug: 'sumber' });
    for (let index = 0; index < 6; index += 1) {
      await insertProduct(taxonomy, { slug: `lain-${index}` });
    }

    expect(await listRelatedProducts(testPool, 'sumber', 3)).toHaveLength(3);
  });

  it('does not repeat a product that matches more than one signal', async () => {
    const taxonomy = await seedTaxonomy();
    await insertProduct(taxonomy, { slug: 'sumber' });
    // Same category AND same brand: the strongest match, counted once.
    await insertProduct(taxonomy, { slug: 'cocok-ganda' });
    await insertProduct(taxonomy, { slug: 'lain', category: 'meja', brand: 'rotan-sungai' });

    const related = await listRelatedProducts(testPool, 'sumber', 10);

    expect(related.map((item) => item.slug)).toEqual(['cocok-ganda', 'lain']);
  });

  it('returns an empty list for an unknown or inactive source product', async () => {
    const taxonomy = await seedTaxonomy();
    await insertProduct(taxonomy, { slug: 'disembunyikan', isActive: false });
    await insertProduct(taxonomy, { slug: 'lain' });

    expect(await listRelatedProducts(testPool, 'tidak-ada', 4)).toEqual([]);
    expect(await listRelatedProducts(testPool, 'disembunyikan', 4)).toEqual([]);
  });

  it('excludes inactive products from the rail', async () => {
    const taxonomy = await seedTaxonomy();
    await insertProduct(taxonomy, { slug: 'sumber' });
    await insertProduct(taxonomy, { slug: 'nonaktif', isActive: false });
    await insertProduct(taxonomy, { slug: 'aktif' });

    const related = await listRelatedProducts(testPool, 'sumber', 10);

    expect(related.map((item) => item.slug)).toEqual(['aktif']);
  });
});
