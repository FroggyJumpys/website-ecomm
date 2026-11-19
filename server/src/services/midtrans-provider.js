import Snap from 'midtrans-client/lib/snap.js';
import { AppError } from '../lib/errors.js';

/**
 * The only place that talks to Midtrans.
 *
 * A thin wrapper around the official SDK for two reasons:
 *
 *  - the rest of the app depends on a small interface (`createTransaction`,
 *    `fetchStatus`), so tests can hand in a fake and never touch the network;
 *  - provider failures become one `AppError`, so a raw SDK error (which carries
 *    the response body) never reaches a client.
 *
 * The Snap object is created once: the SDK is stateless apart from its keys.
 */
export function createMidtransProvider({ serverKey, clientKey, isProduction = false }) {
  const configured = Boolean(serverKey && clientKey);
  const snap = configured ? new Snap({ isProduction, serverKey, clientKey }) : null;

  function providerError(error) {
    // `MidtransError` exposes httpStatusCode and ApiResponse. Only the status
    // code is surfaced; the response body can echo request details.
    const providerStatus = error?.httpStatusCode ?? null;

    return new AppError(
      502,
      'PAYMENT_PROVIDER_ERROR',
      'Penyedia pembayaran sedang tidak dapat dihubungi. Coba lagi beberapa saat lagi.',
      { providerStatus }
    );
  }

  return {
    name: 'midtrans',
    configured,

    /**
     * Creates a Snap transaction. The caller has already built the payload from
     * the stored order, so nothing here can change the amount.
     */
    async createTransaction(payload) {
      if (!snap) throw providerError(new Error('Midtrans is not configured'));

      try {
        const response = await snap.createTransaction(payload);

        if (!response?.token || !response?.redirect_url) {
          throw new Error('Midtrans returned no token');
        }

        return { token: response.token, redirectUrl: response.redirect_url };
      } catch (error) {
        throw providerError(error);
      }
    },

    /**
     * Reads the authoritative status for an order id from Midtrans. Used when a
     * webhook could not reach a local machine, and to confirm a Snap result
     * without trusting the browser.
     */
    async fetchStatus(providerOrderId) {
      if (!snap) throw providerError(new Error('Midtrans is not configured'));

      try {
        return await snap.transaction.status(providerOrderId);
      } catch (error) {
        throw providerError(error);
      }
    },
  };
}

/**
 * A provider that refuses every call. Used when credentials are absent so the
 * rest of the API keeps working and the payment endpoints can answer with a
 * clear `503` instead of crashing at startup.
 */
export const unconfiguredProvider = Object.freeze({
  name: 'midtrans',
  configured: false,
  async createTransaction() {
    throw new AppError(
      503,
      'PAYMENT_NOT_CONFIGURED',
      'Pembayaran online belum diaktifkan di server ini.'
    );
  },
  async fetchStatus() {
    throw new AppError(
      503,
      'PAYMENT_NOT_CONFIGURED',
      'Pembayaran online belum diaktifkan di server ini.'
    );
  },
});
