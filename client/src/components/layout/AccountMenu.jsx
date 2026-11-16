import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiBox, FiLogOut, FiUser } from 'react-icons/fi';
import { Badge } from '../ui/Badge.jsx';
import { headerIconButton } from '../ui/buttonStyles.js';
import { useAuth } from '../../context/authContext.js';
import { accountNav, routes } from '../../lib/nav.js';
import { initials } from '../../lib/initials.js';
import { cn } from '../../lib/cn.js';

const menuItem =
  'flex w-full items-center gap-2.5 rounded-field px-3 py-2 text-left text-sm text-ink transition hover:bg-ink/5';

/**
 * Header account control. Guests get a link to /masuk; signed-in users get
 * their initials and a small panel with the account links and the sign-out
 * action, which is the only place the mock session ends.
 *
 * It is a disclosure, not a `role="menu"`: the links stay in the tab order, so
 * no arrow-key handling is needed to keep it usable.
 */
export function AccountMenu() {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (status !== 'authenticated' || !user) {
    return (
      <Link to={routes.login} className={headerIconButton} aria-label="Masuk atau daftar">
        <FiUser className="size-5" aria-hidden="true" />
      </Link>
    );
  }

  const handleLogout = async () => {
    setOpen(false);
    // Leave first: the guard would otherwise redirect to /masuk the moment the
    // session drops, which reads as "access denied" rather than "signed out".
    navigate(routes.home);
    await logout();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Akun ${user.name}`}
        className={cn(headerIconButton, open && 'bg-ink/5')}
      >
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-ulin text-[0.6875rem] font-semibold tracking-wide text-paper"
        >
          {initials(user.name)}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 animate-fade-in rounded-card border border-sand bg-surface p-2 shadow-lift">
          <div className="border-b border-sand px-3 pb-3 pt-1.5">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-spec text-ink-soft">{user.email}</p>
            {user.role === 'admin' && (
              <Badge tone="dark" className="mt-2">
                Admin
              </Badge>
            )}
          </div>

          <nav aria-label="Menu akun" className="pt-1.5">
            <ul>
              {accountNav.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} onClick={() => setOpen(false)} className={menuItem}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {user.role === 'admin' && (
            <div className="mt-1.5 border-t border-sand pt-1.5">
              <Link to={routes.admin} onClick={() => setOpen(false)} className={menuItem}>
                <FiBox className="size-4 shrink-0" aria-hidden="true" />
                Panel toko
              </Link>
            </div>
          )}

          <div className="mt-1.5 border-t border-sand pt-1.5">
            <button type="button" onClick={handleLogout} className={menuItem}>
              <FiLogOut className="size-4 shrink-0" aria-hidden="true" />
              Keluar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
