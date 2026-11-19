import { Router } from 'express';
import { createRequireAuth } from '../middleware/auth.js';
import { createOrderControllers } from '../controllers/orders.js';
import { createPaymentControllers } from '../controllers/payments.js';
import { createOrderService } from '../services/orders.js';

/**
 * `/api/v1/orders` — placing an order.
 *
 * Only checkout lives here. A customer's history and detail are part of their
 * account and are mounted under `/users/me` with the rest of it, even though
 * they share this controller.
 *
 * Checkout is behind `requireAuth` and nothing else: an order belongs to an
 * account, so there is no guest checkout and no owner id in the body.
 */
export function createOrdersRouter({ pool, paymentService }) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);
  const controllers = createOrderControllers(createOrderService(pool));
  const paymentControllers = createPaymentControllers(paymentService);

  router.post('/', requireAuth, controllers.create);

  // Starting a payment and syncing it act on one owned order, so they live here
  // rather than under `/payments`, and both require the owner's session.
  router.get('/:orderNumber/payments', requireAuth, paymentControllers.state);
  router.post('/:orderNumber/payments', requireAuth, paymentControllers.start);
  router.post('/:orderNumber/payments/sync', requireAuth, paymentControllers.sync);

  return router;
}
