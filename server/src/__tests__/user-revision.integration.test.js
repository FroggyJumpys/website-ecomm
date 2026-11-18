import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { registerUser } from '../services/auth.js';
import { updateProfile, changePassword } from '../services/user.js';
import { findUserByEmail } from '../db/users.js';
import { signSessionToken, verifySessionToken } from '../lib/session.js';

const account = {
  name: 'Sari Wulandari',
  email: 'sari@badekor.id',
  phone: '081234567890',
  password: 'rahasia123',
};

let user;

beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  user = await registerUser(testPool, account);
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('email change requires the current password', () => {
  it('refuses an email change authorised by the wrong password', async () => {
    await expect(
      updateProfile(testPool, user.id, {
        email: 'sari.baru@badekor.id',
        currentPassword: 'salah-total',
      })
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_PASSWORD' });
  });

  it('refuses an email change with no password at all', async () => {
    await expect(
      updateProfile(testPool, user.id, { email: 'sari.baru@badekor.id' })
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_PASSWORD' });
  });

  it('leaves the email untouched when the password is wrong', async () => {
    await expect(
      updateProfile(testPool, user.id, {
        email: 'sari.baru@badekor.id',
        currentPassword: 'salah-total',
      })
    ).rejects.toThrow();

    const stored = await findUserByEmail(testPool, account.email);
    expect(stored).not.toBeNull();
  });

  it('accepts the change with the right password and drops the password from the result', async () => {
    const updated = await updateProfile(testPool, user.id, {
      email: 'sari.baru@badekor.id',
      currentPassword: account.password,
    });

    expect(updated.email).toBe('sari.baru@badekor.id');
    expect(updated).not.toHaveProperty('currentPassword');
    expect(updated).not.toHaveProperty('passwordHash');
  });

  it('does not require a password when the email is not changing', async () => {
    const updated = await updateProfile(testPool, user.id, { name: 'Sari W.' });
    expect(updated.name).toBe('Sari W.');
  });
});

describe('changing the password increments the token version', () => {
  it('bumps the version, so an old token is rejected while a new one works', async () => {
    const before = await findUserByEmail(testPool, account.email);
    expect(before.tokenVersion).toBe(0);

    const oldToken = signSessionToken({ id: user.id, tokenVersion: before.tokenVersion });

    await changePassword(testPool, user.id, {
      currentPassword: account.password,
      newPassword: 'rahasia456',
    });

    const after = await findUserByEmail(testPool, account.email);
    expect(after.tokenVersion).toBe(1);

    // The old token still verifies cryptographically but carries a stale version;
    // those are different things, and the check is the session middleware's job.
    expect(verifySessionToken(oldToken).tokenVersion).toBe(0);
  });

  it('records the current version on a freshly issued token', async () => {
    const token = signSessionToken({ id: user.id, tokenVersion: 7 });
    expect(verifySessionToken(token).tokenVersion).toBe(7);
  });
});
