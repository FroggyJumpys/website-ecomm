import { AppError } from '../lib/errors.js';
import { toSummary } from './catalog.js';

/**
 * Wishlist SQL.
 *
 * The relationship lives in `tbl_favorit`, whose `(user_id, product_id)` unique
 * constraint makes "saved once" a database fact rather than an application
 * promise. Ownership is always part of the WHERE clause, so another customer's
 * row is indistinguishable from a row that does not exist.
 *
 * Saved rows are not snapshots: every read joins `tbl_produk`, so the customer
 * sees today's price and stock, and a product the admin hides simply stops
 * appearing — the saved relationship survives and returns when it is reactivated.
 */

const ITEM_COLUMNS = `
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

const ITEM_FROM = `
  FROM tbl_favorit f
  JOIN tbl_produk p ON p.id = f.product_id
  JOIN tbl_kategori c ON c.id = p.category_id
  LEFT JOIN tbl_merek b ON b.id = p.brand_id
`;

/** The same columns without the wishlist join, for a product by id. */
const PRODUCT_FROM = `
  FROM tbl_produk p
  JOIN tbl_kategori c ON c.id = p.category_id
  LEFT JOIN tbl_merek b ON b.id = p.brand_id
`;

/** The card shape plus the variant arrays the wishlist row offers. */
function toItem(row) {
  return {
    ...toSummary(row),
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
  };
}

function productNotFound() {
  return new AppError(404, 'PRODUCT_NOT_FOUND', 'Produk ini tidak ada di katalog kami.');
}

export function createWishlistStore(pool) {
  return {
    /**
     * Newest saved first. `f.id DESC` only breaks ties: two rows saved in the
     * same transaction share a `created_at`, and an unstable order would make
     * the list jump between reloads.
     */
    async list(userId) {
      const { rows } = await pool.query(
        `SELECT ${ITEM_COLUMNS} ${ITEM_FROM}
          WHERE f.user_id = $1 AND p.is_active
          ORDER BY f.created_at DESC, f.id DESC`,
        [userId]
      );

      return rows.map(toItem);
    },

    /**
     * Saves a product and returns it.
     *
     * The product is read in the same statement that inserts the relationship,
     * so the 404 and the insert cannot disagree: a product hidden between two
     * separate queries would be saved after being reported missing.
     *
     * `ON CONFLICT DO NOTHING` is what makes a repeat save idempotent and what
     * keeps two simultaneous tabs from turning the unique constraint into a
     * 23505.
     */
    async save(userId, productId) {
      const { rows } = await pool.query(
        `WITH product AS (
           SELECT ${ITEM_COLUMNS} ${PRODUCT_FROM}
            WHERE p.id = $1 AND p.is_active
         ), saved AS (
           INSERT INTO tbl_favorit (user_id, product_id)
           SELECT $2, id FROM product
           ON CONFLICT ON CONSTRAINT tbl_favorit_user_product_key DO NOTHING
           RETURNING product_id
         )
         SELECT * FROM product`,
        [productId, userId]
      );

      if (rows.length === 0) throw productNotFound();

      return toItem(rows[0]);
    },

    /**
     * Removes the relationship. Deleting nothing is success: the caller asked
     * for the product not to be saved, and it is not.
     */
    async remove(userId, productId) {
      await pool.query('DELETE FROM tbl_favorit WHERE user_id = $1 AND product_id = $2', [
        userId,
        productId,
      ]);

      return null;
    },
  };
}
