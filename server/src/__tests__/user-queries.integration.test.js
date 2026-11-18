import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { createUser, findUserByEmail, findUserById, publicUser } from '../db/users.js';

const registration = {
  name: 'Sari Wulandari',
  email: 'sari@badekor.id',
  phone: '081234567890',
  passwordHash: 'hashed-value',
};

describe('user queries', () => {
  beforeAll(async () => {
    await migrateTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('creates a customer and returns the public shape without the hash', async () => {
    const user = await createUser(testPool, registration);

    expect(user).toEqual({
      id: expect.any(Number),
      name: 'Sari Wulandari',
      email: 'sari@badekor.id',
      phone: '081234567890',
      role: 'customer',
      createdAt: expect.any(Date),
    });
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('defaults the role to customer even when a role is passed', async () => {
    const user = await createUser(testPool, { ...registration, role: 'admin' });
    expect(user.role).toBe('customer');
  });

  it('finds a user by email case-insensitively and returns the hash for verification', async () => {
    await createUser(testPool, registration);

    const stored = await findUserByEmail(testPool, 'SARI@BaDekor.ID');
    expect(stored.passwordHash).toBe('hashed-value');
    expect(stored.email).toBe('sari@badekor.id');

    expect(await findUserByEmail(testPool, 'missing@badekor.id')).toBeNull();
  });

  it('finds a user by id', async () => {
    const created = await createUser(testPool, registration);
    const stored = await findUserById(testPool, created.id);

    expect(stored.email).toBe('sari@badekor.id');
    expect(await findUserById(testPool, 999_999)).toBeNull();
  });

  it('reports a duplicate email as a typed conflict instead of a raw database error', async () => {
    await createUser(testPool, registration);

    await expect(createUser(testPool, registration)).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
    });
  });

  it('maps a row to the public user, dropping the password hash', () => {
    expect(
      publicUser({
        id: 7,
        name: 'Rani BaDekor',
        email: 'admin@badekor.id',
        phone: '081100000000',
        role: 'admin',
        password_hash: 'secret',
        created_at: new Date('2026-01-01T00:00:00Z'),
      })
    ).toEqual({
      id: 7,
      name: 'Rani BaDekor',
      email: 'admin@badekor.id',
      phone: '081100000000',
      role: 'admin',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  });
});
