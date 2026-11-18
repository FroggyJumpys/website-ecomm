import { env } from '../config/env.js';
import { GUEST_CART_COOKIE, isGuestToken } from '../lib/guestCart.js';
import { createRequireAuth } from './auth.js';

/**
 * Resolves who owns the cart on this request, without deciding yet whether a
 * guest token has to be minted.
 *
 * Three cases, and the difference matters:
 *
 *  - **A session cookie is present.** It must be valid, or the request is a 401.
 *    Falling back to guest ownership here would silently split a signed-in
 *    customer's cart in two the moment their session expired.
 *  - **No session, a well-shaped guest cookie.** The visitor owns a guest cart.
 *  - **No session and no (valid) guest cookie.** A read is simply empty; a write
 *    mints a token, which the controller sets only once the write has succeeded.
 *
 * The controller is left to build the owner object so it can decide when to hand
 * out a new cookie; this middleware only gathers what was sent.
 */
export function createResolveCartOwner(pool) {
  const requireAuth = createRequireAuth(pool);

  return function resolveCartOwner(req, res, next) {
    const sessionToken = req.cookies?.[env.COOKIE_NAME];

    if (!sessionToken) {
      const guestToken = req.cookies?.[GUEST_CART_COOKIE];

      req.cartUser = null;
      req.cartGuestToken = isGuestToken(guestToken) ? guestToken : null;
      return next();
    }

    return requireAuth(req, res, (error) => {
      if (error) return next(error);

      req.cartUser = req.user;
      req.cartGuestToken = null;
      return next();
    });
  };
}
