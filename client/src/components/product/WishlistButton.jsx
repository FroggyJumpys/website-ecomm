import { useLocation, useNavigate } from 'react-router-dom';
import { FiHeart } from 'react-icons/fi';
import { cn } from '../../lib/cn.js';
import { routes } from '../../lib/nav.js';
import { useAuth } from '../../context/authContext.js';
import { useAddToWishlist, useIsSaved, useRemoveFromWishlist } from '../../hooks/useWishlist.js';

/**
 * Save/unsave control shared by the shop card, the shop list row and the
 * product page. Signed-out visitors are sent to the sign-in form with a
 * `redirect` back to where they were, because the wishlist belongs to an
 * account and is stored in `tbl_favorit`.
 */

const variants = {
  // Icon over a product image; the caller positions it.
  floating:
    'absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-surface/95 text-ink shadow-card ring-1 ring-ink/10 backdrop-blur transition hover:bg-surface hover:text-primary-deep',
  // Icon + label in a quiet line, for rows next to other text actions.
  plain:
    'inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-soft transition hover:text-ink',
};

const savedVariants = {
  floating: 'text-primary',
  plain: 'font-medium text-primary-deep',
};

export function WishlistButton({ product, variant = 'floating', className }) {
  const { isAuthenticated } = useAuth();
  const saved = useIsSaved(product.id);
  const addMutation = useAddToWishlist();
  const removeMutation = useRemoveFromWishlist();
  const navigate = useNavigate();
  const location = useLocation();

  const pending = addMutation.isPending || removeMutation.isPending;
  const iconOnly = variant === 'floating';

  const toggle = () => {
    if (!isAuthenticated) {
      const target = `${location.pathname}${location.search}`;
      navigate(`${routes.login}?redirect=${encodeURIComponent(target)}`);
      return;
    }

    if (saved) removeMutation.mutate(product.id);
    else addMutation.mutate(product.id);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={
        iconOnly
          ? `${saved ? 'Hapus' : 'Simpan'} ${product.name} ${saved ? 'dari' : 'ke'} favorit`
          : undefined
      }
      title={iconOnly ? (saved ? 'Hapus dari favorit' : 'Simpan ke favorit') : undefined}
      disabled={pending}
      className={cn(
        variants[variant] ?? variants.floating,
        saved && (savedVariants[variant] ?? savedVariants.floating),
        pending && 'opacity-60',
        className
      )}
    >
      <FiHeart
        aria-hidden="true"
        className={iconOnly ? 'size-[1.125rem]' : 'size-4'}
        fill={saved ? 'currentColor' : 'none'}
      />
      {!iconOnly && <span>{saved ? 'Tersimpan di favorit' : 'Simpan ke favorit'}</span>}
    </button>
  );
}
