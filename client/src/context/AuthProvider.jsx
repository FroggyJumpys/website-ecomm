import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthContext } from './authContext.js';
import {
  fetchSession,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from '../services/auth.js';

/**
 * Owns the signed-in user. The session is an httpOnly JWT cookie the browser
 * never reads, so components only ever see `status`, `user` and the actions.
 *
 * Signing in also merges the guest cart on the server and signing out leaves
 * the account cart there, so the cart query is re-read after either: otherwise
 * the header would keep counting a cart that just moved to the account.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState({ status: 'restoring', user: null });

  useEffect(() => {
    let active = true;

    fetchSession()
      .then((payload) => {
        if (!active) return;
        const user = payload?.data ?? null;
        setSession({ status: user ? 'authenticated' : 'guest', user });
      })
      .catch(() => {
        if (active) setSession({ status: 'guest', user: null });
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (credentials) => {
      const { data } = await loginRequest(credentials);
      setSession({ status: 'authenticated', user: data });
      // Background housekeeping: the guest cart merge happens server-side, and a
      // failed cart refetch must not turn a successful sign-in into an error.
      void queryClient.invalidateQueries({ queryKey: ['cart'] });

      return data;
    },
    [queryClient]
  );

  const register = useCallback(
    async (payload) => {
      const { data } = await registerRequest(payload);
      setSession({ status: 'authenticated', user: data });
      void queryClient.invalidateQueries({ queryKey: ['cart'] });

      return data;
    },
    [queryClient]
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      // Sign out locally even if the request fails: the UI must never pretend
      // the user is still signed in. Resetting every query drops addresses,
      // orders, wishlist and admin data that belong to the old account, and
      // refetches the active cart as the now-guest visitor.
      setSession({ status: 'guest', user: null });
      void queryClient.resetQueries();
    }
  }, [queryClient]);

  /** Replaces the cached user after a successful profile update. */
  const updateUser = useCallback((nextUser) => {
    setSession((current) =>
      current.status === 'authenticated' ? { ...current, user: nextUser } : current
    );
  }, []);

  const value = useMemo(
    () => ({
      status: session.status,
      user: session.user,
      isAuthenticated: session.status === 'authenticated',
      isAdmin: session.user?.role === 'admin',
      login,
      register,
      logout,
      updateUser,
    }),
    [session, login, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
