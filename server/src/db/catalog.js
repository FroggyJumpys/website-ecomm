import { SORT_OPTIONS, DEFAULT_SORT } from '../validators/catalog.js';

/**
 * Catalogue SQL. Every statement is parameterised and every ORDER BY comes from
 * a fixed allowlist, so no user input reaches the query text.
 *
 * Only `is_active` products are visible to the storefront. The admin list in
 * 04h reads the table directly and sees both.
 */

/** Shared SELECT list for a product joined to its category and brand. */
const PRODUCT_COLUMNS = `
  p.id,
  p.slug,
  p.name,
  p.price,
  p.compare_at_price,
  p.rating,
  p.review_count,
  p.stock,
  p.material,
  p.dimensions,
  p.description,
  p.colors,
  p.sizes,
  p.images,
  p.is_new,
  p.is_trending,
  c.slug AS category_slug,
  c.name AS category_name,
  b.slug AS brand_slug,
  b.name AS brand_name
`;

const BASE_FROM = `
  FROM tbl_produk p
  JOIN tbl_kategori c ON c.id = p.category_id
  LEFT JOIN tbl_merek b ON b.id = p.brand_id
`;

/**
 * `ORDER BY` per sort option. `id` is always the tie-breaker so two products
 * with the same price keep a stable position across pages.
 *
 * `newest` keeps the mock's order: new-tagged products first, then the most
 * recently inserted.
 */
const SORT_SQL = {
  newest: 'p.is_new DESC, p.id DESC',
  'price-asc': 'p.price ASC, p.id ASC',
  'price-desc': 'p.price DESC, p.id DESC',
  rating: 'p.rating DESC, p.id ASC',
};

function orderBy(sort) {
  return SORT_SQL[SORT_OPTIONS.includes(sort) ? sort : DEFAULT_SORT];
}

/**
 * Builds the WHERE clause for the storefront filters.
 *
 * Search matches a literal substring across name, material and description,
 * the same fields and rule as the frontend mock. The term is escaped for LIKE
 * (`%`, `_`, `\`) so those characters cannot act as wildcards, and the
 * comparison is written against the same expression the trigram index covers.
 */
function buildWhere(filters) {
  const conditions = ['p.is_active'];
  const values = [];

  if (filters.search) {
    values.push(filters.search);
    conditions.push(
      `lower(p.name || ' ' || p.material || ' ' || p.description)
        LIKE '%' || replace(replace(replace(lower($${values.length}), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'`
    );
  }

  if (filters.category) {
    values.push(filters.category);
    conditions.push(`c.slug = $${values.length}`);
  }

  if (filters.brand) {
    values.push(filters.brand);
    conditions.push(`b.slug = $${values.length}`);
  }

  if (filters.color) {
    values.push(filters.color);
    conditions.push(`p.colors @> ARRAY[$${values.length}]::TEXT[]`);
  }

  if (filters.size) {
    values.push(filters.size);
    conditions.push(`p.sizes @> ARRAY[$${values.length}]::TEXT[]`);
  }

  if (filters.minPrice !== undefined) {
    values.push(filters.minPrice);
    conditions.push(`p.price >= $${values.length}`);
  }

  if (filters.maxPrice !== undefined) {
    values.push(filters.maxPrice);
    conditions.push(`p.price <= $${values.length}`);
  }

  return { where: conditions.join(' AND '), values };
}

/** `NUMERIC` arrives as a string from `pg`; the client needs a number. */
function toRating(value) {
  return value === null ? 0 : Number(value);
}

function taxonomy(row) {
  return {
    category: { slug: row.category_slug, name: row.category_name },
    brand: row.brand_slug ? { slug: row.brand_slug, name: row.brand_name } : null,
  };
}

/** The card/row shape: no description, arrays or gallery. */
export function toSummary(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    price: row.price,
    compareAtPrice: row.compare_at_price,
    rating: toRating(row.rating),
    reviewCount: row.review_count,
    stock: row.stock,
    material: row.material,
    dimensions: row.dimensions,
    image: row.images?.[0] ?? '',
    isNew: row.is_new,
    isTrending: row.is_trending,
    ...taxonomy(row),
  };
}

/** The detail shape, which adds the copy and the variant arrays. */
export function toDetail(row) {
  return {
    ...toSummary(row),
    description: row.description,
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    images: row.images ?? [],
  };
}

/**
 * `listProducts(pool, filters)` returns
 * `{ data: summary[], meta: { page, limit, total, totalPages } }`.
 *
 * `total` counts the whole filtered set, so a page past the end still reports
 * the real number of matches.
 */
export async function listProducts(pool, filters) {
  const { where, values } = buildWhere(filters);

  const countResult = await pool.query(
    `SELECT count(*)::int AS total ${BASE_FROM} WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;

  const offset = (filters.page - 1) * filters.limit;
  const rows = await pool.query(
    `SELECT ${PRODUCT_COLUMNS} ${BASE_FROM}
      WHERE ${where}
      ORDER BY ${orderBy(filters.sort)}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, offset]
  );

  return {
    data: rows.rows.map(toSummary),
    meta: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    },
  };
}

