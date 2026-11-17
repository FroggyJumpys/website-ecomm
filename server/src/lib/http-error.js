/**
 * An error that carries the HTTP status and the machine-readable code the API
 * contract promises: { error: { code, message, details? } }.
 *
 * Throw this from services and middleware; the central error handler turns it
 * into the response, so no layer has to know about `res`.
 */
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function badRequest(code, message, details) {
  return new HttpError(400, code, message, details);
}

export function unauthorized(message) {
  return new HttpError(401, 'UNAUTHENTICATED', message);
}

export function forbidden(message) {
  return new HttpError(403, 'FORBIDDEN', message);
}
