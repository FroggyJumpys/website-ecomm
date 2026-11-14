import { Outlet } from 'react-router-dom';
import { SiteHeader } from '../components/layout/SiteHeader.jsx';
import { SiteFooter } from '../components/layout/SiteFooter.jsx';
import { useScrollToTop } from '../hooks/useScrollToTop.js';

export function MainLayout() {
  useScrollToTop();

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-paper"
      >
        Lewati ke konten utama
      </a>

      <SiteHeader />

      <main id="konten" className="flex-1">
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  );
}
