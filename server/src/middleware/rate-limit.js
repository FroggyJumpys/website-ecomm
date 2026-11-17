import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Rate limiting for the auth endpoints, so a script cannot grind through
 * passwords or mass-register accounts.
 *
 * The factory exists for tests: the default limiter is skipped under
 * `NODE_ENV=test` (otherwise a test suite would rate-limit itself), so the
 * behaviour is verified by building a limiter with its own window and a
 * disabled skip.
 */
export function createAuthLimiter({ windowMs = 15 * 60 * 1000, limit = 20, skip } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: skip ?? (() => env.NODE_ENV === 'test'),
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.',
        },
      });
    },
  });
}

export const authLimiter = createAuthLimiter();
