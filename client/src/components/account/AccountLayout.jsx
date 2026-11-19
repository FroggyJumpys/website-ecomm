import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  FiGrid,
  FiHeart,
  FiLogOut,
  FiMapPin,
  FiPackage,
  FiShoppingBag,
  FiUser,
} from 'react-icons/fi';
import { Breadcrumbs } from '../ui/Breadcrumbs.jsx';
import { useAuth } from '../../context/authContext.js';
import { initials } from '../../lib/initials.js';
import { accountNav, routes } from '../../lib/nav.js';
import { cn } from '../../lib/cn.js';

const icons = {
  [routes.account]: FiGrid,
  [routes.orders]: FiPackage,
  [routes.profile]: FiUser,
  [routes.addresses]: FiMapPin,
  [routes.wishlist]: FiHeart,
  [routes.cart]: FiShoppingBag,
};

function breadcrumbItems(pathname) {
  if (pathname === routes.account) {
    return [{ label: 'Beranda', to: routes.home }, { label: 'Akun' }];
  }

  const exact = accountNav.find((item) => item.to === pathname);
  const isOrderDetail = pathname.startsWith(`${routes.orders}/`);

  return [
    { label: 'Beranda', to: routes.home },
    { label: 'Akun', to: routes.account },
    { label: isOrderDetail ? 'Detail pesanan' : (exact?.label ?? 'Akun') },
  ];
}

/**
 * Frame for every /akun page: breadcrumbs, a sticky customer rail and the
 * page content. The rail is a plain list with a monogram, not a dashboard card
 * kit; on small screens it becomes a horizontally scrollable row above the
 * content so the page starts immediately.
 */
export function AccountLayout() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();

  const handleLogout = () => {
    // The provider takes the visitor home and only then drops the session, so
    // this never lands on the guard's /masuk?redirect=… (see signOut.js).
    void signOut();
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
      <Breadcrumbs items={breadcrumbItems(pathname)} />

      <div className="mt-6 grid gap-10 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-14">
        <aside className="min-w-0 lg:sticky lg:top-36 lg:self-start">
          <div className="flex items-center gap-3.5">
            <span
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-full bg-ulin font-display text-base font-semibold tracking-wide text-paper"
            >
              {initials(user?.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-[0.9375rem] font-medium text-ink">
                {user?.name}
              </p>
              <p className="truncate text-spec text-ink-soft">{user?.email}</p>
            </div>
          </div>

          <nav aria-label="Menu akun" className="mt-6">
            <ul className="flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
              {accountNav.map((item) => {
                const Icon = icons[item.to] ?? FiGrid;

                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === routes.account}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition lg:rounded-field',
                          isActive
                            ? 'bg-ink text-paper'
                            : 'text-ink-soft hover:bg-ink/5 hover:text-ink'
                        )
                      }
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-6 hidden border-t border-sand pt-4 lg:block">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-field px-3.5 py-2 text-left text-sm text-ink-soft transition hover:bg-ink/5 hover:text-ink"
            >
              <FiLogOut className="size-4 shrink-0" aria-hidden="true" />
              Keluar
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
