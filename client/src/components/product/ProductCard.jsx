import { Link } from 'react-router-dom';
import { Badge } from '../ui/Badge.jsx';
import { Price } from '../ui/Price.jsx';
import { Rating } from '../ui/Rating.jsx';
import { WishlistButton } from './WishlistButton.jsx';
import { cn } from '../../lib/cn.js';
import { routes } from '../../lib/nav.js';

/**
 * The catalogue's repeating unit. The material line under the name carries real
 * specification (material + dimensions), not decoration.
 */
export function ProductCard({ product, className }) {
  const discounted = product.compareAtPrice && product.compareAtPrice > product.price;

  return (
    <article className={cn('group flex flex-col', className)}>
      <div className="relative overflow-hidden rounded-card bg-sand/50">
        <Link to={routes.product(product.slug)} tabIndex={-1} aria-hidden="true">
          <img
            src={product.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-square w-full object-cover transition duration-500 ease-out group-hover:scale-[1.03]"
          />
        </Link>
        <span className="pointer-events-none absolute left-3 top-3 flex gap-2">
          {discounted ? (
            <Badge tone="accent">Diskon</Badge>
          ) : product.isNew ? (
            <Badge tone="dark">Baru</Badge>
          ) : null}
        </span>

        <WishlistButton product={product} />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 pt-3">
        <h3 className="font-display text-[0.9375rem] font-medium leading-snug text-ink">
          <Link to={routes.product(product.slug)} className="hover:underline underline-offset-4">
            {product.name}
          </Link>
        </h3>

        <p className="text-spec text-ink-soft">
          {product.material} · {product.dimensions}
        </p>

        <Rating value={product.rating} count={product.reviewCount} className="pt-0.5" />

        <div className="mt-auto pt-2">
          <Price amount={product.price} compareAt={product.compareAtPrice} size="md" />
        </div>
      </div>
    </article>
  );
}

/** Same footprint as ProductCard, so grids do not shift while loading. */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="aspect-square w-full animate-pulse rounded-card bg-sand/70" />
      <div className="space-y-2 pt-3">
        <div className="h-4 w-3/4 animate-pulse rounded-full bg-sand/70" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-sand/60" />
        <div className="h-5 w-1/3 animate-pulse rounded-full bg-sand/70" />
      </div>
    </div>
  );
}
