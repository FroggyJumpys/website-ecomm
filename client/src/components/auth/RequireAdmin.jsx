import { Navigate, useLocation } from 'react-router-dom';
import { FiLock } from 'react-icons/fi';
import { useAuth } from '../../context/authContext.js';
import { routes } from '../../lib/nav.js';
import { Button, ButtonLink } from '../ui/Button.jsx';
import { Skeleton } from '../ui/Spinner.jsx';

/**
 * Route guard for the panel toko. A signed-in customer is told plainly that the
 * area is not theirs and can switch accounts in one click; a guest is sent to
 * the sign-in page with the intended path preserved.
 *
 * This is a usability guard. Authorization is enforced by the API again, which
 * is the only boundary that matters.
 */

function Forbidden({ email, onSwitchAccount }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <span
        aria-hidden="true"
        className="grid size-11 place-items-center rounded-full bg-sand text-ink"
      >
        <FiLock className="size-5" />
      </span>
      <h1 className="mt-5 text-title text-ink">Panel ini hanya untuk pengelola toko</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Kamu masuk sebagai <span className="wrap-break-word text-ink">{email}</span>, yang bukan
        akun admin. Kelola produk dan pesanan dengan akun admin, atau kembali berbelanja.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={onSwitchAccount}>Masuk sebagai admin</Button>
        <ButtonLink to={routes.home} variant="outline">
          Kembali ke toko
        </ButtonLink>
      </div>
    </div>
  );
}

export function RequireAdmin({ children }) {
  const { status, isAdmin, user, logout } = useAuth();
  const location = useLocation();

  if (status === 'restoring' || status === 'signing-out') {
    return (
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8" aria-busy="true">
        <Skeleton className="h-7 w-56 rounded-full" />
        <Skeleton className="mt-6 h-48 w-full rounded-card" />
      </div>
    );
  }

  if (status !== 'authenticated') {
    const target = `${location.pathname}${location.search}`;

    return <Navigate to={`${routes.login}?redirect=${encodeURIComponent(target)}`} replace />;
  }

  if (!isAdmin) {
    // Signing out drops the session, and this guard then redirects to /masuk
    // carrying /admin as the next destination.
    return <Forbidden email={user?.email} onSwitchAccount={() => void logout()} />;
  }

  return children;
}
