import { apiRequest } from './http.js';
import { USE_MOCKS } from '../lib/config.js';
import { createOrder as mockCreateOrder } from '../mocks/account.js';
import { getSessionUserId } from '../mocks/auth.js';

/**
 * Checkout services. Step 04g replaces the mock with a POST /orders call inside
 * a database transaction; the client keeps sending the same payload.
 */

function requireUserId() {
  const id = getSessionUserId();

  if (!id) {
    const error = new Error('Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan pembayaran.');
    error.code = 'UNAUTHENTICATED';
    error.status = 401;
    throw error;
  }

  return id;
}

export function createOrder(payload) {
  if (USE_MOCKS) return mockCreateOrder(requireUserId(), payload);

  return apiRequest('/orders', { method: 'POST', body: payload });
}
