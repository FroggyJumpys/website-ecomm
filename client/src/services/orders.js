import { apiRequest } from './http.js';

/**
 * Checkout service.
 *
 * The request names the address and two policy ids, never a price or an item
 * list — the server reads the cart and prices the order itself. The
 * `Idempotency-Key` header is what makes a retry after a lost response return
 * the order already placed instead of charging twice.
 */
export function createOrder({ idempotencyKey, ...payload }) {
  return apiRequest('/orders', {
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}
