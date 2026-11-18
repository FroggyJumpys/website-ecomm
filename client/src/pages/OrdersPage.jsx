import { useEffect, useState } from 'react';
import { AccountPageHeader } from '../components/account/AccountPageHeader.jsx';
import { OrderRow } from '../components/account/OrderRow.jsx';
import { Button, ButtonLink } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState } from '../components/ui/EmptyState.jsx';
import { Pagination } from '../components/ui/Pagination.jsx';
import { Skeleton } from '../components/ui/Spinner.jsx';
import { useOrders } from '../hooks/useAccount.js';
import { ORDER_FILTERS } from '../lib/orderStatus.js';
import { routes } from '../lib/nav.js';
import { cn } from '../lib/cn.js';

function OrderListSkeleton() {
  return (
    <div className="mt-2 divide-y divide-sand border-t border-sand" aria-busy="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="space-y-3 py-5">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-40 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-field" />
            <Skeleton className="h-4 flex-1 rounded-full" />
            <Skeleton className="h-4 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderResults({ query, filter, orders, onShowAll }) {
  if (query.isPending) return <OrderListSkeleton />;

  if (query.isError) {
    return (
      <ErrorState
        description="Riwayat pesanan tidak dapat dimuat."
        onRetry={query.refetch}
        className="py-12"
      />
    );
  }

  if (orders.length === 0) {
    if (filter === 'all') {
      return (
        <EmptyState
          title="Belum ada pesanan"
          description="Pesanan pertamamu akan muncul di sini setelah checkout."
          action={{ label: 'Lihat koleksi', to: routes.shop }}
        />
      );
    }

    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
        <h2 className="font-display text-heading text-ink">Tidak ada pesanan dengan status ini</h2>
        <p className="text-sm text-ink-soft">Coba lihat semua pesanan, atau pilih status lain.</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onShowAll}>
          Tampilkan semua
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 border-t border-sand">
      {orders.map((order) => (
        <OrderRow key={order.orderNumber} order={order} />
      ))}
    </div>
  );
}

export function OrdersPage() {
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const query = useOrders({ page, status: filter });

  const orders = query.data?.data ?? [];
  const meta = query.data?.meta;
  const counts = meta?.statusCounts ?? {};

  // A different status is a different result set; keeping the old page would
  // often point past the end of the filtered list.
  useEffect(() => {
    setPage(1);
  }, [filter]);

  const countFor = (value) => (query.isPending ? null : (counts[value] ?? 0));

  const changePage = (nextPage) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      <AccountPageHeader
        title="Riwayat pesanan"
        description="Lacak pesanan yang sedang berjalan dan lihat kembali pesanan yang sudah selesai."
      />

      <div role="group" aria-label="Filter status pesanan" className="mt-6 flex flex-wrap gap-1">
        {ORDER_FILTERS.map((option) => {
          const active = filter === option.value;
          const count = countFor(option.value);

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={active}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm transition',
                active ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5 hover:text-ink'
              )}
            >
              {option.label}
              {count !== null && (
                <span
                  className={cn(
                    'tabular text-[0.6875rem]',
                    active ? 'text-paper/70' : 'text-ink-soft/70'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <OrderResults
        query={query}
        filter={filter}
        orders={orders}
        onShowAll={() => setFilter('all')}
      />

      {!query.isPending && !query.isError && orders.length > 0 && (
        <Pagination
          page={page}
          totalPages={meta?.totalPages ?? 1}
          onChange={changePage}
          className="pt-10"
        />
      )}

      <p className="mt-10 border-t border-sand pt-6 text-sm text-ink-soft">
        Pesanan belum terlihat?{' '}
        <ButtonLink to={routes.account} variant="link" size="sm" className="h-auto p-0">
          Kembali ke ringkasan akun
        </ButtonLink>
        {'.'}
      </p>
    </div>
  );
}
