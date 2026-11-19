import { describe, it, expect } from 'vitest';
import { notificationSchema } from '../validators/payments.js';

/**
 * The webhook contract. Provider input is untrusted input: a missing signature,
 * an amount sent as a JSON number (which cannot be signed faithfully) or an
 * unknown field must not be silently normalised into something that looks fine.
 */

const valid = {
  order_id: 'BD-2026-0401',
  status_code: '200',
  gross_amount: '3085000.00',
  signature_key: 'a'.repeat(128),
  transaction_status: 'settlement',
  transaction_id: 'f4b2a1c0-0000-0000-0000-000000000000',
  payment_type: 'bank_transfer',
  fraud_status: 'accept',
};

describe('notificationSchema', () => {
  it('accepts a realistic settlement notification', () => {
    const parsed = notificationSchema.safeParse(valid);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      order_id: 'BD-2026-0401',
      gross_amount: '3085000.00',
      transaction_status: 'settlement',
    });
  });

  it('accepts a body without the optional fields', () => {
    const minimal = {
      order_id: valid.order_id,
      status_code: valid.status_code,
      gross_amount: valid.gross_amount,
      signature_key: valid.signature_key,
      transaction_status: valid.transaction_status,
    };

    expect(notificationSchema.safeParse(minimal).success).toBe(true);
  });

  it('strips fields it does not know instead of keeping them', () => {
    const parsed = notificationSchema.safeParse({ ...valid, amount_paid: 1, paid: true });

    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('amount_paid');
    expect(parsed.data).not.toHaveProperty('paid');
  });

  it('rejects a missing or malformed signature', () => {
    expect(notificationSchema.safeParse({ ...valid, signature_key: undefined }).success).toBe(false);
    expect(notificationSchema.safeParse({ ...valid, signature_key: 'abc' }).success).toBe(false);
    expect(notificationSchema.safeParse({ ...valid, signature_key: 'z'.repeat(128) }).success).toBe(
      false
    );
  });

  it('rejects an amount sent as a number', () => {
    expect(notificationSchema.safeParse({ ...valid, gross_amount: 3085000 }).success).toBe(false);
  });

  it('rejects a missing order id, status code, status or amount', () => {
    for (const field of ['order_id', 'status_code', 'gross_amount', 'transaction_status']) {
      expect(notificationSchema.safeParse({ ...valid, [field]: undefined }).success).toBe(false);
    }
  });

  it('rejects an over-long order id', () => {
    expect(notificationSchema.safeParse({ ...valid, order_id: 'x'.repeat(81) }).success).toBe(false);
  });
});
