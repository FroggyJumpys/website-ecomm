import { parseBody, parseParams } from '../lib/validation.js';
import { addressSchema, addressIdSchema } from '../validators/user.js';

/**
 * Address controllers. The service is bound to the app's pool by the router, so
 * these handlers only validate, call and shape the response.
 */
export function createAddressControllers(service) {
  return {
    /** GET /api/v1/users/me/addresses */
    async index(req, res) {
      const list = await service.list(req.user.id);
      res.status(200).json({ data: list });
    },

    /** POST /api/v1/users/me/addresses */
    async create(req, res) {
      const address = parseBody(addressSchema, req.body);
      const created = await service.create(req.user.id, address);

      res.status(201).json({ data: created });
    },

    /** PATCH /api/v1/users/me/addresses/:id */
    async update(req, res) {
      const id = parseParams(addressIdSchema, req.params.id);
      const address = parseBody(addressSchema, req.body);
      const updated = await service.update(req.user.id, id, address);

      res.status(200).json({ data: updated });
    },

    /** DELETE /api/v1/users/me/addresses/:id */
    async remove(req, res) {
      const id = parseParams(addressIdSchema, req.params.id);

      await service.remove(req.user.id, id);
      res.status(200).json({ data: null });
    },

    /** POST /api/v1/users/me/addresses/:id/default */
    async setDefault(req, res) {
      const id = parseParams(addressIdSchema, req.params.id);

      await service.setDefault(req.user.id, id);
      res.status(200).json({ data: null });
    },
  };
}
