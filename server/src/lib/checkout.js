import { createHash } from 'node:crypto';
import { AppError } from './errors.js';

/**
 * Checkout policy: everything the server decides about a checkout before it
 * touches the database.
 *
 * Three rules:
 *
 *  - **The server prices the order.** The browser may display a rate; only this
 *    table decides what is charged. The ids and labels mirror
 *    `client/src/lib/shipping.js` exactly, so the customer is not surprised.
 *  - **Money never goes through a float.** Prices arrive from PostgreSQL as
 *    decimal text and are multiplied and added as `BigInt`. A value that cannot
 *    be represented exactly as a JSON number is refused, never rounded.
 *  - **A retry is recognised by what was asked, not by what is in the cart.**
 *    The fingerprint covers the three inputs and nothing else, so a replay still
 *    works after the cart has been emptied.
 */

export const SHIPPING_METHODS = Object.freeze([
  { id: 'reguler', label: 'Reguler', cost: 85_000 },
  { id: 'kargo', label: 'Kargo mebel', cost: 250_000 },
  { id: 'workshop', label: 'Ambil di workshop', cost: 0 },
]);

export const PAYMENT_METHODS = Object.freeze([
  { id: 'bca', label: 'Transfer bank BCA' },
  { id: 'bni-va', label: 'Virtual account BNI' },
  // The label is what the order stores and the customer reads; QRIS is a brand
  // name, so it is not translated.
  { id: 'qris', label: 'QRIS' },
  { id: 'kartu', label: 'Kartu kredit' },
]);

/** The largest whole Rupiah amount a JSON number can carry exactly. */
const MAX_SAFE_MONEY = BigInt(Number.MAX_SAFE_INTEGER);

function unknownShipping() {
  return new AppError(422, 'VALIDATION_ERROR', 'Metode pengiriman tidak dikenal.', {
    field: 'shippingMethod',
    message: 'Metode pengiriman tidak dikenal.',
  });
}

function unknownPayment() {
  return new AppError(422, 'VALIDATION_ERROR', 'Metode pembayaran tidak dikenal.', {
    field: 'paymentMethod',
    message: 'Metode pembayaran tidak dikenal.',
  });
}

function totalTooLarge() {
  return new AppError(
    409,
    'ORDER_TOTAL_TOO_LARGE',
    'Total pesanan terlalu besar untuk diproses. Kurangi jumlah barang.'
  );
}

export function shippingCostFor(methodId) {
  const method = SHIPPING_METHODS.find((candidate) => candidate.id === methodId);

  if (!method) throw unknownShipping();
  return method.cost;
}

export function paymentLabelFor(methodId) {
  const method = PAYMENT_METHODS.find((candidate) => candidate.id === methodId);

  if (!method) throw unknownPayment();
  return method.label;
}

/**
 * SHA-256 over the canonical request. Built from an array, not an object, so
 * key insertion order can never change the digest — the same request must
 * always produce the same fingerprint, whichever layer built it.
 */
export function checkoutFingerprint({ addressId, shippingMethod, paymentMethod }) {
  const canonical = JSON.stringify([addressId, shippingMethod, paymentMethod]);

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Converts a monetary column, cast to text, into a JSON number — refusing
 * anything a JSON number cannot hold exactly.
 *
 * The text form matters: `pg` parses BIGINT into a JavaScript number by default,
 * and 9007199254740993 would arrive already rounded to ...992. Casting to text
 * in the query and checking here is what makes the refusal honest.
 */
export function toSafeOrderMoney(decimalText) {
  if (typeof decimalText !== 'string' || !/^\d+$/.test(decimalText)) throw totalTooLarge();

  const exact = BigInt(decimalText);

  if (exact > MAX_SAFE_MONEY) throw totalTooLarge();

  return Number(exact);
}

/**
 * Multiplies, sums and adds shipping in exact arithmetic, then converts once at
 * the end. Each line is checked on its own so the error can only mean the order
 * genuinely cannot be represented, not that an intermediate step rounded.
 */
export function calculateOrderTotals(lines, shippingCost) {
  let subtotal = 0n;

  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 0) throw totalTooLarge();

    const unitPrice = typeof line.unitPrice === 'string' && /^\d+$/.test(line.unitPrice)
      ? BigInt(line.unitPrice)
      : null;

    if (unitPrice === null) throw totalTooLarge();

    const lineTotal = unitPrice * BigInt(line.quantity);
    if (lineTotal > MAX_SAFE_MONEY) throw totalTooLarge();

    subtotal += lineTotal;
    if (subtotal > MAX_SAFE_MONEY) throw totalTooLarge();
  }

  if (!Number.isSafeInteger(shippingCost) || shippingCost < 0) throw totalTooLarge();

  const total = subtotal + BigInt(shippingCost);
  if (total > MAX_SAFE_MONEY) throw totalTooLarge();

  return {
    subtotal: Number(subtotal),
    shippingCost,
    discount: 0,
    total: Number(total),
  };
}

/**
 * `BD-2026-0417`. The sequence is text from PostgreSQL, so it keeps every digit
 * it was given: padding is a minimum width, never a truncation.
 */
export function formatOrderNumber(year, sequenceText) {
  return `BD-${year}-${String(sequenceText).padStart(4, '0')}`;
}
