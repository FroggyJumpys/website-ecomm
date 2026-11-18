import { AppError } from '../lib/errors.js';
import { slugify, suffixedSlug } from '../lib/catalogSlug.js';
import { toSafeCatalogMoney } from '../lib/catalogMoney.js';
import { toAdminProduct } from './admin-catalog.js';

/**
 * Product writes.
 *
 * Every write runs in one transaction that starts with an advisory lock on the
 * product table. Two things depend on it:
 *
 *  - **Slug allocation.** Two administrators creating "Kursi Rotan" at the same
 *    moment must get `kursi-rotan` and `kursi-rotan-2`, not a unique violation.
 *    The lock makes "read the taken slugs, then insert" atomic without locking
 *    any product rows.
 *  - **Update ordering.** A single lock order (advisory key, then the product
 *    row) is what keeps an admin write and a checkout from deadlocking.
 *
 * The advisory key is a constant string shared by every writer of
 * `tbl_produk`, so it costs nothing when uncontended and only serialises the
 * rare simultaneous writes.
 */

/** Fixed field → column map. A client key never reaches the SQL text. */
const COLUMN_BY_FIELD = {
  name: 'name',
  slug: 'slug',
  categorySlug: 'category_id',
  brandSlug: 'brand_id',
  price: 'price',
  compareAtPrice: 'compare_at_price',
  stock: 'stock',
  material: 'material',
  dimensions: 'dimensions',
  description: 'description',
  colors: 'colors',
  sizes: 'sizes',
  images: 'images',
  isNew: 'is_new',
  isTrending: 'is_trending',
  isActive: 'is_active',
};

/**
 * The order columns are written in. Fixed, so the generated `SET` clause is
 * predictable in logs and never depends on the order of the request body.
 */
const WRITE_ORDER = [
  'name',
  'slug',
  'categorySlug',
  'brandSlug',
  'price',
  'compareAtPrice',
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
];

const PRODUCT_READ = `
  SELECT p.id,
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
    FROM tbl_produk p
    JOIN tbl_kategori c ON c.id = p.category_id
    LEFT JOIN tbl_merek b ON b.id = p.brand_id
`;

function notFound() {
  return new AppError(404, 'PRODUCT_NOT_FOUND', 'Produk ini tidak ditemukan.');
}

function conflict() {
  return new AppError(
    409,
    'PRODUCT_CONFLICT',
    'Produk sudah diubah di tempat lain. Muat ulang lalu simpan kembali.'
  );
}

function inUse(productId) {
  return new AppError(
    409,
    'PRODUCT_IN_USE',
    'Produk ini masih ada di keranjang pembeli. Kosongkan keranjangnya dulu.',
    { productId }
  );
}

function invalidField(field, message) {
  return new AppError(422, 'VALIDATION_ERROR', message, { field, message });
}

