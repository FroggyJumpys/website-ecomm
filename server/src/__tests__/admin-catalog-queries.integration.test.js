import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { createAdminCatalogStore } from '../db/admin-catalog.js';

/**
 * The admin catalogue reader.
 *
 * Unlike the storefront reader in `db/catalog.js`, this one must show hidden
 * products, count every product in the taxonomy totals, and still page and
 * search deterministically. Each test pins one of those rules against a fixed
 * six-row fixture so the expected slice is readable rather than computed.
 *
 * Money is read as text on purpose: `pg` parses BIGINT through `Number`, and a
 * price above the safe range would come back silently rounded. The unsafe-price
 * test inserts such a row directly and expects a refusal, which is only
 * possible if the column never reaches the BIGINT parser.
 */

const CATEGORIES = [
  { slug: 'kursi', name: 'Kursi', sortOrder: 0 },
  { slug: 'sofa', name: 'Sofa', sortOrder: 1 },
  { slug: 'dekorasi', name: 'Dekorasi', sortOrder: 2 },
];

const BRANDS = [
  { slug: 'ulin-kalsel', name: 'Ulin Kalsel' },
  { slug: 'rotan-sungai', name: 'Rotan Sungai' },
  { slug: 'tanpa-produk', name: 'Tanpa Produk' },
];

/**
 * Insertion order is the id order. `created_at` is explicit so two rows can
 * share a timestamp and the tie-break can be asserted across a page boundary.
 */
const PRODUCTS = [
  {
    slug: 'sofa-ulin',
    name: 'Sofa Ulin',
    category: 'sofa',
    brand: 'ulin-kalsel',
    price: 5_000_000,
    createdAt: '2026-01-01T00:00:00Z',
    isActive: true,
  },
  {
    slug: 'kursi-rotan',
    name: 'Kursi Rotan',
    category: 'kursi',
    brand: 'rotan-sungai',
    price: 1_500_000,
    createdAt: '2026-01-02T00:00:00Z',
    isActive: true,
    isNew: true,
  },
  {
    slug: 'meja-jati',
    name: 'Meja Jati',
    category: 'sofa',
    brand: null,
    price: 3_000_000,
    createdAt: '2026-01-03T00:00:00Z',
    isActive: false,
  },
  {
    slug: 'lemari-ulin',
    name: 'Lemari Ulin',
    category: 'kursi',
    brand: 'ulin-kalsel',
    price: 7_500_000,
    createdAt: '2026-01-03T00:00:00Z',
    isActive: true,
    isTrending: true,
  },
  {
    slug: 'promo-spesial',
    name: 'Promo 10%_ Spesial',
    category: 'sofa',
    brand: 'rotan-sungai',
    price: 250_000,
    createdAt: '2026-01-05T00:00:00Z',
    isActive: true,
  },
  {
    slug: 'rak-buku',
    name: 'Rak Buku',
    category: 'kursi',
    brand: 'rotan-sungai',
    price: 900_000,
    createdAt: '2026-01-06T00:00:00Z',
    isActive: false,
  },
];

/** Sorted, so the assertion compares sets without pinning an order. */
const ADMIN_PRODUCT_KEYS = [
  'id',
  'slug',
  'name',
  'price',
  'compareAtPrice',
  'rating',
  'reviewCount',
  'stock',
  'material',
  'dimensions',
  'description',
  'colors',
  'sizes',
  'images',
  'isNew',
  'isTrending',
  'isActive',
  'category',
  'brand',
  'version',
  'createdAt',
  'updatedAt',
].sort();

const DEFAULT_FILTERS = {
  page: 1,
  limit: 20,
  search: '',
  category: '',
  brand: '',
  visibility: 'all',
  sort: 'newest',
};

const store = createAdminCatalogStore(testPool);

let categoryIds;
let brandIds;
let productIds;

