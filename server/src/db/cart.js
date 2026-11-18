import { AppError } from '../lib/errors.js';
import { createWithTransaction } from '../config/db.js';
import { toSummary } from './catalog.js';

/**
 * Cart SQL.
 *
 * A cart has exactly one owner: an account (`user_id`) or an anonymous visitor
 * (`guest_token`, which holds a digest, never the cookie itself). Every
 * statement takes the owner, never a cart id from the request, so one owner's
 * cart is not addressable by another.
 *
 * Three rules shape the writes:
 *
 *  - **Stock belongs to the product, not the variant.** `tbl_produk.stock` is a
 *    single number while a cart may hold the same sofa in two colours, so the
 *    check sums every variant of the product before comparing.
 *  - **The cart row is the lock.** Every mutation starts by locking the owner's
 *    cart, which serialises two tabs adding the same product and turns a race
 *    into a 409 instead of a cart holding more than the workshop has.
 *  - **Nothing is reserved.** Adding to a cart never touches stock; checkout in
 *    04g re-reads it. A cart is a wish, not a hold.
 */

const ITEM_COLUMNS = `
  i.id AS item_id,
  i.quantity,
  i.color,
  i.size,
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
  p.images,
  p.is_new,
  p.is_trending,
  p.is_active,
  p.colors,
  p.sizes,
  c.slug AS category_slug,
  c.name AS category_name,
  b.slug AS brand_slug,
  b.name AS brand_name
`;

const ITEM_FROM = `
  FROM tbl_item_keranjang i
  JOIN tbl_produk p ON p.id = i.product_id
  JOIN tbl_kategori c ON c.id = p.category_id
  LEFT JOIN tbl_merek b ON b.id = p.brand_id
`;

function productNotFound() {
  return new AppError(404, 'PRODUCT_NOT_FOUND', 'Produk ini tidak ada di katalog kami.');
}

function itemNotFound() {
  return new AppError(404, 'CART_ITEM_NOT_FOUND', 'Barang ini tidak ada di keranjangmu.');
}

function invalidVariant() {
  return new AppError(
    422,
    'INVALID_VARIANT',
    'Pilihan warna atau ukuran ini tidak tersedia untuk produk tersebut.'
  );
}

function insufficientStock(available, requested) {
  const message =
    available <= 0
      ? 'Stok tidak mencukupi. Produk ini sedang habis.'
      : `Stok tidak mencukupi. Tersisa ${available} unit.`;

  return new AppError(409, 'INSUFFICIENT_STOCK', message, { available, requested });
}

/**
 * The owner key on `tbl_keranjang`. Exactly one of the two is set, because the
 * table's CHECK constraint forbids both — and so does this function, which is
 * the only place a cart is looked up.
 */
function ownerKey(owner) {
  if (owner?.userId) return { column: 'user_id', value: owner.userId };
  if (owner?.guestTokenHash) return { column: 'guest_token', value: owner.guestTokenHash };

  throw new Error('A cart owner needs either a user id or a guest token hash.');
}

/** What the customer chose, checked against what the product offers today. */
function hasVariantIssue(product, color, size) {
  const colors = product.colors ?? [];
  const sizes = product.sizes ?? [];

  const colorOk = colors.length === 0 ? color === '' : colors.includes(color);
  const sizeOk = sizes.length === 0 ? size === '' : sizes.includes(size);

  return !colorOk || !sizeOk;
}

function lineIssues(row) {
  const issues = [];

  if (!row.is_active) {
    issues.push({ code: 'PRODUCT_UNAVAILABLE', message: 'Produk ini sedang tidak dijual.' });
  }

  if (hasVariantIssue(row, row.color, row.size)) {
    issues.push({
      code: 'INVALID_VARIANT',
      message: 'Pilihan warna atau ukuran ini sudah tidak tersedia.',
    });
  }

  if (row.quantity > row.stock) {
    issues.push({ code: 'INSUFFICIENT_STOCK', message: `Stok tersisa ${row.stock} unit.` });
  }

  return issues;
}

