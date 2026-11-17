import { query } from '../config/db.js';

/**
 * Data access for `tbl_pengguna`. Rows are returned as they are stored; mapping
 * to the public shape belongs to the auth service.
 */

const COLUMNS = 'id, name, email, phone, password_hash, role';

export async function findByEmail(email) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM tbl_pengguna WHERE email = $1`, [email]);

  return rows[0] ?? null;
}

export async function findById(id) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM tbl_pengguna WHERE id = $1`, [id]);

  return rows[0] ?? null;
}

export async function create({ name, email, phone, passwordHash, role }) {
  const { rows } = await query(
    `INSERT INTO tbl_pengguna (name, email, phone, password_hash, role)
          VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
    [name, email, phone, passwordHash, role]
  );

  return rows[0];
}