async function seed() {
  categoryIds = new Map();
  brandIds = new Map();
  productIds = new Map();

  for (const category of CATEGORIES) {
    const { rows } = await testPool.query(
      `INSERT INTO tbl_kategori (slug, name, description, image, sort_order)
            VALUES ($1, $2, '', '', $3) RETURNING id`,
      [category.slug, category.name, category.sortOrder]
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

  for (const item of PRODUCTS) {
    const { rows } = await testPool.query(
      `INSERT INTO tbl_produk (
              slug, name, category_id, brand_id, price, compare_at_price, rating,
              review_count, stock, material, dimensions, description, colors,
              sizes, images, is_new, is_trending, is_active, created_at
            )
            VALUES ($1, $2, $3, $4, $5, NULL, 4.5, 7, 6, 'Rotan', '50 × 50 cm',
                    'Deskripsi produk.', ARRAY['Rotan natural'], ARRAY['Standar'],
                    ARRAY['/images/products/product3.jpg'], $6, $7, $8, $9)
         RETURNING id`,
      [
        item.slug,
        item.name,
        categoryIds.get(item.category),
        item.brand === null ? null : brandIds.get(item.brand),
        item.price,
        item.isNew ?? false,
        item.isTrending ?? false,
        item.isActive,
        item.createdAt,
      ]
    );
    productIds.set(item.slug, rows[0].id);
  }

  // A cart line exists while the admin reads. Reading must not depend on it,
  // and the cart's presence must not hide the product from the admin list.
  const cart = await testPool.query(
    `INSERT INTO tbl_keranjang (guest_token) VALUES ('guest-uji') RETURNING id`
  );
  await testPool.query(
    `INSERT INTO tbl_item_keranjang (cart_id, product_id, quantity, color, size)
          VALUES ($1, $2, 1, 'Rotan natural', 'Standar')`,
    [cart.rows[0].id, productIds.get('sofa-ulin')]
  );
}

function list(filters) {
  return store.listProducts({ ...DEFAULT_FILTERS, ...filters });
}

async function insertUnsafePrice() {
  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, price, rating, review_count, stock, material,
            dimensions, description, colors, sizes, images, is_new, is_trending,
            is_active
          )
          VALUES ('harga-raksasa', 'Harga Raksasa', $1, $2, 0, 0, 0, '', '', '',
                  '{}', '{}', '{}', false, false, true)
       RETURNING id`,
    // Passed as text so PostgreSQL stores the exact BIGINT; a JS number would
    // already be rounded before it reached the database.
    [categoryIds.get('kursi'), '9007199254740993']
  );

  return rows[0].id;
}

beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  await seed();
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('listProducts', () => {
  it('returns every product in the exact admin shape, newest first', async () => {
    const { data, meta } = await list();

    expect(meta).toEqual({ page: 1, limit: 20, total: 6, totalPages: 1 });
    expect(data.map((item) => item.slug)).toEqual([
      'rak-buku',
      'promo-spesial',
      'lemari-ulin',
      'meja-jati',
      'kursi-rotan',
      'sofa-ulin',
    ]);

    expect(Object.keys(data[0]).sort()).toEqual(ADMIN_PRODUCT_KEYS);
    expect(Object.keys(data[0].category).sort()).toEqual(['id', 'name', 'slug']);
    expect(data[0].price).toBe(900_000);
    expect(data[0].rating).toBe(4.5);
    expect(data[0].version).toBe(1);
    expect(data[0].createdAt).toBe('2026-01-06T00:00:00.000Z');
    expect(typeof data[0].updatedAt).toBe('string');
  });

  it('nests the taxonomy and leaves a missing brand as null', async () => {
    const { data } = await list();
    const sofa = data.find((item) => item.slug === 'sofa-ulin');
    const meja = data.find((item) => item.slug === 'meja-jati');

    expect(sofa.category).toEqual({
      id: categoryIds.get('sofa'),
      slug: 'sofa',
      name: 'Sofa',
    });
    expect(sofa.brand).toEqual({
      id: brandIds.get('ulin-kalsel'),
      slug: 'ulin-kalsel',
      name: 'Ulin Kalsel',
    });

    expect(meja.brand).toBeNull();
    expect(meja.category.slug).toBe('sofa');
  });

  it('filters by visibility, category and brand', async () => {
    const active = await list({ visibility: 'active' });
    const hidden = await list({ visibility: 'hidden' });

    expect(active.data.every((item) => item.isActive)).toBe(true);
    expect(hidden.data.every((item) => item.isActive)).toBe(false);
    expect(active.meta.total + hidden.meta.total).toBe(6);

    const sofa = await list({ category: 'sofa' });
    expect(sofa.data.map((item) => item.slug)).toEqual(['promo-spesial', 'meja-jati', 'sofa-ulin']);

    const rotan = await list({ brand: 'rotan-sungai' });
    expect(rotan.data.map((item) => item.slug)).toEqual([
      'rak-buku',
      'promo-spesial',
      'kursi-rotan',
    ]);
  });

  it('treats wildcard characters in the search term literally', async () => {
    const percent = await list({ search: '%' });

    // An unescaped LIKE would match every row here.
    expect(percent.meta.total).toBe(1);
    expect(percent.data[0].slug).toBe('promo-spesial');

    const underscore = await list({ search: '_' });
    expect(underscore.data.map((item) => item.slug)).toEqual(['promo-spesial']);
  });

  it('searches case-insensitively across product, category and brand names', async () => {
    const byProduct = await list({ search: 'KURSI' });
    expect(byProduct.meta.total).toBe(3);

    const byCategory = await list({ search: 'sofa' });
    expect(byCategory.data.map((item) => item.slug)).toEqual([
      'promo-spesial',
      'meja-jati',
      'sofa-ulin',
    ]);

    const byBrand = await list({ search: 'sungai' });
    expect(byBrand.data.map((item) => item.slug)).toEqual([
      'rak-buku',
      'promo-spesial',
      'kursi-rotan',
    ]);
  });

  it('pages with honest totals and a stable tie-break', async () => {
    const second = await list({ page: 2, limit: 2 });

    expect(second.meta).toEqual({ page: 2, limit: 2, total: 6, totalPages: 3 });
    // Both rows share created_at, so only `id DESC` keeps this order stable
    // between two separate page requests.
    expect(second.data.map((item) => item.slug)).toEqual(['lemari-ulin', 'meja-jati']);

    const past = await list({ page: 99, limit: 2 });
    expect(past.data).toEqual([]);
    expect(past.meta.total).toBe(6);
    expect(past.meta.totalPages).toBe(3);
  });

  it('reports zero pages for an empty result', async () => {
    const { data, meta } = await list({ search: 'tidak-ada-yang-cocok' });

    expect(data).toEqual([]);
    expect(meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('sorts by name and price', async () => {
    const byName = await list({ sort: 'name-asc' });
    expect(byName.data.map((item) => item.name)).toEqual([
      'Kursi Rotan',
      'Lemari Ulin',
      'Meja Jati',
      'Promo 10%_ Spesial',
      'Rak Buku',
      'Sofa Ulin',
    ]);

    const cheapest = await list({ sort: 'price-asc' });
    expect(cheapest.data.map((item) => item.price)).toEqual([
      250_000, 900_000, 1_500_000, 3_000_000, 5_000_000, 7_500_000,
    ]);

    const priciest = await list({ sort: 'price-desc' });
    expect(priciest.data[0].slug).toBe('lemari-ulin');
  });

  it('issues the same number of queries on every page size', async () => {
    let queries = 0;

    const countingPool = {
      query: (...args) => {
        queries += 1;
        return testPool.query(...args);
      },
      connect: async () => {
        const client = await testPool.connect();

        return {
          query: (...args) => {
            queries += 1;
            return client.query(...args);
          },
          release: () => client.release(),
        };
      },
    };

    const countingStore = createAdminCatalogStore(countingPool);

    queries = 0;
    await countingStore.listProducts({ ...DEFAULT_FILTERS, limit: 1 });
    const oneRow = queries;

    queries = 0;
    await countingStore.listProducts({ ...DEFAULT_FILTERS, limit: 50 });
    const fiftyRows = queries;

    expect(oneRow).toBe(fiftyRows);
    expect(oneRow).toBeLessThanOrEqual(4);
  });

  it('refuses a price too large for a JSON number instead of rounding it', async () => {
    await insertUnsafePrice();

    await expect(list()).rejects.toMatchObject({
      status: 409,
      code: 'CATALOG_VALUE_TOO_LARGE',
    });
  });
});

describe('getProduct', () => {
  it('returns a hidden product by id', async () => {
    const product = await store.getProduct(productIds.get('rak-buku'));

    expect(Object.keys(product).sort()).toEqual(ADMIN_PRODUCT_KEYS);
    expect(product.isActive).toBe(false);
    expect(product.slug).toBe('rak-buku');
    expect(product.brand.slug).toBe('rotan-sungai');
  });

  it('reports a missing product', async () => {
    await expect(store.getProduct(999_999)).rejects.toMatchObject({
      status: 404,
      code: 'PRODUCT_NOT_FOUND',
      message: 'Produk ini tidak ditemukan.',
    });
  });

  it('refuses an unsafe price', async () => {
    const id = await insertUnsafePrice();

    await expect(store.getProduct(id)).rejects.toMatchObject({
      status: 409,
      code: 'CATALOG_VALUE_TOO_LARGE',
    });
  });
});

describe('taxonomy reads', () => {
  it('counts hidden products and orders categories by sort order', async () => {
    const categories = await store.listCategories();

    expect(categories.map((category) => category.slug)).toEqual(['kursi', 'sofa', 'dekorasi']);
    expect(categories[0]).toEqual({
      id: categoryIds.get('kursi'),
      slug: 'kursi',
      name: 'Kursi',
      description: '',
      image: '',
      sortOrder: 0,
      productCount: 3,
    });
    expect(categories.map((category) => category.productCount)).toEqual([3, 3, 0]);
  });

  it('counts every product per brand, including hidden ones', async () => {
    const brands = await store.listBrands();

    expect(brands).toEqual([
      {
        id: brandIds.get('ulin-kalsel'),
        slug: 'ulin-kalsel',
        name: 'Ulin Kalsel',
        productCount: 2,
      },
      {
        id: brandIds.get('rotan-sungai'),
        slug: 'rotan-sungai',
        name: 'Rotan Sungai',
        productCount: 3,
      },
      {
        id: brandIds.get('tanpa-produk'),
        slug: 'tanpa-produk',
        name: 'Tanpa Produk',
        productCount: 0,
      },
    ]);
  });
});
