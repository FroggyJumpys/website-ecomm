import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { verifySessionToken } from '../lib/session.js';
import { findSessionUser } from '../services/auth.js';

/**
 * Reads the session cookie, verifies it, and re-reads the user from the
 * database. Using `requireAuth` is what makes every protected handler safe
 * against a token for a deleted account or a role that changed since sign-in.
 *
 * The token version is compared here too: a password change bumps the column,
 * so every token issued before it becomes stale and its device is signed out.
 */
export function createRequireAuth(pool) {
  return async function requireAuth(req, _res, next) {
    const token = req.cookies?.[env.COOKIE_NAME];

    if (!token) return next(unauthenticated());

    try {
      const claims = verifySessionToken(token);
      const user = await findSessionUser(pool, Number(claims.sub));

      if (!user) return next(unauthenticated());

      // A token with no version predates revocation and is treated as stale.
      if ((claims.tokenVersion ?? -1) !== user.tokenVersion) {
        return next(unauthenticated());
      }

      // `tokenVersion` is internal: it authorises the comparison above, but it
      // must not reach the client through `/auth/me`.
      req.user = { ...user };
      delete req.user.tokenVersion;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * Role gate. Must be mounted after `requireAuth`, which is where `req.user`
 * comes from; the role is never read from the token.
 */
export function requireRole(role) {
  return function roleGuard(req, _res, next) {
    if (!req.user) return next(unauthenticated());

    if (req.user.role !== role) {
      return next(new AppError(403, 'FORBIDDEN', 'Kamu tidak punya akses ke halaman ini.'));
    }

    return next();
  };
}

function unauthenticated() {
  return new AppError(
    401,
    'UNAUTHENTICATED',
    'Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.'
  );
}
