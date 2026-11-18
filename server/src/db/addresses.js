import { AppError } from '../lib/errors.js';
import { createWithTransaction } from '../config/db.js';

/**
 * Shipping-address queries and the transaction that keeps "exactly one
 * default" true.
 *
 * Ownership is part of every statement's WHERE clause (`user_id = $1`), so an
 * address that belongs to somebody else is indistinguishable from one that does
 * not exist — both come back as `ADDRESS_NOT_FOUND`.
 */

const COLUMNS = `
  id, label, recipient, phone, street, district, city, province,
  postal_code, notes, is_default
`;

/** Maps a snake_case row to the camelCase shape the account forms use. */
export function toAddress(row) {
  return {
    id: row.id,
    label: row.label,
    recipient: row.recipient,
    phone: row.phone,
    street: row.street,
    district: row.district,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    notes: row.notes,
    isDefault: row.is_default,
  };
}

function notFound() {
  return new AppError(404, 'ADDRESS_NOT_FOUND', 'Alamat ini tidak ditemukan.');
}

/** Default addresses first, then the oldest; matches the mock's list order. */
export async function listAddresses(pool, userId) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS}
       FROM tbl_alamat
      WHERE user_id = $1
      ORDER BY is_default DESC, id ASC`,
    [userId]
  );

  return rows.map(toAddress);
}

/**
 * Runs `fn` inside a transaction after locking the owner's user row.
 *
 * The lock serialises every address mutation for one customer, which is what
 * keeps "at most one default" true when two requests arrive together: the
 * partial unique index would otherwise reject the second one with a raw 23505
 * instead of doing what the customer asked.
 */
export function createAddressStore(pool) {
  const withTransaction = createWithTransaction(pool);

  async function inLockedTransaction(userId, fn) {
    return withTransaction(async (client) => {
      const { rows } = await client.query('SELECT id FROM tbl_pengguna WHERE id = $1 FOR UPDATE', [
        userId,
      ]);

      if (rows.length === 0) {
        throw new AppError(
          401,
          'UNAUTHENTICATED',
          'Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.'
        );
      }

      return fn(client);
    });
  }

  async function findOne(client, userId, id) {
    const { rows } = await client.query(
      `SELECT ${COLUMNS} FROM tbl_alamat WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    return rows.length === 0 ? null : toAddress(rows[0]);
  }

  async function clearDefault(client, userId, exceptId = null) {
    await client.query(
      `UPDATE tbl_alamat
          SET is_default = false
        WHERE user_id = $1
          AND is_default
          AND ($2::bigint IS NULL OR id <> $2)`,
      [userId, exceptId]
    );
  }

  async function insert(client, userId, address) {
    const { rows } = await client.query(
      `INSERT INTO tbl_alamat (
              user_id, label, recipient, phone, street, district, city,
              province, postal_code, notes, is_default
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${COLUMNS}`,
      [
        userId,
        address.label,
        address.recipient,
        address.phone,
        address.street,
        address.district,
        address.city,
        address.province,
        address.postalCode,
        address.notes,
        address.isDefault,
      ]
    );

    return toAddress(rows[0]);
  }

  return {
    list: (userId) => listAddresses(pool, userId),

    async create(userId, address) {
      return inLockedTransaction(userId, async (client) => {
        const { rows } = await client.query(
          'SELECT count(*)::int AS count FROM tbl_alamat WHERE user_id = $1',
          [userId]
        );

        // The first address is the default whether or not it was asked for;
        // otherwise an explicit default replaces the old one.
        const isDefault = rows[0].count === 0 ? true : address.isDefault;

        if (isDefault) await clearDefault(client, userId);

        return insert(client, userId, { ...address, isDefault });
      });
    },

    async update(userId, id, address) {
      return inLockedTransaction(userId, async (client) => {
        const existing = await findOne(client, userId, id);
        if (!existing) throw notFound();

        // A customer who has any address always has exactly one default. If the
        // edit clears the flag, the default moves to the oldest other address;
        // if this is the only address, it stays the default.
        //
        // The promotion happens after the UPDATE below on purpose: the partial
        // unique index allows only one default per user, so the edited row must
        // be demoted first.
        let isDefault = address.isDefault ? true : false;
        let promoteId = null;

        if (address.isDefault) {
          await clearDefault(client, userId, id);
        } else if (existing.isDefault) {
          const { rows: others } = await client.query(
            `SELECT id FROM tbl_alamat
              WHERE user_id = $1 AND id <> $2
              ORDER BY id ASC
              LIMIT 1`,
            [userId, id]
          );

          if (others.length === 0) {
            isDefault = true;
          } else {
            promoteId = others[0].id;
          }
        }

        const { rows } = await client.query(
          `UPDATE tbl_alamat
              SET label = $1,
                  recipient = $2,
                  phone = $3,
                  street = $4,
                  district = $5,
                  city = $6,
                  province = $7,
                  postal_code = $8,
                  notes = $9,
                  is_default = $10
            WHERE id = $11 AND user_id = $12
        RETURNING ${COLUMNS}`,
          [
            address.label,
            address.recipient,
            address.phone,
            address.street,
            address.district,
            address.city,
            address.province,
            address.postalCode,
            address.notes,
            isDefault,
            id,
            userId,
          ]
        );

        // Demote first (the UPDATE above), then promote the oldest other
        // address: the partial unique index allows only one default per user.
        if (promoteId !== null) {
          await client.query('UPDATE tbl_alamat SET is_default = true WHERE id = $1', [promoteId]);
        }

        return toAddress(rows[0]);
      });
    },

    async remove(userId, id) {
      return inLockedTransaction(userId, async (client) => {
        const existing = await findOne(client, userId, id);
        if (!existing) throw notFound();

        await client.query('DELETE FROM tbl_alamat WHERE id = $1 AND user_id = $2', [id, userId]);

        // Deleting the default promotes the oldest remaining address so the
        // customer is never left without one by accident.
        if (existing.isDefault) {
          await client.query(
            `UPDATE tbl_alamat
                SET is_default = true
              WHERE id = (
                SELECT id FROM tbl_alamat
                 WHERE user_id = $1
                 ORDER BY id ASC
                 LIMIT 1
              )`,
            [userId]
          );
        }

        return null;
      });
    },

    async setDefault(userId, id) {
      return inLockedTransaction(userId, async (client) => {
        const existing = await findOne(client, userId, id);
        if (!existing) throw notFound();

        if (!existing.isDefault) {
          await clearDefault(client, userId);
          await client.query(
            'UPDATE tbl_alamat SET is_default = true WHERE id = $1 AND user_id = $2',
            [id, userId]
          );
        }

        return null;
      });
    },
  };
}
