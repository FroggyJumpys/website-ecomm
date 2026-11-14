import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Reset scroll on navigation. React Router's <ScrollRestoration> needs a data
 * router, and this app uses the declarative one.
 */
export function useScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
}
