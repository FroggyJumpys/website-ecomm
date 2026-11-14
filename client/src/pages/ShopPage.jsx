import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiSliders } from 'react-icons/fi';
import { Breadcrumbs } from '../components/ui/Breadcrumbs.jsx';
import { Drawer } from '../components/ui/Drawer.jsx';
import { EmptyState, ErrorState } from '../components/ui/EmptyState.jsx';
import { Pagination } from '../components/ui/Pagination.jsx';
import { ProductCard, ProductCardSkeleton } from '../components/product/ProductCard.jsx';
import { ProductRow } from '../components/product/ProductRow.jsx';
import { FilterPanel, FilterPanelSkeleton } from '../components/shop/FilterPanel.jsx';
import { ActiveFilters } from '../components/shop/ActiveFilters.jsx';
import { ViewToggle } from '../components/shop/ViewToggle.jsx';
import { useBrands, useCategories, useFilterOptions, useProducts } from '../hooks/useCatalog.js';
import { routes } from '../lib/nav.js';
import {
  DEFAULT_SORT,
  PAGE_SIZE,
  VIEW,
  countActiveFilters,
  readFilters,
  toApiParams,
  writeFilters,
} from '../lib/shopParams.js';

const sortFallback = [{ value: DEFAULT_SORT, label: 'Terbaru' }];

function ResultsGrid({ query, view }) {
  if (query.isPending) {
    return view === VIEW.list ? (
      <div className="divide-y divide-sand border-y border-sand">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex gap-4 py-6 sm:gap-6">
            <div className="aspect-square w-28 shrink-0 animate-pulse rounded-card bg-sand/70 sm:w-48" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-sand/70" />
              <div className="h-3 w-1/3 animate-pulse rounded-full bg-sand/60" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-sand/60" />
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3">
        {Array.from({ length: PAGE_SIZE }).map((_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return <ErrorState description="Katalog tidak dapat dimuat." onRetry={query.refetch} />;
  }

  const items = query.data.data;

  if (items.length === 0) {
    return (
      <EmptyState
        title="Tidak ada produk yang cocok"
        description="Coba longgarkan filter, atau telusuri seluruh koleksi."
        action={{ label: 'Lihat semua produk', to: routes.shop }}
      />
    );
  }

  if (view === VIEW.list) {
    return (
      <div className="divide-y divide-sand border-y border-sand">
        {items.map((product) => (
          <div key={product.id} className="py-6">
            <ProductRow product={product} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3">
      {items.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

export function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);

  const filters = readFilters(searchParams);
  const productsQuery = useProducts(toApiParams(filters));

  const categoriesQuery = useCategories();
  const brandsQuery = useBrands();
  const filterOptionsQuery = useFilterOptions();

  const categories = categoriesQuery.data?.data ?? [];
  const brands = brandsQuery.data?.data ?? [];
  const facetOptions = filterOptionsQuery.data?.data;
  const optionsReady = Boolean(
    categoriesQuery.data && brandsQuery.data && filterOptionsQuery.data
  );

  const options = {
    categories,
    brands,
    priceRange: facetOptions?.priceRange ?? { min: 0, max: 0 },
    colors: facetOptions?.colors ?? [],
    sizes: facetOptions?.sizes ?? [],
  };

  const activeCount = countActiveFilters(filters);
  const total = productsQuery.data?.meta.total ?? 0;
  const totalPages = productsQuery.data?.meta.totalPages ?? 1;

  /** Any facet change is a new result set, so the page resets to 1. */
  const applyPatch = (patch) => {
    setSearchParams(writeFilters(filters, { ...patch, page: 1 }));
  };

  const clearAll = () => {
    setSearchParams(writeFilters({ sort: filters.sort, view: filters.view }, {}));
  };

  const changePage = (page) => {
    setSearchParams(writeFilters(filters, { page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeCategory = categories.find((item) => item.slug === filters.category);

  const title = filters.search
    ? `Hasil untuk “${filters.search}”`
    : (activeCategory?.name ?? 'Semua mebel');

  const description = filters.search
    ? 'Menampilkan produk yang namanya, bahannya, atau deskripsinya memuat kata kunci tersebut.'
    : (activeCategory?.description ??
      'Koleksi ulin dan rotan yang dibuat di workshop Banjarmasin, dikirim ke seluruh Indonesia.');

  const sortOptions = facetOptions?.sortOptions ?? sortFallback;

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
      <Breadcrumbs
        items={[
          { label: 'Beranda', to: routes.home },
          { label: activeCategory?.name ?? (filters.search ? 'Hasil pencarian' : 'Koleksi') },
        ]}
      />

      <header className="mt-5 max-w-2xl">
        <h1 className="text-title text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{description}</p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[248px_1fr] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="lg:sticky lg:top-36 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:pr-1">
            {optionsReady ? (
              <FilterPanel
                idPrefix="rail"
                filters={filters}
                options={options}
                onPatch={applyPatch}
                onClearAll={clearAll}
              />
            ) : (
              <FilterPanelSkeleton />
            )}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand pb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                aria-label="Buka filter"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-ink/15 px-3.5 text-[0.8125rem] font-medium text-ink transition hover:border-ink/40 lg:hidden"
              >
                <FiSliders className="size-4" aria-hidden="true" />
                Filter
                {activeCount > 0 && (
                  <span className="tabular grid size-5 place-items-center rounded-full bg-ink text-[0.6875rem] text-paper">
                    {activeCount}
                  </span>
                )}
              </button>

              <p className="tabular text-spec text-ink-soft">
                {productsQuery.isPending ? 'Memuat produk…' : `${total} produk`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="urutkan" className="sr-only">
                Urutkan produk
              </label>
              <select
                id="urutkan"
                value={filters.sort}
                onChange={(event) => applyPatch({ sort: event.target.value })}
                className="h-9 rounded-full border border-ink/15 bg-surface pl-3.5 pr-8 text-[0.8125rem] text-ink focus:border-primary focus:ring-2 focus:ring-primary/25 focus:outline-hidden"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <ViewToggle value={filters.view} onChange={(view) => applyPatch({ view })} />
            </div>
          </div>

          {activeCount > 0 && (
            <div className="pt-4">
              <ActiveFilters
                filters={filters}
                options={options}
                onPatch={applyPatch}
                onClearAll={clearAll}
              />
            </div>
          )}

          <div className="pt-6">
            <ResultsGrid query={productsQuery} view={filters.view} />
          </div>

          <Pagination
            page={filters.page}
            totalPages={totalPages}
            onChange={changePage}
            className="pt-12"
          />
        </div>
      </div>

      <Drawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter"
        side="left"
        footer={
          <button
            type="button"
            onClick={() => setFilterOpen(false)}
            className="h-11 w-full rounded-full bg-ink text-sm font-medium text-paper transition hover:bg-ulin"
          >
            Tampilkan {productsQuery.isPending ? 'produk' : `${total} produk`}
          </button>
        }
      >
        {optionsReady ? (
          <FilterPanel
            idPrefix="drawer"
            showTitle={false}
            filters={filters}
            options={options}
            onPatch={applyPatch}
            onClearAll={clearAll}
          />
        ) : (
          <FilterPanelSkeleton />
        )}
      </Drawer>
    </div>
  );
}
