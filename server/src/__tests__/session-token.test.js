import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  signSessionToken,
  verifySessionToken,
  durationToMs,
  sessionCookieOptions,
  clearCookieOptions,
} from '../lib/session.js';
import { env } from '../config/env.js';

describe('signSessionToken / verifySessionToken', () => {
  it('round-trips the user id as a string subject', () => {
    const token = signSessionToken({ id: 42 });
    expect(verifySessionToken(token).sub).toBe('42');
  });

  it('rejects a token signed with a different secret', () => {
    const token = jwt.sign({ sub: '1' }, 'another-secret-value-that-is-long-enough', {
      expiresIn: '1h',
    });

    expect(() => verifySessionToken(token)).toThrow(
      expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' })
    );
  });

  it('rejects a tampered token', () => {
    const token = signSessionToken({ id: 42 });
    const [header, payload, signature] = token.split('.');
    const tampered = `${header}.${payload}.${signature.slice(0, -2)}xx`;

    expect(() => verifySessionToken(tampered)).toThrow(
      expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' })
    );
  });

  it('rejects an expired token', () => {
    const token = jwt.sign({ sub: '1' }, env.JWT_SECRET, { expiresIn: -10 });

    expect(() => verifySessionToken(token)).toThrow(
      expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' })
    );
  });

  it('rejects an unsigned token', () => {
    const unsigned = jwt.sign({ sub: '1' }, '', { algorithm: 'none' });

    expect(() => verifySessionToken(unsigned)).toThrow(
      expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' })
    );
  });

  it('rejects a non-string token', () => {
    expect(() => verifySessionToken(undefined)).toThrow(
      expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' })
    );
  });
});

describe('durationToMs', () => {
  it('reads the suffixed durations the JWT library accepts', () => {
    expect(durationToMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(durationToMs('12h')).toBe(12 * 60 * 60 * 1000);
    expect(durationToMs('30m')).toBe(30 * 60 * 1000);
    expect(durationToMs('45s')).toBe(45 * 1000);
  });

  it('treats a bare number as seconds', () => {
    expect(durationToMs('90')).toBe(90 * 1000);
  });

  it('falls back to seven days for a value it cannot read', () => {
    expect(durationToMs('nonsense')).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('cookie options', () => {
  it('is httpOnly, lax, rooted and long-lived outside production', () => {
    expect(sessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
      maxAge: durationToMs(env.JWT_EXPIRES_IN),
    });
  });

  it('clears with the same attributes so the browser matches the cookie', () => {
    expect(clearCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
    });
    expect(clearCookieOptions()).not.toHaveProperty('maxAge');
  });
});
