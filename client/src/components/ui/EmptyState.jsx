import { cn } from '../../lib/cn.js';
import { ButtonLink } from './Button.jsx';

/**
 * Empty states explain what is missing and how to fill it, in the interface's
 * voice. Pass `action` to give the next step.
 */
export function EmptyState({ title, description, action, className }) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center',
        className
      )}
    >
      <h2 className="font-display text-heading text-ink">{title}</h2>
      {description && <p className="text-sm text-ink-soft">{description}</p>}
      {action && (
        <ButtonLink to={action.to} variant="outline" size="sm" className="mt-2">
          {action.label}
        </ButtonLink>
      )}
    </div>
  );
}

/** Inline error with a retry action; never apologetic, always specific. */
export function ErrorState({ title = 'Gagal memuat data', description, onRetry, className }) {
  return (
    <div className={cn('mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center', className)}>
      <h2 className="font-display text-heading text-ink">{title}</h2>
      {description && <p className="text-sm text-ink-soft">{description}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-primary-deep underline underline-offset-4"
        >
          Coba lagi
        </button>
      )}
    </div>
  );
}
