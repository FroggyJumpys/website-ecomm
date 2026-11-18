import { parseBody, parseQuery } from '../lib/validation.js';
import {
  checkoutSchema,
  idempotencyHeaderSchema,
  orderListSchema,
  orderNumberParamsSchema,
} from '../validators/orders.js';

/**
 * Order controllers: HTTP only.
 *
 * The owner always comes from `req.user`, which `requireAuth` has already
 * re-read from the database: no route takes a user id from the request. Body,
 * header and query validation happens here so the response names the offending
 * field, and every shape decision (envelopes, status codes) stays in this layer.
 */
export function createOrderControllers(service) {
  return {
    /**
     * POST /api/v1/orders
     *
     * `201` for a new order and `200` for a retry that found its own earlier
     * commit. The distinction matters to the client: a replay is a success, but
     * it is not a second purchase.
     */
    async create(req, res) {
      const { idempotencyKey } = parseBody(idempotencyHeaderSchema, {
        idempotencyKey: req.get('Idempotency-Key'),
      });
      const input = parseBody(checkoutSchema, req.body);

      const { order, replayed } = await service.create(req.user.id, input, idempotencyKey);

      res.status(replayed ? 200 : 201).json({ data: order, meta: { replayed } });
    },

    /** GET /api/v1/users/me/orders */
    async index(req, res) {
      const query = parseQuery(orderListSchema, req.query);
      const { orders, meta } = await service.list(req.user.id, query);

      res.status(200).json({ data: orders, meta });
    },

    /** GET /api/v1/users/me/orders/:orderNumber */
    async show(req, res) {
      // The params object goes through `parseBody` rather than `parseParams`:
      // that helper hard-codes the field name `id`, and the error here has to
      // point at `orderNumber`.
      const { orderNumber } = parseBody(orderNumberParamsSchema, req.params);
      const order = await service.get(req.user.id, orderNumber);

      res.status(200).json({ data: order });
    },
  };
}
