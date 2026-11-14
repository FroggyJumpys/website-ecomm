import { Link } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import { Badge } from '../ui/Badge.jsx';
import { Price } from '../ui/Price.jsx';
import { Rating } from '../ui/Rating.jsx';
import { WishlistButton } from './WishlistButton.jsx';
import { routes } from '../../lib/nav.js';

/**
 * Horizontal product row for the shop's list layout. Same data as ProductCard,
 * rearranged so the specification (material, dimensions, stock) can be read in
 * one line while scanning a long result set. Details sit left, price and the
 * action sit in a fixed right-hand column so prices line up down the page.
 */
export function ProductRow({ product }) {
  const discounted = product.compareAtPrice && product.compareAtPrice > product.price;
  const lowStock = product.stock > 0 && product.stock <= 5;

  return (
    <article className="group flex gap-4 sm:gap-6">
      <Link
        to={routes.product(product.slug)}
        tabIndex={-1}
        aria-hidden="true"
        className="w-28 shrink-0 self-start overflow-hidden rounded-card bg-sand/50 sm:w-44"
      >
        <img
          src={product.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="aspect-square w-full object-cover transition duration-500 ease-out group-hover:scale-[1.03]"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[0.9375rem] font-medium leading-snug text-ink sm:text-base">
              <Link to={routes.product(product.slug)} className="hover:underline underline-offset-4">
                {product.name}
              </Link>
            </h3>
            {discounted ? (
              <Badge tone="accent">Diskon</Badge>
            ) : product.isNew ? (
              <Badge tone="dark">Baru</Badge>
            ) : null}
          </div>

          {product.category && (
            <p className="mt-1 text-spec text-ink-soft">{product.category.name}</p>
          )}

          <p className="mt-1 text-spec text-ink-soft">
            {product.material} · {product.dimensions}
          </p>

          <Rating value={product.rating} count={product.reviewCount} className="mt-2" />

          {lowStock && <p className="mt-1.5 text-spec text-warning">Tersisa {product.stock} unit</p>}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end sm:pt-1 sm:text-right">
          <Price amount={product.price} compareAt={product.compareAtPrice} size="md" />
          <WishlistButton product={product} variant="plain" />
          <Link
            to={routes.product(product.slug)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink transition hover:text-primary-deep"
          >
            Lihat produk
            <FiArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
