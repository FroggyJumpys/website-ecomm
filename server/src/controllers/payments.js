import { parseBody } from '../lib/validation.js';
import { orderNumberParamsSchema } from '../validators/orders.js';
import { notificationSchema } from '../validators/payments.js';

/**
 * Payment controllers: HTTP only.
 *
 * The owner always comes from `req.user`, never from the payload or the path:
 * an order number is guessable, and owning it is checked in the service.
 *
 * The webhook is the one endpoint here without a session. It is authenticated
 * by the provider signature instead, which the service verifies before any
 * state changes, and it answers `200` for replays so the provider stops
 * retrying an event that has already been handled.
 */
export function createPaymentControllers(service) {
  return {
    /** GET /api/v1/payments/config */
    config(req, res) {
      res.status(200).json({ data: service.config() });
    },

    /** GET /api/v1/orders/:orderNumber/payments */
    async state(req, res) {
      const { orderNumber } = parseBody(orderNumberParamsSchema, req.params);
      const data = await service.state(req.user.id, orderNumber);

      res.status(200).json({ data });
    },

    /** POST /api/v1/orders/:orderNumber/payments */
    async start(req, res) {
      const { orderNumber } = parseBody(orderNumberParamsSchema, req.params);
      const data = await service.start(req.user.id, orderNumber);

      res.status(201).json({ data });
    },

    /** POST /api/v1/orders/:orderNumber/payments/sync */
    async sync(req, res) {
      const { orderNumber } = parseBody(orderNumberParamsSchema, req.params);
      const data = await service.sync(req.user.id, orderNumber);

      res.status(200).json({ data });
    },

    /** POST /api/v1/payments/midtrans/notification */
    async notification(req, res) {
      const body = parseBody(notificationSchema, req.body);
      const data = await service.handleNotification(body);

      res.status(200).json({ data });
    },
  };
}
