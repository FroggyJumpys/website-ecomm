import { z } from 'zod';
import { SHIPPING_METHODS, PAYMENT_METHODS } from '../lib/checkout.js';

/**
 * Orders request contracts: checkout, history query, detail path.
 *
 * The client names an address and two policy ids. It never names a price, a
 * total, an item list, a status or an owner, so every schema here is strict:
 * an unexpected field is a rejected request, not a stripped one. A payload that
 * arrives with `total: 1` is a client that believes it is pricing the order,
 * and silently ignoring that belief hides a real integration bug.
 */

/** The statuses the history filter accepts; `all` is the absence of a filter. */
export const ORDER_STATUS_VALUES = ['all', 'processing', 'shipped', 'completed', 'cancelled'];

const PAGE_MAX = 1_000_000;
const DEFAULT_LIMIT = 10;
const LIMIT_MAX = 100;
const ORDER_NUMBER_MAX_LENGTH = 80;

const ADDRESS_REQUIRED = 'Alamat pengiriman wajib dipilih.';
const ADDRESS_INVALID = 'Alamat pengiriman tidak valid.';
const SHIPPING_UNKNOWN = 'Metode pengiriman tidak dikenal.';
const PAYMENT_UNKNOWN = 'Metode pembayaran tidak dikenal.';
const IDEMPOTENCY_REQUIRED = 'Idempotency-Key wajib diisi.';
const IDEMPOTENCY_INVALID =
  'Idempotency-Key harus 16–128 karakter: huruf, angka, garis bawah, atau tanda hubung.';

/** Any raw query value: a string, a number, undefined, or a repeated parameter. */
const rawValue = z.union([z.string(), z.number(), z.array(z.string())]).optional();

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * A single-valued whole-number query parameter. A repeated parameter is a
 * client bug and is rejected rather than collapsed, and so is a decimal or a
 * non-numeric string: `?page=dua` must not quietly return page 1.
 */
function intParam({ label, field, min, max }) {
  return rawValue
    .refine((value) => !Array.isArray(value), {
      message: `Parameter ${label} hanya boleh diisi satu nilai.`,
    })
    .transform((value) => (isBlank(value) ? undefined : String(value).trim()))
    .refine((value) => value === undefined || /^\d+$/.test(value), {
      message: `Parameter ${label} harus berupa angka bulat.`,
    })
    .transform((value) => (value === undefined ? undefined : Number(value)))
    .refine((value) => value === undefined || (value >= min && value <= max), {
      message: `Parameter ${field} harus antara ${min} dan ${max}.`,
    });
}

/** Address ids are database identities: positive, whole, exactly representable. */
const addressIdField = z
  .number({
    error: (issue) =>
      issue.input === undefined || issue.input === null ? ADDRESS_REQUIRED : ADDRESS_INVALID,
  })
  .refine((value) => Number.isSafeInteger(value) && value >= 1, { message: ADDRESS_INVALID });

export const checkoutSchema = z
  .object({
    addressId: addressIdField,
    shippingMethod: z
      .string({ error: SHIPPING_UNKNOWN })
      .refine((value) => SHIPPING_METHODS.some((method) => method.id === value), {
        message: SHIPPING_UNKNOWN,
      }),
    paymentMethod: z
      .string({ error: PAYMENT_UNKNOWN })
      .refine((value) => PAYMENT_METHODS.some((method) => method.id === value), {
        message: PAYMENT_UNKNOWN,
      }),
  })
  .strict();

/**
 * The `Idempotency-Key` header. Validated as an object so `parseBody` can name
 * the field in `details`, which is what the controller's error shape expects.
 */
export const idempotencyHeaderSchema = z.object({
  idempotencyKey: z
    .string({
      error: (issue) =>
        issue.input === undefined || issue.input === null
          ? IDEMPOTENCY_REQUIRED
          : IDEMPOTENCY_INVALID,
    })
    .refine((value) => /^[A-Za-z0-9_-]{16,128}$/.test(value), {
      message: IDEMPOTENCY_INVALID,
    }),
});

export const orderListSchema = z
  .object({
    page: intParam({ label: 'halaman', field: 'page', min: 1, max: PAGE_MAX }),
    limit: intParam({ label: 'jumlah', field: 'limit', min: 1, max: LIMIT_MAX }),
    status: rawValue
      .refine((value) => !Array.isArray(value), {
        message: 'Parameter status hanya boleh diisi satu nilai.',
      })
      .transform((value) => (isBlank(value) ? 'all' : String(value).trim()))
      .refine((value) => ORDER_STATUS_VALUES.includes(value), {
        message: 'Status pesanan tidak dikenal.',
      }),
  })
  .transform((query) => ({
    page: query.page ?? 1,
    limit: query.limit ?? DEFAULT_LIMIT,
    status: query.status,
  }));

/** The `:orderNumber` path parameter, shaped as an object for `parseBody`. */
export const orderNumberParamsSchema = z.object({
  orderNumber: z
    .string({ error: 'Nomor pesanan tidak valid.' })
    .max(ORDER_NUMBER_MAX_LENGTH, { message: 'Nomor pesanan tidak valid.' })
    .refine((value) => /^BD-\d{4}-\d{4,}$/.test(value), {
      message: 'Nomor pesanan tidak valid.',
    }),
});
