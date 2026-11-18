import { AppError } from '../lib/errors.js';
import { createWithTransaction } from '../config/db.js';
import {
  shippingCostFor,
  paymentLabelFor,
  checkoutFingerprint,
  calculateOrderTotals,
  formatOrderNumber,
} from '../lib/checkout.js';
import { readOrderById } from './orders.js';

/**
 * Checkout: the one transaction that turns a cart into an order.
 *
 * The order of operations is the contract:
 *
 *  1. lock the cart row, which serialises every write for this account;
 *  2. look the idempotency key up **before** touching the cart or the address,
 *     so a retry after a lost response still works when the cart has since been
 *     emptied or refilled;
 *  3. snapshot the owned address once, without locking it — a later edit or
 *     delete must not rewrite an order that was already placed;
 *  4. read the cart, lock its products in id order, and validate **aggregated**
 *     quantities, because stock belongs to the product and not to a variant;
 *  5. compute the money exactly, write the order and its snapshot, decrement
 *     stock with a guarded update, then delete the checked-out lines.
 *
 * Nothing is partly done. A failure anywhere rolls back the order, its items,
 * its first status event, the stock and the cart together, and the key is not
 * persisted, so the same request can be tried again.
 */

function cartEmpty() {
  return new AppError(400, 'CART_EMPTY', 'Keranjangmu masih kosong.');
}

function addressNotFound() {
  return new AppError(404, 'ADDRESS_NOT_FOUND', 'Alamat ini tidak ditemukan.');
}

function productUnavailable(productId) {
  return new AppError(
    409,
    'PRODUCT_UNAVAILABLE',
    'Ada produk di keranjangmu yang sudah tidak dijual. Hapus dulu untuk melanjutkan.',
    { productId }
  );
}

function invalidVariant(productId) {
  return new AppError(
    422,
    'INVALID_VARIANT',
    'Pilihan warna atau ukuran di keranjangmu sudah tidak tersedia. Hapus dulu untuk melanjutkan.',
    { productId }
  );
}

function insufficientStock(productId, available, requested) {
  const message =
    available <= 0
      ? 'Stok tidak mencukupi. Produk ini sedang habis.'
      : `Stok tidak mencukupi. Tersisa ${available} unit.`;

  return new AppError(409, 'INSUFFICIENT_STOCK', message, {
    productId,
    available,
    requested,
  });
}

function idempotencyConflict() {
  return new AppError(
    409,
    'IDEMPOTENCY_CONFLICT',
    'Permintaan ini sudah dipakai untuk pesanan lain. Muat ulang halaman lalu coba lagi.'
  );
}

/** The product offers this colour and size today. */
function variantAvailable(product, color, size) {
  const colors = product.colors ?? [];
  const sizes = product.sizes ?? [];

  const colorOk = colors.length === 0 ? color === '' : colors.includes(color);
  const sizeOk = sizes.length === 0 ? size === '' : sizes.includes(size);

  return colorOk && sizeOk;
}

