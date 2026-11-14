import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCheck } from 'react-icons/fi';
import { Breadcrumbs } from '../components/ui/Breadcrumbs.jsx';
import { ButtonLink } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState } from '../components/ui/EmptyState.jsx';
import { FormAlert } from '../components/ui/FormAlert.jsx';
import { Skeleton } from '../components/ui/Spinner.jsx';
import { WishlistRow } from '../components/wishlist/WishlistRow.jsx';
import { useCart } from '../context/cartContext.js';
import { useRemoveFromWishlist, useWishlist } from '../hooks/useWishlist.js';
import { routes } from '../lib/nav.js';

function WishlistSkeleton() {
  return (
    <div className="mt-2 space-y-6" aria-busy="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 border-t border-sand pt-6">
          <Skeleton className="aspect-square rounded-card" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3 rounded-full" />
            <Skeleton className="h-3 w-1/2 rounded-full" />
            <Skeleton className="h-3 w-2/5 rounded-full" />
            <Skeleton className="h-8 w-40 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function WishlistPage() {
  const query = useWishlist();
  const removeMutation = useRemoveFromWishlist();
  const { addItem } = useCart();
  const [status, setStatus] = useState(null);
  // Which row is waiting on the server, and for what, so only that row spins.
  const [pending, setPending] = useState(null);

  const items = query.data?.data ?? [];
  const availableCount = items.filter((item) => (Number(item.stock) || 0) > 0).length;

  const handleMove = (item, selection) => {
    setPending({ id: item.id, type: 'move' });

    removeMutation.mutate(item.id, {
      onSuccess: () => {
        // The cart is synchronous, so the line is added only once the wishlist
        // row is gone: a failed removal cannot leave a product in both lists.
        addItem(item, selection);
        setStatus({
          tone: 'success',
          message: `${item.name} dipindahkan ke keranjang.`,
          showCart: true,
        });
      },
      onError: (error) => {
        setStatus({
          tone: 'error',
          message: error.message || 'Produk tidak dapat dipindahkan. Coba lagi.',
        });
      },
      onSettled: () => setPending(null),
    });
  };

  const handleRemove = (item) => {
    setPending({ id: item.id, type: 'remove' });

    removeMutation.mutate(item.id, {
      onSuccess: () => setStatus({ tone: 'success', message: `${item.name} dihapus dari favorit.` }),
      onError: (error) => {
        setStatus({
          tone: 'error',
          message: error.message || 'Produk tidak dapat dihapus. Coba lagi.',
        });
      },
      onSettled: () => setPending(null),
    });
  };

  let content;

  if (query.isPending) {
    content = <WishlistSkeleton />;
  } else if (query.isError) {
    content = (
      <ErrorState
        description="Daftar favorit tidak dapat dimuat."
        onRetry={query.refetch}
        className="py-12"
      />
    );
  } else if (items.length === 0) {
    content = (
      <EmptyState
        title="Belum ada yang disimpan"
        description="Ketuk ikon hati pada produk mana pun untuk menyimpannya di sini. Favorit tersimpan di akunmu, jadi tetap ada saat kamu kembali."
        action={{ label: 'Jelajahi koleksi', to: routes.shop }}
        className="py-20"
      />
    );
  } else {
    content = (
      <div className="mt-2">
        {items.map((item) => (
          <WishlistRow
            key={item.id}
            item={item}
            onMove={handleMove}
            onRemove={handleRemove}
            moving={pending?.id === item.id && pending.type === 'move'}
            removing={pending?.id === item.id && pending.type === 'remove'}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
      <Breadcrumbs items={[{ label: 'Beranda', to: routes.home }, { label: 'Favorit' }]} />

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-sand pb-6">
        <div className="max-w-xl">
          <h1 className="text-title text-ink">Favorit</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Produk yang kamu simpan untuk nanti. Pindahkan ke keranjang saat sudah siap dibeli,
            atau hapus yang sudah tidak cocok.
          </p>
          {!query.isPending && !query.isError && items.length > 0 && (
            <p className="mt-3 text-spec text-ink-soft">
              <span className="tabular">{items.length}</span> produk tersimpan
              {availableCount < items.length && (
                <>
                  {' · '}
                  <span className="tabular">{availableCount}</span> masih tersedia
                </>
              )}
            </p>
          )}
        </div>

        <ButtonLink to={routes.shop} variant="outline" size="sm">
          Lanjut belanja
        </ButtonLink>
      </header>

      {status && (
        <div className="mt-6">
          {status.tone === 'error' ? (
            <FormAlert message={status.message} />
          ) : (
            <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-success">
              <FiCheck className="size-4 shrink-0" aria-hidden="true" />
              {status.message}
              {status.showCart && (
                <Link
                  to={routes.cart}
                  className="font-medium text-ink underline underline-offset-4 hover:text-primary-deep"
                >
                  Lihat keranjang
                </Link>
              )}
            </p>
          )}
        </div>
      )}

      {content}
    </div>
  );
}
