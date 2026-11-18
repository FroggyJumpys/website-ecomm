import { Link } from 'react-router-dom';
import { FiX } from 'react-icons/fi';
import { QuantityStepper } from '../ui/QuantityStepper.jsx';
import { formatIDR } from '../../lib/format.js';
import { routes } from '../../lib/nav.js';
import { cn } from '../../lib/cn.js';

/**
 * One cart line. The list is a ledger: image on the left, everything needed to
 * recognise the variant in the middle, and money right-aligned in a fixed
 * column so totals line up down the page.
 */
export function CartLine({ item, onQuantityChange, onRemove }) {
  const stock = Number(item.stock) || 0;
  const lowStock = stock > 0 && stock <= 5;
  const lineTotal = item.price * item.quantity;
  const variant = [item.color, item.size].filter(Boolean).join(' · ');

  return (
    <article className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-4 border-t border-sand py-6 first:border-t-0 first:pt-0 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:gap-x-6">
      <Link
        to={routes.product(item.slug)}
        tabIndex={-1}
        aria-hidden="true"
        className="self-start overflow-hidden rounded-card bg-sand/50"
      >
        <img
          src={item.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="aspect-square w-full object-cover"
        />
      </Link>

      <div className="min-w-0">
        <h2 className="font-display text-[0.9375rem] font-medium leading-snug text-ink sm:text-base">
          <Link to={routes.product(item.slug)} className="hover:underline underline-offset-4">
            {item.name}
          </Link>
        </h2>
        {variant && <p className="mt-1 text-spec text-ink-soft">{variant}</p>}
        <p className="tabular mt-1 text-spec text-ink-soft">{formatIDR(item.price)} / unit</p>

        {item.issues?.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-spec text-danger">
            {item.issues.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <QuantityStepper
            value={item.quantity}
            onChange={(quantity) => onQuantityChange(item.key, quantity)}
            max={Math.max(1, stock)}
            className="h-10"
            label={`Jumlah ${item.name}`}
          />
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="inline-flex items-center gap-1.5 text-spec text-ink-soft transition hover:text-danger"
          >
            <FiX className="size-3.5" aria-hidden="true" />
            Hapus
            <span className="sr-only"> {item.name} dari keranjang</span>
          </button>
        </div>

        {lowStock && (
          <p className={cn('mt-2.5 text-spec', 'text-warning')}>
            Tersisa {stock} unit di workshop.
          </p>
        )}
      </div>

      <div className="col-span-2 flex items-baseline justify-between gap-4 border-t border-sand/70 pt-3 sm:col-span-1 sm:flex-col sm:items-end sm:justify-start sm:border-0 sm:pt-0">
        <span className="text-spec text-ink-soft sm:hidden">Subtotal</span>
        <span className="tabular font-display text-base font-semibold text-ink">
          {formatIDR(lineTotal)}
        </span>
      </div>
    </article>
  );
}
