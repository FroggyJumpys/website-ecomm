import { parseBody, parseParams } from '../lib/validation.js';
import { cartItemSchema, cartQuantitySchema, cartItemIdSchema } from '../validators/cart.js';
import {
  GUEST_CART_COOKIE,
  createGuestToken,
  guestCartCookieOptions,
  hashGuestToken,
} from '../lib/guestCart.js';

/**
 * Cart controllers.
 *
 * The owner is decided here, from the session (via `resolveCartOwner`) or from
 * the guest cookie — never from the body. A visitor who has no guest cookie yet
 * gets one the first time a write succeeds, not before: a failed add must not
 * leave a cookie lying around for a cart that was never created.
 */

const EMPTY_CART = Object.freeze({ items: [], count: 0, subtotal: 0, canCheckout: false });

/** The owner of a read. `null` means "nobody yet", which reads as empty. */
function readOwner(req) {
  if (req.cartUser) return { userId: req.cartUser.id };
  if (req.cartGuestToken) return { guestTokenHash: hashGuestToken(req.cartGuestToken) };

  return null;
}

/**
 * The owner of a write, minting a guest token when there is none.
 *
 * The cookie is set before the write runs so the response carries it, but the
 * store only creates a cart row if the write succeeds — a rejected add leaves no
 * row behind, and the browser just holds a token for an empty cart.
 */
function writeOwner(req, res) {
  if (req.cartUser) return { userId: req.cartUser.id };
  if (req.cartGuestToken) return { guestTokenHash: hashGuestToken(req.cartGuestToken) };

  const token = createGuestToken();
  res.cookie(GUEST_CART_COOKIE, token, guestCartCookieOptions());

  return { guestTokenHash: hashGuestToken(token) };
}

export function createCartControllers(service) {
  return {
    /** GET /api/v1/cart */
    async index(req, res) {
      const owner = readOwner(req);
      const cart = owner ? await service.read(owner) : { ...EMPTY_CART, items: [] };

      res.status(200).json({ data: cart });
    },

    /** POST /api/v1/cart/items */
    async add(req, res) {
      const item = parseBody(cartItemSchema, req.body);
      const cart = await service.add(writeOwner(req, res), item);

      res.status(200).json({ data: cart });
    },

    /** PATCH /api/v1/cart/items/:id */
    async updateQuantity(req, res) {
      const id = parseParams(cartItemIdSchema, req.params.id);
      const { quantity } = parseBody(cartQuantitySchema, req.body);
      const cart = await service.updateQuantity(writeOwner(req, res), id, quantity);

      res.status(200).json({ data: cart });
    },

    /** DELETE /api/v1/cart/items/:id */
    async remove(req, res) {
      const id = parseParams(cartItemIdSchema, req.params.id);
      const cart = await service.remove(writeOwner(req, res), id);

      res.status(200).json({ data: cart });
    },

    /** DELETE /api/v1/cart */
    async clear(req, res) {
      const cart = await service.clear(writeOwner(req, res));

      res.status(200).json({ data: cart });
    },
  };
}
