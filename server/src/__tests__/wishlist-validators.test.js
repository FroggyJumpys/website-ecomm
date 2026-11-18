import { describe, it, expect } from 'vitest';
import { wishlistItemSchema, wishlistProductIdSchema } from '../validators/wishlist.js';

/**
 * The wishlist takes one product id, either in a JSON body (POST) or in the URL
 * (DELETE). Both paths must reject the same rubbish before any SQL runs, and
 * both must surface a Bahasa Indonesia message a form can show.
 */

function firstIssue(result) {
  return result.success ? null : result.error.issues[0];
}

describe('wishlistItemSchema', () => {
  it('accepts a positive integer product id', () => {
    const result = wishlistItemSchema.safeParse({ productId: 5 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ productId: 5 });
  });

  it('accepts the largest safe integer', () => {
    const result = wishlistItemSchema.safeParse({ productId: Number.MAX_SAFE_INTEGER });
    expect(result.success).toBe(true);
  });

  it('rejects a missing product id', () => {
    const issue = firstIssue(wishlistItemSchema.safeParse({}));

    expect(issue.message).toBe('ID produk wajib diisi.');
    expect(issue.path).toEqual(['productId']);
  });

  it('rejects a null product id', () => {
    expect(firstIssue(wishlistItemSchema.safeParse({ productId: null })).message).toBe(
      'ID produk wajib diisi.'
    );
  });

  it('rejects a product id sent as a string', () => {
    // A numeric string is a client bug, not user input: accept numbers only so
    // one request cannot mean two different products depending on the caller.
    const issue = firstIssue(wishlistItemSchema.safeParse({ productId: '5' }));

    expect(issue.message).toBe('ID produk harus berupa angka.');
    expect(issue.path).toEqual(['productId']);
  });

  it('rejects a fractional product id', () => {
    expect(firstIssue(wishlistItemSchema.safeParse({ productId: 1.5 })).message).toBe(
      'ID produk harus berupa angka bulat.'
    );
  });

  it('rejects NaN', () => {
    expect(firstIssue(wishlistItemSchema.safeParse({ productId: NaN })).message).toBe(
      'ID produk harus berupa angka.'
    );
  });

  it('rejects zero and negative ids', () => {
    for (const productId of [0, -1, -999]) {
      expect(firstIssue(wishlistItemSchema.safeParse({ productId })).message).toBe(
        'ID produk tidak valid.'
      );
    }
  });

  it('rejects an id beyond the safe integer range', () => {
    expect(
      firstIssue(wishlistItemSchema.safeParse({ productId: Number.MAX_SAFE_INTEGER + 2 })).message
    ).toBe('ID produk tidak valid.');
  });

  it('strips extra fields, so a client cannot nominate an owner', () => {
    const result = wishlistItemSchema.safeParse({ productId: 5, userId: 99, id: 1 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ productId: 5 });
  });
});

describe('wishlistProductIdSchema', () => {
  it('accepts a numeric string from the URL and returns a number', () => {
    expect(wishlistProductIdSchema.parse('42')).toBe(42);
  });

  it('tolerates surrounding whitespace', () => {
    expect(wishlistProductIdSchema.parse(' 7 ')).toBe(7);
  });

  it('rejects an empty id', () => {
    expect(firstIssue(wishlistProductIdSchema.safeParse('')).message).toBe('ID produk wajib diisi.');
  });

  it('rejects a non-numeric id', () => {
    expect(firstIssue(wishlistProductIdSchema.safeParse('abc')).message).toBe(
      'ID produk harus berupa angka.'
    );
  });

  it('rejects a decimal id', () => {
    expect(firstIssue(wishlistProductIdSchema.safeParse('1.5')).message).toBe(
      'ID produk harus berupa angka bulat.'
    );
  });

  it('rejects zero', () => {
    expect(firstIssue(wishlistProductIdSchema.safeParse('0')).message).toBe(
      'ID produk tidak valid.'
    );
  });

  it('rejects an id beyond the safe integer range', () => {
    expect(firstIssue(wishlistProductIdSchema.safeParse('9007199254740993')).message).toBe(
      'ID produk tidak valid.'
    );
  });
});
