import { describe, it, expect } from 'vitest';
import { cartItemSchema, cartQuantitySchema, cartItemIdSchema } from '../validators/cart.js';

/**
 * Cart request schemas.
 *
 * The body of an add carries a product id and optional variant/quantity, the
 * patch carries only a quantity, and the route id arrives as a string. All
 * three must reject rubbish with a Bahasa Indonesia message before any SQL
 * runs, and none may accept a price or an owner from the client.
 */

function firstIssue(result) {
  return result.success ? null : result.error.issues[0];
}

describe('cartItemSchema', () => {
  it('accepts a complete item', () => {
    const result = cartItemSchema.safeParse({
      productId: 3,
      color: 'Rotan natural',
      size: 'Standar',
      quantity: 2,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      productId: 3,
      color: 'Rotan natural',
      size: 'Standar',
      quantity: 2,
    });
  });

  it('defaults the variant to empty and the quantity to one', () => {
    const result = cartItemSchema.safeParse({ productId: 3 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ productId: 3, color: '', size: '', quantity: 1 });
  });

  it('trims the variant so a stray space still matches the catalogue value', () => {
    const result = cartItemSchema.safeParse({ productId: 3, color: '  Rotan natural  ' });

    expect(result.data.color).toBe('Rotan natural');
  });

  it('rejects a missing product id', () => {
    const issue = firstIssue(cartItemSchema.safeParse({}));

    expect(issue.message).toBe('ID produk wajib diisi.');
    expect(issue.path).toEqual(['productId']);
  });

  it('rejects a product id sent as a string', () => {
    const issue = firstIssue(cartItemSchema.safeParse({ productId: '3' }));

    expect(issue.message).toBe('ID produk harus berupa angka.');
    expect(issue.path).toEqual(['productId']);
  });

  it('rejects a fractional product id', () => {
    expect(firstIssue(cartItemSchema.safeParse({ productId: 1.5 })).message).toBe(
      'ID produk harus berupa angka bulat.'
    );
  });

  it('rejects zero and negative product ids', () => {
    for (const productId of [0, -4]) {
      expect(firstIssue(cartItemSchema.safeParse({ productId })).message).toBe(
        'ID produk tidak valid.'
      );
    }
  });

  it('rejects a product id beyond the safe integer range', () => {
    expect(
      firstIssue(cartItemSchema.safeParse({ productId: Number.MAX_SAFE_INTEGER + 2 })).message
    ).toBe('ID produk tidak valid.');
  });

  it('accepts the largest quantity PostgreSQL can store', () => {
    const result = cartItemSchema.safeParse({ productId: 3, quantity: 2_147_483_647 });

    expect(result.success).toBe(true);
    expect(result.data.quantity).toBe(2_147_483_647);
  });

  it('rejects a quantity of zero', () => {
    // Zero means "remove", which is DELETE. Accepting it here would make the
    // same request mean two different things.
    const issue = firstIssue(cartItemSchema.safeParse({ productId: 3, quantity: 0 }));

    expect(issue.message).toBe('Jumlah minimal 1.');
    expect(issue.path).toEqual(['quantity']);
  });

  it('rejects a fractional quantity', () => {
    expect(firstIssue(cartItemSchema.safeParse({ productId: 3, quantity: 2.5 })).message).toBe(
      'Jumlah harus berupa angka bulat.'
    );
  });

  it('rejects a quantity sent as a string', () => {
    expect(firstIssue(cartItemSchema.safeParse({ productId: 3, quantity: '2' })).message).toBe(
      'Jumlah harus berupa angka.'
    );
  });

  it('rejects a quantity beyond the PostgreSQL integer range', () => {
    expect(
      firstIssue(cartItemSchema.safeParse({ productId: 3, quantity: 2_147_483_648 })).message
    ).toBe('Jumlah terlalu besar.');
  });

  it('rejects a non-string variant', () => {
    expect(firstIssue(cartItemSchema.safeParse({ productId: 3, color: 12 })).message).toBe(
      'Warna yang dipilih tidak valid.'
    );
  });

  it('strips a client-supplied price and owner, so neither can be trusted', () => {
    const result = cartItemSchema.safeParse({
      productId: 3,
      price: 1,
      userId: 99,
      cartId: 5,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ productId: 3, color: '', size: '', quantity: 1 });
  });
});

describe('cartQuantitySchema', () => {
  it('accepts a whole quantity of one or more', () => {
    expect(cartQuantitySchema.parse({ quantity: 3 })).toEqual({ quantity: 3 });
  });

  it('rejects a missing quantity', () => {
    // A patch with no quantity is a client bug; silently doing nothing would
    // let the UI show a value the server never stored.
    expect(firstIssue(cartQuantitySchema.safeParse({})).message).toBe('Jumlah wajib diisi.');
  });

  it('rejects zero and negatives', () => {
    for (const quantity of [0, -2]) {
      expect(firstIssue(cartQuantitySchema.safeParse({ quantity })).message).toBe(
        'Jumlah minimal 1.'
      );
    }
  });

  it('rejects a fraction', () => {
    expect(firstIssue(cartQuantitySchema.safeParse({ quantity: 1.5 })).message).toBe(
      'Jumlah harus berupa angka bulat.'
    );
  });
});

describe('cartItemIdSchema', () => {
  it('parses a numeric route id into a number', () => {
    expect(cartItemIdSchema.parse('42')).toBe(42);
  });

  it('tolerates surrounding whitespace', () => {
    expect(cartItemIdSchema.parse(' 7 ')).toBe(7);
  });

  it('rejects an empty id', () => {
    expect(firstIssue(cartItemIdSchema.safeParse('')).message).toBe(
      'ID keranjang wajib diisi.'
    );
  });

  it('rejects a non-numeric id', () => {
    expect(firstIssue(cartItemIdSchema.safeParse('abc')).message).toBe(
      'ID keranjang harus berupa angka.'
    );
  });

  it('rejects a decimal id', () => {
    expect(firstIssue(cartItemIdSchema.safeParse('1.5')).message).toBe(
      'ID keranjang harus berupa angka bulat.'
    );
  });

  it('rejects zero', () => {
    expect(firstIssue(cartItemIdSchema.safeParse('0')).message).toBe(
      'ID keranjang tidak valid.'
    );
  });

  it('rejects an id beyond the safe integer range', () => {
    expect(firstIssue(cartItemIdSchema.safeParse('9007199254740993')).message).toBe(
      'ID keranjang tidak valid.'
    );
  });
});
