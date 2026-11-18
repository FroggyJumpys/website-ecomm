import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { registerUser, authenticate } from '../services/auth.js';
import { updateProfile, changePassword } from '../services/user.js';
import { findUserByEmail } from '../db/users.js';

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

describe('updateProfile', () => {
  it('saves a partial change and leaves the other fields alone', async () => {
    const updated = await updateProfile(testPool, user.id, { name: 'Sari W.' });

    expect(updated).toMatchObject({
      id: user.id,
      name: 'Sari W.',
      email: 'sari@badekor.id',
      phone: '081234567890',
      role: 'customer',
    });
    expect(updated).not.toHaveProperty('passwordHash');
  });

  it('saves the email lowercased and the phone normalised', async () => {
    const updated = await updateProfile(testPool, user.id, {
      email: 'SARI.BARU@badekor.id',
      phone: '6281234567891',
      currentPassword: account.password,
    });

    expect(updated.email).toBe('sari.baru@badekor.id');
    expect(updated.phone).toBe('081234567891');
  });

  it('allows saving the same email again, given the current password', async () => {
    const updated = await updateProfile(testPool, user.id, {
      email: account.email,
      currentPassword: account.password,
    });
    expect(updated.email).toBe(account.email);
  });

  it('refuses an email that another account already uses', async () => {
    await registerUser(testPool, {
      name: 'Rani BaDekor',
      email: 'admin@badekor.id',
      phone: '081100000000',
      password: 'rahasia123',
    });

    await expect(
      updateProfile(testPool, user.id, {
        email: 'admin@badekor.id',
        currentPassword: account.password,
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
      details: { field: 'email' },
    });
  });

  it('keeps the password working after a profile change', async () => {
    await updateProfile(testPool, user.id, { name: 'Nama Baru' });

    const signedIn = await authenticate(testPool, {
      email: account.email,
      password: account.password,
    });

    expect(signedIn.name).toBe('Nama Baru');
  });

  it('never changes the role', async () => {
    const updated = await updateProfile(testPool, user.id, { name: 'Sari', role: 'admin' });
    expect(updated.role).toBe('customer');
  });

  it('reports a missing account as unauthenticated', async () => {
    await expect(updateProfile(testPool, 999_999, { name: 'Hantu' })).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
  });
});

describe('changePassword', () => {
  it('stores a new hash and lets the new password sign in', async () => {
    await changePassword(testPool, user.id, {
      currentPassword: account.password,
      newPassword: 'rahasia456',
    });

    const stored = await findUserByEmail(testPool, account.email);
    expect(await bcrypt.compare('rahasia456', stored.passwordHash)).toBe(true);

    const signedIn = await authenticate(testPool, {
      email: account.email,
      password: 'rahasia456',
    });
    expect(signedIn.id).toBe(user.id);
  });

  it('stops the old password from working', async () => {
    await changePassword(testPool, user.id, {
      currentPassword: account.password,
      newPassword: 'rahasia456',
    });

    await expect(
      authenticate(testPool, { email: account.email, password: account.password })
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('rejects a wrong current password with INVALID_PASSWORD', async () => {
    await expect(
      changePassword(testPool, user.id, {
        currentPassword: 'salah-total',
        newPassword: 'rahasia456',
      })
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_PASSWORD' });
  });

  it('rejects reusing the current password with SAME_PASSWORD', async () => {
    await expect(
      changePassword(testPool, user.id, {
        currentPassword: account.password,
        newPassword: account.password,
      })
    ).rejects.toMatchObject({ status: 400, code: 'SAME_PASSWORD' });
  });

  it('leaves the old hash in place when the change is rejected', async () => {
    const before = await findUserByEmail(testPool, account.email);

    await expect(
      changePassword(testPool, user.id, {
        currentPassword: 'salah-total',
        newPassword: 'rahasia456',
      })
    ).rejects.toThrow();

    const after = await findUserByEmail(testPool, account.email);
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('reports a missing account as unauthenticated', async () => {
    await expect(
      changePassword(testPool, 999_999, {
        currentPassword: account.password,
        newPassword: 'rahasia456',
      })
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });
});
