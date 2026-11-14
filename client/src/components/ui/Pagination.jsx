import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { cn } from '../../lib/cn.js';

/** Page numbers with ellipsis gaps, always showing the first and last page. */
function buildPages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const wanted = [1, total, current - 1, current, current + 1]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);

  const result = [];
  let previous = 0;

  for (const page of wanted) {
    if (previous && page - previous > 1) result.push(`gap-${page}`);
    result.push(page);
    previous = page;
  }

  return result;
}

export function Pagination({ page, totalPages, onChange, className }) {
  if (!totalPages || totalPages <= 1) return null;

  const go = (next) => {
    if (next < 1 || next > totalPages || next === page) return;
    onChange(next);
  };

  const buttonBase =
    'grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm transition ' +
    'disabled:pointer-events-none disabled:opacity-40';

  return (
    <nav aria-label="Navigasi halaman" className={cn('flex items-center justify-center gap-1', className)}>
      <button
        type="button"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        aria-label="Halaman sebelumnya"
        className={cn(buttonBase, 'text-ink-soft hover:bg-ink/5 hover:text-ink')}
      >
        <FiChevronLeft className="size-4" />
      </button>

      {buildPages(page, totalPages).map((item) =>
        typeof item === 'number' ? (
          <button
            key={item}
            type="button"
            onClick={() => go(item)}
            aria-current={item === page ? 'page' : undefined}
            className={cn(
              buttonBase,
              'tabular',
              item === page
                ? 'bg-ink font-medium text-paper'
                : 'text-ink-soft hover:bg-ink/5 hover:text-ink'
            )}
          >
            {item}
          </button>
        ) : (
          <span key={item} aria-hidden="true" className="px-1 text-ink-soft/60">
            …
          </span>
        )
      )}

      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
        aria-label="Halaman berikutnya"
        className={cn(buttonBase, 'text-ink-soft hover:bg-ink/5 hover:text-ink')}
      >
        <FiChevronRight className="size-4" />
      </button>
    </nav>
  );
}
