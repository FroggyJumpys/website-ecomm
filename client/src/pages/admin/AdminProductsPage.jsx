import { Link, useSearchParams } from 'react-router-dom';
import { ProductsPanel } from '../../components/admin/ProductsPanel.jsx';
import { TaxonomyPanel } from '../../components/admin/TaxonomyPanel.jsx';
import { useAdminTaxonomy } from '../../hooks/useAdmin.js';
import { routes } from '../../lib/nav.js';
import { cn } from '../../lib/cn.js';

const TABS = [
  { value: 'produk', label: 'Produk' },
  { value: 'kategori', label: 'Kategori' },
  { value: 'merek', label: 'Merek' },
];

/**
 * Catalogue management. The active tab lives in the URL so a reviewer can link
 * straight to it and the browser back button works; each panel owns its own
 * drawer and delete confirmation.
 */
export function AdminProductsPage() {
  const [params] = useSearchParams();
  const requested = params.get('tab');
  const tab = TABS.some((item) => item.value === requested) ? requested : 'produk';

  const taxonomyQuery = useAdminTaxonomy();

  const categories = taxonomyQuery.data?.data?.categories ?? [];
  const brands = taxonomyQuery.data?.data?.brands ?? [];

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="text-title text-ink">Katalog</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Produk yang kamu simpan di sini langsung tampil di toko. Stok, harga, dan kategori memakai
          data yang sama dengan halaman koleksi.
        </p>
      </header>

      <nav aria-label="Bagian katalog" className="mt-6">
        <ul className="flex flex-wrap gap-1">
          {TABS.map((item) => {
            const active = tab === item.value;
            const to =
              item.value === 'produk'
                ? routes.adminProducts
                : `${routes.adminProducts}?tab=${item.value}`;

            return (
              <li key={item.value}>
                <Link
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center rounded-full px-3.5 py-2 text-sm transition',
                    active ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5 hover:text-ink'
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === 'produk' && <ProductsPanel categories={categories} brands={brands} />}
      {tab === 'kategori' && <TaxonomyPanel kind="category" query={taxonomyQuery} />}
      {tab === 'merek' && <TaxonomyPanel kind="brand" query={taxonomyQuery} />}
    </div>
  );
}
