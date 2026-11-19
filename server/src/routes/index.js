import { Router } from 'express';
import { ping } from '../config/db.js';
import { createAuthRouter } from './auth.js';
import { createCatalogRouter } from './catalog.js';
import { createUsersRouter } from './users.js';
import { createCartRouter } from './cart.js';
import { createOrdersRouter } from './orders.js';
import { createPaymentsRouter } from './payments.js';
import { createAdminRouter } from './admin.js';
import { createMediaRouter } from './media.js';
import pkg from '../../package.json' with { type: 'json' };

/**
 * `/api/v1`. Mounted by `createApp`, which supplies the pool and the auth
 * rate-limit settings.
 */
export function createApiRouter({
  pool,
  authRateLimitMax,
  authRateLimitWindowMs,
  passwordRateLimitMax,
  passwordRateLimitWindowMs,
  uploadDir,
  publicImageDir,
  clientOrigin,
  adminUploadLimit,
  adminUploadWindowMs,
  paymentService,
}) {
  const router = Router();

  /** Liveness: the process is up. Never touches the database. */
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: pkg.name,
      version: pkg.version,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  /** Readiness: the process can reach PostgreSQL. */
  router.get('/health/db', async (req, res) => {
    try {
      await ping();
      res.json({ status: 'ok', database: 'up' });
    } catch (error) {
      res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database is not reachable.',
          details: error.message,
        },
      });
    }
  });

  router.use(
    '/auth',
    createAuthRouter({
      pool,
      rateLimitMax: authRateLimitMax,
      rateLimitWindowMs: authRateLimitWindowMs,
    })
  );

  router.use('/', createCatalogRouter());

  router.use('/cart', createCartRouter({ pool }));

  router.use('/orders', createOrdersRouter({ pool, paymentService }));

  router.use('/payments', createPaymentsRouter({ paymentService }));

  router.use(
    '/users',
    createUsersRouter({
      pool,
      passwordRateLimitMax,
      passwordRateLimitWindowMs,
    })
  );

  router.use(
    '/admin',
    createAdminRouter({
      pool,
      uploadDir,
      publicImageDir,
      clientOrigin,
      uploadLimit: adminUploadLimit,
      uploadWindowMs: adminUploadWindowMs,
    })
  );

  router.use('/media', createMediaRouter({ uploadDir }));

  return router;
}
