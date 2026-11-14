import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiShoppingBag, FiX } from 'react-icons/fi';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { Price } from '../ui/Price.jsx';
import { cn } from '../../lib/cn.js';
import { routes } from '../../lib/nav.js';
import { COLOR_SWATCH } from '../../lib/shopParams.js';

/**
 * One saved product. The row leads with the image, then everything needed to
 * decide (specification, availability, the variant that will move), and keeps
 * price plus actions in a fixed right-hand column so the money lines up down
 * the list — the same reading order as the shop's list layout.
 */

const chipBase =
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] transition';

function VariantChips({ label, options, value, onChange, showSwatch = false }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-spec text-ink-soft">{label}</span>
      {options.map((option) => {
        const selected = value === option;

        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={selected}
            className={cn(
              chipBase,
              selected ? 'border-ink bg-ink text-paper' : 'border-ink/15 text-ink hover:border-ink/40'
            )}
          >
            {showSwatch && (
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full ring-1 ring-inset ring-black/20"
                style={{ backgroundColor: COLOR_SWATCH[option] ?? '#c9c2b8' }}
              />
            )}
            {option}
          </button>
        );
      })}
    </div>
  );
}

function Availability({ stock }) {
  const soldOut = stock <= 0;
  const lowStock = !soldOut && stock <= 5;

  return (
    <p className="mt-2 flex items-center gap-1.5 text-spec">
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full',
          soldOut ? 'bg-danger' : lowStock ? 'bg-warning' : 'bg-success'
        )}
      />
      <span className={cn(soldOut ? 'text-danger' : lowStock ? 'text-warning' : 'text-ink-soft')}>
        {soldOut ? 'Stok habis' : lowStock ? `Tersisa ${stock} unit` : 'Siap dikirim dari Banjarmasin'}
      </span>
    </p>
  );
}

export function WishlistRow({ item, onMove, onRemove, moving = false, removing = false }) {
  const colors = item.colors ?? [];
  const sizes = item.sizes ?? [];
  const stock = Number(item.stock) || 0;
  const soldOut = stock <= 0;

  const [color, setColor] = useState(colors[0] ?? '');
  const [size, setSize] = useState(sizes[0] ?? '');

  const discounted = item.compareAtPrice && item.compareAtPrice > item.price;
  const busy = moving || removing;

  return (
    <article className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-4 border-t border-sand py-6 first:border-t-0 first:pt-0 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:gap-x-6">
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
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="font-display text-[0.9375rem] font-medium leading-snug text-ink sm:text-base">
            <Link to={routes.product(item.slug)} className="hover:underline underline-offset-4">
              {item.name}
            </Link>
          </h2>
          {discounted && <Badge tone="accent">Diskon</Badge>}
          {soldOut && <Badge tone="danger">Habis</Badge>}
        </div>

        <p className="mt-0.5 text-spec text-ink-soft">
          {[item.category?.name, item.brand?.name].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1 text-spec text-ink-soft">
          {item.material} · {item.dimensions}
        </p>

        <Availability stock={stock} />

        {colors.length > 1 && (
          <VariantChips
            label="Warna"
            options={colors}
            value={color}
            onChange={setColor}
            showSwatch
          />
        )}

        {sizes.length > 1 && (
          <VariantChips label="Ukuran" options={sizes} value={size} onChange={setSize} />
        )}
      </div>

      <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 sm:col-span-1 sm:flex-col sm:items-end sm:justify-start">
        <Price amount={item.price} compareAt={item.compareAtPrice} size="md" />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-end sm:gap-2.5">
          <Button
            size="sm"
            onClick={() => onMove(item, { color, size, quantity: 1 })}
            disabled={soldOut || busy}
            loading={moving}
          >
            <FiShoppingBag className="size-4" aria-hidden="true" />
            {soldOut ? 'Stok habis' : 'Pindahkan ke keranjang'}
          </Button>

          <button
            type="button"
            onClick={() => onRemove(item)}
            disabled={busy}
            className="inline-flex items-center gap-1 text-spec text-ink-soft transition hover:text-danger disabled:opacity-60"
          >
            <FiX className="size-3.5" aria-hidden="true" />
            Hapus
            <span className="sr-only"> {item.name} dari favorit</span>
          </button>
        </div>
      </div>
    </article>
  );
}
