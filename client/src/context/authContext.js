import { createContext, useContext } from 'react';

/**
 * Session store shared by the header, the auth pages and the route guards.
 *
 * `status` starts at 'restoring' until the session has been checked, so guards
 * can wait instead of bouncing a signed-in user to /masuk on every reload.
 * `updateUser` lets the profile screen replace the cached user after a save.
 */
export const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
