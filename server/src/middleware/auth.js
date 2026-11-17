import { getUserById } from '../services/auth.js';
import { forbidden, unauthorized } from '../lib/http-error.js';
import { readSessionUserId } from '../lib/session.js';

/**
 * Route guards. Both read the session cookie through `lib/session.js` and then
 * load the user, so a token is never treated as proof of a role: a customer
 * promoted to admin takes effect on their next request, and a deleted account
 * loses access immediately.
 */

const SESSION_ENDED = 'Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.';

export async function requireAuth(req, res, next) {
  const userId = readSessionUserId(req);

  if (!userId) throw unauthorized(SESSION_ENDED);

  const user = await getUserById(userId);

  if (!user) throw unauthorized(SESSION_ENDED);

  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) throw unauthorized(SESSION_ENDED);

  if (req.user.role !== 'admin') {
    throw forbidden('Halaman ini hanya untuk admin.');
  }

  next();
}
