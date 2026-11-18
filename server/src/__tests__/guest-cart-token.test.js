import { describe, it, expect } from 'vitest';
import {
  GUEST_CART_COOKIE,
  createGuestToken,
  hashGuestToken,
  isGuestToken,
  guestCartCookieOptions,
  guestCartCookieClearOptions,
} from '../lib/guestCart.js';

/**
 * Guest cart identity.
 *
 * An anonymous visitor is identified by a random token in an httpOnly cookie.
 * Only the digest is stored, so a leaked database dump cannot be replayed as a
 * cookie, and the token is long enough that guessing one is not a thing an
 * attacker can do.
 */

describe('createGuestToken', () => {
  it('produces 32 random bytes as 64 lowercase hex characters', () => {
    const token = createGuestToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not repeat itself', () => {
    const tokens = new Set(Array.from({ length: 100 }, createGuestToken));

    expect(tokens.size).toBe(100);
  });
});

describe('hashGuestToken', () => {
  it('is a stable 64-character SHA-256 digest', () => {
    const token = createGuestToken();

    expect(hashGuestToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashGuestToken(token)).toBe(hashGuestToken(token));
  });

  it('differs for different tokens', () => {
    expect(hashGuestToken(createGuestToken())).not.toBe(hashGuestToken(createGuestToken()));
  });

  it('never returns the token itself', () => {
    // A stored token would make every database read a credential.
    const token = createGuestToken();

    expect(hashGuestToken(token)).not.toBe(token);
  });
});

describe('isGuestToken', () => {
  it('accepts a token it produced', () => {
    expect(isGuestToken(createGuestToken())).toBe(true);
  });

  it('rejects anything that is not 64 lowercase hex characters', () => {
    const token = createGuestToken();

    expect(isGuestToken(token.slice(1))).toBe(false);
    expect(isGuestToken(token.toUpperCase())).toBe(false);
    expect(isGuestToken(`${token}0`)).toBe(false);
    expect(isGuestToken('z'.repeat(64))).toBe(false);
    expect(isGuestToken('')).toBe(false);
    expect(isGuestToken(null)).toBe(false);
    expect(isGuestToken(undefined)).toBe(false);
    expect(isGuestToken(42)).toBe(false);
    expect(isGuestToken({ token })).toBe(false);
  });
});

describe('cookie options', () => {
  it('uses a name no session cookie shares', () => {
    expect(GUEST_CART_COOKIE).toBe('ba_dekor_guest_cart');
  });

  it('is unreadable from JavaScript and scoped to the whole site', () => {
    const options = guestCartCookieOptions();

    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(typeof options.secure).toBe('boolean');
  });

  it('expires, so an abandoned guest cart stops being addressable', () => {
    // Thirty days is long enough for a slow furniture decision, and short
    // enough that dead tokens do not accumulate forever.
    expect(guestCartCookieOptions().maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('clear options keep the identifying attributes but drop the expiry', () => {
    const options = guestCartCookieClearOptions();

    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(options).not.toHaveProperty('maxAge');
  });
});
