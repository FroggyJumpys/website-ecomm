import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { pool as defaultPool } from './config/db.js';
import { createApiRouter } from './routes/index.js';
import { createPaymentService } from './services/payments.js';
import { createMidtransProvider, unconfiguredProvider } from './services/midtrans-provider.js';
import { snapScriptUrl } from './lib/payments.js';
import { defaultUploadRoot } from './services/admin-storage.js';
import { notFound } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';

const serverDir = path.dirname(fileURLToPath(import.meta.url));

/** The client's image directory: `public/images` in dev, `dist/images` in a build. */
function defaultPublicImageDir() {
  const clientDir = path.resolve(serverDir, '../../client');
  const sub = env.NODE_ENV === 'production' ? 'dist/images' : 'public/images';

  return path.join(clientDir, sub);
}

/**
 * Builds the Express app.
 *
 * `pool` is a parameter so the integration tests can hand in the test
 * database. The auth rate limit is parameterised for the same reason: a test
 * must be able to hit the limit without waiting out the real window, and the
 * upload directory is injected so a test never writes into the working tree.
 *
 * Paths are resolved once per app rather than per request: resolving them in a
 * handler would let a change to `process.cwd()` move the media route at runtime.
 */
export function createApp({
  pool = defaultPool,
  authRateLimitMax = 10,
  authRateLimitWindowMs = 15 * 60 * 1000,
  passwordRateLimitMax = 5,
  passwordRateLimitWindowMs = 15 * 60 * 1000,
  uploadDir = env.UPLOAD_DIR ? path.resolve(serverDir, '..', env.UPLOAD_DIR) : defaultUploadRoot(),
  publicImageDir = env.PUBLIC_IMAGE_DIR ?? defaultPublicImageDir(),
  adminUploadLimit = 20,
  adminUploadWindowMs = 15 * 60 * 1000,
  /**
   * Built from `MIDTRANS_*` (or legacy `MT_*`) unless supplied. Tests inject a
   * service bound to a fake provider and a known key so they never reach the
   * network and never need real credentials.
   */
  paymentService: injectedPaymentService = null,
} = {}) {
  const app = express();

  /**
   * Payment wiring. Without credentials the provider refuses with a clear 503
   * instead of the whole API failing at boot, so a developer can run the shop
   * before the Midtrans keys exist.
   */
  const paymentService =
    injectedPaymentService ??
    createPaymentService(pool, {
      provider:
        env.MIDTRANS_SERVER_KEY && env.MIDTRANS_CLIENT_KEY
          ? createMidtransProvider({
              serverKey: env.MIDTRANS_SERVER_KEY,
              clientKey: env.MIDTRANS_CLIENT_KEY,
              isProduction: env.MIDTRANS_IS_PRODUCTION,
            })
          : unconfiguredProvider,
      serverKey: env.MIDTRANS_SERVER_KEY,
      clientKey: env.MIDTRANS_CLIENT_KEY,
      isProduction: env.MIDTRANS_IS_PRODUCTION,
      scriptUrl:
        env.MIDTRANS_SNAP_SCRIPT_URL ?? snapScriptUrl({ production: env.MIDTRANS_IS_PRODUCTION }),
      clientOrigin: env.CLIENT_ORIGIN,
      expiryMinutes: env.MIDTRANS_EXPIRY_MINUTES,
    });

  app.locals.pool = pool;
  app.locals.uploadDir = uploadDir;
  app.locals.publicImageDir = publicImageDir;

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  app.use(
    '/api/v1',
    createApiRouter({
      pool,
      authRateLimitMax,
      authRateLimitWindowMs,
      passwordRateLimitMax,
      passwordRateLimitWindowMs,
      uploadDir,
      publicImageDir,
      clientOrigin: env.CLIENT_ORIGIN,
      adminUploadLimit,
      adminUploadWindowMs,
      paymentService,
    })
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export const app = createApp();

export default app;
