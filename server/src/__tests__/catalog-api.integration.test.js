import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';

let app;

const CATEGORIES = [
  { slug: 'sofa', name: 'Sofa' },
  { slug: 'kursi', name: 'Kursi' },
];

const BRANDS = [
  { slug: 'ulin-kalsel', name: 'Ulin Kalsel' },
  { slug: 'rotan-sungai', name: 'Rotan Sungai' },
];

async function seedCatalog() {
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
      'INSERT INTO tbl_merek (slug, name) VALUES ($1, $2) RETURNING id',
      [brand.slug, brand.name]
    );
    brandIds.set(brand.slug, rows[0].id);
  }

  const products = [
    {
      slug: 'sofa-ulin',
      name: 'Sofa Ulin',
      category: 'sofa',
      brand: 'ulin-kalsel',
      price: 8_750_000,
      rating: 4.8,
      colors: ['Ulin natural', 'Hitam'],
      sizes: ['3 dudukan'],
      isNew: true,
    },
    {
      slug: 'kursi-rotan',
      name: 'Kursi Rotan',
      category: 'kursi',
      brand: 'rotan-sungai',
      price: 1_250_000,
      rating: 4.2,
      colors: ['Rotan natural'],
      sizes: [],
      isNew: false,
    },
    {
      slug: 'meja-nonaktif',
      name: 'Meja Nonaktif',
      category: 'kursi',
      brand: 'rotan-sungai',
      price: 900_000,
      rating: 3.0,
      colors: ['Hitam'],
      sizes: [],
      isNew: false,
      isActive: false,
    },
  ];

  for (const item of products) {
    await testPool.query(
      `INSERT INTO tbl_produk (
              slug, name, category_id, brand_id, price, compare_at_price, rating,
              review_count, stock, material, dimensions, description, colors,
              sizes, images, is_new, is_trending, is_active
            )
            VALUES ($1, $2, $3, $4, $5, NULL, $6, 5, 3, 'Kayu ulin', '100 cm', $7,
                    $8, $9, $10, $11, false, $12)`,
      [
        item.slug,
        item.name,
        categoryIds.get(item.category),
        brandIds.get(item.brand),
        item.price,
        item.rating,
        `Deskripsi ${item.name}.`,
        item.colors,
        item.sizes,
        ['/images/products/product1.jpg'],
        item.isNew,
        item.isActive ?? true,
      ]
    );
  }
}

beforeAll(async () => {
  await migrateTestDatabase();
  app = createApp({ pool: testPool, authRateLimitMax: 10_000 });
});

beforeEach(async () => {
  await resetDatabase();
  await seedCatalog();
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('GET /api/v1/products', () => {
  it('lists active products with pagination metadata', async () => {
    const response = await request(app).get('/api/v1/products');

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({ page: 1, limit: 9, total: 2, totalPages: 1 });
    expect(response.body.data.map((item) => item.slug).sort()).toEqual([
      'kursi-rotan',
      'sofa-ulin',
    ]);
  });

  it('applies the shop filters from the query string', async () => {
    const response = await request(app).get(
      '/api/v1/products?search=ulin&category=sofa&brand=ulin-kalsel&color=Ulin%20natural' +
        '&size=3%20dudukan&minPrice=1000000&maxPrice=9000000'
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].slug).toBe('sofa-ulin');
  });

  it('sorts and paginates through the query string', async () => {
    const response = await request(app).get('/api/v1/products?sort=price-asc&page=1&limit=1');

    expect(response.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(response.body.data[0].slug).toBe('kursi-rotan');
  });

  it('returns an empty page for filters that match nothing', async () => {
    const response = await request(app).get('/api/v1/products?category=tidak-ada');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [],
      meta: { page: 1, limit: 9, total: 0, totalPages: 1 },
    });
  });

  it('rejects an invalid page with 422 and a field detail', async () => {
    const response = await request(app).get('/api/v1/products?page=0');

    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { field: 'page', message: 'Halaman minimal 1.' },
    });
  });

  it('rejects an inverted price range with 422', async () => {
    const response = await request(app).get('/api/v1/products?minPrice=9000000&maxPrice=1000000');

    expect(response.status).toBe(422);
    expect(response.body.error.details.field).toBe('minPrice');
  });

  it('rejects a repeated category parameter', async () => {
    const response = await request(app).get('/api/v1/products?category=sofa&category=kursi');
    expect(response.status).toBe(422);
  });

  it('never returns inactive products', async () => {
    const response = await request(app).get('/api/v1/products?limit=100');

    expect(response.body.data.map((item) => item.slug)).not.toContain('meja-nonaktif');
  });
});

