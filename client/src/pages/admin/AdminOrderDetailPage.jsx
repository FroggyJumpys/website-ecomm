import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import { OrderStatusForm } from '../../components/admin/OrderStatusForm.jsx';
import { OrderStatusBadge } from '../../components/account/OrderStatusBadge.jsx';
import { OrderTimeline } from '../../components/account/OrderTimeline.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { ErrorState } from '../../components/ui/EmptyState.jsx';
import { PriceRow } from '../../components/ui/Price.jsx';
import { Skeleton } from '../../components/ui/Spinner.jsx';
import { useAdminOrder, useUpdateOrderStatus } from '../../hooks/useAdmin.js';
import { formatDate, formatIDR } from '../../lib/format.js';
import { statusMeta } from '../../lib/orderStatus.js';
import { routes } from '../../lib/nav.js';

function whatsappHref(phone) {
  const digits = String(phone ?? '').replace(/[^0-9]/g, '');
  if (!digits) return null;

  // Mock data stores the local 08… form; wa.me needs the 62 country code.
  return `https://wa.me/${digits.startsWith('0') ? `62${digits.slice(1)}` : digits}`;
}

function DetailSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-3 w-44 rounded-full" />
      <Skeleton className="mt-6 h-9 w-56 rounded-full" />
      <Skeleton className="mt-8 h-40 w-full rounded-card" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  );
}

function OrderNotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="text-spec text-ink-soft">Pesanan tidak ditemukan</p>
      <h1 className="mt-2 text-title text-ink">Pesanan ini tidak ada</h1>
      <p className="mt-3 text-ink-soft">
        Nomor pesanan mungkin sudah berubah atau belum pernah dibuat. Periksa daftar pesanan untuk
        melihat semua yang masuk.
      </p>
      <ButtonLink to={routes.adminOrders} className="mt-8">
        Kembali ke daftar pesanan
      </ButtonLink>
    </div>
  );
}

