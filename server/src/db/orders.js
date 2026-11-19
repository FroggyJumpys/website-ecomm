import { AppError } from '../lib/errors.js';
import { createWithTransaction } from '../config/db.js';
import { toSafeOrderMoney } from '../lib/checkout.js';

/**
 * Order reads: one order, and a page of history.
 *
 * Everything here comes from the snapshot tables. A product renamed, an address
 * deleted or a price changed after the order was placed must not rewrite what
 * the customer bought or where it was sent — that is the whole point of copying
 * those values onto the order at checkout.
 *
 * Money columns are cast to text in SQL. `pg` parses BIGINT through `Number`,
 * which silently rounds 9007199254740993 to ...992, so a value this API cannot
 * represent is caught after an exact read instead of after a lossy one.
 */

export const ORDER_COLUMNS = `
  o.id,
  o.order_number,
  o.status,
  o.subtotal::text          AS subtotal,
  o.shipping_cost::text     AS shipping_cost,
  o.discount::text          AS discount,
  o.total::text             AS total,
  o.shipping_method,
  o.payment_method,
  o.payment_method_id,
  o.payment_status,
  o.tracking_number,
  o.cancellation_reason,
  o.shipping_recipient,
  o.shipping_phone,
  o.shipping_street,
  o.shipping_district,
  o.shipping_city,
  o.shipping_province,
  o.shipping_postal_code,
  o.shipping_notes,
  o.created_at
`;

const ITEM_COLUMNS = `
  i.order_id,
  i.product_id,
  i.product_slug,
  i.product_name,
  i.image,
  i.unit_price::text AS unit_price,
  i.quantity,
  i.color,
  i.size
`;

const EVENT_COLUMNS = `
  e.order_id,
  e.status,
  e.note,
  e.created_at
`;

export const STATUS_COUNTS_KEYS = ['all', 'processing', 'shipped', 'completed', 'cancelled'];

function notFound() {
  return new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan ini tidak ditemukan.');
}

function toItem(row) {
  return {
    productId: row.product_id,
    slug: row.product_slug,
    name: row.product_name,
    image: row.image,
    price: toSafeOrderMoney(row.unit_price),
    quantity: row.quantity,
    color: row.color,
    size: row.size,
  };
}

function toEvent(row) {
  return {
    status: row.status,
    at: row.created_at.toISOString(),
    note: row.note,
  };
}

/**
 * Assembles one order from its row and the children already fetched for it.
 *
 * Children are grouped by `order_id` before this runs so a page of orders costs
 * the same number of statements as a single order does.
 *
 * Exported because the admin order store renders the same snapshot shape: the
 * customer and the operator must not be able to disagree about what an order
 * contains.
 */
export function toOrder(row, itemsByOrder, eventsByOrder) {
  const items = (itemsByOrder.get(row.id) ?? []).map(toItem);
  const timeline = (eventsByOrder.get(row.id) ?? []).map(toEvent);

  return {
    orderNumber: row.order_number,
    createdAt: row.created_at.toISOString(),
    status: row.status,
    items,
    subtotal: toSafeOrderMoney(row.subtotal),
    shippingCost: toSafeOrderMoney(row.shipping_cost),
    discount: toSafeOrderMoney(row.discount),
    total: toSafeOrderMoney(row.total),
    shippingMethod: row.shipping_method,
    shippingAddress: {
      recipient: row.shipping_recipient,
      phone: row.shipping_phone,
      street: row.shipping_street,
      district: row.shipping_district,
      city: row.shipping_city,
      province: row.shipping_province,
      postalCode: row.shipping_postal_code,
      notes: row.shipping_notes,
    },
    paymentMethod: row.payment_method,
    paymentMethodId: row.payment_method_id,
    paymentStatus: row.payment_status,
    trackingNumber: row.tracking_number,
    cancellationReason: row.cancellation_reason,
    timeline,
  };
}

function groupBy(rows, key) {
  const grouped = new Map();

  for (const row of rows) {
    const group = grouped.get(row[key]);
    if (group) group.push(row);
    else grouped.set(row[key], [row]);
  }

  return grouped;
}

/**
 * Loads the children of several orders in one statement each.
 *
 * `= ANY($1::bigint[])` keeps this bounded: one query for every line of the
 * page, one for every status event, however many orders the page holds.
 *
 * Shared with the admin store so a listing there has the same statement count
 * as a customer's history page.
 */
