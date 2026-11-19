import { Link, NavLink } from 'react-router-dom';
import { FiLogOut, FiSearch, FiHeart, FiShoppingBag, FiMenu } from 'react-icons/fi';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer } from '../ui/Drawer.jsx';
import { ButtonLink } from '../ui/Button.jsx';
import { headerIconButton } from '../ui/buttonStyles.js';
import { AccountMenu } from './AccountMenu.jsx';
import { useCart } from '../../context/cartContext.js';
import { useAuth } from '../../context/authContext.js';
import { primaryNav, routes, accountNav } from '../../lib/nav.js';
import { cn } from '../../lib/cn.js';

function Wordmark({ className }) {
  return (
    <Link
      to={routes.home}
      className={cn('flex items-baseline gap-2 text-ink', className)}
      aria-label="BaDekor, ke beranda"
    >
      <span className="font-display text-[1.375rem] font-semibold leading-none tracking-[-0.045em]">
        BaDekor
      </span>
      <span className="hidden text-spec text-ink-soft sm:inline">mebel Banjarmasin</span>
    </Link>
  );
}

function SearchForm({ className, onSubmitted }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const query = term.trim();
    navigate(query ? `${routes.shop}?q=${encodeURIComponent(query)}` : routes.shop);
    onSubmitted?.();
  };

  return (
    <form role="search" onSubmit={handleSubmit} className={cn('relative', className)}>
      <label htmlFor="pencarian" className="sr-only">
        Cari produk
      </label>
      <FiSearch
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
      />
      <input
        id="pencarian"
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Cari sofa, meja makan, rotan…"
        className="h-11 w-full rounded-full border border-ink/15 bg-surface pl-11 pr-4 text-sm text-ink placeholder:text-ink-soft/70 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden"
      />
    </form>
  );
}

/** Thin utility strip above the header. */
function TopBar() {
  return (
    <div className="bg-ulin text-paper">
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-between gap-4 px-5 text-spec sm:px-8">
        <p className="min-w-0 truncate">Dikirim dari Banjarmasin ke seluruh Indonesia</p>
        <div className="hidden shrink-0 items-center gap-5 sm:flex">
          <Link to={routes.account} className="hover:underline underline-offset-4">
            Lacak pesanan
          </Link>
          <a href="tel:+62511000000" className="hover:underline underline-offset-4">
            0511 000 000
          </a>
        </div>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { count } = useCart();
  const { status, user, signOut } = useAuth();

  const handleLogout = () => {
    setMenuOpen(false);
    // The provider takes the visitor home and only then drops the session, so
    // this never lands on the guard's /masuk?redirect=… (see signOut.js).
    void signOut();
  };

  return (
    <>
      <TopBar />

      <header className="sticky top-0 z-40 border-b border-sand bg-paper/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex h-16 items-center gap-3 sm:h-20 sm:gap-6">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Buka menu"
              className={cn(headerIconButton, 'lg:hidden')}
            >
              <FiMenu className="size-5" />
            </button>

            <Wordmark />

            <SearchForm className="ml-auto hidden w-full max-w-sm md:block" />

            <div className="ml-auto flex items-center gap-1 md:ml-0">
              <Link to={routes.wishlist} className={headerIconButton} aria-label="Favorit">
                <FiHeart className="size-5" />
              </Link>
              <AccountMenu />
              <Link
                to={routes.cart}
                className={headerIconButton}
                aria-label={count > 0 ? `Keranjang, ${count} item` : 'Keranjang'}
              >
                <FiShoppingBag className="size-5" />
                {count > 0 && (
                  <span
                    aria-hidden="true"
                    className="tabular absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-4 text-white"
                  >
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </Link>
            </div>
          </div>

          <nav aria-label="Navigasi utama" className="hidden border-t border-sand/80 lg:block">
            <ul className="flex items-center gap-8 py-3">
              {primaryNav.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === routes.home}
                    className={({ isActive }) =>
                      cn(
                        'text-sm text-ink-soft transition hover:text-ink',
                        isActive && 'font-medium text-ink'
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
              <li className="ml-auto">
                <Link
                  to={`${routes.shop}?sort=newest`}
                  className="text-sm font-medium text-primary-deep hover:underline underline-offset-4"
                >
                  Baru minggu ini
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" side="left">
        <div className="space-y-6">
          <SearchForm onSubmitted={() => setMenuOpen(false)} />

          <nav aria-label="Navigasi seluler">
            <ul className="space-y-1">
              {primaryNav.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-field px-2 py-2.5 text-[0.9375rem] text-ink transition hover:bg-ink/5"
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-sand pt-5">
            <p className="mb-2 text-spec text-ink-soft">Akun</p>
            {status === 'authenticated' && user ? (
              <>
                <p className="px-2 pb-2 text-sm text-ink">{user.name}</p>
                <ul className="space-y-1">
                  {accountNav.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={() => setMenuOpen(false)}
                        className="block rounded-field px-2 py-2.5 text-[0.9375rem] text-ink transition hover:bg-ink/5"
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-1 flex w-full items-center gap-2 rounded-field px-2 py-2.5 text-left text-[0.9375rem] text-ink transition hover:bg-ink/5"
                >
                  <FiLogOut className="size-4 shrink-0" aria-hidden="true" />
                  Keluar
                </button>
              </>
            ) : (
              <div className="space-y-3 px-2">
                <p className="text-sm text-ink-soft">Masuk untuk melihat pesanan dan favoritmu.</p>
                <div className="flex gap-2">
                  <ButtonLink
                    to={routes.login}
                    size="sm"
                    className="flex-1"
                    onClick={() => setMenuOpen(false)}
                  >
                    Masuk
                  </ButtonLink>
                  <ButtonLink
                    to={routes.register}
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setMenuOpen(false)}
                  >
                    Daftar
                  </ButtonLink>
                </div>
              </div>
            )}
          </div>
        </div>
      </Drawer>
    </>
  );
}
