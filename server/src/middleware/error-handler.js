import { env } from '../config/env.js';

/**
 * Central error handler. Every error surfaced to the client uses the shape
 * { error: { code, message, details? } }.
 *
 * Express 5 forwards rejected async handlers here automatically, so route
 * handlers do not need try/catch.
 */
export function errorHandler(error, req, res, _next) {
  const status = error.status ?? error.statusCode ?? 500;

  if (status >= 500) {
    console.error(`[api] ${req.method} ${req.originalUrl}`, error);
  }

  const body = {
    error: {
      code: error.code ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
      message:
        status >= 500 && env.NODE_ENV === 'production'
          ? 'Unexpected server error.'
          : error.message,
    },
  };

  if (error.details) body.error.details = error.details;

  res.status(status).json(body);
}
