import { Link } from 'react-router-dom';
import { FiArrowRight, FiShield, FiTruck } from 'react-icons/fi';
import { Breadcrumbs } from '../components/ui/Breadcrumbs.jsx';
import { ButtonLink } from '../components/ui/Button.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { CartLine } from '../components/cart/CartLine.jsx';
import { OrderTotals } from '../components/cart/OrderTotals.jsx';
import { useAuth } from '../context/authContext.js';
import { useCart } from '../context/cartContext.js';
import { routes } from '../lib/nav.js';

export function CartPage() {
  const { items, count, subtotal, updateQuantity, removeItem } = useCart();
  const { isAuthenticated } = useAuth();

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
      <Breadcrumbs items={[{ label: 'Beranda', to: routes.home }, { label: 'Keranjang' }]} />

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-sand pb-6">
        <div className="max-w-xl">
          <h1 className="text-title text-ink">Keranjang</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Periksa ukuran dan warna sebelum membayar. Ongkos kirim dihitung di langkah
            berikutnya, karena sofa dan lemari tidak bisa memakai tarif paket biasa.
          </p>
          {items.length > 0 && (
            <p className="mt-3 text-spec text-ink-soft">
              <span className="tabular">{count}</span> barang dari{' '}
              <span className="tabular">{items.length}</span> produk
            </p>
          )}
        </div>

        <ButtonLink to={routes.shop} variant="outline" size="sm">
          Lanjut belanja
        </ButtonLink>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Keranjangmu masih kosong"
          description="Simpan produk favorit atau mulai dari koleksi ulin dan rotan yang siap dikirim dari Banjarmasin."
          action={{ label: 'Lihat koleksi', to: routes.shop }}
          className="py-20"
        />
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-14">
          <section aria-label="Barang di keranjang">
            {items.map((item) => (
              <CartLine
                key={item.key}
                item={item}
                onQuantityChange={updateQuantity}
                onRemove={() => removeItem(item.key)}
              />
            ))}

            <p className="border-t border-sand pt-5 text-spec text-ink-soft">
              Stok dicek ulang saat pesanan dibuat. Bila ada perubahan, kami menghubungi kamu
              sebelum pengiriman.
            </p>
          </section>

          <aside className="lg:sticky lg:top-36">
            <div className="rounded-card border border-sand bg-surface p-5 sm:p-6">
              <h2 className="font-display text-heading text-ink">Ringkasan</h2>
              <OrderTotals subtotal={subtotal} className="mt-4" />

              <ButtonLink to={routes.checkout} size="lg" fullWidth className="mt-5">
                Lanjut ke pembayaran
                <FiArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>

              {!isAuthenticated && (
                <p className="mt-3 text-spec text-ink-soft">
                  Kamu akan diminta masuk sebelum pesanan dibuat, supaya pesanan tersimpan di
                  akunmu.
                </p>
              )}

              <ul className="mt-5 space-y-2.5 border-t border-sand pt-4 text-spec text-ink-soft">
                <li className="flex items-start gap-2.5">
                  <FiTruck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Dikirim dari Banjarmasin. Kargo mebel tersedia untuk sofa dan lemari.
                </li>
                <li className="flex items-start gap-2.5">
                  <FiShield className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Garansi rangka ulin lima tahun untuk setiap unit.
                </li>
              </ul>
            </div>

            <p className="mt-4 px-1 text-spec text-ink-soft">
              Butuh bantuan ukuran?{' '}
              <Link
                to={routes.shop}
                className="font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
              >
                Lihat panduan ukuran di halaman produk
              </Link>
              .
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
