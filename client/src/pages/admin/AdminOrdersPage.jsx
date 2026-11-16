import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiSearch } from 'react-icons/fi';
import { OrderStatusBadge } from '../../components/account/OrderStatusBadge.jsx';
import { ErrorState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Spinner.jsx';
import { useAdminOrders } from '../../hooks/useAdmin.js';
import { ORDER_FILTERS } from '../../lib/orderStatus.js';
import { formatDate, formatIDR } from '../../lib/format.js';
import { routes } from '../../lib/nav.js';
import { cn } from '../../lib/cn.js';

const columns = [
  { key: 'order', label: 'Pesanan' },
  { key: 'customer', label: 'Pelanggan', className: 'hidden sm:table-cell' },
  { key: 'status', label: 'Status' },
  { key: 'total', label: 'Total', className: 'text-right' },
];

function OrderRows({ orders }) {
  return orders.map((order) => (
    <tr key={order.orderNumber} className="border-b border-sand/70 last:border-b-0">
      <td className="py-3 pr-4 align-top">
        <Link
          to={routes.adminOrder(order.orderNumber)}
          className="font-medium text-ink hover:underline underline-offset-4"
        >
          {order.orderNumber}
        </Link>
        <span className="mt-0.5 block text-spec text-ink-soft">{formatDate(order.createdAt)}</span>
      </td>

      <td className="hidden py-3 pr-4 align-top sm:table-cell">
        <span className="block truncate text-sm text-ink">{order.customer?.name ?? '—'}</span>
        <span className="block truncate text-spec text-ink-soft">{order.customer?.email ?? ''}</span>
      </td>

      <td className="py-3 pr-4 align-top">
        <OrderStatusBadge status={order.status} />
      </td>

      <td className="tabular py-3 text-right align-top text-sm text-ink">
        {formatIDR(order.total)}
      </td>
    </tr>
  ));
}

function OrderTable({ orders }) {
  return (
    <div className="mt-6 min-w-0 overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-sm sm:min-w-lg">
        <thead>
          <tr className="border-b border-sand text-left">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn('py-2 pr-4 text-spec font-normal text-ink-soft', column.className)}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <OrderRows orders={orders} />
        </tbody>
      </table>
    </div>
  );
}

/** Every customer's orders with a status filter and a search box. */
export function AdminOrdersPage() {
  const query = useAdminOrders();
  const [filter, setFilter] = useState('all');
  const [term, setTerm] = useState('');

  const orders = query.data?.data ?? [];
  const needle = term.trim().toLowerCase();

  const byStatus = filter === 'all' ? orders : orders.filter((order) => order.status === filter);
  const filtered = needle
    ? byStatus.filter((order) =>
        `${order.orderNumber} ${order.customer?.name ?? ''} ${order.customer?.email ?? ''}`
          .toLowerCase()
          .includes(needle)
      )
    : byStatus;

  const countFor = (value) =>
    value === 'all' ? orders.length : orders.filter((order) => order.status === value).length;

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="text-title text-ink">Pesanan</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Semua pesanan dari pelanggan, terbaru lebih dulu. Buka satu pesanan untuk melihat
          barangnya, memeriksa alamat kirim, dan memindahkan statusnya.
        </p>
      </header>

      {!query.isPending && !query.isError && orders.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <FiSearch
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
            />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Cari nomor atau pelanggan"
              aria-label="Cari pesanan"
              className="h-10 w-full rounded-full border border-ink/15 bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-soft/70 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden"
            />
          </div>

          <p className="text-spec text-ink-soft">
            <span className="tabular">{filtered.length}</span>
            {needle ? ` dari ${byStatus.length}` : ''} pesanan
          </p>
        </div>
      )}

      {!query.isPending && !query.isError && orders.length > 0 && (
        <div role="group" aria-label="Filter status pesanan" className="mt-4 flex flex-wrap gap-1">
          {ORDER_FILTERS.map((option) => {
            const active = filter === option.value;

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
                <span
                  className={cn(
                    'tabular text-[0.6875rem]',
                    active ? 'text-paper/70' : 'text-ink-soft/70'
                  )}
                >
                  {countFor(option.value)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {query.isPending && (
        <div className="mt-6 space-y-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-field" />
          ))}
        </div>
      )}

      {query.isError && (
        <ErrorState
          className="py-12"
          description="Daftar pesanan tidak dapat dimuat."
          onRetry={query.refetch}
        />
      )}

      {!query.isPending && !query.isError && orders.length === 0 && (
        <div className="mt-6 border-y border-sand py-12 text-center">
          <h2 className="font-display text-heading text-ink">Belum ada pesanan</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Pesanan pelanggan muncul di sini begitu checkout selesai.
          </p>
        </div>
      )}

      {!query.isPending && !query.isError && orders.length > 0 && filtered.length === 0 && (
        <div className="mt-6 border-y border-sand py-10 text-center">
          <p className="text-sm text-ink-soft">
            {needle
              ? `Tidak ada pesanan yang cocok dengan “${term.trim()}”.`
              : 'Tidak ada pesanan dengan status ini.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setTerm('');
              setFilter('all');
            }}
            className="mt-2 text-sm font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
          >
            Tampilkan semua pesanan
          </button>
        </div>
      )}

      {filtered.length > 0 && <OrderTable orders={filtered} />}
    </div>
  );
}