function toItem(row) {
  return {
    ...toSummary(row),
    id: row.item_id,
    productId: row.id,
    key: `${row.id}::${row.color}::${row.size}`,
    color: row.color,
    size: row.size,
    quantity: row.quantity,
    lineTotal: row.price * row.quantity,
    isAvailable: lineIssues(row).length === 0,
    issues: lineIssues(row),
  };
}

/**
 * Turns rows into the snapshot the API returns. A total that `Number` cannot
 * hold exactly is refused rather than rounded: the customer must never be shown
 * a price the server cannot charge.
 */
function toSnapshot(rows) {
  const items = rows.map(toItem);

  let subtotal = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.lineTotal)) {
      throw new AppError(
        409,
        'CART_TOTAL_TOO_LARGE',
        'Total keranjang terlalu besar untuk dihitung. Kurangi jumlah barang.'
      );
    }
    subtotal += item.lineTotal;
  }

  if (!Number.isSafeInteger(subtotal)) {
    throw new AppError(
      409,
      'CART_TOTAL_TOO_LARGE',
      'Total keranjang terlalu besar untuk dihitung. Kurangi jumlah barang.'
    );
  }

  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    items,
    count,
    subtotal,
    canCheckout: items.length > 0 && items.every((item) => item.isAvailable),
  };
}

const EMPTY_SNAPSHOT = Object.freeze({ items: [], count: 0, subtotal: 0, canCheckout: false });

