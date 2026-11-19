import { describe, it, expect } from 'vitest';
import {
  attemptUsable,
  buildSnapPayload,
  enabledPaymentsFor,
  grossAmountMatches,
  mapTransactionStatus,
  nextPaymentStatus,
  notificationFingerprint,
  notificationSignature,
  parseProviderAmount,
  providerOrderIdFor,
  qrCodeUrl,
  snapScriptUrl,
  verifyNotificationSignature,
} from '../lib/payments.js';

/**
 * Midtrans policy without a provider, an HTTP server or a database.
 *
 * These are the decisions that protect the money: what a provider status means,
 * whether a notification is genuine, whether an amount is the one we quoted,
 * and whether a late event is allowed to overwrite a newer one.
 */

const SERVER_KEY = 'SB-Mid-server-test-key';

/** A real sha512 digest, computed once outside the test so it is not tautological. */
const EXPECTED_SIGNATURE =
  '8f2ebf78630fdadbf65549bc6bba87c52c729f4c02a5dfa1802d6ef10337d45d' +
  'fe374d04e1a916409d0c0b03e03c53d77673d173e679f3fa2a009335d6848a5b';

function notification(overrides = {}) {
  return {
    order_id: 'BD-2026-0401',
    status_code: '200',
    gross_amount: '1500000.00',
    transaction_status: 'settlement',
    signature_key: EXPECTED_SIGNATURE,
    ...overrides,
  };
}

function order(overrides = {}) {
  return {
    orderNumber: 'BD-2026-0401',
    items: [
      { productId: 7, slug: 'kursi-rotan', name: 'Kursi Rotan', price: 1_500_000, quantity: 2 },
    ],
    subtotal: 3_000_000,
    shippingCost: 85_000,
    discount: 0,
    total: 3_085_000,
    paymentMethodId: 'bca',
    shippingAddress: { recipient: 'Sari Wulandari', phone: '081234567890' },
    ...overrides,
  };
}

describe('mapTransactionStatus', () => {
  it('treats an accepted capture and a settlement as paid', () => {
    expect(mapTransactionStatus({ transactionStatus: 'capture', fraudStatus: 'accept' })).toBe(
      'paid'
    );
    expect(mapTransactionStatus({ transactionStatus: 'settlement' })).toBe('paid');
  });

  it('keeps a challenged card capture pending', () => {
    expect(mapTransactionStatus({ transactionStatus: 'capture', fraudStatus: 'challenge' })).toBe(
      'pending'
    );
    expect(mapTransactionStatus({ transactionStatus: 'authorize' })).toBe('pending');
  });

  it('maps refusals, cancellations and expiry to a terminal failure', () => {
    expect(mapTransactionStatus({ transactionStatus: 'capture', fraudStatus: 'deny' })).toBe(
      'failed'
    );
    expect(mapTransactionStatus({ transactionStatus: 'deny' })).toBe('failed');
    expect(mapTransactionStatus({ transactionStatus: 'cancel' })).toBe('failed');
    expect(mapTransactionStatus({ transactionStatus: 'failure' })).toBe('failed');
    expect(mapTransactionStatus({ transactionStatus: 'expire' })).toBe('expired');
  });

  it('maps refunds and ignores a status it does not know', () => {
    expect(mapTransactionStatus({ transactionStatus: 'refund' })).toBe('refunded');
    expect(mapTransactionStatus({ transactionStatus: 'partial_refund' })).toBe('refunded');
    expect(mapTransactionStatus({ transactionStatus: 'something_new' })).toBeNull();
  });
});

describe('nextPaymentStatus', () => {
  it('moves a pending attempt forward', () => {
    expect(nextPaymentStatus('pending', 'paid')).toBe('paid');
    expect(nextPaymentStatus('pending', 'expired')).toBe('expired');
    expect(nextPaymentStatus('pending', 'failed')).toBe('failed');
  });

  it('refuses a replay of the same state', () => {
    expect(nextPaymentStatus('paid', 'paid')).toBeNull();
    expect(nextPaymentStatus('pending', 'pending')).toBeNull();
  });

  it('never lets a late pending undo a settlement', () => {
    expect(nextPaymentStatus('paid', 'pending')).toBeNull();
    expect(nextPaymentStatus('paid', 'failed')).toBeNull();
    expect(nextPaymentStatus('paid', 'expired')).toBeNull();
  });

  it('allows a refund only after payment, and nothing after a refund', () => {
    expect(nextPaymentStatus('paid', 'refunded')).toBe('refunded');
    expect(nextPaymentStatus('pending', 'refunded')).toBeNull();
    expect(nextPaymentStatus('refunded', 'paid')).toBeNull();
  });

  it('accepts money that arrives after a failure or an expiry', () => {
    expect(nextPaymentStatus('failed', 'paid')).toBe('paid');
    expect(nextPaymentStatus('expired', 'paid')).toBe('paid');
  });

  it('does not resurrect a failed attempt as pending', () => {
    expect(nextPaymentStatus('failed', 'pending')).toBeNull();
    expect(nextPaymentStatus('expired', 'pending')).toBeNull();
  });
});

