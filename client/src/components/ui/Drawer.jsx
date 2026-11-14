import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX } from 'react-icons/fi';
import { cn } from '../../lib/cn.js';

/**
 * Right-side panel for the mini cart, mobile navigation and filters.
 *
 * Escape closes it, background scrolling is locked while open, focus moves into
 * the panel and returns to the trigger on close.
 */
export function Drawer({ open, onClose, title, children, footer, side = 'right', className }) {
  const panelRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 animate-fade-in bg-ink/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 flex w-full max-w-md flex-col bg-surface shadow-lift outline-hidden',
          side === 'right' ? 'right-0 animate-drawer-in' : 'left-0 animate-drawer-in-left',
          className
        )}
      >
        <header className="flex items-center justify-between gap-4 border-b border-sand px-5 py-4">
          <h2 id={titleId} className="font-display text-heading text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel"
            className="grid size-9 place-items-center rounded-full text-ink-soft transition hover:bg-ink/5 hover:text-ink"
          >
            <FiX className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && <div className="border-t border-sand px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
