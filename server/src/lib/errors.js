/**
 * An error that carries the HTTP status and machine code the API returns.
 *
 * The error handler already renders `error.status`, `error.code` and
 * `error.details`, so throwing one of these from a service is enough to shape
 * the response.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}
