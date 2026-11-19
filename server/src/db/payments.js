import { AppError } from '../lib/errors.js';
import { createWithTransaction } from '../config/db.js';
import { toSafeOrderMoney } from '../lib/checkout.js';
import {
  attemptUsable,
  grossAmountMatches,
  mapTransactionStatus,
  nextPaymentStatus,
  providerOrderIdFor,
} from '../lib/payments.js';
import { readOrderById } from './orders.js';

/**
 * Payment persistence: attempts, and the reconciliation of provider status.
 *
 * The order row is the lock for a customer's checkout writes, so payment work
 * takes the same lock first and the payment row second. That keeps ordering
 * consistent with checkout and prevents a deadlock between a retry and a
 * webhook arriving at the same moment.
 *
 * Nothing here decides policy: mapping and precedence live in `lib/payments.js`
 * and are pure, so both the notification path and the manual sync path share
 * exactly one implementation.
 */

const ATTEMPT_COLUMNS = `
  p.id,
  p.order_id,
  p.provider,
  p.provider_order_id,
  p.attempt_no,
  p.status,
  p.gross_amount::text AS gross_amount,
  p.snap_token,
  p.snap_redirect_url,
  p.qr_code_url,
  p.transaction_id,
  p.payment_type,
  p.fraud_status,
  p.status_code,
  p.paid_at,
  p.expires_at,
  p.created_at
`;

