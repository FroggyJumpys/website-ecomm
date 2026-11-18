import { parseBody } from '../lib/validation.js';
import { profilePatchSchema, passwordChangeSchema } from '../validators/user.js';
import { updateProfile, changePassword } from '../services/user.js';
import { findTokenVersion } from '../db/users.js';
import { startSession } from './auth.js';

/**
 * `/users/me` controllers. The customer is always `req.user`, loaded by
 * `requireAuth` from the database — never a body or query parameter.
 */

/** PATCH /api/v1/users/me */
export async function patchProfile(req, res) {
  const patch = parseBody(profilePatchSchema, req.body);
  const user = await updateProfile(req.app.locals.pool, req.user.id, patch);

  res.status(200).json({ data: user });
}

/**
 * POST /api/v1/users/me/password
 *
 * Changing the password bumps `token_version`, which signs every other device
 * out. This device gets a freshly signed cookie in the same response, so the
 * customer who made the change is not logged out by their own action.
 */
export async function postPassword(req, res) {
  const input = parseBody(passwordChangeSchema, req.body);
  const pool = req.app.locals.pool;

  await changePassword(pool, req.user.id, input);

  const tokenVersion = await findTokenVersion(pool, req.user.id);
  startSession(res, req.user, tokenVersion);

  res.status(200).json({ data: null });
}
