import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * The session. One httpOnly cookie holds a signed JWT whose subject is the
 * user id; nothing else about the user is trusted from the token, so a renamed
 * or promoted account is picked up on the next request.
 *
 * Callers only need three things: put a session on the response, take it off,
 * and read the user id from a request.
 */

const ALGORITHM = 'HS256';
const USER_ID_PATTERN = /^[0-9]+$/;

const DURATION_PATTERN = /^(\d+)([smhd])?$/;
const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Cookie flags shared by set and clear, so clearing cannot miss one. */
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
};

/** `JWT_EXPIRES_IN` as milliseconds; undefined leaves a session cookie. */
function lifetimeMs(value) {
  const match = DURATION_PATTERN.exec(String(value).trim());
  if (!match) return undefined;

  return Number(match[1]) * UNIT_MS[match[2] ?? 's'];
}

export function issueSession(res, userId) {
  const token = jwt.sign({}, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    subject: String(userId),
    expiresIn: env.JWT_EXPIRES_IN,
  });

  const maxAge = lifetimeMs(env.JWT_EXPIRES_IN);

  res.cookie(env.COOKIE_NAME, token, maxAge ? { ...cookieOptions, maxAge } : { ...cookieOptions });
}

export function clearSession(res) {
  res.clearCookie(env.COOKIE_NAME, { ...cookieOptions });
}

/** The signed-in user's id as a string, or null for a guest or a bad token. */
export function readSessionUserId(req) {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
    const subject = payload?.sub;

    return typeof subject === 'string' && USER_ID_PATTERN.test(subject) ? subject : null;
  } catch {
    // Expired, tampered, wrong algorithm or wrong secret: all just mean guest.
    return null;
  }
}