export function createCheckoutStore(pool) {
  const withTransaction = createWithTransaction(pool);

  /**
   * The year of the order number is read in WITA (`Asia/Makassar`), where the
   * business operates, not in UTC: an order placed at 01:00 on 1 January in
   * Banjarmasin is still 31 December in UTC. The sequence comes back as text so
   * a value past four digits is never truncated.
   */
  async function orderNumber(db) {
    const { rows } = await db.query(
      `SELECT to_char(now() AT TIME ZONE 'Asia/Makassar', 'YYYY') AS year,
              nextval('order_number_sequence')::text              AS sequence`
    );

    return formatOrderNumber(rows[0].year, rows[0].sequence);
  }

  return {
    async create(userId, input, idempotencyKey) {
      const fingerprint = checkoutFingerprint(input);

      const result = await withTransaction(async (db) => {
        // 1. Serialise every write for this account on its cart row. Created on
        //    first checkout so the lock always exists to be taken.
        await db.query(
          `INSERT INTO tbl_keranjang (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
          [userId]
        );
        const cartRow = await db.query(
          'SELECT id FROM tbl_keranjang WHERE user_id = $1 FOR UPDATE',
          [userId]
        );
        const cartId = cartRow.rows[0].id;

        // 2. A committed retry returns the order already placed. This runs
        //    before the address and cart are read, so replay works even after
        //    the address was deleted or the cart was refilled.
        const existing = await db.query(
          `SELECT id, request_fingerprint
             FROM tbl_pesanan
            WHERE user_id = $1 AND idempotency_key = $2`,
          [userId, idempotencyKey]
        );

        if (existing.rows.length > 0) {
          if (existing.rows[0].request_fingerprint !== fingerprint) throw idempotencyConflict();

          return {
            order: await readOrderById(db, userId, existing.rows[0].id),
            replayed: true,
          };
        }

        // 3. One atomic read of the owned address is the whole snapshot. No
        //    lock: a concurrent edit yields either the old or the new values,
        //    and neither may change this order afterwards.
        const address = await db.query(
          `SELECT recipient, phone, street, district, city, province, postal_code, notes
             FROM tbl_alamat
            WHERE id = $1 AND user_id = $2`,
          [input.addressId, userId]
        );

        if (address.rows.length === 0) throw addressNotFound();
        const snapshot = address.rows[0];

        // 4. The cart, in insertion order, and its products locked by id so two
        //    checkouts that share products queue instead of deadlocking.
        const lines = await db.query(
          `SELECT id, product_id, quantity, color, size
             FROM tbl_item_keranjang
            WHERE cart_id = $1
            ORDER BY created_at ASC, id ASC`,
          [cartId]
        );

        if (lines.rows.length === 0) throw cartEmpty();

        const productIds = [...new Set(lines.rows.map((line) => line.product_id))];
        // Money is read as text: `pg` converts BIGINT through Number and would
        // round a price this API is about to refuse.
        const products = await db.query(
          `SELECT id, slug, name, price::text AS price, stock, colors, sizes, is_active,
                  images
             FROM tbl_produk
            WHERE id = ANY($1::bigint[])
            ORDER BY id
              FOR UPDATE`,
          [productIds]
        );

        const byId = new Map(products.rows.map((product) => [product.id, product]));

        const requested = new Map();
        for (const line of lines.rows) {
          requested.set(line.product_id, (requested.get(line.product_id) ?? 0) + line.quantity);
        }

        // 5. Every line is checked before anything is written. An unavailable
        //    product, a dropped variant or a shortfall fails the whole order:
        //    unlike the guest merge, nothing is reduced to fit.
        for (const line of lines.rows) {
          const product = byId.get(line.product_id);

          if (!product || !product.is_active) throw productUnavailable(line.product_id);
          if (!variantAvailable(product, line.color, line.size)) {
            throw invalidVariant(line.product_id);
          }
        }

        for (const [productId, quantity] of requested) {
          const product = byId.get(productId);

          if (quantity > product.stock) throw insufficientStock(productId, product.stock, quantity);
        }

        const totals = calculateOrderTotals(
          lines.rows.map((line) => ({
            unitPrice: byId.get(line.product_id).price,
            quantity: line.quantity,
          })),
          shippingCostFor(input.shippingMethod)
        );

        const number = await orderNumber(db);
        const orderRow = await db.query(
          `INSERT INTO tbl_pesanan (
             order_number, user_id, status,
             subtotal, shipping_cost, discount, total,
             shipping_method, payment_method,
             shipping_recipient, shipping_phone, shipping_street, shipping_district,
             shipping_city, shipping_province, shipping_postal_code, shipping_notes,
             idempotency_key, request_fingerprint
           )
           VALUES ($1, $2, 'processing', $3, $4, 0, $5, $6, $7,
                   $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id`,
          [
            number,
            userId,
            totals.subtotal,
            totals.shippingCost,
            totals.total,
            input.shippingMethod,
            paymentLabelFor(input.paymentMethod),
            snapshot.recipient,
            snapshot.phone,
            snapshot.street,
            snapshot.district,
            snapshot.city,
            snapshot.province,
            snapshot.postal_code,
            snapshot.notes,
            idempotencyKey,
            fingerprint,
          ]
        );
        const orderId = orderRow.rows[0].id;

        for (const line of lines.rows) {
          const product = byId.get(line.product_id);
          const image = product.images?.[0] ?? '';

          await db.query(
            `INSERT INTO tbl_item_pesanan (
               order_id, product_id, product_name, product_slug, image,
               unit_price, quantity, color, size
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              orderId,
              line.product_id,
              product.name,
              product.slug,
              image,
              product.price,
              line.quantity,
              line.color,
              line.size,
            ]
          );
        }

        await db.query(
          `INSERT INTO tbl_riwayat_status_pesanan (order_id, status, note)
           VALUES ($1, 'processing', '')`,
          [orderId]
        );

        // One deduction per product, guarded by the stock it read. The row lock
        // already serialises competitors, so a zero-row update means the
        // database disagrees with the read above — still a conflict, never a
        // negative stock or a silent oversell.
        for (const [productId, quantity] of requested) {
          const updated = await db.query(
            `UPDATE tbl_produk SET stock = stock - $1 WHERE id = $2 AND stock >= $1`,
            [quantity, productId]
          );

          if (updated.rowCount === 0) throw insufficientStock(productId, 0, quantity);
        }

        await db.query('DELETE FROM tbl_item_keranjang WHERE cart_id = $1', [cartId]);

        // Read back on the same client: a second connection cannot see these
        // rows before COMMIT, and reading after COMMIT could show a state the
        // customer was not told about.
        return { order: await readOrderById(db, userId, orderId), replayed: false };
      });

      return result;
    },
  };
}
