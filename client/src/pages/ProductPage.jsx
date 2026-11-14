import { Link, useParams } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import { Breadcrumbs } from '../components/ui/Breadcrumbs.jsx';
import { ButtonLink } from '../components/ui/Button.jsx';
import { ErrorState } from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Spinner.jsx';
import { ProductCard, ProductCardSkeleton } from '../components/product/ProductCard.jsx';
import { ProductGallery } from '../components/product/ProductGallery.jsx';
import { ProductPurchase } from '../components/product/ProductPurchase.jsx';
import { ProductTabs } from '../components/product/ProductTabs.jsx';
import { useProduct, useRelatedProducts } from '../hooks/useCatalog.js';
import { routes } from '../lib/nav.js';

function ProductPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
      <Skeleton className="h-3 w-56 rounded-full" />
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
        <Skeleton className="aspect-7/5 rounded-card" />
        <div className="space-y-3">
          <Skeleton className="h-3 w-28 rounded-full" />
          <Skeleton className="h-9 w-3/4 rounded-full" />
          <Skeleton className="h-4 w-40 rounded-full" />
          <Skeleton className="h-7 w-32 rounded-full" />
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-11 w-56 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function ProductNotFound() {
  return (
    <div className="mx-auto max-w-xl px-5 py-20 text-center sm:px-8">
      <p className="text-spec text-ink-soft">Produk tidak ditemukan</p>
      <h1 className="mt-2 text-title text-ink">Produk ini tidak ada di katalog kami</h1>
      <p className="mt-3 text-ink-soft">
        Mungkin tautannya salah, atau produknya sudah diganti model baru.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink to={routes.shop}>Lihat koleksi</ButtonLink>
        <ButtonLink to={routes.home} variant="outline">
          Kembali ke beranda
        </ButtonLink>
      </div>
    </div>
  );
}

function RelatedProducts({ query, currentId, category }) {
  if (query.isPending) {
    return (
      <section className="mt-16 border-t border-sand pt-12">
        <Skeleton className="h-7 w-48 rounded-full" />
        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      </section>
    );
  }

  if (query.isError) return null;

  const items = (query.data?.data ?? []).filter((item) => item.id !== currentId);
  if (items.length === 0) return null;

  return (
    <section className="mt-16 border-t border-sand pt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-spec text-ink-soft">Masih dengan bahan yang sama</p>
          <h2 className="mt-1 text-title text-ink">Produk terkait</h2>
        </div>
        <Link
          to={category ? `${routes.shop}?kategori=${category.slug}` : routes.shop}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink transition hover:text-primary-deep"
        >
          Lihat semua
          <FiArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-4">
        {items.map((item) => (
          <ProductCard key={item.id} product={item} />
        ))}
      </div>
    </section>
  );
}

export function ProductPage() {
  const { slug } = useParams();
  const productQuery = useProduct(slug);
  const relatedQuery = useRelatedProducts(slug, 4);

  if (productQuery.isPending) {
    return <ProductPageSkeleton />;
  }

  if (productQuery.isError) {
    if (productQuery.error?.status === 404) {
      return <ProductNotFound />;
    }

    return (
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <ErrorState description="Detail produk tidak dapat dimuat." onRetry={productQuery.refetch} />
      </div>
    );
  }

  const product = productQuery.data.data;

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
      <Breadcrumbs
        items={[
          { label: 'Beranda', to: routes.home },
          product.category
            ? {
                label: product.category.name,
                to: `${routes.shop}?kategori=${product.category.slug}`,
              }
            : { label: 'Koleksi', to: routes.shop },
          { label: product.name },
        ]}
      />

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
        <ProductGallery key={product.id} images={product.images} alt={product.name} />
        <ProductPurchase key={product.id} product={product} />
      </div>

      <ProductTabs product={product} className="mt-16" />

      <RelatedProducts
        query={relatedQuery}
        currentId={product.id}
        category={product.category}
      />
    </div>
  );
}
