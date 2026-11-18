import { z } from 'zod';

/**
 * Cart request schemas.
 *
 * Two ideas drive every rule here:
 *
 *  - The client names a product and a variant; it never names a price or an
 *    owner. Those fields are stripped, so a tampered payload cannot change what
 *    anything costs or whose cart it lands in.
 *  - Quantities are whole numbers from 1 up. Zero is not "remove" — that is a
 *    DELETE — so the same request never has two meanings.
 */

/** The largest value `quantity INTEGER` accepts in PostgreSQL. */
export const MAX_QUANTITY = 2_147_483_647;

const PRODUCT_REQUIRED = 'ID produk wajib diisi.';
const PRODUCT_NOT_A_NUMBER = 'ID produk harus berupa angka.';
const PRODUCT_NOT_AN_INTEGER = 'ID produk harus berupa angka bulat.';
const PRODUCT_INVALID = 'ID produk tidak valid.';

const QUANTITY_REQUIRED = 'Jumlah wajib diisi.';
const QUANTITY_NOT_A_NUMBER = 'Jumlah harus berupa angka.';
const QUANTITY_NOT_AN_INTEGER = 'Jumlah harus berupa angka bulat.';
const QUANTITY_TOO_SMALL = 'Jumlah minimal 1.';
const QUANTITY_TOO_LARGE = 'Jumlah terlalu besar.';

const CART_ITEM_REQUIRED = 'ID keranjang wajib diisi.';
const CART_ITEM_NOT_A_NUMBER = 'ID keranjang harus berupa angka.';
const CART_ITEM_NOT_AN_INTEGER = 'ID keranjang harus berupa angka bulat.';
const CART_ITEM_INVALID = 'ID keranjang tidak valid.';

const VARIANT_MAX_LENGTH = 80;

function isUsableId(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function productIdIssue(value) {
  if (value === undefined || value === null) return PRODUCT_REQUIRED;
  if (typeof value !== 'number' || Number.isNaN(value)) return PRODUCT_NOT_A_NUMBER;
  if (!Number.isInteger(value)) return PRODUCT_NOT_AN_INTEGER;
  return PRODUCT_INVALID;
}

/**
 * A variant option. Empty is meaningful — a product with no colours takes an
 * empty colour — so it is allowed, bounded and trimmed rather than required.
 */
function variantField(nonStringMessage) {
  return z
    .string({ error: nonStringMessage })
    .trim()
    .max(VARIANT_MAX_LENGTH, { message: nonStringMessage });
}

const productIdField = z
  .number({ error: (issue) => productIdIssue(issue.input) })
  .refine((value) => Number.isInteger(value), { message: PRODUCT_NOT_AN_INTEGER })
  .refine(isUsableId, { message: PRODUCT_INVALID });

const quantityField = z
  .number({
    error: (issue) => {
      if (issue.input === undefined || issue.input === null) return QUANTITY_REQUIRED;
      return QUANTITY_NOT_A_NUMBER;
    },
  })
  .refine((value) => Number.isInteger(value), { message: QUANTITY_NOT_AN_INTEGER })
  .refine((value) => value >= 1, { message: QUANTITY_TOO_SMALL })
  .refine((value) => value <= MAX_QUANTITY, { message: QUANTITY_TOO_LARGE });

/** POST body: which product, which variant, how many. */
export const cartItemSchema = z
  .object({
    productId: productIdField,
    color: variantField('Warna yang dipilih tidak valid.').default(''),
    size: variantField('Ukuran yang dipilih tidak valid.').default(''),
    quantity: quantityField.default(1),
  })
  .strip();

/** PATCH body: an absolute quantity, nothing else. */
export const cartQuantitySchema = z
  .object({
    quantity: quantityField,
  })
  .strip();

/** Route ids arrive as strings; the digits are checked before converting. */
export const cartItemIdSchema = z
  .string({ error: CART_ITEM_REQUIRED })
  .trim()
  .min(1, { message: CART_ITEM_REQUIRED })
  .refine((value) => /^-?\d+(\.\d+)?$/.test(value), { message: CART_ITEM_NOT_A_NUMBER })
  .refine((value) => !/^-?\d+\.\d+$/.test(value), {
    message: CART_ITEM_NOT_AN_INTEGER,
  })
  .transform(Number)
  .refine(isUsableId, { message: CART_ITEM_INVALID });
