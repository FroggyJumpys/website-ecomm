import { AppError } from '../lib/errors.js';
import { slugify, suffixedSlug } from '../lib/catalogSlug.js';

/**
 * Category and brand writes.
 *
 * Both tables have the same lifecycle, so they share one generic implementation
 * parameterised by a small descriptor. The important rule is the delete guard:
 * the schema lets a brand be deleted with `ON DELETE SET NULL`, which would
 * quietly strip the brand from every product that used it. The panel needs the
 * opposite — refuse and tell the operator to move the products first — so a
 * product, hidden or not, always blocks the delete.
 *
 * Lock order is advisory key → taxonomy row. Product writes share-lock the
 * parent row while resolving it, so a delete that holds `FOR UPDATE` cannot
 * commit between a product's validation and its insert.
 */

const CATEGORY = {
  table: 'tbl_kategori',
  productColumn: 'category_id',
  advisoryKey: 'admin_catalog:tbl_kategori',
  columns: ['slug', 'name', 'description', 'image', 'sort_order'],
  notFound: () => new AppError(404, 'CATEGORY_NOT_FOUND', 'Kategori ini tidak ditemukan.'),
  inUse: (id) =>
    new AppError(
      409,
      'TAXONOMY_IN_USE',
      'Kategori ini masih dipakai produk. Pindahkan produknya dulu sebelum menghapus.',
      { taxonomy: 'category', id }
    ),
  duplicateSlug: () =>
    new AppError(422, 'VALIDATION_ERROR', 'Slug kategori ini sudah dipakai.', {
      field: 'slug',
      message: 'Slug kategori ini sudah dipakai.',
    }),
};

const BRAND = {
  table: 'tbl_merek',
  productColumn: 'brand_id',
  advisoryKey: 'admin_catalog:tbl_merek',
  columns: ['slug', 'name'],
  notFound: () => new AppError(404, 'BRAND_NOT_FOUND', 'Merek ini tidak ditemukan.'),
  inUse: (id) =>
    new AppError(
      409,
      'TAXONOMY_IN_USE',
      'Merek ini masih dipakai produk. Pindahkan produknya dulu sebelum menghapus.',
      { taxonomy: 'brand', id }
    ),
  duplicateSlug: () =>
    new AppError(422, 'VALIDATION_ERROR', 'Slug merek ini sudah dipakai.', {
      field: 'slug',
      message: 'Slug merek ini sudah dipakai.',
    }),
};

/**
 * Client field → column, per descriptor. A fixed map, so a request key never
 * reaches the SQL text.
 */
const COLUMN_BY_FIELD = {
  name: 'name',
  slug: 'slug',
  description: 'description',
  image: 'image',
  sortOrder: 'sort_order',
};

/** The order columns are written in, so the generated SQL is stable. */
const WRITE_ORDER = ['name', 'slug', 'description', 'image', 'sortOrder'];

/** Categories need their count and their order; brands only name and count. */
function categorySelect() {
  return `
    SELECT c.id, c.slug, c.name, c.description, c.image, c.sort_order,
           count(p.id)::int AS product_count
      FROM tbl_kategori c
      LEFT JOIN tbl_produk p ON p.category_id = c.id
     WHERE c.id = $1
     GROUP BY c.id
  `;
}

function brandSelect() {
  return `
    SELECT b.id, b.slug, b.name, count(p.id)::int AS product_count
      FROM tbl_merek b
      LEFT JOIN tbl_produk p ON p.brand_id = b.id
     WHERE b.id = $1
     GROUP BY b.id
  `;
}

function toCategory(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    image: row.image,
    sortOrder: row.sort_order,
    productCount: row.product_count,
  };
}

function toBrand(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    productCount: row.product_count,
  };
}

const SELECTS = {
  tbl_kategori: { sql: categorySelect, map: toCategory },
  tbl_merek: { sql: brandSelect, map: toBrand },
};

