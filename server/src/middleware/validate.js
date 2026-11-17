import { badRequest } from '../lib/http-error.js';

/**
 * Validate `req.body` against a zod schema and replace it with the parsed
 * value, so controllers only ever see normalised input.
 *
 * Failures become a 400 with `details.fields`, a map of field name to the first
 * message for that field. The browser can then attach each message to its own
 * input.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      const fields = {};

      for (const issue of result.error.issues) {
        const field = issue.path.join('.') || 'body';
        fields[field] ??= issue.message;
      }

      next(badRequest('VALIDATION_ERROR', 'Periksa kembali data yang dikirim.', { fields }));

      return;
    }

    req.body = result.data;
    next();
  };
}
