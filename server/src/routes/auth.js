import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { register, login, logout, me } from '../controllers/auth.js';
import { createRequireAuth } from '../middleware/auth.js';

/**
 * `/api/v1/auth`.
 *
 * Sign-in and registration share a limiter because both are brute-force
 * targets. The limits are parameters so tests can exercise the 429 without
 * waiting out the production window.
 */
export function createAuthRouter({ pool, rateLimitMax = 10, rateLimitWindowMs = 15 * 60 * 1000 }) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  const authLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    limit: rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.',
        },
      });
    },
  });

  router.post('/register', authLimiter, register);
  router.post('/login', authLimiter, login);
  router.post('/logout', logout);
  router.get('/me', requireAuth, me);

  return router;
}