/** Serialises every writer of `tbl_produk` for the rest of the transaction. */
async function lockProductTable(client) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('admin_catalog:tbl_produk'))`);
}

/**
 * Resolves the parent rows a product write references.
 *
 * `FOR SHARE` on both sides is deliberate: it lets two product writes that name
 * the same category proceed together, while a taxonomy delete (which takes
 * `FOR UPDATE`) must wait. Without the share lock a delete could commit between
 * the lookup and the insert and leave the product pointing at a missing row.
 */
async function resolveParent(client, sql, slug, field, message) {
  const { rows } = await client.query(sql, [slug]);

  if (rows.length === 0) throw invalidField(field, message);

  return rows[0].id;
}

async function resolveCategory(client, slug) {
  if (slug === undefined) return undefined;

  return resolveParent(
    client,
    'SELECT id FROM tbl_kategori WHERE slug = $1 FOR SHARE',
    slug,
    'categorySlug',
    'Pilih kategori yang terdaftar.'
  );
}

async function resolveBrand(client, slug) {
  if (slug === undefined) return undefined;
  if (slug === null) return null;

  return resolveParent(
    client,
    'SELECT id FROM tbl_merek WHERE slug = $1 FOR SHARE',
    slug,
    'brandSlug',
    'Pilih merek yang terdaftar.'
  );
}

/**
 * Turns validated input into the column values the insert needs.
 *
 * `slug` stays undefined here so `create` can allocate one under the advisory
 * lock; everything else maps straight through, with the two slug fields already
 * replaced by the ids resolved above.
 */
function insertValues(input, categoryId, brandId) {
  return {
    name: input.name,
    category_id: categoryId,
    brand_id: brandId ?? null,
    price: input.price,
    compare_at_price: input.compareAtPrice ?? null,
    stock: input.stock ?? 0,
    material: input.material,
    dimensions: input.dimensions,
    description: input.description,
    colors: input.colors,
    sizes: input.sizes ?? [],
    images: input.images,
    is_new: input.isNew ?? false,
    is_trending: input.isTrending ?? false,
    is_active: input.isActive ?? true,
  };
}

/** Reads one product in the admin shape, inside the caller's transaction. */
async function readProduct(client, id) {
  const { rows } = await client.query(`${PRODUCT_READ} WHERE p.id = $1`, [id]);

  if (rows.length === 0) throw notFound();

  return toAdminProduct(rows[0]);
}

export function createAdminProductStore(pool) {
  async function transaction(run) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function create(input) {
    return transaction(async (client) => {
      await lockProductTable(client);

      const categoryId = await resolveCategory(client, input.categorySlug);
      const brandId = await resolveBrand(client, input.brandSlug);

      // Same rule as the taxonomy store: a slug the operator typed is theirs,
      // so a collision is their error to fix; a slug derived from the name was
      // never chosen, so it is suffixed and the response says what it became.
      const explicit = input.slug !== undefined && input.slug !== null && input.slug !== '';
      const base = explicit ? input.slug : slugify(input.name);
      const { rows: slugRows } = await client.query('SELECT slug FROM tbl_produk');
      const taken = new Set(slugRows.map((row) => row.slug));

      if (explicit && taken.has(base)) {
        throw invalidField('slug', 'Slug ini sudah dipakai. Coba nama lain.');
      }

      const slug = suffixedSlug(base, (candidate) => taken.has(candidate));

      const values = insertValues(input, categoryId, brandId);

      let inserted;

      try {
        inserted = await client.query(
          `INSERT INTO tbl_produk (
             slug, name, category_id, brand_id, price, compare_at_price, stock,
             material, dimensions, description, colors, sizes, images,
             is_new, is_trending, is_active
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           RETURNING id`,
          [
            slug,
            values.name,
            values.category_id,
            values.brand_id,
            values.price,
            values.compare_at_price,
            values.stock,
            values.material,
            values.dimensions,
            values.description,
            values.colors,
            values.sizes,
            values.images,
            values.is_new,
            values.is_trending,
            values.is_active,
          ]
        );
      } catch (error) {
        // The advisory lock makes this unreachable in practice, but a unique
        // violation must still be a client-visible 422 rather than a 500.
        if (error.code === '23505') {
          throw invalidField('slug', 'Slug ini sudah dipakai. Coba nama lain.');
        }

        throw error;
      }

      return readProduct(client, inserted.rows[0].id);
    });
  }

  async function update(id, patch, expectedVersion) {
    return transaction(async (client) => {
      await lockProductTable(client);

      const locked = await client.query(
        `SELECT id, price::text AS price, compare_at_price::text AS compare_at_price, version
           FROM tbl_produk
          WHERE id = $1
            FOR UPDATE`,
        [id]
      );

      if (locked.rows.length === 0) throw notFound();

      const current = locked.rows[0];

      if (current.version !== expectedVersion) throw conflict();

      const categoryId = await resolveCategory(client, patch.categorySlug);
      const brandId = await resolveBrand(client, patch.brandSlug);

      // Cross-field validation uses the state the row will have *after* the
      // patch, not the patch alone: setting only compare-at price must still be
      // checked against the stored price. Money is compared exactly — the
      // stored price arrives as text and `Number` would round it.
      const effectivePrice =
        patch.price !== undefined ? patch.price : toSafeCatalogMoney(current.price);
      const effectiveCompareAt =
        patch.compareAtPrice !== undefined
          ? patch.compareAtPrice
          : current.compare_at_price === null
            ? null
            : Number(current.compare_at_price);

      if (effectiveCompareAt !== null && effectiveCompareAt <= effectivePrice) {
        throw invalidField(
          'compareAtPrice',
          'Harga sebelum diskon harus lebih tinggi dari harga jual.'
        );
      }

      /** Value for one patch field in the shape its column expects. */
      const valueFor = (field) => {
        if (field === 'categorySlug') return categoryId;
        if (field === 'brandSlug') return brandId;
        return patch[field];
      };

      const fields = WRITE_ORDER.filter(
        (field) => patch[field] !== undefined && valueFor(field) !== undefined
      );

      if (fields.length === 0) return readProduct(client, id);

      const assignments = fields.map((field, index) => `${COLUMN_BY_FIELD[field]} = $${index + 1}`);
      const values = fields.map(valueFor);

      const result = await client.query(
        `UPDATE tbl_produk
            SET ${assignments.join(', ')}
          WHERE id = $${fields.length + 1} AND version = $${fields.length + 2}`,
        [...values, id, expectedVersion]
      );

      // The version check above already matched, so a miss here means a write
      // landed between the SELECT and the UPDATE despite the row lock.
      if (result.rowCount === 0) throw conflict();

      return readProduct(client, id);
    });
  }

  return {
    create,
    update,

    /** Hiding is an ordinary update; the panel's delete button calls `remove`. */
    hide(id, expectedVersion) {
      return update(id, { isActive: false }, expectedVersion);
    },

    /**
     * Deletes a product, refusing while any cart still holds a line for it.
     *
     * The refusals protect two different things:
     *
     *  - a cart line would be cascade-deleted, silently emptying a shopper's
     *    basket mid-session;
     *  - a checkout that has already locked the product is about to snapshot
     *    it, and deleting underneath it would fail the order for a reason the
     *    customer cannot act on.
     *
     * The product row is locked first, which is the same lock `cart.add` and
     * `checkout.create` take, so a cart write either lands before the check (and
     * is seen) or after the delete (and then fails because the product is
     * gone). The FK from `tbl_item_keranjang` is the final guard; a `23503`
     * reaching here means a line won the race after the check, and it is
     * reported as the same 409 rather than a 500.
     *
     * Historical order lines survive: their `product_id` is `ON DELETE SET
     * NULL`, and the name, price, variant and image are snapshots.
     */
    async remove(id, expectedVersion) {
      return transaction(async (client) => {
        await lockProductTable(client);

        const locked = await client.query(
          'SELECT version FROM tbl_produk WHERE id = $1 FOR UPDATE',
          [id]
        );

        if (locked.rows.length === 0) throw notFound();
        if (locked.rows[0].version !== expectedVersion) throw conflict();

        const inCart = await client.query(
          'SELECT 1 FROM tbl_item_keranjang WHERE product_id = $1 LIMIT 1',
          [id]
        );

        if (inCart.rows.length > 0) throw inUse(id);

        try {
          await client.query('DELETE FROM tbl_produk WHERE id = $1', [id]);
        } catch (error) {
          if (error.code === '23503') throw inUse(id);
          throw error;
        }

        return null;
      });
    },
  };
}
