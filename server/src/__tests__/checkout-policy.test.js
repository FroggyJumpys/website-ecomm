import { describe, it, expect } from 'vitest';
import {
  SHIPPING_METHODS,
  PAYMENT_METHODS,
  shippingCostFor,
  paymentLabelFor,
  checkoutFingerprint,
  toSafeOrderMoney,
  calculateOrderTotals,
  formatOrderNumber,
} from '../lib/checkout.js';

/**
 * Checkout policy: the values the server decides, never the client.
 *
 * Shipping rates and payment labels are copied from `client/src/lib/shipping.js`
 * so the number the customer saw is the number stored. Money is arithmetic on
 * exact decimal strings and `BigInt` — a price that cannot be represented as an
 * exact safe integer must be refused, not rounded.
 */

describe('shippingCostFor', () => {
  it('pins the three rates the storefront shows', () => {
    expect(shippingCostFor('reguler')).toBe(85_000);
    expect(shippingCostFor('kargo')).toBe(250_000);
    expect(shippingCostFor('workshop')).toBe(0);
  });

  it('rejects an unknown method instead of charging a default', () => {
    expect(() => shippingCostFor('instan')).toThrow(
      expect.objectContaining({ status: 422, code: 'VALIDATION_ERROR' })
    );
  });

  it('lists the methods and their ids', () => {
    expect(SHIPPING_METHODS.map((method) => method.id)).toEqual([
      'reguler',
      'kargo',
      'workshop',
    ]);
    expect(SHIPPING_METHODS.map((method) => method.cost)).toEqual([85_000, 250_000, 0]);
  });
});

describe('paymentLabelFor', () => {
  it('pins the exact labels the order stores', () => {
    expect(paymentLabelFor('bca')).toBe('Transfer bank BCA');
    expect(paymentLabelFor('bni-va')).toBe('Virtual account BNI');
    expect(paymentLabelFor('kartu')).toBe('Kartu kredit');
  });

  it('rejects an unknown method instead of storing a default label', () => {
    expect(() => paymentLabelFor('cod')).toThrow(
      expect.objectContaining({ status: 422, code: 'VALIDATION_ERROR' })
    );
  });

  it('lists the methods and their labels', () => {
    expect(PAYMENT_METHODS).toEqual([
      { id: 'bca', label: 'Transfer bank BCA' },
      { id: 'bni-va', label: 'Virtual account BNI' },
      { id: 'kartu', label: 'Kartu kredit' },
    ]);
  });
});

