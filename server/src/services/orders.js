import { createCheckoutStore } from '../db/checkout.js';
import { createOrderStore } from '../db/orders.js';

/**
 * Order service. Binds the checkout transaction and the snapshot reads to the
 * app's pool, so controllers can validate and shape responses without owning
 * any SQL.
 */
export function createOrderService(pool) {
  const checkout = createCheckoutStore(pool);
  const orders = createOrderStore(pool);

  return {
    create: (userId, input, idempotencyKey) => checkout.create(userId, input, idempotencyKey),
    list: (userId, query) => orders.list(userId, query),
    get: (userId, orderNumber) => orders.get(userId, orderNumber),
  };
}