describe('notification signature', () => {
  it('reproduces the documented sha512 over order id, status code, amount and key', () => {
    expect(
      notificationSignature({
        orderId: 'BD-2026-0401',
        statusCode: '200',
        grossAmount: '1500000.00',
        serverKey: SERVER_KEY,
      })
    ).toBe(EXPECTED_SIGNATURE);
  });

  it('accepts a correctly signed body', () => {
    expect(verifyNotificationSignature(notification(), SERVER_KEY)).toBe(true);
  });

  it('rejects a body whose amount, status code or order was changed', () => {
    expect(verifyNotificationSignature(notification({ gross_amount: '1.00' }), SERVER_KEY)).toBe(
      false
    );
    expect(
      verifyNotificationSignature(notification({ transaction_status: 'expire' }), SERVER_KEY)
    ).toBe(true); // the status is not part of the signature, so it cannot be checked there
    expect(verifyNotificationSignature(notification({ status_code: '201' }), SERVER_KEY)).toBe(
      false
    );
    expect(
      verifyNotificationSignature(notification({ order_id: 'BD-2026-9999' }), SERVER_KEY)
    ).toBe(false);
  });

  it('rejects a missing signature, a missing server key and a malformed digest', () => {
    expect(
      verifyNotificationSignature({ ...notification(), signature_key: undefined }, SERVER_KEY)
    ).toBe(false);
    expect(verifyNotificationSignature(notification(), '')).toBe(false);
    expect(verifyNotificationSignature(notification({ signature_key: 'zz' }), SERVER_KEY)).toBe(
      false
    );
    expect(verifyNotificationSignature(null, SERVER_KEY)).toBe(false);
  });
});

