import { z } from 'zod';

/**
 * Wishlist request schemas.
 *
 * A saved product is identified by one positive integer. The same id arrives
 * two ways — a JSON number in the POST body, a decimal string in the DELETE
 * URL — so both are checked here, with the same messages, before any SQL runs.
 *
 * The product id is deliberately **not** coerced in the body: a client that
 * sends `"5"` is fixed by its own code, and silently accepting both shapes
 * would make one request mean two things depending on the caller.
 */

const REQUIRED_MESSAGE = 'ID produk wajib diisi.';
const NOT_A_NUMBER_MESSAGE = 'ID produk harus berupa angka.';
const NOT_AN_INTEGER_MESSAGE = 'ID produk harus berupa angka bulat.';
const INVALID_MESSAGE = 'ID produk tidak valid.';

/** Positive, whole, and inside the range `Number` can represent exactly. */
function isUsableId(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function idIssue(value) {
  if (value === undefined || value === null) return REQUIRED_MESSAGE;
  if (typeof value !== 'number' || Number.isNaN(value)) return NOT_A_NUMBER_MESSAGE;
  if (!Number.isInteger(value)) return NOT_AN_INTEGER_MESSAGE;
  return INVALID_MESSAGE;
}

export const wishlistItemSchema = z
  .object({
    productId: z
      .number({ error: (issue) => idIssue(issue.input) })
      .refine((value) => Number.isInteger(value), { message: NOT_AN_INTEGER_MESSAGE })
      .refine(isUsableId, { message: INVALID_MESSAGE }),
  })
  .strip();

/**
 * Route ids arrive as strings. `1.5` has to answer "must be a whole number"
 * rather than "must be a number", so the decimal form is recognised before the
 * general digits-only check rejects it.
 */
export const wishlistProductIdSchema = z
  .string({ error: REQUIRED_MESSAGE })
  .trim()
  .min(1, { message: REQUIRED_MESSAGE })
  .refine((value) => /^-?\d+(\.\d+)?$/.test(value), { message: NOT_A_NUMBER_MESSAGE })
  .refine((value) => !/^-?\d+\.\d+$/.test(value), { message: NOT_AN_INTEGER_MESSAGE })
  .transform(Number)
  .refine(isUsableId, { message: INVALID_MESSAGE });
