import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { findUserById, updateUser, updatePasswordHash } from '../db/users.js';
import { normalizePhone } from '../validators/auth.js';

/**
 * Account services: everything a signed-in customer can change about their own
 * record. The user id always comes from the session, never from the body.
 */

function unauthenticated() {
  return new AppError(
    401,
    'UNAUTHENTICATED',
    'Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.'
  );
}

/**
 * Normalises the editable fields before they reach SQL.
 *
 * The validator already trims and lowercases, but the service is also called by
 * tests and future admin flows, and the database CHECK requires a lowercase
 * email — so the rule is enforced here as well rather than trusted upstream.
 */
function normalisePatch(patch) {
  const next = {};

  if (patch.name !== undefined) next.name = String(patch.name).trim();
  if (patch.email !== undefined) next.email = String(patch.email).trim().toLowerCase();
  if (patch.phone !== undefined) next.phone = normalizePhone(patch.phone);

  return next;
}

/**
 * Applies a validated patch and returns the public user.
 *
 * An email change is treated as a credential change: it needs the current
 * password, verified here, because a stolen session must not be able to move
 * the login address to another inbox. The password itself is never written —
 * only used for this check.
 */
export async function updateProfile(pool, id, patch) {
  if (patch.email !== undefined) {
    const stored = await findUserById(pool, id);

    if (!stored) throw unauthenticated();

    const authorised =
      typeof patch.currentPassword === 'string' &&
      (await bcrypt.compare(patch.currentPassword, stored.passwordHash));

    if (!authorised) {
      throw new AppError(400, 'INVALID_PASSWORD', 'Kata sandi saat ini tidak cocok.', {
        field: 'currentPassword',
        message: 'Kata sandi saat ini tidak cocok.',
      });
    }
  }

  const updated = await updateUser(pool, id, normalisePatch(patch));

  if (!updated) throw unauthenticated();

  return updated;
}

/**
 * Verifies the current password before replacing the hash.
 *
 * The update also increments `token_version`, so every token issued before this
 * call becomes stale and those devices are signed out on their next request.
 * The caller re-issues a cookie for the device that made the change.
 */
export async function changePassword(pool, id, { currentPassword, newPassword }) {
  const stored = await findUserById(pool, id);

  if (!stored) throw unauthenticated();

  const matches = await bcrypt.compare(currentPassword, stored.passwordHash);

  if (!matches) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Kata sandi saat ini tidak cocok.', {
      field: 'currentPassword',
      message: 'Kata sandi saat ini tidak cocok.',
    });
  }

  if (currentPassword === newPassword) {
    throw new AppError(400, 'SAME_PASSWORD', 'Kata sandi baru harus berbeda dari yang sekarang.', {
      field: 'newPassword',
      message: 'Kata sandi baru harus berbeda dari yang sekarang.',
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  const saved = await updatePasswordHash(pool, id, passwordHash);

  if (!saved) throw unauthenticated();

  return null;
}