describe('GET /api/v1/products/filters', () => {
  it('is reachable and returns the facets for active products', async () => {
    const response = await request(app).get('/api/v1/products/filters');

    expect(response.status).toBe(200);
    expect(response.body.data.priceRange).toEqual({ min: 1_250_000, max: 8_750_000 });
    expect([...response.body.data.colors].sort()).toEqual([
      'Hitam',
      'Rotan natural',
      'Ulin natural',
    ]);
    expect(response.body.data.sizes).toEqual(['3 dudukan']);
    expect(response.body.data.sortOptions).toHaveLength(4);
  });

  it('is not mistaken for a product slug', async () => {
    // Route order: `/products/filters` must be registered before `/products/:slug`.
    const response = await request(app).get('/api/v1/products/filters');
    expect(response.body.data).toHaveProperty('priceRange');
    expect(response.body.error).toBeUndefined();
  });
});

describe('GET /api/v1/products/:slug', () => {
  it('returns the full product detail', async () => {
    const response = await request(app).get('/api/v1/products/sofa-ulin');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      slug: 'sofa-ulin',
      name: 'Sofa Ulin',
      description: 'Deskripsi Sofa Ulin.',
      colors: ['Ulin natural', 'Hitam'],
      sizes: ['3 dudukan'],
      images: ['/images/products/product1.jpg'],
      category: { slug: 'sofa', name: 'Sofa' },
      brand: { slug: 'ulin-kalsel', name: 'Ulin Kalsel' },
    });
  });

  it('returns 404 with PRODUCT_NOT_FOUND for an unknown slug', async () => {
    const response = await request(app).get('/api/v1/products/tidak-ada');

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
      message: 'Produk tidak ditemukan.',
    });
  });

  it('treats an inactive product as missing', async () => {
    const response = await request(app).get('/api/v1/products/meja-nonaktif');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });
});

describe('GET /api/v1/products/:slug/related', () => {
  it('returns related summaries without the product itself', async () => {
    const response = await request(app).get('/api/v1/products/sofa-ulin/related');

    expect(response.status).toBe(200);
    expect(response.body.data.map((item) => item.slug)).toEqual(['kursi-rotan']);
  });

  it('honours the limit', async () => {
    const response = await request(app).get('/api/v1/products/sofa-ulin/related?limit=1');
    expect(response.body.data).toHaveLength(1);
  });

  it('returns an empty list for an unknown source product', async () => {
    const response = await request(app).get('/api/v1/products/tidak-ada/related');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
  });

  it('rejects a non-numeric limit', async () => {
    const response = await request(app).get('/api/v1/products/sofa-ulin/related?limit=banyak');

    expect(response.status).toBe(422);
    expect(response.body.error.details.field).toBe('limit');
  });
});

describe('GET /api/v1/categories and /api/v1/brands', () => {
  it('lists categories with active product counts', async () => {
    const response = await request(app).get('/api/v1/categories');

    expect(response.status).toBe(200);
    expect(response.body.data.map((item) => [item.slug, item.productCount])).toEqual([
      ['sofa', 1],
      ['kursi', 1],
    ]);
  });

  it('lists brands', async () => {
    const response = await request(app).get('/api/v1/brands');

    expect(response.status).toBe(200);
    expect(response.body.data.map((item) => item.slug)).toEqual(['ulin-kalsel', 'rotan-sungai']);
  });
});

describe('catalogue access', () => {
  it('needs no session cookie', async () => {
    await request(app).get('/api/v1/products').expect(200);
    await request(app).get('/api/v1/categories').expect(200);
    await request(app).get('/api/v1/brands').expect(200);
  });

  it('keeps the health and auth routes working', async () => {
    await request(app).get('/api/v1/health').expect(200);
    await request(app).get('/api/v1/auth/me').expect(401);
  });
});
