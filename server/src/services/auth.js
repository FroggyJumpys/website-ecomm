import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import * as users from '../db/users.js';
import { HttpError } from '../lib/http-error.js';

/**
 * The auth module. Callers get three operations and plain public user objects;
 * hashing, credential checks and column mapping stay inside.
 *
 * Input is already validated and normalised by `validators/auth.js`.
 */

const DUPLICATE_KEY = '23505';

const INVALID_CREDENTIALS_MESSAGE = 'Email atau kata sandi salah.';

/**
 * `pg` returns BIGINT as a string. The client has always used numeric ids
 * (see client/src/mocks/auth.js) and identity ids stay far below
 * Number.MAX_SAFE_INTEGER, so they are normalised here once instead of in every
 * consumer.
 */
function toPublicUser(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
  };
}

/**
 * Compared against when the email is unknown, so a missing account costs the
 * same bcrypt work as a wrong password and the response time does not reveal
 * which emails are registered.
 */
let dummyHashPromise;

function compareWithDummy(password) {
  dummyHashPromise ??= bcrypt.hash('badekor-unknown-account', env.BCRYPT_ROUNDS);

  return dummyHashPromise.then((hash) => bcrypt.compare(password, hash));
}

export async function register({ name, email, phone, password }) {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  try {
    // The role is fixed here, never taken from the request.
    const row = await users.create({ name, email, phone, passwordHash, role: 'customer' });

    return toPublicUser(row);
  } catch (error) {
    // Let the unique index decide, so two simultaneous registrations cannot
    // both pass a "does this email exist?" check.
    if (error.code === DUPLICATE_KEY) {
      throw new HttpError(
        409,
        'EMAIL_TAKEN',
        'Email ini sudah terdaftar. Coba masuk dengan email tersebut.'
      );
    }

    throw error;
  }
}

export async function login({ email, password }) {
  const row = await users.findByEmail(email);

  if (!row) {
    await compareWithDummy(password);

    throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
  }

  const passwordMatches = await bcrypt.compare(password, row.password_hash);

  if (!passwordMatches) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
  }

  return toPublicUser(row);
}

/** The signed-in user, or null when the account no longer exists. */
export async function getUserById(id) {
  return toPublicUser(await users.findById(id));
}
