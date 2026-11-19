import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AuthContext } from './authContext.js';
import { routes } from '../lib/nav.js';
import { signOutStep } from '../lib/signOut.js';
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
 * `status` is one of 'restoring', 'authenticated', 'guest' or 'signing-out'.
 *
 * Signing in also merges the guest cart on the server and signing out leaves
 * the account cart there, so the cart query is re-read after either: otherwise
 * the header would keep counting a cart that just moved to the account.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
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

  const dropSession = useCallback(() => {
    // Sign out locally even if the request failed: the UI must never pretend
    // the user is still signed in. Resetting every query drops addresses,
    // orders, wishlist and admin data that belong to the old account, and
    // refetches the active cart as the now-guest visitor.
    setSession({ status: 'guest', user: null });
    void queryClient.resetQueries();
  }, [queryClient]);

  // Second half of a sign-out: the session is only dropped once the router has
  // committed the home page, so no guard is mounted to turn "signed out" into
  // its own "access denied" redirect. See lib/signOut.js for the decision table
  // and for why navigating in the same tick as the session drop loses the race.
  useEffect(() => {
    const step = signOutStep(session.status, pathname);

    if (step === 'leave') navigate(routes.home, { replace: true });
    else if (step === 'finish') dropSession();
  }, [session.status, pathname, navigate, dropSession]);

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

  /**
   * Ends the session where the visitor stands. The route guard decides what
   * happens next, which is what "Masuk sebagai admin" on the panel's forbidden
   * screen wants: drop the customer session, then let the guard send the guest
   * to /masuk with /admin preserved as the destination.
   */
  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      dropSession();
    }
  }, [dropSession]);

  /**
   * The "Keluar" action: end the session *and* return to the home page as a
   * guest. It finishes in two steps so the guard can never win the race — see
   * the effect above. The request is deliberately not awaited for the status
   * change: the visitor is signed out locally either way, and a slow or failed
   * logout call must not keep the header signed in.
   */
  const signOut = useCallback(async () => {
    setSession({ status: 'signing-out', user: null });

    try {
      await logoutRequest();
    } catch {
      // The cookie may already be gone (expired session, offline); the local
      // status is what the UI reads, so there is nothing else to do here.
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
      signOut,
      updateUser,
    }),
    [session, login, register, logout, signOut, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
