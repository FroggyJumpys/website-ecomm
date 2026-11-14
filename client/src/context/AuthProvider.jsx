import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './authContext.js';
import {
  fetchSession,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from '../services/auth.js';

/**
 * Owns the signed-in user. The mock session lives in browser storage; the real
 * one will be an httpOnly cookie (step 04b), so components only ever see
 * `status`, `user` and the three actions.
 */
export function AuthProvider({ children }) {
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

  const login = useCallback(async (credentials) => {
    const { data } = await loginRequest(credentials);
    setSession({ status: 'authenticated', user: data });
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await registerRequest(payload);
    setSession({ status: 'authenticated', user: data });
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      // Sign out locally even if the request fails: the UI must never pretend
      // the user is still signed in.
      setSession({ status: 'guest', user: null });
    }
  }, []);

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
