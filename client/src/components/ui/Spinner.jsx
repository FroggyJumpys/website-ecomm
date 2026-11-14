import { cn } from '../../lib/cn.js';

/**
 * Spinner for small inline waits. Skeleton blocks are preferred for page-level
 * loading so the layout does not jump.
 */
export function Spinner({ className, label = 'Memuat' }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-ink-soft', className)}>
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      <span className="text-spec">{label}</span>
    </span>
  );
}

/** A single placeholder block, shaped to be composed into layout skeletons. */
export function Skeleton({ className }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-card bg-sand/70', className)} />;
}
