import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { createWithTransaction } from '../config/db.js';
import { createUser, findUserByEmail, findUserById, stripPasswordHash } from '../db/users.js';
import { mergeGuestCart } from '../db/cart-merge.js';
import { AppError } from '../lib/errors.js';

/**
 * Auth domain logic. No Express types here: the service takes validated input
 * and a `pg` Pool, so it can be tested against a real database without an HTTP
 * server.
 *
 * Signing in also drains the visitor's guest cart into their account cart. Both
 * entry points do it inside one transaction with the account write, so a
 * customer either gets a session and their cart, or neither.
 */

const INVALID_CREDENTIALS = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.');

/**
 * Registers a customer. Kept returning the user itself, because that is what
 * every existing caller and test expects; the cart-aware entry point below is
 * what the register endpoint uses.
 */
export async function registerUser(pool, input) {
  const { user } = await registerUserWithCart(pool, input);
  return user;
}

/**
 * Registers a customer and merges any guest cart they arrived with.
 *
 * The account insert and the merge share a transaction: if the merge fails, the
 * account is rolled back too, rather than leaving a customer who was told
 * registration failed able to log in with that email.
 */
export async function registerUserWithCart(pool, input, { guestTokenHash = null } = {}) {
  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const withTransaction = createWithTransaction(pool);

  return withTransaction(async (client) => {
    const user = await createUser(client, { ...input, passwordHash });
    const cartMerge = guestTokenHash
      ? await mergeGuestCart(client, { userId: user.id, guestTokenHash })
      : null;

    return { user, cartMerge };
  });
}

/**
 * Checks credentials, then merges the guest cart.
 *
 * The credentials are checked before the transaction opens on purpose: a wrong
 * password must not touch, consume or lock the visitor's cart.
 */
export async function loginUser(pool, input, { guestTokenHash = null } = {}) {
  const user = await authenticate(pool, input);
  const withTransaction = createWithTransaction(pool);

  const cartMerge = guestTokenHash
    ? await withTransaction((client) => mergeGuestCart(client, { userId: user.id, guestTokenHash }))
    : null;

  return { user, cartMerge };
}

export async function authenticate(pool, { email, password }) {
  const stored = await findUserByEmail(pool, email);

  // Hash a dummy value when the account does not exist so that "unknown email"
  // and "wrong password" take comparable time; otherwise the response time
  // reveals which emails are registered.
  const passwordMatches = stored
    ? await bcrypt.compare(password, stored.passwordHash)
    : await bcrypt.compare(password, DUMMY_HASH);

  if (!stored || !passwordMatches) {
    throw INVALID_CREDENTIALS();
  }

  return stripPasswordHash(stored);
}

/** The user behind a session token, re-read so role changes take effect. */
export async function findSessionUser(pool, id) {
  const stored = await findUserById(pool, id);

  // `tokenVersion` is not part of the public user; the middleware needs it, so
  // it is attached to the object it receives rather than sent to the client.
  return stored ? { ...stripPasswordHash(stored), tokenVersion: stored.tokenVersion } : null;
}

// A bcrypt hash of a random value, used only to equalise timings above.
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
