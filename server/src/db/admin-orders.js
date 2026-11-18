import { AppError } from '../lib/errors.js';
import { createWithTransaction } from '../config/db.js';
import {
  DEFAULT_CANCELLATION_REASON,
  allowedTransitions,
  canTransition,
} from '../lib/orderTransitions.js';
import { ORDER_COLUMNS, loadChildren, toOrder } from './orders.js';

/**
 * Admin order reads and the status transition.
 *
 * The order shape is the customer one plus the owner: both screens render the
 * same snapshot tables, so a list assembled here reuses `toOrder` instead of
 * copying the field names into a second module that could drift.
 *
 * The status write is the only mutation. It locks the order row before reading
 * its status, so two operators cannot both restock the same cancellation: the
 * second one waits, then sees `cancelled` and answers with the order as it
 * stands instead of restoring the stock a second time.
 */

const CUSTOMER_COLUMNS = `
  u.id    AS customer_id,
  u.name  AS customer_name,
  u.email AS customer_email,
  u.phone AS customer_phone
`;

/** SQL operator that escapes the LIKE wildcards a search term may contain. */
function likePattern(term) {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * Shared WHERE fragment. The search matches the order number and the customer's
 * name or email — the three things the panel's search box offers — as a literal
 * substring, not as a pattern: typing `%` must not list every order.
 */
function searchCondition(parameter) {
  return `(
    ${parameter}::text IS NULL
    OR o.order_number ILIKE ${parameter} ESCAPE '\\'
    OR u.name         ILIKE ${parameter} ESCAPE '\\'
    OR u.email        ILIKE ${parameter} ESCAPE '\\'
  )`;
}

function notFound() {
  return new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan ini tidak ditemukan.');
}

function invalidTransition(from, to) {
  return new AppError(
    409,
    'ORDER_STATUS_CONFLICT',
    'Perubahan status pesanan ini tidak diizinkan.',
    { from, to, allowed: allowedTransitions(from) }
  );
}

function toAdminOrder(row, itemsByOrder, eventsByOrder) {
  return {
    ...toOrder(row, itemsByOrder, eventsByOrder),
    customer: {
      id: row.customer_id,
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
    },
  };
}

/**
 * Restores every line of a cancelled order to stock, one product at a time in
 * id order. Locking products in the same order checkout does keeps a concurrent
 * checkout and cancellation from deadlocking each other.
 *
 * A line whose product was deleted has a `null` `product_id` (the snapshot
 * keeps the name and price), so there is nothing to restore and it is skipped.
 */
async function restock(db, orderId) {
  const { rows } = await db.query(
    `SELECT product_id, sum(quantity)::int AS quantity
       FROM tbl_item_pesanan
      WHERE order_id = $1 AND product_id IS NOT NULL
      GROUP BY product_id
      ORDER BY product_id`,
    [orderId]
  );

  for (const row of rows) {
    await db.query('UPDATE tbl_produk SET stock = stock + $1 WHERE id = $2', [
      row.quantity,
      row.product_id,
    ]);
  }
}

function selectOrder({ lock = false } = {}) {
  return `SELECT ${ORDER_COLUMNS}, ${CUSTOMER_COLUMNS}
            FROM tbl_pesanan o
            JOIN tbl_pengguna u ON u.id = o.user_id
           WHERE o.order_number = $1
           ${lock ? 'FOR UPDATE OF o' : ''}`;
}

export function createAdminOrderStore(pool) {
  const withTransaction = createWithTransaction(pool);

  return {
    /**
     * One page of every customer's orders, newest first.
     *
     * `meta.statusCounts` follows the search but ignores the selected status,
     * like the customer history chips: a chip that says "Dikirim 3" must still
     * be true while the list is filtered to Diproses. Repeatable read keeps the
     * counts, the total and the page from disagreeing about which rows exist.
     */
    list({ page, limit, status, search }) {
      return withTransaction(async (db) => {
        await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

        const filtered = status === 'all' ? null : status;
        const pattern = search ? likePattern(search) : null;

        const counts = await db.query(
          `SELECT count(*) FILTER (WHERE o.status = 'processing')::int AS processing,
                  count(*) FILTER (WHERE o.status = 'shipped')::int    AS shipped,
                  count(*) FILTER (WHERE o.status = 'completed')::int  AS completed,
                  count(*) FILTER (WHERE o.status = 'cancelled')::int  AS cancelled,
                  count(*)::int                                      AS all
             FROM tbl_pesanan o
             JOIN tbl_pengguna u ON u.id = o.user_id
            WHERE ${searchCondition('$1')}`,
          [pattern]
        );

        const totalResult = await db.query(
          `SELECT count(*)::int AS total
             FROM tbl_pesanan o
             JOIN tbl_pengguna u ON u.id = o.user_id
            WHERE ($1::text IS NULL OR o.status = $1)
              AND ${searchCondition('$2')}`,
          [filtered, pattern]
        );

        const rows = await db.query(
          `SELECT ${ORDER_COLUMNS}, ${CUSTOMER_COLUMNS}
             FROM tbl_pesanan o
             JOIN tbl_pengguna u ON u.id = o.user_id
            WHERE ($1::text IS NULL OR o.status = $1)
              AND ${searchCondition('$2')}
            ORDER BY o.created_at DESC, o.id DESC
            LIMIT $3 OFFSET $4`,
          [filtered, pattern, limit, (page - 1) * limit]
        );

        const children = await loadChildren(
          db,
          rows.rows.map((row) => row.id)
        );
        const countsRow = counts.rows[0];
        const total = totalResult.rows[0].total;

        return {
          orders: rows.rows.map((row) =>
            toAdminOrder(row, children.itemsByOrder, children.eventsByOrder)
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

    /** One order by number, across every customer. */
    get(orderNumber) {
      return withTransaction(async (db) => {
        await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

        const { rows } = await db.query(selectOrder(), [orderNumber]);
        if (rows.length === 0) throw notFound();

        const children = await loadChildren(db, [rows[0].id]);

        return toAdminOrder(rows[0], children.itemsByOrder, children.eventsByOrder);
      });
    },

    /**
     * Moves one order to a new status, optionally recording the tracking number
     * the same request carries.
     *
     * A request that asks for the status the order already has is a successful
     * no-op: the panel retries after a lost response, and a retry must not add a
     * second timeline entry. Cancelling is the one transition with a side effect
     * beyond the status itself — the lines go back to stock and a reason is
     * recorded for the customer — and it is safe to run once because `cancelled`
     * is terminal.
     */
    updateStatus(orderNumber, status, trackingNumber) {
      return withTransaction(async (db) => {
        const { rows } = await db.query(selectOrder({ lock: true }), [orderNumber]);
        if (rows.length === 0) throw notFound();

        const current = rows[0];
        const statusChanged = current.status !== status;
        const trackingChanged =
          trackingNumber !== undefined && trackingNumber !== current.tracking_number;

        if (statusChanged && !canTransition(current.status, status)) {
          throw invalidTransition(current.status, status);
        }

        if (!statusChanged && !trackingChanged) {
          const children = await loadChildren(db, [current.id]);
          return toAdminOrder(current, children.itemsByOrder, children.eventsByOrder);
        }

        if (statusChanged && status === 'cancelled') await restock(db, current.id);

        const assignments = [];
        const values = [];

        if (statusChanged) {
          values.push(status);
          assignments.push(`status = $${values.length}`);
        }

        if (trackingChanged) {
          values.push(trackingNumber);
          assignments.push(`tracking_number = $${values.length}`);
        }

        if (statusChanged && status === 'cancelled') {
          values.push(DEFAULT_CANCELLATION_REASON);
          assignments.push(
            `cancellation_reason = COALESCE(cancellation_reason, $${values.length})`
          );
        }

        values.push(current.id);
        await db.query(
          `UPDATE tbl_pesanan SET ${assignments.join(', ')} WHERE id = $${values.length}`,
          values
        );

        if (statusChanged) {
          await db.query(
            `INSERT INTO tbl_riwayat_status_pesanan (order_id, status, note)
             VALUES ($1, $2, '')`,
            [current.id, status]
          );
        }

        const { rows: updatedRows } = await db.query(selectOrder(), [orderNumber]);
        const children = await loadChildren(db, [current.id]);

        return toAdminOrder(updatedRows[0], children.itemsByOrder, children.eventsByOrder);
      });
    },
  };
}
