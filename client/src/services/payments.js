import { apiRequest } from './http.js';

/**
 * Payment service.
 *
 * The client never sends an amount: it names an order, and the server prices the
 * Snap transaction from the stored total. `startPayment` is idempotent per
 * order, so calling it again returns the same Snap token while it is still
 * usable instead of creating a second provider order.
 */
export function fetchPaymentConfig() {
  return apiRequest('/payments/config');
}

export function startPayment(orderNumber) {
  return apiRequest(`/orders/${orderNumber}/payments`, { method: 'POST' });
}

/**
 * The stored payment state of one owned order: the newest attempt, its expiry
 * and — for QRIS — the transaction-specific QR image. Starting a payment is a
 * separate call, so this one is safe to run whenever the page opens.
 */
export function fetchPaymentState(orderNumber) {
  return apiRequest(`/orders/${orderNumber}/payments`);
}

/**
 * Asks the server to re-check the provider status. Used when the popup closes:
 * the browser's claim is not proof, and a webhook may not have arrived yet on a
 * local machine.
 */
export function syncPayment(orderNumber) {
  return apiRequest(`/orders/${orderNumber}/payments/sync`, { method: 'POST' });
}
