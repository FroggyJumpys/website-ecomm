import { describe, it, expect } from 'vitest';
import {
  checkoutSchema,
  idempotencyHeaderSchema,
  orderListSchema,
  orderNumberParamsSchema,
  ORDER_STATUS_VALUES,
} from '../validators/orders.js';

/**
 * Checkout, history and detail request contracts.
 *
 * The client names an address and two policy ids. It never names a price, a
 * total, an item list or an owner, so the schemas here must strip nothing and
 * accept nothing extra — the whole payload is rejected when a field does not
 * belong. Every message is the one the customer sees, in Bahasa Indonesia.
 */

function firstIssue(result) {
  return result.success ? null : result.error.issues[0];
}

function checkout(overrides = {}) {
  return { addressId: 1, shippingMethod: 'reguler', paymentMethod: 'bca', ...overrides };
}

describe('checkoutSchema', () => {
  it('accepts the documented payload', () => {
    expect(checkoutSchema.parse(checkout())).toEqual({
      addressId: 1,
      shippingMethod: 'reguler',
      paymentMethod: 'bca',
    });
  });

  it('accepts every shipping and payment choice the storefront offers', () => {
    for (const shippingMethod of ['reguler', 'kargo', 'workshop']) {
      for (const paymentMethod of ['bca', 'bni-va', 'kartu']) {
        expect(
          checkoutSchema.safeParse(checkout({ shippingMethod, paymentMethod })).success
        ).toBe(true);
      }
    }
  });

  it('rejects a missing address', () => {
    const issue = firstIssue(checkoutSchema.safeParse({ ...checkout(), addressId: undefined }));

    expect(issue.message).toBe('Alamat pengiriman wajib dipilih.');
    expect(issue.path).toEqual(['addressId']);
  });

  it('rejects an address id sent as a string', () => {
    expect(firstIssue(checkoutSchema.safeParse(checkout({ addressId: '1' }))).message).toBe(
      'Alamat pengiriman tidak valid.'
    );
  });

  it('rejects a fractional address id', () => {
    expect(firstIssue(checkoutSchema.safeParse(checkout({ addressId: 1.5 }))).message).toBe(
      'Alamat pengiriman tidak valid.'
    );
  });

  it('rejects zero, negative and unsafe address ids', () => {
    for (const addressId of [0, -3, Number.MAX_SAFE_INTEGER + 2]) {
      expect(firstIssue(checkoutSchema.safeParse(checkout({ addressId }))).message).toBe(
        'Alamat pengiriman tidak valid.'
      );
    }
  });

  it('rejects an unknown shipping method instead of falling back to a default', () => {
    const issue = firstIssue(checkoutSchema.safeParse(checkout({ shippingMethod: 'instan' })));

    expect(issue.message).toBe('Metode pengiriman tidak dikenal.');
    expect(issue.path).toEqual(['shippingMethod']);
  });

  it('rejects an unknown payment method instead of falling back to a default', () => {
    const issue = firstIssue(checkoutSchema.safeParse(checkout({ paymentMethod: 'cod' })));

    expect(issue.message).toBe('Metode pembayaran tidak dikenal.');
    expect(issue.path).toEqual(['paymentMethod']);
  });

  it('rejects a payload carrying a price, a total or an owner', () => {
    for (const extra of [
      { items: [] },
      { subtotal: 1 },
      { total: 1 },
      { shippingCost: 0 },
      { discount: 0 },
      { userId: 2 },
      { status: 'completed' },
    ]) {
      expect(checkoutSchema.safeParse(checkout(extra)).success).toBe(false);
    }
  });

  it('rejects a card number rather than silently accepting it', () => {
    // Payment is a choice, not an integration. Card data must never reach the
    // request, let alone a column.
    expect(checkoutSchema.safeParse(checkout({ cardNumber: '4111111111111111' })).success).toBe(
      false
    );
  });
});

