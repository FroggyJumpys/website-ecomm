import { Link, useParams } from 'react-router-dom';
import { FiCheck, FiPrinter } from 'react-icons/fi';
import { OrderStatusBadge } from '../components/account/OrderStatusBadge.jsx';
import { PaymentPanel } from '../components/payment/PaymentPanel.jsx';
import { ButtonLink } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState } from '../components/ui/EmptyState.jsx';
import { PriceRow } from '../components/ui/Price.jsx';
import { Skeleton } from '../components/ui/Spinner.jsx';
import { useOrder } from '../hooks/useAccount.js';
import { formatDate, formatIDR } from '../lib/format.js';
import { routes } from '../lib/nav.js';

function CompleteSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-4 w-40 rounded-full" />
      <Skeleton className="mt-4 h-10 w-72 rounded-full" />
      <Skeleton className="mt-8 h-52 w-full rounded-card" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  );
}

function OrderItems({ order }) {
  return (
    <section aria-labelledby="barang-dipesan" className="rounded-card border border-sand bg-surface">
      <h2
        id="barang-dipesan"
        className="border-b border-sand px-5 py-4 font-display text-heading text-ink"
      >
        Yang kami siapkan
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
              <p className="text-sm font-medium text-ink">{item.name}</p>
              <p className="mt-0.5 text-spec text-ink-soft">
                {[item.color, item.size].filter(Boolean).join(', ')}
              </p>
              <p className="tabular mt-1 text-spec text-ink-soft">
                {item.quantity} × {formatIDR(item.price)}
              </p>
            </div>
            <p className="tabular text-sm font-medium text-ink">
              {formatIDR(item.price * item.quantity)}
            </p>
          </li>
        ))}
      </ul>

      <div className="space-y-2.5 border-t border-sand px-5 py-4">
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
        <div className="border-t border-ink/20 pt-2.5">
          <PriceRow label="Total" value={order.total} strong />
        </div>
      </div>
    </section>
  );
}

function ShippingAddress({ address }) {
  return (
    <section aria-labelledby="dikirim-ke" className="rounded-card border border-sand bg-surface p-5">
      <h2 id="dikirim-ke" className="font-display text-heading text-ink">
        Dikirim ke
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
      </div>
    </section>
  );
}

export function OrderCompletePage() {
  const { orderNumber } = useParams();
  const query = useOrder(orderNumber);

  if (query.isPending) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <CompleteSkeleton />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        {query.error?.status === 404 ? (
          <EmptyState
            title="Pesanan ini tidak ditemukan"
            description="Nomor pesanan mungkin salah ketik, atau pesanan dibuat dengan akun lain."
            action={{ label: 'Lihat riwayat pesanan', to: routes.orders }}
            className="py-20"
          />
        ) : (
          <ErrorState
            description="Konfirmasi pesanan tidak dapat dimuat."
            onRetry={query.refetch}
            className="py-20"
          />
        )}
      </div>
    );
  }

  const order = query.data.data;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="mt-1 grid size-9 shrink-0 place-items-center rounded-full bg-ink text-paper"
        >
          <FiCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-spec text-ink-soft">Pesanan diterima</p>
          <h1 className="mt-1 text-title text-ink">Terima kasih, pesananmu sudah masuk.</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            Kami siapkan barangnya di workshop Banjarmasin. Simpan nomor pesanan ini untuk
            menanyakan status lewat WhatsApp.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-ink/15 py-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="font-display text-2xl font-semibold tracking-tight text-ink">
            {order.orderNumber}
          </p>
          <p className="text-spec text-ink-soft">Dibuat {formatDate(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10">
        <div className="space-y-8">
          <OrderItems order={order} />

          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink to={routes.accountOrder(order.orderNumber)} size="md">
              Lihat detail pesanan
            </ButtonLink>
            <ButtonLink to={routes.shop} variant="outline" size="md">
              Lanjut belanja
            </ButtonLink>
            <span className="inline-flex items-center gap-1.5 text-spec text-ink-soft">
              <FiPrinter className="size-3.5" aria-hidden="true" />
              Halaman ini bisa dicetak sebagai bukti pesanan.
            </span>
          </div>
        </div>

        <aside className="space-y-6">
          <PaymentPanel order={order} onUpdated={query.refetch} />
          <ShippingAddress address={order.shippingAddress} />

          <p className="text-sm text-ink-soft">
            Ada yang perlu diubah?{' '}
            <Link
              to={routes.orders}
              className="font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
            >
              Buka riwayat pesanan
            </Link>{' '}
            atau hubungi tim BaDekor di{' '}
            <a
              href="https://wa.me/6281100000000"
              className="font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
            >
              WhatsApp
            </a>
            .
          </p>
        </aside>
      </div>
    </div>
  );
}
