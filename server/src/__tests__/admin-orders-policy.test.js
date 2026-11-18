import { describe, it, expect } from 'vitest';
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  DEFAULT_CANCELLATION_REASON,
  allowedTransitions,
  canTransition,
} from '../lib/orderTransitions.js';
import { adminOrderListSchema, adminOrderStatusSchema } from '../validators/admin-orders.js';

/**
 * The policy and contracts the admin order endpoints expose.
 *
 * The transition table is pinned here because it is the rule that makes
 * cancellation safe: a terminal `cancelled` is what guarantees the stock
 * restore runs once. The query schema is pinned because a repeated or unknown
 * parameter must fail loudly rather than quietly returning page one.
 */

function firstIssue(result) {
  return result.success ? null : result.error.issues[0];
}

describe('order transition policy', () => {
  it('allows the forward path and cancelling from both open states', () => {
    expect(allowedTransitions('processing')).toEqual(['shipped', 'cancelled']);
    expect(allowedTransitions('shipped')).toEqual(['completed', 'cancelled']);

    for (const [from, targets] of Object.entries(ORDER_TRANSITIONS)) {
      for (const to of targets) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  it('makes completed and cancelled terminal', () => {
    expect(allowedTransitions('completed')).toEqual([]);
    expect(allowedTransitions('cancelled')).toEqual([]);

    for (const status of ORDER_STATUSES) {
      expect(canTransition('completed', status)).toBe(false);
      expect(canTransition('cancelled', status)).toBe(false);
    }
  });

  it('refuses backward moves', () => {
    expect(canTransition('shipped', 'processing')).toBe(false);
    expect(canTransition('completed', 'shipped')).toBe(false);
    expect(canTransition('completed', 'processing')).toBe(false);
  });

  it('treats an unknown source as having no exits', () => {
    expect(allowedTransitions('refunded')).toEqual([]);
    expect(canTransition('refunded', 'shipped')).toBe(false);
  });

  it('ships a default cancellation reason in Bahasa Indonesia', () => {
    expect(DEFAULT_CANCELLATION_REASON).toBe('Pesanan dibatalkan oleh admin toko.');
  });
});

describe('adminOrderListSchema', () => {
  it('applies the documented defaults', () => {
    expect(adminOrderListSchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      status: 'all',
      search: '',
    });
  });

  it('converts and trims query values', () => {
    expect(
      adminOrderListSchema.parse({
        page: '2',
        limit: '50',
        status: 'shipped',
        search: '  Sari  ',
      })
    ).toEqual({ page: 2, limit: 50, status: 'shipped', search: 'Sari' });
  });

  it('accepts only the known status filters', () => {
    for (const status of ['all', ...ORDER_STATUSES]) {
      expect(adminOrderListSchema.parse({ status }).status).toBe(status);
    }

    const result = adminOrderListSchema.safeParse({ status: 'refunded' });
    expect(firstIssue(result)).toMatchObject({
      path: ['status'],
      message: 'Status pesanan tidak dikenal.',
    });
  });

  it('rejects a repeated parameter instead of using one of its values', () => {
    const result = adminOrderListSchema.safeParse({ status: ['shipped', 'completed'] });
    expect(firstIssue(result).message).toBe('Parameter status hanya boleh diisi satu nilai.');
  });

  it('rejects pages and limits outside the contract', () => {
    expect(adminOrderListSchema.safeParse({ page: '0' }).success).toBe(false);
    expect(adminOrderListSchema.safeParse({ page: 'dua' }).success).toBe(false);
    expect(adminOrderListSchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(adminOrderListSchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('caps the search length', () => {
    expect(adminOrderListSchema.safeParse({ search: 'a'.repeat(100) }).success).toBe(true);

    const result = adminOrderListSchema.safeParse({ search: 'a'.repeat(101) });
    expect(firstIssue(result).message).toBe('Kata kunci maksimal 100 karakter.');
  });
});

describe('adminOrderStatusSchema', () => {
  it('accepts a status on its own', () => {
    expect(adminOrderStatusSchema.parse({ status: 'shipped' })).toEqual({
      status: 'shipped',
      trackingNumber: undefined,
    });
  });

  it('trims a supplied tracking number', () => {
    expect(adminOrderStatusSchema.parse({ status: 'shipped', trackingNumber: ' JNE-1 ' })).toEqual({
      status: 'shipped',
      trackingNumber: 'JNE-1',
    });
  });

  it('reads an empty or null tracking number as clearing it', () => {
    expect(
      adminOrderStatusSchema.parse({ status: 'shipped', trackingNumber: '' }).trackingNumber
    ).toBeNull();
    expect(
      adminOrderStatusSchema.parse({ status: 'shipped', trackingNumber: null }).trackingNumber
    ).toBeNull();
  });

  it('refuses an unknown, missing or mistyped status', () => {
    expect(firstIssue(adminOrderStatusSchema.safeParse({ status: 'refunded' })).message).toBe(
      'Status pesanan tidak dikenal.'
    );
    expect(firstIssue(adminOrderStatusSchema.safeParse({})).path).toEqual(['status']);
    expect(firstIssue(adminOrderStatusSchema.safeParse({ status: 3 })).path).toEqual(['status']);
  });

  it('refuses unknown fields', () => {
    expect(
      adminOrderStatusSchema.safeParse({ status: 'shipped', cancellationReason: 'x' }).success
    ).toBe(false);
    expect(adminOrderStatusSchema.safeParse({ status: 'shipped', total: 1 }).success).toBe(false);
  });

  it('refuses a tracking number that is not text or is too long', () => {
    expect(
      adminOrderStatusSchema.safeParse({ status: 'shipped', trackingNumber: 42 }).success
    ).toBe(false);
    expect(
      adminOrderStatusSchema.safeParse({ status: 'shipped', trackingNumber: 'x'.repeat(65) })
        .success
    ).toBe(false);
  });
});
