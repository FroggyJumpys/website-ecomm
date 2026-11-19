import { Router } from 'express';
import { createPaymentControllers } from '../controllers/payments.js';

/**
 * `/api/v1/payments` — the provider-facing surface.
 *
 * Only two routes live here:
 *
 *  - `GET /config` hands the browser the public Snap script and client key. The
 *    client key is public by design; the server key is never in this response.
 *  - `POST /midtrans/notification` is the webhook. It has no session and no
 *    `requireAuth`: Midtrans signs it, and the service verifies that signature
 *    before touching any row.
 *
 * Order-scoped actions (start a payment, sync it) are mounted under `/orders`
 * next to checkout because they act on one owned order.
 */
export function createPaymentsRouter({ paymentService }) {
  const router = Router();
  const controllers = createPaymentControllers(paymentService);

  router.get('/config', controllers.config);
  router.post('/midtrans/notification', controllers.notification);

  return router;
}
