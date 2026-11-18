import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

/**
 * The session is a signed JWT in an httpOnly cookie. The token carries the user
 * id and the account's token version; the role is re-read from the database on
 * every request so an account that loses admin rights loses them immediately,
 * and the version is compared so a password change can revoke older tokens.
 */

const ALGORITHM = 'HS256';
const FALLBACK_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function signSessionToken({ id, tokenVersion = 0 }) {
  return jwt.sign({ sub: String(id), tokenVersion }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

export function verifySessionToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    throw unauthenticated();
  }

  try {
    // Pinning the algorithm rejects `alg: none` and any symmetric/asymmetric
    // confusion attempt, whatever the token header claims.
    return jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
  } catch {
    throw unauthenticated();
  }
}

function unauthenticated() {
  return new AppError(
    401,
    'UNAUTHENTICATED',
    'Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.'
  );
}

/** Milliseconds for a JWT-style duration (`7d`, `12h`, `30m`, `45s`, `90`). */
export function durationToMs(value) {
  const match = /^(\d+)([smhd])?$/.exec(String(value ?? '').trim());

  if (!match) return FALLBACK_DURATION_MS;

  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

  return amount * multipliers[unit];
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: env.NODE_ENV === 'production',
    maxAge: durationToMs(env.JWT_EXPIRES_IN),
  };
}

/**
 * `res.clearCookie` ignores `maxAge`/`expires`; it only needs the attributes
 * that identify the cookie, which must otherwise match the ones it was set
 * with.
 */
export function clearCookieOptions() {
  const options = sessionCookieOptions();
  delete options.maxAge;
  return options;
}
