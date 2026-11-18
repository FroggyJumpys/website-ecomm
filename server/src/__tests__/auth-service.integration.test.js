import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { registerUser, authenticate, findSessionUser } from '../services/auth.js';
import { findUserByEmail } from '../db/users.js';

const registration = {
  name: 'Sari Wulandari',
  email: 'sari@badekor.id',
  phone: '081234567890',
  password: 'rahasia123',
};

describe('auth service', () => {
  beforeAll(async () => {
    await migrateTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('registers a customer with a bcrypt hash that never stores the password', async () => {
    const user = await registerUser(testPool, registration);

    expect(user).toMatchObject({
      name: 'Sari Wulandari',
      email: 'sari@badekor.id',
      phone: '081234567890',
      role: 'customer',
    });
    expect(user).not.toHaveProperty('passwordHash');

    const stored = await findUserByEmail(testPool, 'sari@badekor.id');
    expect(stored.passwordHash).not.toBe('rahasia123');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare('rahasia123', stored.passwordHash)).toBe(true);
  });

  it('rejects a second registration with the same email', async () => {
    await registerUser(testPool, registration);

    await expect(registerUser(testPool, registration)).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
    });
  });

  it('signs in with the right password regardless of email case', async () => {
    await registerUser(testPool, registration);

    const user = await authenticate(testPool, {
      email: 'SARI@badekor.id',
      password: 'rahasia123',
    });

    expect(user.email).toBe('sari@badekor.id');
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('gives the same rejection for an unknown email and a wrong password', async () => {
    await registerUser(testPool, registration);

    const unknownEmail = await authenticate(testPool, {
      email: 'nobody@badekor.id',
      password: 'rahasia123',
    }).catch((error) => error);

    const wrongPassword = await authenticate(testPool, {
      email: 'sari@badekor.id',
      password: 'salah-total',
    }).catch((error) => error);

    expect(unknownEmail).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(wrongPassword).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(unknownEmail.message).toBe(wrongPassword.message);
  });

  it('returns the session user for an existing id and null for a deleted one', async () => {
    const user = await registerUser(testPool, registration);

    expect(await findSessionUser(testPool, user.id)).toMatchObject({ id: user.id });
    expect(await findSessionUser(testPool, user.id + 1000)).toBeNull();
  });
});