export function createAdminTaxonomyStore(pool) {
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

  async function lockTable(client, descriptor) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [descriptor.advisoryKey]);
  }

  async function readOne(client, descriptor, id) {
    const select = SELECTS[descriptor.table];
    const { rows } = await client.query(select.sql(), [id]);

    if (rows.length === 0) throw descriptor.notFound();

    return select.map(rows[0]);
  }

  /**
   * Allocates a free slug inside the advisory lock.
   *
   * Two cases, deliberately different:
   *
   *  - **Derived** (no slug sent): the operator never chose it, so a collision
   *    is answered with the next free suffix and the response says what the row
   *    actually got.
   *  - **Explicit** (the operator typed one): they asked for that exact slug, so
   *    a collision is a `422`. Silently turning `meja` into `meja-2` would leave
   *    the operator with a URL they did not choose and did not see.
   */
  async function allocateSlug(client, descriptor, { name, slug, exceptId = null }) {
    const { rows } = await client.query(`SELECT id, slug FROM ${descriptor.table}`);
    const taken = new Set(rows.map((row) => row.slug));

    if (exceptId !== null) {
      // A rename that keeps its own slug is not a collision with itself.
      const own = rows.find((row) => row.id === exceptId);
      if (own) taken.delete(own.slug);
    }

    const explicit = slug !== undefined && slug !== null && slug !== '';
    const base = explicit ? slug : slugify(name);

    if (explicit && taken.has(base)) throw descriptor.duplicateSlug();

    return suffixedSlug(base, (candidate) => taken.has(candidate));
  }

  async function insert(client, descriptor, values) {
    const columns = Object.keys(values);
    const placeholders = columns.map((_, index) => `$${index + 1}`);

    try {
      const { rows } = await client.query(
        `INSERT INTO ${descriptor.table} (${columns.join(', ')})
              VALUES (${placeholders.join(', ')})
           RETURNING id`,
        Object.values(values)
      );

      return rows[0].id;
    } catch (error) {
      if (error.code === '23505') throw descriptor.duplicateSlug();
      throw error;
    }
  }

  async function updateRow(client, descriptor, id, patch) {
    const locked = await client.query(
      `SELECT id FROM ${descriptor.table} WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (locked.rows.length === 0) throw descriptor.notFound();

    let slug = patch.slug;

    if (patch.slug !== undefined) {
      slug = await allocateSlug(client, descriptor, {
        name: patch.name,
        slug: patch.slug,
        exceptId: id,
      });
    }

    const fields = WRITE_ORDER.filter((field) => field !== 'slug' && patch[field] !== undefined);

    const assignments = fields.map((field, index) => `${COLUMN_BY_FIELD[field]} = $${index + 1}`);
    const values = fields.map((field) => patch[field]);

    if (slug !== undefined) {
      assignments.push(`slug = $${assignments.length + 1}`);
      values.push(slug);
    }

    if (assignments.length > 0) {
      try {
        await client.query(
          `UPDATE ${descriptor.table}
              SET ${assignments.join(', ')}
            WHERE id = $${values.length + 1}`,
          [...values, id]
        );
      } catch (error) {
        if (error.code === '23505') throw descriptor.duplicateSlug();
        throw error;
      }
    }

    return readOne(client, descriptor, id);
  }

  async function removeRow(client, descriptor, id) {
    const locked = await client.query(
      `SELECT id FROM ${descriptor.table} WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (locked.rows.length === 0) throw descriptor.notFound();

    // Any product, hidden or not, blocks the delete. The brand FK would
    // otherwise silently set `brand_id` to NULL on every product that used it.
    const used = await client.query(
      `SELECT 1 FROM tbl_produk WHERE ${descriptor.productColumn} = $1 LIMIT 1`,
      [id]
    );

    if (used.rows.length > 0) throw descriptor.inUse(id);

    try {
      await client.query(`DELETE FROM ${descriptor.table} WHERE id = $1`, [id]);
    } catch (error) {
      if (error.code === '23503') throw descriptor.inUse(id);
      throw error;
    }

    return null;
  }

  async function createWith(client, descriptor, input) {
    const slug = await allocateSlug(client, descriptor, {
      name: input.name,
      slug: input.slug,
    });

    const values = { slug, name: input.name };

    if (descriptor.table === 'tbl_kategori') {
      values.description = input.description ?? '';
      values.image = input.image ?? '';
      values.sort_order = input.sortOrder ?? 0;
    }

    const id = await insert(client, descriptor, values);

    return readOne(client, descriptor, id);
  }

  return {
    createCategory(input) {
      return transaction(async (client) => {
        await lockTable(client, CATEGORY);
        return createWith(client, CATEGORY, input);
      });
    },

    updateCategory(id, patch) {
      return transaction(async (client) => {
        await lockTable(client, CATEGORY);
        return updateRow(client, CATEGORY, id, patch);
      });
    },

    removeCategory(id) {
      return transaction(async (client) => {
        await lockTable(client, CATEGORY);
        return removeRow(client, CATEGORY, id);
      });
    },

    createBrand(input) {
      return transaction(async (client) => {
        await lockTable(client, BRAND);
        return createWith(client, BRAND, input);
      });
    },

    updateBrand(id, patch) {
      return transaction(async (client) => {
        await lockTable(client, BRAND);
        return updateRow(client, BRAND, id, patch);
      });
    },

    removeBrand(id) {
      return transaction(async (client) => {
        await lockTable(client, BRAND);
        return removeRow(client, BRAND, id);
      });
    },
  };
}
