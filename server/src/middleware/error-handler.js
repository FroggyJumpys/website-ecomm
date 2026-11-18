import { AppError } from '../lib/errors.js';

/**
 * Central error handler. Every error surfaced to the client uses the shape
 * { error: { code, message, details? } }.
 *
 * Express 5 forwards rejected async handlers here automatically, so route
 * handlers do not need try/catch.
 *
 * Only an `AppError` — something a service chose to surface — keeps its code,
 * message and details. Anything else (a driver error, a thrown string, a bug)
 * is reported as a 500 with a generic message, so a raw SQLSTATE such as
 * `23505` never becomes the public error code and the database schema does not
 * leak through error text.
 */
export function errorHandler(error, req, res, _next) {
  const isPublic = error instanceof AppError;
  const status = isPublic ? error.status : 500;

  if (status >= 500) {
    console.error(`[api] ${req.method} ${req.originalUrl}`, error);
  }

  const body = {
    error: {
      code: isPublic ? error.code : 'INTERNAL_ERROR',
      message: isPublic ? error.message : 'Unexpected server error.',
    },
  };

  if (isPublic && error.details) body.error.details = error.details;

  res.status(status).json(body);
}