describe('notificationFingerprint', () => {
  it('is stable for the same event and differs for a different status', () => {
    const first = notificationFingerprint(
      notification({ transaction_id: 'tx-1', transaction_status: 'pending' })
    );
    const again = notificationFingerprint(
      notification({ transaction_id: 'tx-1', transaction_status: 'pending' })
    );
    const settled = notificationFingerprint(
      notification({ transaction_id: 'tx-1', transaction_status: 'settlement' })
    );

    expect(first).toBe(again);
    expect(first).not.toBe(settled);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('amount handling', () => {
  it('parses whole Rupiah sent with a zero fraction', () => {
    expect(parseProviderAmount('1500000.00')).toBe(1_500_000n);
    expect(parseProviderAmount('1500000')).toBe(1_500_000n);
    expect(parseProviderAmount('0.00')).toBe(0n);
  });

  it('refuses a fraction, separators, a number and junk', () => {
    expect(parseProviderAmount('1500000.50')).toBeNull();
    expect(parseProviderAmount('1.500.000')).toBeNull();
    expect(parseProviderAmount('1,500,000')).toBeNull();
    expect(parseProviderAmount('-1500000')).toBeNull();
    expect(parseProviderAmount('')).toBeNull();
    expect(parseProviderAmount(1_500_000)).toBeNull();
  });

  it('compares a provider amount with the stored integer exactly', () => {
    expect(grossAmountMatches('3085000.00', 3_085_000)).toBe(true);
    expect(grossAmountMatches('3085001.00', 3_085_000)).toBe(false);
    expect(grossAmountMatches('nonsense', 3_085_000)).toBe(false);
  });
});

describe('attempt identity', () => {
  it('uses the order number for the first attempt and suffixes retries', () => {
    expect(providerOrderIdFor('BD-2026-0401', 0)).toBe('BD-2026-0401');
    expect(providerOrderIdFor('BD-2026-0401', 1)).toBe('BD-2026-0401');
    expect(providerOrderIdFor('BD-2026-0401', 2)).toBe('BD-2026-0401-2');
  });

  it('reuses only a pending attempt that has a token and time left', () => {
    const now = new Date('2026-11-18T10:00:00Z');

    expect(
      attemptUsable({ status: 'pending', snapToken: 'tok', expiresAt: '2026-11-18T11:00:00Z' }, now)
    ).toBe(true);
    expect(
      attemptUsable({ status: 'pending', snapToken: 'tok', expiresAt: '2026-11-18T09:00:00Z' }, now)
    ).toBe(false);
    expect(attemptUsable({ status: 'pending', snapToken: null }, now)).toBe(false);
    expect(attemptUsable({ status: 'paid', snapToken: 'tok' }, now)).toBe(false);
  });
});

describe('buildSnapPayload', () => {
  it('prices the payload from the stored order, including shipping', () => {
    const payload = buildSnapPayload({
      order: order(),
      providerOrderId: 'BD-2026-0401',
      customer: { name: 'Sari Wulandari', email: 'sari@badekor.id', phone: '081234567890' },
      clientOrigin: 'http://localhost:5173',
      expiryMinutes: 60,
    });

    expect(payload.transaction_details).toEqual({
      order_id: 'BD-2026-0401',
      gross_amount: 3_085_000,
    });
    expect(payload.item_details).toEqual([
      { id: '7', price: 1_500_000, quantity: 2, name: 'Kursi Rotan' },
      { id: 'ongkos-kirim', price: 85_000, quantity: 1, name: 'Ongkos kirim' },
    ]);
    expect(payload.enabled_payments).toEqual(['bca_va']);
    expect(payload.expiry).toEqual({ unit: 'minutes', duration: 60 });
    expect(payload.callbacks.finish).toBe('http://localhost:5173/pesanan/BD-2026-0401/selesai');
    expect(payload.customer_details.first_name).toBe('Sari Wulandari');
  });

  it('refuses to send a payload whose lines do not add up to the order total', () => {
    expect(() =>
      buildSnapPayload({
        order: order({ total: 1 }),
        providerOrderId: 'BD-2026-0401',
      })
    ).toThrow(/does not match order total/);
  });

  it('refuses a payment method with no provider channel', () => {
    expect(() =>
      buildSnapPayload({
        order: order({ paymentMethodId: 'cod' }),
        providerOrderId: 'BD-2026-0401',
      })
    ).toThrow(/No Midtrans channel/);
  });

  it('adds a discount line so the total still matches', () => {
    const payload = buildSnapPayload({
      order: order({ discount: 85_000, total: 3_000_000 }),
      providerOrderId: 'BD-2026-0401',
      expiryMinutes: 30,
    });

    expect(payload.item_details.at(-1)).toEqual({
      id: 'diskon',
      price: -85_000,
      quantity: 1,
      name: 'Diskon',
    });
  });

  it('only asks for 3-D Secure on card payments and truncates long names', () => {
    const card = buildSnapPayload({
      order: order({
        paymentMethodId: 'kartu',
        items: [{ productId: 1, slug: 's', name: 'N'.repeat(80), price: 3_085_000, quantity: 1 }],
        shippingCost: 0,
      }),
      providerOrderId: 'BD-2026-0401',
    });

    expect(card.credit_card).toEqual({ secure: true });
    expect(card.enabled_payments).toEqual(['credit_card']);
    expect(card.item_details[0].name.length).toBeLessThanOrEqual(50);

    const transfer = buildSnapPayload({ order: order(), providerOrderId: 'BD-2026-0401' });
    expect(transfer.credit_card).toBeUndefined();
  });

  it('asks Snap for the QRIS channel only, with no card settings', () => {
    const payload = buildSnapPayload({
      order: order({ paymentMethodId: 'qris', paymentMethod: 'QRIS' }),
      providerOrderId: 'BD-2026-0401',
    });

    expect(payload.enabled_payments).toEqual(['other_qris']);
    expect(payload.credit_card).toBeUndefined();
    expect(payload.transaction_details.gross_amount).toBe(3_085_000);
  });
});

describe('provider helpers', () => {
  it('maps each checkout method to its Snap channels', () => {
    expect(enabledPaymentsFor('bca')).toEqual(['bca_va']);
    expect(enabledPaymentsFor('bni-va')).toEqual(['bni_va']);
    expect(enabledPaymentsFor('qris')).toEqual(['other_qris']);
    expect(enabledPaymentsFor('kartu')).toEqual(['credit_card']);
    expect(enabledPaymentsFor('unknown')).toBeNull();
  });

  it('reads the transaction-specific QR image out of the provider actions', () => {
    expect(
      qrCodeUrl([
        { name: 'cancel', method: 'POST', url: 'https://api.sandbox.midtrans.com/v2/cancel' },
        {
          name: 'generate_qr_code',
          method: 'GET',
          url: 'https://api.sandbox.midtrans.com/v2/qris/abc/qr-code',
        },
      ])
    ).toBe('https://api.sandbox.midtrans.com/v2/qris/abc/qr-code');
  });

  it('accepts only an https QR URL, and no URL at all as "not ready yet"', () => {
    expect(qrCodeUrl([{ name: 'generate_qr_code', url: 'javascript:alert(1)' }])).toBeNull();
    expect(qrCodeUrl([{ name: 'generate_qr_code', url: 'http://example.test/qr.png' }])).toBeNull();
    expect(qrCodeUrl([{ name: 'generate_qr_code', url: 'not a url' }])).toBeNull();
    expect(qrCodeUrl([{ name: 'generate_qr_code' }])).toBeNull();
    expect(qrCodeUrl([{ name: 'cancel', url: 'https://example.test' }])).toBeNull();
    expect(qrCodeUrl(undefined)).toBeNull();
  });

  it('uses the sandbox Snap script outside production', () => {
    expect(snapScriptUrl({ production: false })).toContain('sandbox');
    expect(snapScriptUrl({ production: true })).toBe('https://app.midtrans.com/snap/snap.js');
  });
});
