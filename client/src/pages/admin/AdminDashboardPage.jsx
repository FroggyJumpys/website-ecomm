import { Link } from 'react-router-dom';
import { OrderStatusBadge } from '../../components/account/OrderStatusBadge.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { ErrorState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Spinner.jsx';
import { useAdminOrders, useAdminProducts } from '../../hooks/useAdmin.js';
import { formatDate, formatIDR } from '../../lib/format.js';
import { routes } from '../../lib/nav.js';
import { LOW_STOCK_THRESHOLD, stockStatus } from '../../lib/stock.js';
import { cn } from '../../lib/cn.js';

function Figures({ orders, counts, products, loading }) {
  const processing = counts?.processing ?? 0;
  const shipped = counts?.shipped ?? 0;
  const revenue = orders
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + order.total, 0);
  const lowStock = products.filter((product) => stockStatus(product.stock) !== 'ok').length;

  const figures = [
    { label: 'Pesanan diproses', value: processing },
    { label: 'Dalam pengiriman', value: shipped },
    { label: 'Pendapatan', value: formatIDR(revenue) },
    { label: 'Stok menipis', value: lowStock },
  ];

  return (
    <section
      aria-label="Angka toko"
      className="mt-8 grid grid-cols-2 gap-y-6 border-y border-sand py-6 sm:grid-cols-4 sm:gap-y-0 sm:divide-x sm:divide-sand"
    >
      {figures.map((figure, index) => (
        <div
          key={figure.label}
          className={cn('min-w-0 sm:px-5', index === 0 && 'sm:pl-0', index === 3 && 'sm:pr-0')}
        >
          <p className="text-spec text-ink-soft">{figure.label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-24 rounded-full" />
          ) : (
            <p className="tabular mt-1 truncate font-display text-xl font-semibold text-ink sm:text-2xl">
              {figure.value}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

function RecentOrders({ query }) {
  if (query.isPending) {
    return (
      <div className="mt-4 space-y-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-field" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        className="py-10"
        description="Pesanan tidak dapat dimuat."
        onRetry={query.refetch}
      />
    );
  }

  const orders = query.data?.data ?? [];

  if (orders.length === 0) {
    return (
      <p className="mt-4 border-y border-sand py-6 text-sm text-ink-soft">
        Belum ada pesanan masuk. Pesanan baru muncul di sini begitu pelanggan menyelesaikan
        pembayaran.
      </p>
    );
  }

  return (
    <div className="mt-4 min-w-0 overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-sm sm:min-w-[34rem]">
        <thead>
          <tr className="border-b border-sand text-left">
            <th scope="col" className="py-2 pr-4 text-spec font-normal text-ink-soft">
              Pesanan
            </th>
            <th
              scope="col"
              className="hidden py-2 pr-4 text-spec font-normal text-ink-soft sm:table-cell"
            >
              Pelanggan
            </th>
            <th scope="col" className="py-2 pr-4 text-spec font-normal text-ink-soft">
              Status
            </th>
            <th scope="col" className="py-2 text-right text-spec font-normal text-ink-soft">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.slice(0, 5).map((order) => (
            <tr key={order.orderNumber} className="border-b border-sand/70 last:border-b-0">
              <td className="py-3 pr-4 align-top">
                <Link
                  to={routes.adminOrder(order.orderNumber)}
                  className="font-medium text-ink hover:underline underline-offset-4"
                >
                  {order.orderNumber}
                </Link>
                <span className="mt-0.5 block text-spec text-ink-soft">
                  {formatDate(order.createdAt)}
                </span>
              </td>
              <td className="hidden py-3 pr-4 align-top text-ink-soft sm:table-cell">
                {order.customer.name}
              </td>
              <td className="py-3 pr-4 align-top">
                <OrderStatusBadge status={order.status} />
              </td>
              <td className="tabular py-3 text-right align-top text-ink">
                {formatIDR(order.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LowStock({ query }) {
  if (query.isPending) {
    return (
      <div className="mt-4 space-y-3" aria-busy="true">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full rounded-field" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return <p className="mt-4 text-sm text-ink-soft">Stok produk tidak dapat dimuat.</p>;
  }

  const products = (query.data?.data ?? [])
    .filter((product) => stockStatus(product.stock) !== 'ok')
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 5);

  if (products.length === 0) {
    return (
      <p className="mt-4 border-y border-sand py-6 text-sm text-ink-soft">
        Semua produk masih di atas {LOW_STOCK_THRESHOLD} unit. Tidak ada yang perlu diisi ulang.
      </p>
    );
  }

  return (
    <ul className="mt-4 divide-y divide-sand border-y border-sand">
      {products.map((product) => {
        const status = stockStatus(product.stock);

        return (
          <li key={product.id} className="flex items-center justify-between gap-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-sm text-ink">{product.name}</span>
              <span className="block text-spec text-ink-soft">
                {product.category?.name ?? 'Tanpa kategori'}
              </span>
            </span>
            <Badge tone={status === 'out' ? 'danger' : 'warning'}>
              {status === 'out' ? 'Habis' : `${product.stock} unit`}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminDashboardPage() {
  const ordersQuery = useAdminOrders({ limit: 100 });
  const productsQuery = useAdminProducts({ limit: 100 });

  const orders = ordersQuery.data?.data ?? [];
  const products = productsQuery.data?.data ?? [];
  const loading = ordersQuery.isPending || productsQuery.isPending;

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="text-title text-ink">Ringkasan</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Keadaan workshop hari ini: pesanan yang menunggu dikerjakan, pengiriman yang berjalan, dan
          stok yang perlu ditambah sebelum menerima pesanan baru.
        </p>
      </header>

      <Figures
        orders={orders}
        counts={ordersQuery.data?.meta?.statusCounts}
        products={products}
        loading={loading}
      />

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-14">
        <section aria-labelledby="pesanan-terbaru" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="pesanan-terbaru" className="font-display text-heading text-ink">
              Pesanan terbaru
            </h2>
            <Link
              to={routes.adminOrders}
              className="text-sm font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
            >
              Semua pesanan
            </Link>
          </div>
          <RecentOrders query={ordersQuery} />
        </section>

        <section aria-labelledby="perlu-perhatian" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="perlu-perhatian" className="font-display text-heading text-ink">
              Stok menipis
            </h2>
            <Link
              to={routes.adminProducts}
              className="text-sm font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
            >
              Kelola produk
            </Link>
          </div>
          <LowStock query={productsQuery} />
        </section>
      </div>
    </div>
  );
}