export function createCartStore(pool) {
  const withTransaction = createWithTransaction(pool);

  /** The cart id for an owner, or `null` when no cart was ever created. */
  async function findCartId(db, owner) {
    const { column, value } = ownerKey(owner);
    const { rows } = await db.query(
      `SELECT id FROM tbl_keranjang WHERE ${column} = $1`,
      [value]
    );

    return rows.length === 0 ? null : rows[0].id;
  }

  /**
   * The cart id for an owner, created if missing and locked for the rest of the
   * transaction.
   *
   * The insert carries no conflict target on purpose: there are two partial
   * unique indexes (one per owner kind) and only the one matching this owner can
   * fire. A concurrent first add blocks on the insert, then finds the row.
   *
   * A guest token that has already been merged into an account is spent: a
   * write that was in flight while the merge ran would otherwise recreate the
   * customer's cart behind a token nobody holds any more. It is told to reload
   * instead of silently losing the item.
   */
  async function lockCart(db, owner) {
    const { column, value } = ownerKey(owner);

    await db.query(
      `INSERT INTO tbl_keranjang (user_id, guest_token) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [owner.userId ?? null, owner.guestTokenHash ?? null]
    );

    const { rows } = await db.query(
      `SELECT id, merged_at FROM tbl_keranjang WHERE ${column} = $1 FOR UPDATE`,
      [value]
    );

    if (rows[0].merged_at !== null) {
      throw new AppError(
        409,
        'CART_MERGED',
        'Keranjang ini sudah digabungkan ke akunmu. Muat ulang halaman lalu coba lagi.'
      );
    }

    return rows[0].id;
  }

  async function readItems(db, cartId) {
    const { rows } = await db.query(
      `SELECT ${ITEM_COLUMNS} ${ITEM_FROM}
        WHERE i.cart_id = $1
        ORDER BY i.created_at ASC, i.id ASC`,
      [cartId]
    );

    return rows;
  }

  /**
   * The cart id for an owner that already has one, locked for the rest of the
   * transaction — or `null`, leaving the absent case absent.
   *
   * Deletions use this rather than `lockCart`: removing a line from a cart that
   * does not exist must not mint one. The lock is still required, because
   * checkout holds the same row while it snapshots the lines it is about to
   * turn into an order; without it a concurrent delete could empty the cart
   * underneath that snapshot.
   */
  async function lockExistingCart(db, owner) {
    const { column, value } = ownerKey(owner);

    const { rows } = await db.query(
      `SELECT id FROM tbl_keranjang WHERE ${column} = $1 FOR UPDATE`,
      [value]
    );

    return rows.length === 0 ? null : rows[0].id;
  }

  /**
   * Locks the products a write is about to inspect, in id order.
   *
   * Two carts checking each other's stock in opposite orders would deadlock;
   * a fixed order means they queue instead.
   */
  async function lockProducts(db, productIds) {
    const ids = [...new Set(productIds)].sort((a, b) => a - b);

    const { rows } = await db.query(
      `SELECT id, stock, colors, sizes, is_active
         FROM tbl_produk
        WHERE id = ANY($1::bigint[])
        ORDER BY id
          FOR UPDATE`,
      [ids]
    );

    return new Map(rows.map((row) => [row.id, row]));
  }

  /** Quantity of one product already in the cart, on either side of `exceptId`. */
  async function productQuantity(db, cartId, productId, exceptItemId = null) {
    const { rows } = await db.query(
      `SELECT coalesce(sum(quantity), 0)::int AS quantity
         FROM tbl_item_keranjang
        WHERE cart_id = $1
          AND product_id = $2
          AND ($3::bigint IS NULL OR id <> $3)`,
      [cartId, productId, exceptItemId]
    );

    return rows[0].quantity;
  }

  async function snapshot(owner) {
    const cartId = await findCartId(pool, owner);
    if (cartId === null) return { ...EMPTY_SNAPSHOT, items: [] };

    return toSnapshot(await readItems(pool, cartId));
  }

  return {
    read: (owner) => snapshot(owner),

    async add(owner, { productId, color, size, quantity = 1 }) {
      await withTransaction(async (db) => {
        const cartId = await lockCart(db, owner);
        const products = await lockProducts(db, [productId]);
        const product = products.get(productId);

        if (!product || !product.is_active) throw productNotFound();
        if (hasVariantIssue(product, color, size)) throw invalidVariant();

        const current = await productQuantity(db, cartId, productId);
        const available = Math.max(0, product.stock - current);

        if (quantity > available) throw insufficientStock(available, quantity);

        await db.query(
          `INSERT INTO tbl_item_keranjang (cart_id, product_id, quantity, color, size)
                VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ON CONSTRAINT tbl_item_keranjang_cart_variant_key
           DO UPDATE SET quantity = tbl_item_keranjang.quantity + EXCLUDED.quantity`,
          [cartId, productId, quantity, color, size]
        );
      });

      return snapshot(owner);
    },

    async updateQuantity(owner, itemId, quantity) {
      await withTransaction(async (db) => {
        const cartId = await lockCart(db, owner);

        const { rows } = await db.query(
          `SELECT id, product_id FROM tbl_item_keranjang WHERE id = $1 AND cart_id = $2`,
          [itemId, cartId]
        );

        if (rows.length === 0) throw itemNotFound();

        const productId = rows[0].product_id;
        const products = await lockProducts(db, [productId]);
        const product = products.get(productId);

        // The product row is read again for the stock figure; the variant is
        // already on the line and is not re-validated here, so a customer can
        // still reduce or remove a line whose variant the catalogue dropped.
        const others = await productQuantity(db, cartId, productId, itemId);
        const available = Math.max(0, product.stock - others);

        if (quantity > available) throw insufficientStock(available, quantity);

        await db.query('UPDATE tbl_item_keranjang SET quantity = $1 WHERE id = $2', [
          quantity,
          itemId,
        ]);
      });

      return snapshot(owner);
    },

    async remove(owner, itemId) {
      await withTransaction(async (db) => {
        const cartId = await lockExistingCart(db, owner);
        if (cartId === null) return;

        await db.query('DELETE FROM tbl_item_keranjang WHERE id = $1 AND cart_id = $2', [
          itemId,
          cartId,
        ]);
      });

      return snapshot(owner);
    },

    async clear(owner) {
      await withTransaction(async (db) => {
        const cartId = await lockExistingCart(db, owner);
        if (cartId === null) return;

        await db.query('DELETE FROM tbl_item_keranjang WHERE cart_id = $1', [cartId]);
      });

      return snapshot(owner);
    },
  };
}