/** The full detail for one active product, or `null`. */
export async function findProductBySlug(pool, slug) {
  const { rows } = await pool.query(
    `SELECT ${PRODUCT_COLUMNS} ${BASE_FROM}
      WHERE p.is_active AND p.slug = $1`,
    [slug]
  );

  return rows.length === 0 ? null : toDetail(rows[0]);
}

/**
 * Categories with the number of *active* products in each.
 *
 * The count is a `LEFT JOIN` + `FILTER` rather than an inner join so an empty
 * category still appears (the home page shows the whole grid), and inactive
 * products do not inflate the number the card advertises.
 */
export async function listCategories(pool) {
  const { rows } = await pool.query(`
    SELECT c.id,
           c.slug,
           c.name,
           c.description,
           c.image,
           count(p.id) FILTER (WHERE p.is_active)::int AS product_count
      FROM tbl_kategori c
      LEFT JOIN tbl_produk p ON p.category_id = c.id
     GROUP BY c.id
     ORDER BY c.sort_order, c.id
  `);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    image: row.image,
    productCount: row.product_count,
  }));
}

/** Every brand, in insertion order. */
export async function listBrands(pool) {
  const { rows } = await pool.query('SELECT id, slug, name FROM tbl_merek ORDER BY id');

  return rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name }));
}

/**
 * The sort options are part of the API contract, not of the data, so they are
 * fixed here instead of being derived from whatever the catalogue contains.
 */
const SORT_LABELS = [
  { value: 'newest', label: 'Terbaru' },
  { value: 'price-asc', label: 'Harga termurah' },
  { value: 'price-desc', label: 'Harga tertinggi' },
  { value: 'rating', label: 'Rating tertinggi' },
];

/**
 * Facets for the shop filter panel, computed from active products only.
 *
 * Colours and sizes are un-nested from the TEXT[] columns and de-duplicated in
 * SQL; the price range comes from the same scan so the bounds always match the
 * products a visitor can actually filter to. An empty catalogue returns an
 * empty range rather than nulls, which the slider cannot render.
 */
export async function listFilterOptions(pool) {
  const { rows } = await pool.query(`
    SELECT
      COALESCE(min(p.price), 0)::bigint AS min_price,
      COALESCE(max(p.price), 0)::bigint AS max_price,
      COALESCE(
        (SELECT array_agg(value ORDER BY value)
           FROM (
             SELECT DISTINCT unnest(colors) AS value
               FROM tbl_produk
              WHERE is_active
           ) AS colour_values),
        '{}'::text[]
      ) AS colors,
      COALESCE(
        (SELECT array_agg(value ORDER BY value)
           FROM (
             SELECT DISTINCT unnest(sizes) AS value
               FROM tbl_produk
              WHERE is_active
           ) AS size_values),
        '{}'::text[]
      ) AS sizes
      FROM tbl_produk p
     WHERE p.is_active
  `);

  const row = rows[0];

  return {
    priceRange: { min: row.min_price, max: row.max_price },
    colors: row.colors,
    sizes: row.sizes,
    sortOptions: SORT_LABELS,
  };
}

/**
 * "Related" products for a detail page.
 *
 * Two signals, strongest first: same category, then same brand. The remaining
 * slots go to the best-rated products so a small catalogue still fills the
 * rail. A product that matches both signals is returned once, because the two
 * `UNION ALL` branches are ordered by a rank and de-duplicated on id.
 *
 * An unknown or inactive source product has no related list, and the storefront
 * treats that as "show nothing" rather than as an error.
 */
export async function listRelatedProducts(pool, slug, limit = 4) {
  const source = await pool.query(
    'SELECT id, category_id, brand_id FROM tbl_produk WHERE is_active AND slug = $1',
    [slug]
  );

  if (source.rows.length === 0) return [];

  const { id, category_id: categoryId, brand_id: brandId } = source.rows[0];

  const { rows } = await pool.query(
    `WITH ranked AS (
       SELECT p.id, 0 AS rank
         FROM tbl_produk p
        WHERE p.is_active AND p.id <> $1 AND p.category_id = $2
       UNION ALL
       SELECT p.id, 1 AS rank
         FROM tbl_produk p
        WHERE p.is_active AND p.id <> $1 AND p.brand_id = $3 AND p.brand_id IS NOT NULL
       UNION ALL
       -- Fallback so a small catalogue still fills the rail: everything else,
       -- ranked last, best-rated first by the ORDER BY below.
       SELECT p.id, 2 AS rank
         FROM tbl_produk p
        WHERE p.is_active AND p.id <> $1
     ),
     best AS (
       SELECT id, min(rank) AS rank FROM ranked GROUP BY id
     )
     SELECT ${PRODUCT_COLUMNS}
       FROM best
       JOIN tbl_produk p ON p.id = best.id
       JOIN tbl_kategori c ON c.id = p.category_id
       LEFT JOIN tbl_merek b ON b.id = p.brand_id
      ORDER BY best.rank, p.rating DESC, p.id ASC
      LIMIT $4`,
    [id, categoryId, brandId, limit]
  );

  return rows.map(toSummary);
}
