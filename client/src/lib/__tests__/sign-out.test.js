import { describe, expect, it } from 'vitest';
import { signOutStep } from '../signOut.js';

/**
 * Pins the 03d reviewer finding: "Keluar" must never leave the visitor on a
 * guard's `/masuk?redirect=…`. The session may only be dropped once the
 * committed location is the home page, because a guard that is still mounted
 * would otherwise push its own redirect before the router commits the new one.
 */

describe('signOutStep', () => {
  it('does nothing while the visitor is not signing out', () => {
    expect(signOutStep('restoring', '/akun')).toBe('idle');
    expect(signOutStep('authenticated', '/akun')).toBe('idle');
    expect(signOutStep('guest', '/masuk')).toBe('idle');
  });

  it('leaves a guarded page instead of dropping the session on it', () => {
    expect(signOutStep('signing-out', '/akun')).toBe('leave');
    expect(signOutStep('signing-out', '/akun/pesanan')).toBe('leave');
    expect(signOutStep('signing-out', '/admin/pesanan/BD-2026-0417')).toBe('leave');
    expect(signOutStep('signing-out', '/pembayaran')).toBe('leave');
  });

  it('finishes only once the home page is actually the current location', () => {
    expect(signOutStep('signing-out', '/')).toBe('finish');
  });
});
