import { createAdminOrderStore } from '../db/admin-orders.js';

/**
 * Admin order service. It binds one pool to the store; the controller decides
 * validation and envelopes, and the store owns the lock, the transition check
 * and the stock restore that must happen inside one transaction.
 */
export function createAdminOrderService(pool) {
  const orders = createAdminOrderStore(pool);

  return {
    /** GET /admin/orders */
    list(query) {
      return orders.list(query);
    },

    /** GET /admin/orders/:orderNumber */
    get(orderNumber) {
      return orders.get(orderNumber);
    },

    /** PATCH /admin/orders/:orderNumber/status */
    updateStatus(orderNumber, input) {
      return orders.updateStatus(orderNumber, input.status, input.trackingNumber);
    },
  };
}
