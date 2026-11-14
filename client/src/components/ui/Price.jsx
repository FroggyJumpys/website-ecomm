import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { formatIDR, discountPercent } from '../../lib/format.js';

const sizes = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-2xl',
};

/**
 * Rupiah price with an optional strike-through compare price.
 * `amount` and `compareAt` are whole Rupiah integers from the API.
 */
export function Price({ amount, compareAt = null, size = 'md', className, showDiscount = true }) {
  const off = discountPercent(amount, compareAt);

  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5', className)}>
      <span className={cn('tabular font-display font-semibold text-ink', sizes[size])}>
        {formatIDR(amount)}
      </span>
      {off > 0 && (
        <>
          <span className="tabular text-spec text-ink-soft line-through">{formatIDR(compareAt)}</span>
          {showDiscount && (
            <span className="text-spec font-medium text-primary-deep">Hemat {off}%</span>
          )}
        </>
      )}
    </span>
  );
}

/** Inline price link used in the order summary rows. */
export function PriceRow({ label, value, strong = false, to }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={cn('text-sm', strong ? 'font-medium text-ink' : 'text-ink-soft')}>{label}</span>
      {to ? (
        <Link to={to} className="tabular text-sm font-medium text-ink hover:underline">
          {formatIDR(value)}
        </Link>
      ) : (
        <span
          className={cn(
            'tabular',
            strong ? 'font-display text-base font-semibold text-ink' : 'text-sm text-ink'
          )}
        >
          {formatIDR(value)}
        </span>
      )}
    </div>
  );
}