describe('checkoutFingerprint', () => {
  const input = { addressId: 7, shippingMethod: 'kargo', paymentMethod: 'bni-va' };

  it('is a lowercase 64 character hex digest', () => {
    expect(checkoutFingerprint(input)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for equal requests', () => {
    expect(checkoutFingerprint(input)).toBe(checkoutFingerprint({ ...input }));
  });

  it('changes when any checkout input changes', () => {
    const base = checkoutFingerprint(input);

    expect(checkoutFingerprint({ ...input, addressId: 8 })).not.toBe(base);
    expect(checkoutFingerprint({ ...input, shippingMethod: 'workshop' })).not.toBe(base);
    expect(checkoutFingerprint({ ...input, paymentMethod: 'bca' })).not.toBe(base);
  });

  it('does not depend on the order the keys were written in', () => {
    const reordered = {
      paymentMethod: input.paymentMethod,
      shippingMethod: input.shippingMethod,
      addressId: input.addressId,
    };

    expect(checkoutFingerprint(reordered)).toBe(checkoutFingerprint(input));
  });
});

describe('toSafeOrderMoney', () => {
  it('converts an exact decimal string to a number', () => {
    expect(toSafeOrderMoney('0')).toBe(0);
    expect(toSafeOrderMoney('1500000')).toBe(1_500_000);
  });

  it('accepts the largest safe integer', () => {
    expect(toSafeOrderMoney('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('refuses a value one above the safe integer range without rounding it first', () => {
    // 9007199254740993 is not representable as a double: parsing it through
    // Number would silently yield 9007199254740992 and let it pass.
    expect(() => toSafeOrderMoney('9007199254740993')).toThrow(
      expect.objectContaining({ status: 409, code: 'ORDER_TOTAL_TOO_LARGE' })
    );
  });

  it('refuses negatives, fractions and non-numeric text', () => {
    for (const bad of ['-1', '1.5', 'abc', '', '1e5', ' 12']) {
      expect(() => toSafeOrderMoney(bad)).toThrow(
        expect.objectContaining({ code: 'ORDER_TOTAL_TOO_LARGE' })
      );
    }
  });
});

describe('calculateOrderTotals', () => {
  it('multiplies each line and adds the shipping cost', () => {
    expect(
      calculateOrderTotals(
        [
          { unitPrice: '1500000', quantity: 2 },
          { unitPrice: '250000', quantity: 3 },
        ],
        85_000
      )
    ).toEqual({ subtotal: 3_750_000, shippingCost: 85_000, discount: 0, total: 3_835_000 });
  });

  it('treats workshop pickup as free', () => {
    expect(calculateOrderTotals([{ unitPrice: '990000', quantity: 1 }], 0)).toEqual({
      subtotal: 990_000,
      shippingCost: 0,
      discount: 0,
      total: 990_000,
    });
  });

  it('handles an empty cart with only shipping', () => {
    expect(calculateOrderTotals([], 85_000)).toEqual({
      subtotal: 0,
      shippingCost: 85_000,
      discount: 0,
      total: 85_000,
    });
  });

  it('accepts the largest representable subtotal', () => {
    // 4503599627370495 × 2 = 9007199254740990, safe; + 0 shipping stays safe.
    const totals = calculateOrderTotals(
      [{ unitPrice: '4503599627370495', quantity: 2 }],
      0
    );

    expect(totals.subtotal).toBe(9_007_199_254_740_990);
    expect(totals.total).toBe(9_007_199_254_740_990);
  });

  it('refuses a line total that would lose precision', () => {
    expect(() => calculateOrderTotals([{ unitPrice: '9007199254740993', quantity: 1 }], 0)).toThrow(
      expect.objectContaining({ status: 409, code: 'ORDER_TOTAL_TOO_LARGE' })
    );
    expect(() => calculateOrderTotals([{ unitPrice: '4503599627370496', quantity: 2 }], 0)).toThrow(
      expect.objectContaining({ code: 'ORDER_TOTAL_TOO_LARGE' })
    );
  });

  it('refuses a sum that would lose precision', () => {
    // Each line fits; the sum does not.
    expect(() =>
      calculateOrderTotals(
        [
          { unitPrice: '5000000000000000', quantity: 1 },
          { unitPrice: '5000000000000000', quantity: 1 },
        ],
        0
      )
    ).toThrow(expect.objectContaining({ code: 'ORDER_TOTAL_TOO_LARGE' }));
  });

  it('refuses a total that only overflows once shipping is added', () => {
    expect(() =>
      calculateOrderTotals([{ unitPrice: '9007199254740991', quantity: 1 }], 85_000)
    ).toThrow(expect.objectContaining({ code: 'ORDER_TOTAL_TOO_LARGE' }));
  });
});

describe('formatOrderNumber', () => {
  it('pads a short sequence to four digits', () => {
    expect(formatOrderNumber(2026, '417')).toBe('BD-2026-0417');
  });

  it('keeps a four digit sequence as it is', () => {
    expect(formatOrderNumber(2026, '1000')).toBe('BD-2026-1000');
  });

  it('never truncates a sequence that grew past four digits', () => {
    expect(formatOrderNumber(2026, '10000')).toBe('BD-2026-10000');
    expect(formatOrderNumber(2026, '1234567')).toBe('BD-2026-1234567');
  });

  it('uses the year it is given', () => {
    expect(formatOrderNumber(2027, '1')).toBe('BD-2027-0001');
  });
});
