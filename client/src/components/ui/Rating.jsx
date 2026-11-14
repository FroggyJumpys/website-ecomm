import { FaStar, FaStarHalfStroke, FaRegStar } from 'react-icons/fa6';
import { cn } from '../../lib/cn.js';

/**
 * Read-only rating. `value` is 0–5, `count` is the number of reviews.
 * The visible stars are decorative; the accessible name carries the numbers.
 */
export function Rating({ value = 0, count, size = 'sm', showValue = true, className }) {
  const stars = [1, 2, 3, 4, 5].map((position) => {
    if (value >= position) return 'full';
    if (value >= position - 0.5) return 'half';
    return 'empty';
  });

  const iconSize = size === 'md' ? 'size-4' : 'size-3.5';
  const label = `Rating ${value} dari 5${count ? `, ${count} ulasan` : ''}`;

  return (
    <div className={cn('flex items-center gap-2', className)} aria-label={label} role="img">
      <span aria-hidden="true" className="flex items-center gap-0.5 text-primary">
        {stars.map((state, index) =>
          state === 'full' ? (
            <FaStar key={index} className={iconSize} />
          ) : state === 'half' ? (
            <FaStarHalfStroke key={index} className={iconSize} />
          ) : (
            <FaRegStar key={index} className={iconSize} />
          )
        )}
      </span>
      {showValue && (
        <span aria-hidden="true" className="tabular text-spec text-ink-soft">
          {value.toFixed(1)}
          {count !== undefined && count !== null ? ` (${count})` : ''}
        </span>
      )}
    </div>
  );
}
