import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { signSessionToken, sessionCookieOptions, clearCookieOptions } from '../lib/session.js';
import {
  GUEST_CART_COOKIE,
  guestCartCookieClearOptions,
  hashGuestToken,
  isGuestToken,
} from '../lib/guestCart.js';
import { parseBody } from '../lib/validation.js';
import { registerSchema, loginSchema } from '../validators/auth.js';
import { registerUserWithCart, loginUser } from '../services/auth.js';
import { findTokenVersion } from '../db/users.js';

/**
 * Auth endpoints. Controllers only translate HTTP to service calls: no SQL and
 * no password handling here.
 *
 * Every session cookie is issued with the account's current `token_version`, so
 * a later password change (which increments it) invalidates this token.
 *
 * Signing in also consumes the guest cart the visitor arrived with. The guest
 * cookie is cleared only after the merge has committed and the session has been
 * issued, so a failure at any step leaves the visitor's cart where it was.
 */

export function startSession(res, user, tokenVersion) {
  res.cookie(env.COOKIE_NAME, signSessionToken({ id: user.id, tokenVersion }), sessionCookieOptions());
}

/** The digest of the caller's guest cookie, or `null` when there is none. */
function guestTokenHashOf(req) {
  const token = req.cookies?.[GUEST_CART_COOKIE];

  return isGuestToken(token) ? hashGuestToken(token) : null;
}

/**
 * Adds the merge report to a successful sign-in, and clears the spent cookie.
 *
 * `cartMerge: null` means the visitor had no guest cart at all, so the response
 * stays byte-for-byte what it was before this step.
 */
function finishSignIn(res, user, tokenVersion, cartMerge) {
  startSession(res, user, tokenVersion);

  if (cartMerge?.consumed) {
    res.clearCookie(GUEST_CART_COOKIE, guestCartCookieClearOptions());
  }

  const body = { data: user };

  if (cartMerge?.consumed) {
    body.meta = {
      cartMerge: { merged: cartMerge.merged, adjustments: cartMerge.adjustments },
    };
  }

  return body;
}

/** POST /api/v1/auth/register */
export async function register(req, res) {
  const input = parseBody(registerSchema, req.body);
  const { user, cartMerge } = await registerUserWithCart(req.app.locals.pool, input, {
    guestTokenHash: guestTokenHashOf(req),
  });

  // A new account always starts at version 0.
  res.status(201).json(finishSignIn(res, user, 0, cartMerge));
}

/** POST /api/v1/auth/login */
export async function login(req, res) {
  const input = parseBody(loginSchema, req.body);
  const { user, cartMerge } = await loginUser(req.app.locals.pool, input, {
    guestTokenHash: guestTokenHashOf(req),
  });
  const tokenVersion = await findTokenVersion(req.app.locals.pool, user.id);

  res.status(200).json(finishSignIn(res, user, tokenVersion, cartMerge));
}

/**
 * POST /api/v1/auth/logout
 *
 * The token is stateless, so this clears the browser's cookie. A copy of the
 * token held elsewhere stays valid until it expires; a password change is the
 * way to revoke every device.
 *
 * The account cart is left alone: it belongs to the account, and signing out on
 * a shared computer must not turn it into a guest cart the next visitor can read.
 */
export function logout(req, res) {
  res.clearCookie(env.COOKIE_NAME, clearCookieOptions());
  res.status(200).json({ data: null });
}

/** GET /api/v1/auth/me — `requireAuth` has already loaded the user. */
export function me(req, res) {
  if (!req.user) {
    throw new AppError(
      401,
      'UNAUTHENTICATED',
      'Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.'
    );
  }

  res.status(200).json({ data: req.user });
}
