import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Guest cart identity.
 *
 * A visitor who is not signed in still needs a cart that survives a reload, so
 * the browser holds a random token in an httpOnly cookie. The database stores
 * only its SHA-256 digest: a leaked database row cannot be turned back into a
 * usable cookie, and the raw token never has to be compared with user input in
 * a way that could be timed.
 *
 * The token is deliberately not a JWT. It grants nothing except "this anonymous
 * cart is mine", it never expires inside the token itself, and the server-side
 * row is the only authority — which is what lets login consume it for good.
 */

export const GUEST_CART_COOKIE = 'ba_dekor_guest_cart';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function createGuestToken() {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function hashGuestToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Shape check before hashing, so a junk cookie is a miss, not a query. */
export function isGuestToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

/**
 * Constant-time comparison of two digests. Both are hex strings of the same
 * length, so the only thing an attacker could learn from timing is that a
 * comparison happened, not how much of a value matched.
 */
export function guestTokensMatch(a, b) {
  if (!isGuestToken(a) || !isGuestToken(b)) return false;

  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function guestCartCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

/** `res.clearCookie` only needs the attributes that identify the cookie. */
export function guestCartCookieClearOptions() {
  const options = guestCartCookieOptions();
  delete options.maxAge;
  return options;
}
