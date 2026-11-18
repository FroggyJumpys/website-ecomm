import { AppError } from '../lib/errors.js';
import { toSafeCatalogMoney } from '../lib/catalogMoney.js';

/**
 * Admin catalogue reads.
 *
 * The storefront reader in `db/catalog.js` answers "what can a visitor buy?" and
 * therefore hides inactive rows and counts only active products. The admin
 * panel answers a different question — "what does the catalogue contain?" — so
 * this module deliberately drops the `is_active` filter from both the product
 * list and the taxonomy counts. An administrator who hides a product must still
 * see it to unhide it, and a category whose only products are hidden must not
 * look empty when the panel warns that deleting it would orphan products.
 *
 * Money columns are cast to text before they leave PostgreSQL. The `pg` driver
 * parses BIGINT through `Number`, which rounds anything above
 * `Number.MAX_SAFE_INTEGER`; reading text and checking it here keeps a corrupt
 * row visible as a `409` instead of silently changing a price on screen.
 */

/** Shared column list; aliases are qualified because the query joins. */
const PRODUCT_SELECT = `
  p.id,
  p.slug,
  p.name,
  p.price::text AS price,
  p.compare_at_price::text AS compare_at_price,
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
  p.is_active,
  p.version,
  p.created_at,
  p.updated_at,
  c.id AS category_id,
  c.slug AS category_slug,
  c.name AS category_name,
  b.id AS brand_id,
  b.slug AS brand_slug,
  b.name AS brand_name
`;

const PRODUCT_FROM = `
  FROM tbl_produk p
  JOIN tbl_kategori c ON c.id = p.category_id
  LEFT JOIN tbl_merek b ON b.id = p.brand_id
`;

/**
 * Sort options the admin list accepts, mapped to fixed SQL. The route validator
 * has already rejected anything else; the fallback here only protects a caller
 * that skips it.
 */
const SORT_SQL = {
  newest: 'p.created_at DESC, p.id DESC',
  'name-asc': 'p.name ASC, p.id ASC',
  'price-asc': 'p.price ASC, p.id ASC',
  'price-desc': 'p.price DESC, p.id DESC',
};

function notFound() {
  return new AppError(404, 'PRODUCT_NOT_FOUND', 'Produk ini tidak ditemukan.');
}

/** `NUMERIC` arrives as a string from `pg`; the panel expects a number. */
function toRating(value) {
  return value === null ? 0 : Number(value);
}

/**
 * One row → the admin product shape.
 *
 * Exported because the product write store and the HTTP layer return the same
 * shape; a second mapper would drift from this one the first time a column is
 * added.
 */
export function toAdminProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    price: toSafeCatalogMoney(row.price),
    compareAtPrice: row.compare_at_price === null ? null : toSafeCatalogMoney(row.compare_at_price),
    rating: toRating(row.rating),
    reviewCount: row.review_count,
    stock: row.stock,
    material: row.material,
    dimensions: row.dimensions,
    description: row.description,
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    images: row.images ?? [],
    isNew: row.is_new,
    isTrending: row.is_trending,
    isActive: row.is_active,
    category: { id: row.category_id, slug: row.category_slug, name: row.category_name },
    brand:
      row.brand_id === null
        ? null
        : { id: row.brand_id, slug: row.brand_slug, name: row.brand_name },
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * The WHERE clause for the admin list.
 *
 * Search matches name, slug, category name and brand name — the four fields an
 * operator types into the one search box. `%`, `_` and `\` in the term are
 * escaped so a search for `%` finds the literal character rather than every row.
 */
function buildWhere({ search, category, brand, visibility }) {
  const conditions = [];
  const values = [];

  if (visibility === 'active') conditions.push('p.is_active');
  if (visibility === 'hidden') conditions.push('NOT p.is_active');

  if (search) {
    values.push(search);
    conditions.push(
      `lower(p.name || ' ' || p.slug || ' ' || c.name || ' ' || coalesce(b.name, ''))
        LIKE '%' || replace(replace(replace(lower($${values.length}), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'`
    );
  }

  if (category) {
    values.push(category);
    conditions.push(`c.slug = $${values.length}`);
  }

  if (brand) {
    values.push(brand);
    conditions.push(`b.slug = $${values.length}`);
  }

  return { where: conditions.length === 0 ? 'TRUE' : conditions.join(' AND '), values };
}

export function createAdminCatalogStore(pool) {
  /**
   * Runs `read` inside one repeatable-read, read-only snapshot.
   *
   * `BEGIN ISOLATION LEVEL …` is a single statement rather than `BEGIN` followed
   * by `SET TRANSACTION`, which keeps the whole page load at four round trips:
   * open, count, page, close.
   */
  async function withReadSnapshot(read) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result = await read(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    /**
     * One page plus the total for the same filters.
     *
     * Both run in a single repeatable-read transaction so the count and the
     * rows cannot disagree when a write lands between them — a page that
     * reports 7 products while showing 6 of them is a bug the panel cannot
     * explain. The query count stays at four regardless of page size.
     */
    async listProducts(filters) {
      const { where, values } = buildWhere(filters);
      const offset = (filters.page - 1) * filters.limit;

      return withReadSnapshot(async (client) => {
        const countResult = await client.query(
          `SELECT count(*)::int AS total ${PRODUCT_FROM} WHERE ${where}`,
          values
        );
        const total = countResult.rows[0].total;

        const pageResult = await client.query(
          `SELECT ${PRODUCT_SELECT} ${PRODUCT_FROM}
            WHERE ${where}
            ORDER BY ${SORT_SQL[filters.sort] ?? SORT_SQL.newest}
            LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, filters.limit, offset]
        );

        return {
          data: pageResult.rows.map(toAdminProduct),
          meta: {
            page: filters.page,
            limit: filters.limit,
            total,
            totalPages: Math.ceil(total / filters.limit),
          },
        };
      });
    },

    /** One product by id, hidden or not. */
    async getProduct(id) {
      const { rows } = await pool.query(
        `SELECT ${PRODUCT_SELECT} ${PRODUCT_FROM} WHERE p.id = $1`,
        [id]
      );

      if (rows.length === 0) throw notFound();

      return toAdminProduct(rows[0]);
    },

    /** Categories with the total number of products in each, hidden included. */
    async listCategories() {
      const { rows } = await pool.query(`
        SELECT c.id,
               c.slug,
               c.name,
               c.description,
               c.image,
               c.sort_order,
               count(p.id)::int AS product_count
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
        sortOrder: row.sort_order,
        productCount: row.product_count,
      }));
    },

    /** Brands with the total number of products in each, hidden included. */
    async listBrands() {
      const { rows } = await pool.query(`
        SELECT b.id,
               b.slug,
               b.name,
               count(p.id)::int AS product_count
          FROM tbl_merek b
          LEFT JOIN tbl_produk p ON p.brand_id = b.id
         GROUP BY b.id
         ORDER BY b.id
      `);

      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        productCount: row.product_count,
      }));
    },
  };
}
