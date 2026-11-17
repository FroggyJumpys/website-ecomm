import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import {
  clearSession,
  cookieOptions,
  issueSession,
  readSessionUserId,
} from '../lib/session.js';
import { loginSchema, registerSchema } from '../validators/auth.js';

/**
 * Contract tests for the pieces of the auth module that do not need a
 * database: request normalisation and the session cookie. Database-backed
 * behaviour lives in `auth.integration.test.js`.
 */

const VALID_REGISTER = {
  name: 'Sari Wulandari',
  email: 'sari@badekor.id',
  phone: '081234567890',
  password: 'rahasia123',
};

describe('registerSchema', () => {
  it('normalises name, email and phone', () => {
    const result = registerSchema.safeParse({
      ...VALID_REGISTER,
      name: '  Sari Wulandari  ',
      email: '  Sari@BaDekor.ID ',
      phone: '+62 812-3456-7890',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: 'Sari Wulandari',
      email: 'sari@badekor.id',
      phone: '081234567890',
      password: 'rahasia123',
    });
  });

  it('accepts the 62… phone form and returns the local 08… form', () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTER, phone: '6281234567890' });

    expect(result.data.phone).toBe('081234567890');
  });

  it('accepts a password of exactly 72 bytes', () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTER, password: `a1${'x'.repeat(70)}` });

    expect(result.success).toBe(true);
  });

  it('rejects a password longer than bcrypt hashes', () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTER, password: `a1${'x'.repeat(71)}` });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain('72');
  });

  it('rejects a password without a digit', () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTER, password: 'katasandi' });

    expect(result.success).toBe(false);
  });

  it('rejects a malformed email', () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTER, email: 'bukan-email' });

    expect(result.success).toBe(false);
  });

  it('rejects unknown keys such as a role the client is not allowed to set', () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTER, role: 'admin' });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].code).toBe('unrecognized_keys');
  });
});

describe('loginSchema', () => {
  it('normalises the email so sign-in is case-insensitive', () => {
    const result = loginSchema.safeParse({ email: ' SARI@BaDekor.id ', password: 'x' });

    expect(result.data.email).toBe('sari@badekor.id');
  });

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({ email: 'sari@badekor.id', password: '' });

    expect(result.success).toBe(false);
  });

  it('rejects a payload with extra keys', () => {
    const result = loginSchema.safeParse({
      email: 'sari@badekor.id',
      password: 'x',
      remember: true,
    });

    expect(result.success).toBe(false);
  });
});

/** A response double that records what the session module writes. */
function fakeResponse() {
  const calls = [];

  return {
    calls,
    cookie(name, value, options) {
      calls.push({ name, value, options });
    },
    clearCookie(name, options) {
      calls.push({ name, options });
    },
  };
}

function requestWithToken(token) {
  return { cookies: token ? { [env.COOKIE_NAME]: token } : {} };
}

describe('session cookie', () => {
  it('is httpOnly, lax and path-wide, and not Secure outside production', () => {
    expect(cookieOptions).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(cookieOptions.secure).toBe(env.NODE_ENV === 'production');
  });

  it('signs the user id into the cookie and reads it back', () => {
    const res = fakeResponse();

    issueSession(res, 42);

    const [call] = res.calls;
    expect(call.name).toBe(env.COOKIE_NAME);
    expect(call.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(call.options.maxAge).toBeGreaterThan(0);
    expect(readSessionUserId(requestWithToken(call.value))).toBe('42');
  });

  it('treats a missing, tampered or foreign-secret token as a guest', () => {
    const res = fakeResponse();
    issueSession(res, 42);
    const token = res.calls[0].value;

    expect(readSessionUserId(requestWithToken(null))).toBeNull();
    expect(readSessionUserId(requestWithToken(`${token}x`))).toBeNull();
    expect(
      readSessionUserId(
        requestWithToken(jwt.sign({}, 'a-different-secret-that-is-long-enough', { subject: '42' }))
      )
    ).toBeNull();
  });

  it('treats an expired token as a guest', () => {
    const token = jwt.sign({}, env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: '42',
      expiresIn: '-1s',
    });

    expect(readSessionUserId(requestWithToken(token))).toBeNull();
  });

  it('ignores a subject that is not a user id', () => {
    const token = jwt.sign({}, env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: 'not-a-number',
      expiresIn: '5m',
    });

    expect(readSessionUserId(requestWithToken(token))).toBeNull();
  });

  it('clears with the same flags it set', () => {
    const res = fakeResponse();

    clearSession(res);

    expect(res.calls[0]).toMatchObject({
      name: env.COOKIE_NAME,
      options: { httpOnly: true, sameSite: 'lax', path: '/' },
    });
  });
});
