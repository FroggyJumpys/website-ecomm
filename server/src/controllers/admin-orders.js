import { parseBody, parseQuery } from '../lib/validation.js';
import { adminOrderListSchema, adminOrderStatusSchema } from '../validators/admin-orders.js';
import { orderNumberParamsSchema } from '../validators/orders.js';

/**
 * Admin order controllers: HTTP only.
 *
 * The route number is validated before the body for a status change, so a
 * malformed URL is reported as such instead of being masked by a payload
 * problem. Nothing reaches the store until both pass.
 *
 * `PATCH .../status` answers with the refreshed order — the same shape as the
 * detail read — so the panel can render the new badge and timeline from the
 * response instead of guessing what the transition did.
 */
export function createAdminOrderControllers(service) {
  function orderNumberFrom(params) {
    // `parseBody` rather than `parseParams`: the helper hard-codes the field
    // name `id`, and the error here has to point at `orderNumber`.
    return parseBody(orderNumberParamsSchema, params).orderNumber;
  }

  return {
    /** GET /admin/orders */
    async index(req, res) {
      const query = parseQuery(adminOrderListSchema, req.query);
      const { orders, meta } = await service.list(query);

      res.status(200).json({ data: orders, meta });
    },

    /** GET /admin/orders/:orderNumber */
    async show(req, res) {
      const orderNumber = orderNumberFrom(req.params);
      const order = await service.get(orderNumber);

      res.status(200).json({ data: order });
    },

    /** PATCH /admin/orders/:orderNumber/status */
    async updateStatus(req, res) {
      const orderNumber = orderNumberFrom(req.params);
      const input = parseBody(adminOrderStatusSchema, req.body);
      const order = await service.updateStatus(orderNumber, input);

      res.status(200).json({ data: order });
    },
  };
}
