import { Link } from 'react-router-dom';
import { AccountPageHeader } from '../components/account/AccountPageHeader.jsx';
import { OrderRow } from '../components/account/OrderRow.jsx';
import { ErrorState } from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Spinner.jsx';
import { useAuth } from '../context/authContext.js';
import { useAddresses, useOrders } from '../hooks/useAccount.js';
import { routes } from '../lib/nav.js';

function LatestOrder({ query }) {
  if (query.isPending) {
    return (
      <div className="space-y-3 pt-5" aria-busy="true">
        <Skeleton className="h-4 w-40 rounded-full" />
        <Skeleton className="h-16 w-full rounded-card" />
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

  const latest = query.data?.data?.[0];

  if (!latest) {
    return (
      <p className="py-6 text-sm text-ink-soft">
        Belum ada pesanan.{' '}
        <Link
          to={routes.shop}
          className="font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
        >
          Mulai belanja koleksi
        </Link>
        {'.'}
      </p>
    );
  }

  return <OrderRow order={latest} />;
}

function PrimaryAddress({ query }) {
  if (query.isPending) {
    return (
      <div className="mt-4 space-y-2" aria-busy="true">
        <Skeleton className="h-4 w-32 rounded-full" />
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-3 w-2/3 rounded-full" />
      </div>
    );
  }

  if (query.isError) {
    return <p className="mt-4 text-sm text-ink-soft">Alamat tidak dapat dimuat.</p>;
  }

  const addresses = query.data?.data ?? [];
  const address = addresses.find((item) => item.isDefault) ?? addresses[0];

  if (!address) {
    return (
      <p className="mt-4 text-sm text-ink-soft">
        Belum ada alamat tersimpan.{' '}
        <Link
          to={routes.addresses}
          className="font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
        >
          Tambahkan alamat
        </Link>{' '}
        agar pengiriman berikutnya lebih cepat.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-1 text-sm">
      <p className="font-medium text-ink">{address.recipient}</p>
      <p className="text-ink-soft">{address.phone}</p>
      <p className="text-ink-soft">{address.street}</p>
      <p className="text-ink-soft">
        {address.district}, {address.city}
      </p>
      <p className="text-ink-soft">
        {address.province} {address.postalCode}
      </p>
    </div>
  );
}

export function AccountPage() {
  const { user } = useAuth();
  const ordersQuery = useOrders();
  const addressesQuery = useAddresses();

  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || 'kak';

  return (
    <div>
      <AccountPageHeader
        title={`Halo, ${firstName}.`}
        description="Pesanan, alamat, dan data akunmu ada di satu tempat. Bagian mana yang ingin kamu ubah hari ini?"
      />

      <section aria-labelledby="pesanan-terakhir" className="mt-10 border-t border-sand pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="pesanan-terakhir" className="font-display text-heading text-ink">
            Pesanan terakhir
          </h2>
          <Link
            to={routes.orders}
            className="text-sm font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
          >
            Semua pesanan
          </Link>
        </div>
        <LatestOrder query={ordersQuery} />
      </section>

      <div className="mt-10 grid gap-8 border-t border-sand pt-6 sm:grid-cols-2 sm:gap-12">
        <section aria-labelledby="data-akun">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="data-akun" className="font-display text-heading text-ink">
              Data akun
            </h2>
            <Link
              to={routes.profile}
              className="text-sm font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
            >
              Ubah profil
            </Link>
          </div>

          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-spec text-ink-soft">Nama</dt>
              <dd className="text-ink">{user?.name}</dd>
            </div>
            <div>
              <dt className="text-spec text-ink-soft">Email</dt>
              <dd className="wrap-break-word text-ink">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-spec text-ink-soft">WhatsApp</dt>
              <dd className="tabular text-ink">{user?.phone}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="alamat-utama">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="alamat-utama" className="font-display text-heading text-ink">
              Alamat utama
            </h2>
            <Link
              to={routes.addresses}
              className="text-sm font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
            >
              Kelola alamat
            </Link>
          </div>
          <PrimaryAddress query={addressesQuery} />
        </section>
      </div>

      <p className="mt-10 border-t border-sand pt-6 text-sm text-ink-soft">
        Butuh bantuan soal pesanan atau ukuran?{' '}
        <a
          href="https://wa.me/6281100000000"
          className="font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
        >
          Chat tim BaDekor di WhatsApp
        </a>
        {'.'}
      </p>
    </div>
  );
}
