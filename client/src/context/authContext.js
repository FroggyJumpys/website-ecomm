import { createContext, useContext } from 'react';

/**
 * Session store shared by the header, the auth pages and the route guards.
 *
 * `status` starts at 'restoring' until the session has been checked, so guards
 * can wait instead of bouncing a signed-in user to /masuk on every reload. It is
 * 'signing-out' while "Keluar" is in flight: the guards wait for that too, and
 * the provider drops the session once the home page is committed.
 * `updateUser` lets the profile screen replace the cached user after a save.
 * `signOut` is the user-facing "Keluar" (ends the session and goes home);
 * `logout` ends the session in place and leaves the destination to the guard.
 */
export const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
