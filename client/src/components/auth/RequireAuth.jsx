import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/authContext.js';
import { routes } from '../../lib/nav.js';
import { Skeleton } from '../ui/Spinner.jsx';

/**
 * Route guard for customer pages. While the session is being restored it renders
 * a quiet skeleton instead of bouncing a signed-in user to /masuk, and it keeps
 * the intended path so the form can send them back after signing in.
 */
export function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'restoring') {
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

  return children;
}
