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
} = {}) {
  const app = express();

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
    })
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export const app = createApp();

export default app;
