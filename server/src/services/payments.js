import { AppError } from '../lib/errors.js';
import { createPaymentStore } from '../db/payments.js';
import {
  buildSnapPayload,
  enabledPaymentsFor,
  notificationFingerprint,
  qrCodeUrl,
  verifyNotificationSignature,
} from '../lib/payments.js';

/**
 * Payment orchestration.
 *
 * The provider call is deliberately **outside** the checkout transaction: an
 * order exists before a Snap token does, so a provider outage leaves a payable
 * order instead of losing the purchase. A failed attempt is recorded and the
 * customer can retry, which produces a new provider order id.
 *
 * Three entry points share one reconciliation path:
 *
 *  - `start`  creates or reuses a Snap transaction for an owned order;
 *  - `sync`   asks the provider directly (useful when a webhook cannot reach a
 *             developer machine, and after Snap closes);
 *  - `handleNotification` consumes a signed webhook.
 */

function notConfigured() {
  return new AppError(
    503,
    'PAYMENT_NOT_CONFIGURED',
    'Pembayaran online belum diaktifkan di server ini.'
  );
}

function invalidSignature() {
  return new AppError(
    401,
    'INVALID_PAYMENT_SIGNATURE',
    'Tanda tangan notifikasi pembayaran tidak valid.'
  );
}

function currencyMismatch() {
  return new AppError(422, 'PAYMENT_CURRENCY_MISMATCH', 'Mata uang pembayaran harus IDR.');
}

/**
 * Anything a provider throws becomes one public error. The SDK wrapper already
 * does this mapping, but a provider injected by a test (or a future one) may
 * throw a plain `Error`, and that must not surface as an unexplained `500`.
 */
function asProviderError(error) {
  if (error instanceof AppError) return error;

  return new AppError(
    502,
    'PAYMENT_PROVIDER_ERROR',
    'Penyedia pembayaran sedang tidak dapat dihubungi. Coba lagi beberapa saat lagi.'
  );
}

/** The payment block the client reads. No provider secret is ever included. */
function paymentView(order, attempt) {
  const status = attempt?.status ?? order.paymentStatus ?? 'unpaid';
  const methodSupported = Boolean(enabledPaymentsFor(order.paymentMethodId));
  const payable = order.status !== 'cancelled' && status !== 'paid' && status !== 'refunded';

  return {
    status,
    canPay: payable && methodSupported,
    method: order.paymentMethod,
    attempt: attempt
      ? {
          providerOrderId: attempt.providerOrderId,
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          expiresAt: attempt.expiresAt,
          paidAt: attempt.paidAt,
          paymentType: attempt.paymentType,
          // Only a QRIS attempt has one; it is what lets the page redraw the
          // transaction-specific code after a reload.
          qrCodeUrl: attempt.qrCodeUrl ?? null,
        }
      : null,
  };
}

