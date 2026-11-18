import { describe, it, expect } from 'vitest';
import {
  profilePatchSchema,
  passwordChangeSchema,
  emailChangeSchema,
} from '../validators/user.js';

function firstMessage(result) {
  return result.success ? null : result.error.issues[0].message;
}

describe('emailChangeSchema', () => {
  it('requires the current password alongside a valid email', () => {
    const result = emailChangeSchema.safeParse({
      email: 'sari.baru@badekor.id',
      currentPassword: 'rahasia123',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      email: 'sari.baru@badekor.id',
      currentPassword: 'rahasia123',
    });
  });

  it('lowercases and trims the email', () => {
    const parsed = emailChangeSchema.parse({
      email: '  SARI.BARU@BaDekor.ID ',
      currentPassword: 'rahasia123',
    });

    expect(parsed.email).toBe('sari.baru@badekor.id');
  });

  it('rejects a missing current password', () => {
    const result = emailChangeSchema.safeParse({ email: 'sari.baru@badekor.id' });
    expect(firstMessage(result)).toBe('Masukkan kata sandi saat ini untuk mengubah email.');
  });

  it('rejects an invalid email', () => {
    const result = emailChangeSchema.safeParse({
      email: 'bukan-email',
      currentPassword: 'rahasia123',
    });
    expect(firstMessage(result)).toBe('Format email belum benar. Contoh: nama@email.com');
  });
});

describe('profilePatchSchema with an email', () => {
  it('requires the current password when the patch changes the email', () => {
    const result = profilePatchSchema.safeParse({ email: 'sari.baru@badekor.id' });

    expect(firstMessage(result)).toBe('Masukkan kata sandi saat ini untuk mengubah email.');
    expect(result.error.issues[0].path).toEqual(['currentPassword']);
  });

  it('accepts an email change that carries the current password', () => {
    const result = profilePatchSchema.safeParse({
      email: 'sari.baru@badekor.id',
      currentPassword: 'rahasia123',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      email: 'sari.baru@badekor.id',
      currentPassword: 'rahasia123',
    });
  });

  it('still accepts a patch without an email and without a password', () => {
    const result = profilePatchSchema.safeParse({ name: 'Sari W.' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'Sari W.' });
  });

  it('accepts a name change that happens to include the password', () => {
    const result = profilePatchSchema.safeParse({
      name: 'Sari W.',
      currentPassword: 'rahasia123',
    });

    expect(result.success).toBe(true);
  });
});

describe('passwordChangeSchema', () => {
  it('accepts a reused password so the service can answer SAME_PASSWORD', () => {
    // The schema cannot know if `currentPassword` is correct; rejecting the
    // reuse here would turn a documented 400 into a 422.
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'rahasia123',
      newPassword: 'rahasia123',
    });

    expect(result.success).toBe(true);
  });

  it('still rejects a mismatched confirmation', () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'rahasia123',
      newPassword: 'rahasia456',
      confirmPassword: 'rahasia789',
    });

    expect(firstMessage(result)).toBe('Konfirmasi kata sandi belum sama.');
  });
});
