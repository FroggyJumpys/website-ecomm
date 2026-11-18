import { AppError } from '../lib/errors.js';

/**
 * Turns a Zod failure into the shape the API contract and the client forms
 * already understand: the first issue becomes
 * `details: { field, message }`, so a form can highlight one input.
 */
function toValidationError(result) {
  const issue = result.error.issues[0];
  const field = issue?.path?.join('.') || '(root)';

  return new AppError(
    422,
    'VALIDATION_ERROR',
    issue?.message ?? 'Data yang dikirim belum lengkap.',
    { field, message: issue?.message ?? 'Data yang dikirim belum lengkap.' }
  );
}

export function parseBody(schema, body) {
  const result = schema.safeParse(body);

  if (result.success) return result.data;

  throw toValidationError(result);
}

/**
 * Same contract for query strings. Kept separate from `parseBody` so a caller
 * cannot accidentally validate a body against a query schema, and so the
 * intent reads at the call site.
 */
export function parseQuery(schema, query) {
  const result = schema.safeParse(query);

  if (result.success) return result.data;

  throw toValidationError(result);
}

/**
 * Route parameters are strings too. Parsed separately so a bad id is rejected
 * before any query runs, and so its error names the field `id` — what the
 * address form expects.
 */
export function parseParams(schema, params) {
  const result = schema.safeParse(params);

  if (result.success) return result.data;

  const issue = result.error.issues[0];

  throw new AppError(422, 'VALIDATION_ERROR', issue.message, {
    field: 'id',
    message: issue.message,
  });
}