function OrderItems({ order }) {
  return (
    <section aria-labelledby="barang-pesanan" className="rounded-card border border-sand bg-surface">
      <h2
        id="barang-pesanan"
        className="border-b border-sand px-5 py-4 font-display text-heading text-ink"
      >
        Barang pesanan
      </h2>
      <ul className="divide-y divide-sand">
        {order.items.map((item) => (
          <li key={`${item.productId}-${item.color}-${item.size}`} className="flex gap-4 px-5 py-4">
            <img
              src={item.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-16 shrink-0 rounded-field bg-sand object-cover"
            />
            <div className="min-w-0 flex-1">
              <Link
                to={routes.product(item.slug)}
                className="text-sm font-medium text-ink hover:underline underline-offset-4"
              >
                {item.name}
              </Link>
              <p className="mt-0.5 text-spec text-ink-soft">
                {[item.color, item.size].filter(Boolean).join(', ')}
              </p>
              <p className="mt-1 tabular text-spec text-ink-soft">
                {item.quantity} × {formatIDR(item.price)}
              </p>
            </div>
            <p className="tabular text-sm font-medium text-ink">
              {formatIDR(item.price * item.quantity)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Customer({ order }) {
  const customer = order.customer;
  const wa = whatsappHref(customer?.phone);

  return (
    <section
      aria-labelledby="pelanggan"
      className="rounded-card border border-sand bg-surface p-5"
    >
      <h2 id="pelanggan" className="font-display text-heading text-ink">
        Pelanggan
      </h2>

      {customer ? (
        <div className="mt-3 space-y-1 text-sm">
          <p className="font-medium text-ink">{customer.name}</p>
          <p className="text-ink-soft">{customer.email}</p>
          {customer.phone && (
            <p className="tabular text-ink-soft">
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-ink hover:underline underline-offset-4"
                >
                  {customer.phone}
                </a>
              ) : (
                customer.phone
              )}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">Data pelanggan tidak tersedia.</p>
      )}
    </section>
  );
}

function ShippingAddress({ address }) {
  return (
    <section
      aria-labelledby="alamat-pengiriman"
      className="rounded-card border border-sand bg-surface p-5"
    >
      <h2 id="alamat-pengiriman" className="font-display text-heading text-ink">
        Alamat pengiriman
      </h2>
      <div className="mt-3 space-y-1 text-sm">
        <p className="font-medium text-ink">{address.recipient}</p>
        <p className="tabular text-ink-soft">{address.phone}</p>
        <p className="text-ink-soft">{address.street}</p>
        <p className="text-ink-soft">
          {address.district}, {address.city}
        </p>
        <p className="text-ink-soft">
          {address.province} {address.postalCode}
        </p>
        {address.notes && (
          <p className="pt-1 text-spec text-ink-soft/80">Catatan: {address.notes}</p>
        )}
      </div>
    </section>
  );
}

function PaymentSummary({ order }) {
  return (
    <section
      aria-labelledby="rincian-pembayaran"
      className="rounded-card border border-sand bg-surface p-5"
    >
      <h2 id="rincian-pembayaran" className="font-display text-heading text-ink">
        Rincian pembayaran
      </h2>

      <div className="mt-4 space-y-2.5">
        <PriceRow label="Subtotal" value={order.subtotal} />
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span className="text-ink-soft">Ongkos kirim</span>
          <span className="tabular text-ink">
            {order.shippingCost === 0 ? 'Gratis' : formatIDR(order.shippingCost)}
          </span>
        </div>
        {order.discount > 0 && (
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-ink-soft">Diskon</span>
            <span className="tabular text-success">-{formatIDR(order.discount)}</span>
          </div>
        )}
        <div className="border-t border-sand pt-2.5">
          <PriceRow label="Total" value={order.total} strong />
        </div>
      </div>

      <div className="mt-4 space-y-1 border-t border-sand pt-4 text-spec text-ink-soft">
        <p>
          Metode pembayaran: <span className="text-ink">{order.paymentMethod}</span>
        </p>
        {order.trackingNumber && (
          <p>
            Nomor resi: <span className="tabular text-ink">{order.trackingNumber}</span>
          </p>
        )}
      </div>
    </section>
  );
}

export function AdminOrderDetailPage() {
  const { orderNumber } = useParams();
  const query = useAdminOrder(orderNumber);
  const updateStatus = useUpdateOrderStatus();
  const [savedStatus, setSavedStatus] = useState('');

  if (query.isPending) {
    return <DetailSkeleton />;
  }

  if (query.isError) {
    if (query.error?.status === 404) {
      return <OrderNotFound />;
    }

    return (
      <ErrorState
        description="Detail pesanan tidak dapat dimuat."
        onRetry={query.refetch}
        className="py-12"
      />
    );
  }

  const order = query.data.data;
  const cancelledEvent = order.timeline?.find((entry) => entry.status === 'cancelled');

  const handleStatusSubmit = async (status) => {
    await updateStatus.mutateAsync({ orderNumber: order.orderNumber, status });
    setSavedStatus(status);
  };

  return (
    <div>
      <Link
        to={routes.adminOrders}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        <FiArrowLeft className="size-4" aria-hidden="true" />
        Kembali ke daftar pesanan
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-sand pb-6">
        <div>
          <h1 className="text-title text-ink">{order.orderNumber}</h1>
          <p className="mt-1.5 text-sm text-ink-soft">Dibuat {formatDate(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      {order.status === 'cancelled' && (
        <div role="status" className="mt-6 rounded-card border border-danger/25 bg-danger/5 p-5">
          <p className="font-display text-heading text-danger">Pesanan dibatalkan</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{order.cancellationReason}</p>
          {cancelledEvent && (
            <p className="mt-2 text-spec text-ink-soft">
              Dibatalkan pada {formatDate(cancelledEvent.at)}
            </p>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10">
        <div className="min-w-0 space-y-8">
          <section
            aria-labelledby="ubah-status"
            className="rounded-card border border-sand bg-surface p-5"
          >
            <h2 id="ubah-status" className="font-display text-heading text-ink">
              Ubah status
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Status baru langsung terlihat oleh pelanggan di riwayat pesanannya.
            </p>

            <div className="mt-4">
              <OrderStatusForm
                order={order}
                submitting={updateStatus.isPending}
                onSubmit={handleStatusSubmit}
              />
            </div>

            {savedStatus && !updateStatus.isPending && (
              <p role="status" className="mt-3 text-sm text-success">
                Status diperbarui menjadi {statusMeta(savedStatus).label.toLowerCase()}.
              </p>
            )}
          </section>

          {order.status !== 'cancelled' && <OrderTimeline order={order} />}

          <OrderItems order={order} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-36">
          <Customer order={order} />
          <ShippingAddress address={order.shippingAddress} />
          <PaymentSummary order={order} />
        </aside>
      </div>
    </div>
  );
}
