import { Link } from 'react-router-dom';
import { FiArrowRight, FiHeadphones, FiShield, FiTruck } from 'react-icons/fi';
import { ButtonLink } from '../components/ui/Button.jsx';
import { SectionHeading } from '../components/ui/SectionHeading.jsx';
import { Skeleton } from '../components/ui/Spinner.jsx';
import { ErrorState } from '../components/ui/EmptyState.jsx';
import { ProductCard, ProductCardSkeleton } from '../components/product/ProductCard.jsx';
import { useProducts, useCategories } from '../hooks/useCatalog.js';
import { routes } from '../lib/nav.js';

const trustPoints = [
  {
    icon: FiTruck,
    title: 'Antar sampai rumah',
    description: 'Ke seluruh Indonesia, termasuk penyeberangan ke luar Kalimantan.',
  },
  {
    icon: FiShield,
    title: 'Garansi rangka 5 tahun',
    description: 'Berlaku untuk semua rangka kayu ulin solid, bukan sekadar lapisan luar.',
  },
  {
    icon: FiHeadphones,
    title: 'Konsultasi lewat WhatsApp',
    description: 'Tim kami bantu ukur ruang dan pilih ukuran sebelum kamu pesan.',
  },
];

function ProductGrid({ query }) {
  if (query.isPending) {
    return (
      <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return <ErrorState className="mt-8" onRetry={query.refetch} />;
  }

  return (
    <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-4">
      {query.data.data.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

function CategoryGrid({ query }) {
  if (query.isPending) {
    return (
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="aspect-4/5 rounded-card" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return <ErrorState className="mt-8" onRetry={query.refetch} />;
  }

  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {query.data.data.map((category) => (
        <Link
          key={category.slug}
          to={`${routes.shop}?kategori=${category.slug}`}
          className="group relative block overflow-hidden rounded-card"
        >
          <img
            src={category.image}
            alt=""
            loading="lazy"
            className="aspect-4/5 w-full object-cover transition duration-500 ease-out group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-linear-to-t from-ink/80 via-ink/5 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3">
            <p className="font-display text-sm font-medium text-paper">{category.name}</p>
            <p className="text-[0.6875rem] text-paper/70">{category.productCount} produk</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function HomePage() {
  const categoriesQuery = useCategories();
  const newArrivalsQuery = useProducts({ sort: 'newest', limit: 4 });
  const trendingQuery = useProducts({ sort: 'rating', limit: 8 });

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-ulin">
        <img
          src="/images/banner-bg.jpg"
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-r from-ulin via-ulin/85 to-ulin/40" />

        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
          <div className="max-w-xl">
            <p className="text-spec text-paper/70">Dari Banjarmasin, untuk seluruh Indonesia</p>
            <h1 className="mt-3 text-display text-paper">
              Mebel ulin yang tumbuh bersama rumah
            </h1>
            <p className="mt-5 max-w-md text-[0.9375rem] leading-relaxed text-paper/80">
              Kayu ulin kering tanur dan anyaman rotan tangan dari pengrajin di bantaran Sungai
              Martapura. Setiap potong dibuat untuk dipakai turun-temurun, bukan diganti tiap
              lima tahun.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <ButtonLink to={routes.shop} size="lg">
                Belanja koleksi
              </ButtonLink>
              <a
                href="#kategori"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-paper underline decoration-paper/40 underline-offset-4 hover:decoration-paper"
              >
                Jelajahi kategori
                <FiArrowRight className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-sand bg-surface">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-10 sm:grid-cols-3 sm:px-8">
          {trustPoints.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary-deep">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-display text-sm font-medium text-ink">{title}</p>
                <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section id="kategori" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <SectionHeading
          eyebrow="Jelajahi"
          title="Kategori pilihan"
          description="Mulai dari ruang yang ingin kamu tata lebih dulu."
          action={{ label: 'Lihat semua produk', to: routes.shop }}
        />
        <CategoryGrid query={categoriesQuery} />
      </section>

      {/* New arrivals */}
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <SectionHeading
          eyebrow="Baru dari workshop"
          title="Baru tiba"
          action={{ label: 'Lihat semua', to: `${routes.shop}?sort=newest` }}
        />
        <ProductGrid query={newArrivalsQuery} />
      </section>

      {/* Promo banner */}
      <section className="mx-auto max-w-7xl px-5 sm:px-8">
        <Link
          to={routes.shop}
          className="group relative block overflow-hidden rounded-card bg-ulin"
        >
          <img
            src="/images/category/category-1.jpg"
            alt=""
            loading="lazy"
            className="h-72 w-full object-cover opacity-90 transition duration-500 ease-out group-hover:scale-105 sm:h-80"
          />
          <div className="absolute inset-0 bg-linear-to-r from-ink/80 via-ink/35 to-transparent" />
          <div className="absolute inset-y-0 left-0 flex max-w-sm flex-col justify-center gap-3 p-8 sm:p-12">
            <p className="text-spec text-paper/70">Sampai akhir bulan</p>
            <h3 className="font-display text-title text-paper">
              Gratis ongkir antar pulau untuk belanja di atas Rp 5.000.000
            </h3>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-paper underline decoration-paper/40 underline-offset-4 group-hover:decoration-paper">
              Belanja sekarang
              <FiArrowRight className="size-4" />
            </span>
          </div>
        </Link>
      </section>

      {/* Trending */}
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <SectionHeading
          eyebrow="Favorit pelanggan"
          title="Sedang digemari"
          action={{ label: 'Lihat semua', to: `${routes.shop}?sort=rating` }}
        />
        <ProductGrid query={trendingQuery} />
      </section>
    </>
  );
}
