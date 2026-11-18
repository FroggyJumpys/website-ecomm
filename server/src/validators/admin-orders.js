import { z } from 'zod';
import { ORDER_STATUSES } from '../lib/orderTransitions.js';
import { singleEnum, singleInt, singleText } from './admin.js';

/**
 * Admin order request contracts.
 *
 * The list query reuses the same single-valued helpers as the admin product
 * list, so a repeated `?status=a&status=b` is rejected instead of silently
 * collapsing to the last value, and an unknown status is refused rather than
 * returning an empty page that looks like "no orders".
 *
 * The status body is strict. An operator may send a tracking number alongside
 * the status, which is the one field the panel needs when an order leaves the
 * workshop. Anything else — a price, an owner id, a cancellation reason — is
 * not the operator's to choose here: the reason is set by the server when an
 * order is cancelled, and money is immutable after checkout.
 */

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 20;
const MAX_PAGE = 1_000_000;
const MAX_SEARCH_LENGTH = 100;
const MAX_TRACKING_LENGTH = 64;

/** `all` is the absence of a filter; the body accepts only a real target status. */
export const ADMIN_ORDER_FILTER_VALUES = ['all', ...ORDER_STATUSES];

export const adminOrderListSchema = z.object({
  page: singleInt({ label: 'halaman', field: 'page', min: 1, max: MAX_PAGE, fallback: 1 }),
  limit: singleInt({
    label: 'jumlah',
    field: 'limit',
    min: 1,
    max: MAX_LIST_LIMIT,
    fallback: DEFAULT_LIST_LIMIT,
  }),
  status: singleEnum({
    label: 'status',
    field: 'status',
    values: ADMIN_ORDER_FILTER_VALUES,
    message: 'Status pesanan tidak dikenal.',
    fallback: 'all',
  }),
  search: singleText({ label: 'kata kunci', maxLength: MAX_SEARCH_LENGTH }),
});

/**
 * An empty tracking field clears the number, which is how a mistyped resi is
 * corrected. `null` does the same explicitly; omitting the field leaves it as
 * it is.
 */
const trackingNumberField = z
  .string({ error: 'Nomor resi harus berupa teks.' })
  .trim()
  .max(MAX_TRACKING_LENGTH, { message: `Nomor resi maksimal ${MAX_TRACKING_LENGTH} karakter.` })
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value));

export const adminOrderStatusSchema = z
  .object({
    status: z.enum(ORDER_STATUSES, { error: 'Status pesanan tidak dikenal.' }),
    trackingNumber: trackingNumberField,
  })
  .strict();
