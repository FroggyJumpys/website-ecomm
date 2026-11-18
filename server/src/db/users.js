import { AppError } from '../lib/errors.js';

/**
 * User queries for `tbl_pengguna`.
 *
 * Takes a `pg` Pool or Client so callers can run inside a transaction. No SQL
 * lives outside this module for the auth flow.
 */

/** Columns that are safe to hand back to a client. */
const PUBLIC_COLUMNS = 'id, name, email, phone, role, created_at';

/** Maps a snake_case row to the camelCase shape the API and client expect. */
export function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    createdAt: row.created_at,
  };
}

/** Strips the credential field from a stored user before it leaves the service. */
export function stripPasswordHash(stored) {
  return {
    id: stored.id,
    name: stored.name,
    email: stored.email,
    phone: stored.phone,
    role: stored.role,
    createdAt: stored.createdAt ?? stored.created_at,
  };
}

/**
 * Inserts a customer. The role is fixed here rather than accepted from the
 * request, so a registration payload cannot create an admin.
 *
 * Takes a `Pool` or a transaction `Client`: registration runs it inside the same
 * transaction as the guest-cart merge, so a merge failure cannot leave behind an
 * account the customer never got a session for.
 */
export async function createUser(db, { name, email, phone, passwordHash }) {
  try {
    const { rows } = await db.query(
      `INSERT INTO tbl_pengguna (name, email, phone, password_hash, role)
            VALUES ($1, $2, $3, $4, 'customer')
         RETURNING ${PUBLIC_COLUMNS}`,
      [name, email, phone, passwordHash]
    );

    return publicUser(rows[0]);
  } catch (error) {
    // 23505 = unique_violation. Two registrations racing for the same email
    // both pass the "does it exist" check, so the database decides the winner.
    if (error.code === '23505' && error.constraint === 'tbl_pengguna_email_key') {
      throw new AppError(
        409,
        'EMAIL_TAKEN',
        'Email ini sudah terdaftar. Coba masuk dengan email tersebut.',
        { field: 'email', message: 'Email ini sudah terdaftar.' }
      );
    }

    throw error;
  }
}

/** Includes the password hash, so this is only for credential checks. */
export async function findUserByEmail(pool, email) {
  const { rows } = await pool.query(
    `SELECT id, name, email, phone, role, password_hash, token_version, created_at
       FROM tbl_pengguna
      WHERE email = $1`,
    [email.trim().toLowerCase()]
  );

  if (rows.length === 0) return null;

  return {
    ...publicUser(rows[0]),
    passwordHash: rows[0].password_hash,
    tokenVersion: rows[0].token_version,
  };
}

/** Used by the session middleware on every authenticated request. */
export async function findUserById(pool, id) {
  const { rows } = await pool.query(
    `SELECT id, name, email, phone, role, password_hash, token_version, created_at
       FROM tbl_pengguna
      WHERE id = $1`,
    [id]
  );

  if (rows.length === 0) return null;

  return {
    ...publicUser(rows[0]),
    passwordHash: rows[0].password_hash,
    tokenVersion: rows[0].token_version,
  };
}

/** Maps a unique-email violation to the 409 the forms already handle. */
function rethrowEmailConflict(error) {
  if (error.code === '23505' && error.constraint === 'tbl_pengguna_email_key') {
    throw new AppError(
      409,
      'EMAIL_TAKEN',
      'Email ini sudah dipakai akun lain. Gunakan email lain.',
      { field: 'email', message: 'Email ini sudah dipakai akun lain. Gunakan email lain.' }
    );
  }

  throw error;
}

/**
 * Updates only the fields a customer may edit. The column list is built from a
 * fixed allowlist, never from the request body, so `role`, `id` and
 * `password_hash` cannot be patched through this path.
 *
 * Returns `null` when the account no longer exists.
 */
export async function updateUser(pool, id, patch) {
  const columns = {
    name: 'name',
    email: 'email',
    phone: 'phone',
  };

  const assignments = [];
  const values = [];

  for (const [field, column] of Object.entries(columns)) {
    if (patch[field] === undefined) continue;
    values.push(patch[field]);
    assignments.push(`${column} = $${values.length}`);
  }

  if (assignments.length === 0) return findUserById(pool, id);

  values.push(id);

  try {
    const { rows } = await pool.query(
      `UPDATE tbl_pengguna
          SET ${assignments.join(', ')}
        WHERE id = $${values.length}
    RETURNING ${PUBLIC_COLUMNS}`,
      values
    );

    return rows.length === 0 ? null : publicUser(rows[0]);
  } catch (error) {
    return rethrowEmailConflict(error);
  }
}

/** Replaces the stored hash and invalidates every other session. */
export async function updatePasswordHash(pool, id, passwordHash) {
  const { rowCount } = await pool.query(
    `UPDATE tbl_pengguna
        SET password_hash = $1,
            token_version = token_version + 1
      WHERE id = $2`,
    [passwordHash, id]
  );

  return rowCount > 0;
}

/** The version to put in a freshly issued token. */
export async function findTokenVersion(pool, id) {
  const { rows } = await pool.query('SELECT token_version FROM tbl_pengguna WHERE id = $1', [id]);

  return rows.length === 0 ? null : rows[0].token_version;
}