export async function loadChildren(db, orderIds) {
  if (orderIds.length === 0) return { itemsByOrder: new Map(), eventsByOrder: new Map() };

  const [items, events] = await Promise.all([
    db.query(
      `SELECT ${ITEM_COLUMNS}
         FROM tbl_item_pesanan i
        WHERE i.order_id = ANY($1::bigint[])
        ORDER BY i.order_id, i.created_at ASC, i.id ASC`,
      [orderIds]
    ),
    db.query(
      `SELECT ${EVENT_COLUMNS}
         FROM tbl_riwayat_status_pesanan e
        WHERE e.order_id = ANY($1::bigint[])
        ORDER BY e.order_id, e.created_at ASC, e.id ASC`,
      [orderIds]
    ),
  ]);

  return {
    itemsByOrder: groupBy(items.rows, 'order_id'),
    eventsByOrder: groupBy(events.rows, 'order_id'),
  };
}

/**
 * Reads one owned order through an open transaction.
 *
 * Exported so checkout can build its response on the same client it inserted
 * with, before committing: a second connection would not see uncommitted rows,
 * and reading after COMMIT could observe a different state than the one the
 * customer was told they bought.
 */
export async function readOrderById(client, userId, orderId) {
  const { rows } = await client.query(
    `SELECT ${ORDER_COLUMNS}
       FROM tbl_pesanan o
      WHERE o.id = $1 AND o.user_id = $2`,
    [orderId, userId]
  );

  if (rows.length === 0) throw notFound();

  const children = await loadChildren(client, [orderId]);

  return toOrder(rows[0], children.itemsByOrder, children.eventsByOrder);
}

export function createOrderStore(pool) {
  const withTransaction = createWithTransaction(pool);

  return {
    get(userId, orderNumber) {
      return withTransaction(async (db) => {
        const { rows } = await db.query(
          `SELECT ${ORDER_COLUMNS}
             FROM tbl_pesanan o
            WHERE o.user_id = $1 AND o.order_number = $2`,
          [userId, orderNumber]
        );

        if (rows.length === 0) throw notFound();

        const children = await loadChildren(db, [rows[0].id]);

        return toOrder(rows[0], children.itemsByOrder, children.eventsByOrder);
      });
    },

    /**
     * One page of history plus the counts the filter chips show.
     *
     * The counts cover every one of this owner's orders, not the page and not
     * the selected status: a chip that says "Dikirim 1" while the list is
     * filtered to Diproses still has to be true. Counting and paging in one
     * repeatable-read transaction means the two cannot disagree about which
     * rows exist.
     */
    list(userId, { page, limit, status }) {
      return withTransaction(async (db) => {
        await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

        const counts = await db.query(
          `SELECT count(*) FILTER (WHERE status = 'processing')::int AS processing,
                  count(*) FILTER (WHERE status = 'shipped')::int    AS shipped,
                  count(*) FILTER (WHERE status = 'completed')::int  AS completed,
                  count(*) FILTER (WHERE status = 'cancelled')::int  AS cancelled,
                  count(*)::int                                      AS all
             FROM tbl_pesanan
            WHERE user_id = $1`,
          [userId]
        );

        const filtered = status === 'all' ? null : status;
        const offset = (page - 1) * limit;

        const totalResult = await db.query(
          `SELECT count(*)::int AS total
             FROM tbl_pesanan
            WHERE user_id = $1 AND ($2::text IS NULL OR status = $2)`,
          [userId, filtered]
        );

        const rows = await db.query(
          `SELECT ${ORDER_COLUMNS}
             FROM tbl_pesanan o
            WHERE o.user_id = $1 AND ($2::text IS NULL OR o.status = $2)
            ORDER BY o.created_at DESC, o.id DESC
            LIMIT $3 OFFSET $4`,
          [userId, filtered, limit, offset]
        );

        const children = await loadChildren(
          db,
          rows.rows.map((row) => row.id)
        );

        const total = totalResult.rows[0].total;
        const countsRow = counts.rows[0];

        return {
          orders: rows.rows.map((row) =>
            toOrder(row, children.itemsByOrder, children.eventsByOrder)
          ),
          meta: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit),
            statusCounts: {
              all: countsRow.all,
              processing: countsRow.processing,
              shipped: countsRow.shipped,
              completed: countsRow.completed,
              cancelled: countsRow.cancelled,
            },
          },
        };
      });
    },
  };
}
