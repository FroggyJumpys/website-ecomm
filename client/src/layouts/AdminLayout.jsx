import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FiBox, FiClipboard, FiExternalLink, FiGrid, FiLogOut } from 'react-icons/fi';
import { useAuth } from '../context/authContext.js';
import { useScrollToTop } from '../hooks/useScrollToTop.js';
import { adminNav, routes } from '../lib/nav.js';
import { initials } from '../lib/initials.js';
import { cn } from '../lib/cn.js';

const icons = {
  [routes.admin]: FiGrid,
  [routes.adminProducts]: FiBox,
  [routes.adminOrders]: FiClipboard,
};

/**
 * Frame for the panel toko. It deliberately does not use the storefront header:
 * an ulin rail on the left, a quiet workspace on the right, and no product
 * navigation competing with the operator's own screens.
 */
export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  useScrollToTop();

  const handleLogout = () => {
    // Leave the guarded area before the session drops; the guard would
    // otherwise report "signed out" as "access denied".
    navigate(routes.home);
    void logout();
  };

  const railLink = (isPill) => ({ isActive }) =>
    cn(
      'flex items-center gap-2.5 px-3 py-2 text-sm transition',
      isPill ? 'whitespace-nowrap rounded-full' : 'rounded-field',
      isActive
        ? 'bg-paper font-medium text-ink'
        : 'text-paper/70 hover:bg-paper/10 hover:text-paper'
    );

  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#konten-admin"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-paper"
      >
        Lewati ke konten panel
      </a>

      <aside className="hidden bg-ulin lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-2 px-5">
          <span className="font-display text-[1.125rem] font-semibold tracking-[-0.03em] text-paper">
            BaDekor
          </span>
          <span className="text-spec text-paper/60">panel toko</span>
        </div>

        <nav aria-label="Navigasi panel toko" className="mt-4 px-3">
          <ul className="space-y-1">
            {adminNav.map((item) => {
              const Icon = icons[item.to] ?? FiGrid;

              return (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.to === routes.admin} className={railLink(false)}>
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto border-t border-paper/10 p-3">
          <NavLink to={routes.home} className={railLink(false)}>
            <FiExternalLink className="size-4 shrink-0" aria-hidden="true" />
            Lihat toko
          </NavLink>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex h-16 items-center gap-4 border-b border-sand bg-surface px-5 sm:px-8">
          <span className="flex items-baseline gap-2 lg:hidden">
            <span className="font-display text-[1.125rem] font-semibold tracking-[-0.03em] text-ink">
              BaDekor
            </span>
            <span className="text-spec text-ink-soft">panel toko</span>
          </span>

          <p className="hidden text-spec text-ink-soft lg:block">Panel toko</p>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <NavLink
              to={routes.home}
              className="text-sm text-ink-soft transition hover:text-ink"
            >
              Lihat toko
            </NavLink>

            <div className="flex items-center gap-2.5 border-sand pl-0 sm:border-l sm:pl-3">
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-full bg-ulin text-[0.6875rem] font-semibold tracking-wide text-paper"
              >
                {initials(user?.name)}
              </span>
              <span className="hidden max-w-40 truncate text-sm text-ink sm:block">{user?.name}</span>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Keluar dari panel toko"
                className="grid size-9 place-items-center rounded-full text-ink-soft transition hover:bg-ink/5 hover:text-ink"
              >
                <FiLogOut className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <nav aria-label="Navigasi panel toko" className="bg-ulin lg:hidden">
          <ul className="flex gap-1 overflow-x-auto px-3 py-2">
            {adminNav.map((item) => {
              const Icon = icons[item.to] ?? FiGrid;

              return (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.to === routes.admin} className={railLink(true)}>
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <main id="konten-admin" className="min-w-0 flex-1 px-5 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
