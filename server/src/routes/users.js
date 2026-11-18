import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createRequireAuth } from '../middleware/auth.js';
import { patchProfile, postPassword } from '../controllers/user.js';
import { createAddressControllers } from '../controllers/addresses.js';
import { createAddressService } from '../services/addresses.js';
import { createWishlistControllers } from '../controllers/wishlist.js';
import { createWishlistService } from '../services/wishlist.js';
import { createOrderControllers } from '../controllers/orders.js';
import { createOrderService } from '../services/orders.js';

/**
 * `/api/v1/users` — the signed-in customer's own account.
 *
 * Every route sits behind `requireAuth`, so `req.user` is always a database row
 * for the session's owner. Nothing here accepts a user id from the request.
 *
 * The password endpoint has its own limiter keyed on the account, because a
 * signed-in attacker guessing the current password is not slowed down by the
 * sign-in limiter (which is keyed on the IP).
 */
export function createUsersRouter({
  pool,
  passwordRateLimitMax = 5,
  passwordRateLimitWindowMs = 15 * 60 * 1000,
}) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);
  const addressControllers = createAddressControllers(createAddressService(pool));
  const wishlistControllers = createWishlistControllers(createWishlistService(pool));
  const orderControllers = createOrderControllers(createOrderService(pool));

  const passwordLimiter = rateLimit({
    windowMs: passwordRateLimitWindowMs,
    limit: passwordRateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `password:${req.user?.id ?? 'anonymous'}`,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.',
        },
      });
    },
  });

  router.use(requireAuth);

  router.patch('/me', patchProfile);
  router.post('/me/password', passwordLimiter, postPassword);

  router.get('/me/addresses', addressControllers.index);
  router.post('/me/addresses', addressControllers.create);
  router.patch('/me/addresses/:id', addressControllers.update);
  router.delete('/me/addresses/:id', addressControllers.remove);
  router.post('/me/addresses/:id/default', addressControllers.setDefault);

  router.get('/me/wishlist', wishlistControllers.index);
  router.post('/me/wishlist', wishlistControllers.save);
  router.delete('/me/wishlist/:productId', wishlistControllers.remove);

  // Order history and detail are reads of the customer's own record, so they
  // live with the rest of the account. Placing the order is `POST /orders`.
  router.get('/me/orders', orderControllers.index);
  router.get('/me/orders/:orderNumber', orderControllers.show);

  return router;
}