describe('idempotencyHeaderSchema', () => {
  const key = 'checkout-2f4a9c71-8b3e';

  it('accepts a 16 to 128 character ASCII key', () => {
    expect(idempotencyHeaderSchema.parse({ idempotencyKey: key })).toEqual({
      idempotencyKey: key,
    });
    expect(
      idempotencyHeaderSchema.safeParse({ idempotencyKey: 'a'.repeat(128) }).success
    ).toBe(true);
  });

  it('rejects a missing key', () => {
    const issue = firstIssue(idempotencyHeaderSchema.safeParse({}));

    expect(issue.message).toBe('Idempotency-Key wajib diisi.');
    expect(issue.path).toEqual(['idempotencyKey']);
  });

  it('rejects a key shorter than 16 or longer than 128 characters', () => {
    for (const short of ['', 'a', 'a'.repeat(15)]) {
      expect(idempotencyHeaderSchema.safeParse({ idempotencyKey: short }).success).toBe(false);
    }
    expect(idempotencyHeaderSchema.safeParse({ idempotencyKey: 'a'.repeat(129) }).success).toBe(
      false
    );
  });

  it('rejects characters outside letters, digits, underscore, hyphen', () => {
    for (const bad of ['has space in it', 'emoji-🚀-key-value', 'slash/key/value', 'dot.key.value']) {
      expect(idempotencyHeaderSchema.safeParse({ idempotencyKey: bad }).success).toBe(false);
    }
  });

  it('does not trim or case-fold, so two different keys never collapse', () => {
    // A padded key is not a silently accepted variant of the same key: it is a
    // different string, and the check constraint stores exactly what arrived.
    expect(idempotencyHeaderSchema.safeParse({ idempotencyKey: ` ${key} ` }).success).toBe(
      false
    );
    expect(
      idempotencyHeaderSchema.parse({ idempotencyKey: key.toUpperCase() }).idempotencyKey
    ).toBe(key.toUpperCase());
  });

  it('accepts a UUID', () => {
    expect(
      idempotencyHeaderSchema.safeParse({
        idempotencyKey: '9f1c1c1e-6a3b-4a0e-8f2d-7c5b4a392817',
      }).success
    ).toBe(true);
  });
});

describe('orderListSchema', () => {
  it('defaults to page 1, ten rows and every status', () => {
    expect(orderListSchema.parse({})).toEqual({ page: 1, limit: 10, status: 'all' });
  });

  it('accepts the documented bounds', () => {
    expect(orderListSchema.parse({ page: '1000000', limit: '100', status: 'shipped' })).toEqual({
      page: 1_000_000,
      limit: 100,
      status: 'shipped',
    });
  });

  it('accepts every status the vocabulary defines', () => {
    expect(ORDER_STATUS_VALUES).toEqual(['all', 'processing', 'shipped', 'completed', 'cancelled']);

    for (const status of ORDER_STATUS_VALUES) {
      expect(orderListSchema.parse({ status }).status).toBe(status);
    }
  });

  it('rejects an unknown status', () => {
    const issue = firstIssue(orderListSchema.safeParse({ status: 'refunded' }));

    expect(issue.message).toBe('Status pesanan tidak dikenal.');
    expect(issue.path).toEqual(['status']);
  });

  it('rejects a repeated query parameter instead of collapsing it', () => {
    expect(
      firstIssue(orderListSchema.safeParse({ status: ['all', 'shipped'] })).message
    ).toBe('Parameter status hanya boleh diisi satu nilai.');
  });

  it('rejects decimals, malformed numbers and out-of-range pages', () => {
    for (const page of ['1.5', 'dua', '0', '1000001', '-1']) {
      expect(orderListSchema.safeParse({ page }).success).toBe(false);
    }
    for (const limit of ['0', '101', '2.5', 'sepuluh']) {
      expect(orderListSchema.safeParse({ limit }).success).toBe(false);
    }
  });

  it('rejects an array of pages', () => {
    expect(firstIssue(orderListSchema.safeParse({ page: ['1', '2'] })).message).toBe(
      'Parameter halaman hanya boleh diisi satu nilai.'
    );
  });
});

describe('orderNumberParamsSchema', () => {
  it('accepts a generated order number', () => {
    expect(orderNumberParamsSchema.parse({ orderNumber: 'BD-2026-1000' })).toEqual({
      orderNumber: 'BD-2026-1000',
    });
  });

  it('accepts a number whose sequence grew past four digits', () => {
    expect(orderNumberParamsSchema.safeParse({ orderNumber: 'BD-2026-1234567' }).success).toBe(
      true
    );
  });

  it('rejects a malformed order number', () => {
    for (const orderNumber of ['', 'BD-2026-417', 'bd-2026-0417', 'BD-26-0417', 'BD-2026-', 'x']) {
      expect(orderNumberParamsSchema.safeParse({ orderNumber }).success).toBe(false);
    }
  });

  it('rejects an over-long order number', () => {
    expect(
      orderNumberParamsSchema.safeParse({ orderNumber: `BD-2026-${'9'.repeat(80)}` }).success
    ).toBe(false);
  });
});