export function createPaymentService(
  pool,
  {
    provider,
    serverKey,
    clientKey,
    isProduction = false,
    scriptUrl,
    clientOrigin,
    expiryMinutes = 120,
  }
) {
  const store = createPaymentStore(pool);

  return {
    /** Public configuration the browser needs to open the Snap popup. */
    config() {
      return {
        enabled: provider.configured,
        clientKey: clientKey ?? null,
        scriptUrl: scriptUrl ?? null,
        isProduction,
      };
    },

    /**
     * The payment block without contacting the provider: the newest attempt as
     * it is stored, including the QRIS code and its expiry. Nothing is created
     * here, so it is safe to call on every visit to the order page.
     */
    async state(userId, orderNumber) {
      const { order, attempt } = await store.findState(userId, orderNumber);

      return { orderNumber: order.orderNumber, payment: paymentView(order, attempt) };
    },

    /**
     * Creates a Snap transaction, or reuses a pending one that still has time
     * left. Idempotent per order: calling it twice returns the same token.
     */
    async start(userId, orderNumber) {
      if (!provider.configured) throw notConfigured();

      const { order, attempt, customer, reused } = await store.prepareAttempt(userId, orderNumber);

      if (reused) {
        return {
          orderNumber: order.orderNumber,
          payment: paymentView(order, attempt),
          snap: {
            token: attempt.snapToken,
            redirectUrl: attempt.redirectUrl,
            clientKey: clientKey ?? null,
            scriptUrl: scriptUrl ?? null,
          },
        };
      }

      const payload = buildSnapPayload({
        order,
        providerOrderId: attempt.providerOrderId,
        customer,
        clientOrigin,
        expiryMinutes,
      });

      let snap;

      try {
        snap = await provider.createTransaction(payload);
      } catch (error) {
        // The attempt is already recorded; mark it failed so it is never reused
        // and the customer sees an honest state instead of a stuck spinner.
        await store.failAttempt(attempt.id, { statusCode: 'provider_error' });
        throw asProviderError(error);
      }

      const expiresAt = new Date(Date.now() + expiryMinutes * 60_000);

      await store.saveSnap(attempt.id, {
        token: snap.token,
        redirectUrl: snap.redirectUrl,
        expiresAt,
      });

      return {
        orderNumber: order.orderNumber,
        payment: paymentView(order, {
          ...attempt,
          status: 'pending',
          expiresAt: expiresAt.toISOString(),
        }),
        snap: {
          token: snap.token,
          redirectUrl: snap.redirectUrl,
          clientKey: clientKey ?? null,
          scriptUrl: scriptUrl ?? null,
        },
      };
    },

    /**
     * Asks Midtrans for the authoritative status and applies it. Never trusts
     * whatever the browser reported after the popup closed.
     */
    async sync(userId, orderNumber) {
      if (!provider.configured) throw notConfigured();

      const { attempt } = await store.findLatest(userId, orderNumber);

      if (attempt.status === 'paid' || attempt.status === 'refunded') {
        return { orderNumber, status: attempt.status, outcome: 'already_final' };
      }

      const providerStatus = await provider.fetchStatus(attempt.providerOrderId).catch((error) => {
        throw asProviderError(error);
      });

      const result = await store.applyProviderStatus({
        providerOrderId: attempt.providerOrderId,
        transactionId: providerStatus.transaction_id ?? null,
        transactionStatus: providerStatus.transaction_status,
        statusCode: String(providerStatus.status_code ?? ''),
        fraudStatus: providerStatus.fraud_status ?? '',
        grossAmountText: String(providerStatus.gross_amount ?? ''),
        paymentType: providerStatus.payment_type ?? null,
      });

      // A QRIS answer that keeps the attempt pending is `stale` (nothing moved),
      // yet it carries the QR code the customer needs, so the image and the
      // channel are recorded separately from the status transition.
      await store.saveAttemptFacts({
        providerOrderId: attempt.providerOrderId,
        qrCodeUrl: qrCodeUrl(providerStatus.actions),
        paymentType: providerStatus.payment_type ?? null,
      });

      const latest = await store.findLatest(userId, orderNumber);

      return { orderNumber, status: latest.attempt.status, outcome: result.outcome };
    },

    /**
     * A signed webhook. Everything in `body` is provider input: validated by the
     * route, signature-checked here, deduplicated and reconciled by the store.
     */
    async handleNotification(body) {
      if (!provider.configured) throw notConfigured();

      if (!verifyNotificationSignature(body, serverKey)) throw invalidSignature();
      if (body.currency && body.currency !== 'IDR') throw currencyMismatch();

      const result = await store.applyProviderStatus({
        providerOrderId: body.order_id,
        transactionId: body.transaction_id ?? null,
        transactionStatus: body.transaction_status,
        statusCode: body.status_code,
        fraudStatus: body.fraud_status ?? '',
        grossAmountText: body.gross_amount,
        paymentType: body.payment_type ?? null,
        notification: {
          key: notificationFingerprint(body),
        },
      });

      // A duplicate, unknown order or stale status is acknowledged: Midtrans
      // retries non-2xx responses, and there is nothing left to do.
      return { received: true, outcome: result.outcome, applied: result.applied };
    },
  };
}
