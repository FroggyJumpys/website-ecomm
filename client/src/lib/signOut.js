import { routes } from './nav.js';

/**
 * What the auth provider does while a sign-out is in flight.
 *
 * "Keluar" must end on the home page, never on a guard's
 * `/masuk?redirect=…`: that reads as "access denied" instead of "signed out".
 * Dropping the session in the same tick as the navigation is not enough,
 * because React Router 7 defers location updates into a transition — the
 * urgent "session dropped" update can re-render the still-mounted guard first,
 * and the guard then pushes its own redirect.
 *
 * So the session is dropped in two steps: `status` becomes 'signing-out', the
 * router is sent home, and only once the committed location *is* home does the
 * status become 'guest'. No guard is mounted at that point, so nothing can
 * race the destination.
 *
 * - 'idle'   — not signing out; nothing to do.
 * - 'leave'  — still on a guarded page: go home (the guards render a skeleton,
 *              they do not redirect while the status is 'signing-out').
 * - 'finish' — the home page is up: drop the session for good.
 */
export function signOutStep(status, pathname) {
  if (status !== 'signing-out') return 'idle';

  return pathname === routes.home ? 'finish' : 'leave';
}
