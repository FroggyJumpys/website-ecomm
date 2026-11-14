import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX } from 'react-icons/fi';
import { cn } from '../../lib/cn.js';

/**
 * Centered dialog for short tasks such as editing an address. Escape and the
 * backdrop close it, scrolling is locked while open, and focus returns to the
 * trigger afterwards. Like Drawer, it is a disclosure-sized dialog rather than
 * a full focus trap; the tab order stays natural.
 */
export function Modal({ open, onClose, title, children, className }) {
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
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 animate-fade-in bg-ink/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={cn('relative mx-auto my-6 w-full max-w-xl sm:my-14', className)}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="animate-rise-in rounded-card border border-sand bg-surface shadow-lift outline-hidden"
        >
          <header className="flex items-center justify-between gap-4 border-b border-sand px-5 py-4 sm:px-6">
            <h2 id={titleId} className="font-display text-heading text-ink">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup dialog"
              className="grid size-9 place-items-center rounded-full text-ink-soft transition hover:bg-ink/5 hover:text-ink"
            >
              <FiX className="size-5" aria-hidden="true" />
            </button>
          </header>

          <div className="px-5 py-5 sm:px-6">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
