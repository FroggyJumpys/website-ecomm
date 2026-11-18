import { parseBody, parseParams } from '../lib/validation.js';
import { wishlistItemSchema, wishlistProductIdSchema } from '../validators/wishlist.js';

/**
 * Wishlist controllers. The customer is always `req.user`, loaded by
 * `requireAuth` — the body cannot nominate an owner.
 */
export function createWishlistControllers(service) {
  return {
    /** GET /api/v1/users/me/wishlist */
    async index(req, res) {
      const items = await service.list(req.user.id);
      res.status(200).json({ data: items });
    },

    /**
     * POST /api/v1/users/me/wishlist
     *
     * `200` for both a first save and a repeat: the request says "this product
     * is in my wishlist", and after it completes that is true either way. A 201
     * would force the client to treat retries as errors.
     */
    async save(req, res) {
      const { productId } = parseBody(wishlistItemSchema, req.body);
      const item = await service.save(req.user.id, productId);

      res.status(200).json({ data: item });
    },

    /** DELETE /api/v1/users/me/wishlist/:productId */
    async remove(req, res) {
      const productId = parseParams(wishlistProductIdSchema, req.params.productId);

      await service.remove(req.user.id, productId);
      res.status(200).json({ data: null });
    },
  };
}