function toAttempt(row) {
  return {
    id: row.id,
    provider: row.provider,
    providerOrderId: row.provider_order_id,
    attemptNumber: row.attempt_no,
    status: row.status,
    grossAmount: toSafeOrderMoney(row.gross_amount),
    snapToken: row.snap_token,
    redirectUrl: row.snap_redirect_url,
    qrCodeUrl: row.qr_code_url,
    transactionId: row.transaction_id,
    paymentType: row.payment_type,
    fraudStatus: row.fraud_status,
    providerStatusCode: row.status_code,
    paidAt: row.paid_at ? row.paid_at.toISOString() : null,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

function orderNotFound() {
  return new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan ini tidak ditemukan.');
}

function orderCancelled() {
  return new AppError(
    409,
    'ORDER_CANCELLED',
    'Pesanan ini sudah dibatalkan, jadi tidak bisa dibayar.'
  );
}

function orderAlreadyPaid() {
  return new AppError(409, 'ORDER_ALREADY_PAID', 'Pesanan ini sudah lunas.');
}

function paymentNotFound() {
  return new AppError(404, 'PAYMENT_NOT_FOUND', 'Belum ada pembayaran untuk pesanan ini.');
}

export function createPaymentStore(pool) {
  const withTransaction = createWithTransaction(pool);

  return {
    /**
     * Returns a usable pending attempt, or records a new one and hands the
     * caller everything the provider request needs.
     *
     * The row is inserted before the provider is called. If the provider then
     * fails, the attempt stays as `failed` for support, and the next try gets a
     * new attempt number — Midtrans refuses a reused `order_id`.
     */
    prepareAttempt(userId, orderNumber) {
      return withTransaction(async (db) => {
        const orderRow = await db.query(
          `SELECT id, status, payment_status
             FROM tbl_pesanan
            WHERE user_id = $1 AND order_number = $2
              FOR UPDATE`,
          [userId, orderNumber]
        );

        if (orderRow.rows.length === 0) throw orderNotFound();

        const order = orderRow.rows[0];

        const customerRow = await db.query(
          'SELECT name, email, phone FROM tbl_pengguna WHERE id = $1',
          [userId]
        );
        const customer = customerRow.rows[0] ?? {};

        if (order.status === 'cancelled') throw orderCancelled();
        if (order.payment_status === 'paid' || order.payment_status === 'refunded') {
          throw orderAlreadyPaid();
        }

        const latest = await db.query(
          `SELECT ${ATTEMPT_COLUMNS}
             FROM tbl_pembayaran p
            WHERE p.order_id = $1
            ORDER BY p.attempt_no DESC
            LIMIT 1`,
          [order.id]
        );

        const previous = latest.rows[0];

        if (previous && attemptUsable(toAttempt(previous))) {
          return {
            order: await readOrderById(db, userId, order.id),
            attempt: toAttempt(previous),
            customer,
            reused: true,
          };
        }

        const attemptNumber = (previous?.attempt_no ?? 0) + 1;
        const providerOrderId = providerOrderIdFor(orderNumber, attemptNumber);

        const inserted = await db.query(
          `INSERT INTO tbl_pembayaran (
             order_id, provider, provider_order_id, attempt_no, gross_amount, status
           )
           VALUES ($1, 'midtrans', $2, $3, (SELECT total FROM tbl_pesanan WHERE id = $1), 'pending')
           RETURNING ${ATTEMPT_COLUMNS.replaceAll('p.', '')}`,
          [order.id, providerOrderId, attemptNumber]
        );

        await db.query(
          `UPDATE tbl_pesanan
              SET payment_status = 'pending'
            WHERE id = $1 AND payment_status IN ('unpaid', 'failed', 'expired')`,
          [order.id]
        );

        return {
          order: await readOrderById(db, userId, order.id),
          attempt: toAttempt(inserted.rows[0]),
          customer,
          reused: false,
        };
      });
    },

    /** Stores what Snap returned and the expiry quoted to the customer. */
    async saveSnap(attemptId, { token, redirectUrl, expiresAt }) {
      await pool.query(
        `UPDATE tbl_pembayaran
            SET snap_token = $2, snap_redirect_url = $3, expires_at = $4
          WHERE id = $1`,
        [attemptId, token, redirectUrl, expiresAt]
      );
    },

    /**
     * A provider call that never produced a token. The attempt is marked failed
     * so it is never reused, and the order says `failed` only if it was pending:
     * a paid or refunded order is never rewritten by a failed retry.
     */
    async failAttempt(attemptId, { statusCode = '', paymentType = null } = {}) {
      await withTransaction(async (db) => {
        const updated = await db.query(
          `UPDATE tbl_pembayaran
              SET status = 'failed', status_code = $2, payment_type = $3
            WHERE id = $1 AND status = 'pending'
          RETURNING order_id`,
          [attemptId, statusCode, paymentType]
        );

        if (updated.rows.length === 0) return;

        await db.query(
          `UPDATE tbl_pesanan
              SET payment_status = 'failed'
            WHERE id = $1 AND payment_status = 'pending'`,
          [updated.rows[0].order_id]
        );
      });
    },

    /** One order with its newest attempt, owner-scoped. Used by the sync route. */
    findLatest(userId, orderNumber) {
      return withTransaction(async (db) => {
        const order = await db.query(
          `SELECT id, order_number
             FROM tbl_pesanan
            WHERE user_id = $1 AND order_number = $2`,
          [userId, orderNumber]
        );

        if (order.rows.length === 0) throw orderNotFound();

        const latest = await db.query(
          `SELECT ${ATTEMPT_COLUMNS}
             FROM tbl_pembayaran p
            WHERE p.order_id = $1
            ORDER BY p.attempt_no DESC
            LIMIT 1`,
          [order.rows[0].id]
        );

        if (latest.rows.length === 0) throw paymentNotFound();

        return { orderNumber: order.rows[0].order_number, attempt: toAttempt(latest.rows[0]) };
      });
    },

    /**
     * One owned order and its newest attempt, or `null` when nothing was ever
     * sent to the provider. Read-only: the order page uses it to redraw a QR
     * code that already exists without creating a new provider transaction.
     */
    findState(userId, orderNumber) {
      return withTransaction(async (db) => {
        const order = await db.query(
          `SELECT id
             FROM tbl_pesanan
            WHERE user_id = $1 AND order_number = $2`,
          [userId, orderNumber]
        );

        if (order.rows.length === 0) throw orderNotFound();

        const latest = await db.query(
          `SELECT ${ATTEMPT_COLUMNS}
             FROM tbl_pembayaran p
            WHERE p.order_id = $1
            ORDER BY p.attempt_no DESC
            LIMIT 1`,
          [order.rows[0].id]
        );

        return {
          order: await readOrderById(db, userId, order.rows[0].id),
          attempt: latest.rows.length === 0 ? null : toAttempt(latest.rows[0]),
        };
      });
    },

    /**
     * Records the non-status provider facts of an attempt that is still payable:
     * the transaction-specific QR image, and the channel it belongs to.
     *
     * Kept out of `applyProviderStatus` on purpose. A provider answer that keeps
     * an attempt pending moves nothing, so it is reported as `stale` — yet it is
     * exactly the answer that carries the QR the customer needs in order to pay.
     * `COALESCE` means a later answer never blanks a fact already known, and the
     * `status = 'pending'` guard keeps a finished attempt immutable.
     */
    async saveAttemptFacts({ providerOrderId, qrCodeUrl = null, paymentType = null }) {
      if (!qrCodeUrl && !paymentType) return;

      await pool.query(
        `UPDATE tbl_pembayaran
            SET qr_code_url = COALESCE($2, qr_code_url),
                payment_type = COALESCE($3, payment_type)
          WHERE provider_order_id = $1
            AND status = 'pending'`,
        [providerOrderId, qrCodeUrl, paymentType]
      );
    },

    /**
     * Applies a provider status to an attempt, once.
     *
     * `notification` is the verified webhook body plus its fingerprint; when it
     * is absent this is a manual sync, which is not logged as a webhook but
     * still goes through the same precedence rules.
     *
     * Outcomes:
     *  - `duplicate`        the same provider event was already recorded;
     *  - `unknown_order`    a notification for an order id we never created;
     *  - `amount_mismatch`  the provider amount disagrees with the stored one;
     *  - `unmapped_status`  a transaction status this build does not map;
     *  - `stale`            a replayed or out-of-order status that must not win;
     *  - `applied`          the payment and order rows moved forward.
     */
    applyProviderStatus({
      provider = 'midtrans',
      providerOrderId,
      transactionId = null,
      transactionStatus,
      statusCode = '',
      fraudStatus = '',
      grossAmountText = '',
      paymentType = null,
      notification = null,
    }) {
      return withTransaction(async (db) => {
        let notificationId = null;

        if (notification) {
          const recorded = await db.query(
            `INSERT INTO tbl_notifikasi_pembayaran (
               provider, notification_key, provider_order_id, transaction_id,
               transaction_status, status_code, fraud_status, gross_amount
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (provider, notification_key) DO NOTHING
             RETURNING id`,
            [
              provider,
              notification.key,
              providerOrderId,
              transactionId ?? '',
              transactionStatus,
              statusCode,
              fraudStatus,
              grossAmountText,
            ]
          );

          if (recorded.rows.length === 0) return { outcome: 'duplicate', applied: false };
          notificationId = recorded.rows[0].id;
        }

        const found = await db.query(
          `SELECT id, order_id, status, gross_amount::text AS gross_amount
             FROM tbl_pembayaran
            WHERE provider = $1 AND provider_order_id = $2`,
          [provider, providerOrderId]
        );

        async function finish(outcome, details = null) {
          if (notificationId) {
            await db.query(
              `UPDATE tbl_notifikasi_pembayaran
                  SET outcome = $2, payment_id = $3, order_id = $4
                WHERE id = $1`,
              [notificationId, outcome, details?.paymentId ?? null, details?.orderId ?? null]
            );
          }

          return { outcome, applied: outcome === 'applied' };
        }

        if (found.rows.length === 0) return finish('unknown_order');

        const orderId = found.rows[0].order_id;

        // Order first, payment second: the same order checkout and a retry take.
        const orderRow = await db.query(
          'SELECT id, payment_status FROM tbl_pesanan WHERE id = $1 FOR UPDATE',
          [orderId]
        );

        const payment = await db.query(
          `SELECT ${ATTEMPT_COLUMNS}
             FROM tbl_pembayaran p
            WHERE p.id = $1
              FOR UPDATE`,
          [found.rows[0].id]
        );

        const attempt = payment.rows[0];
        const details = { paymentId: attempt.id, orderId };

        if (!grossAmountMatches(grossAmountText, attempt.gross_amount)) {
          return finish('amount_mismatch', details);
        }

        const incoming = mapTransactionStatus({ transactionStatus, fraudStatus, statusCode });

        if (!incoming) return finish('unmapped_status', details);

        const applied = nextPaymentStatus(attempt.status, incoming);

        if (!applied) return finish('stale', details);

        await db.query(
          `UPDATE tbl_pembayaran
              SET status = $2,
                  transaction_id = COALESCE($3, transaction_id),
                  payment_type = COALESCE($4, payment_type),
                  fraud_status = $5,
                  status_code = $6,
                  paid_at = CASE WHEN $2 = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END
            WHERE id = $1`,
          [attempt.id, applied, transactionId, paymentType, fraudStatus, statusCode]
        );

        // The order mirrors the newest forward move. A status that would move
        // the order backwards is refused here too, so a late `expired` from an
        // older attempt cannot undo a `paid`.
        const orderPaymentStatus = nextPaymentStatus(
          orderRow.rows[0].payment_status === 'unpaid'
            ? 'pending'
            : orderRow.rows[0].payment_status,
          applied
        );

        if (orderPaymentStatus) {
          await db.query('UPDATE tbl_pesanan SET payment_status = $2 WHERE id = $1', [
            orderId,
            orderPaymentStatus,
          ]);
        }

        return finish('applied', details);
      });
    },
  };
}
