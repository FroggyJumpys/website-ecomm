import { Link } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import { cn } from '../../lib/cn.js';

/**
 * Heading row used above every home-page and shop-page product grid: a label,
 * a title, and an optional "see all" link. Extracted once the same markup
 * appeared in three sections of the home page.
 */
export function SectionHeading({ eyebrow, title, description, action, className }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="max-w-xl">
        {eyebrow && <p className="text-spec text-ink-soft">{eyebrow}</p>}
        <h2 className="mt-1 text-title text-ink">{title}</h2>
        {description && <p className="mt-2 text-sm text-ink-soft">{description}</p>}
      </div>
      {action && (
        <Link
          to={action.to}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-ink transition hover:text-primary-deep"
        >
          {action.label}
          <FiArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}
