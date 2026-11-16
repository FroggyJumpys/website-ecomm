import { productFilters } from './products.js';
import { readCatalog } from './catalogStore.js';

/**
 * In-memory implementation of the catalogue API. Each function returns the
 * exact payload the Express routes will return in Phase 4, so swapping the
 * implementation in step 05 does not change any component.
 *
 * Every read goes through `catalogStore`, which the admin panel writes to, so a
 * product created in the panel is immediately visible in the storefront.
 * Products with `isActive: false` are hidden from customers but stay in the
 * admin list.
 */

const LATENCY_MS = 220;

function delay(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function visibleProducts(catalog) {
  return catalog.products.filter((product) => product.isActive !== false);
}

/** Product summary shape shared by the catalogue and the wishlist mocks. */
export function toSummary(product, catalog) {
  const category = catalog.categories.find((item) => item.slug === product.categorySlug);
  const brand = catalog.brands.find((item) => item.slug === product.brandSlug);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    rating: product.rating,
    reviewCount: product.reviewCount,
    stock: product.stock,
    material: product.material,
    dimensions: product.dimensions,
    image: product.images[0],
    isNew: product.isNew,
    isTrending: product.isTrending,
    category: category ? { slug: category.slug, name: category.name } : null,
    brand: brand ? { slug: brand.slug, name: brand.name } : null,
  };
}

function matches(product, filters) {
  const { search, category, brand, minPrice, maxPrice, color, size } = filters;

  if (search) {
    const haystack = `${product.name} ${product.material} ${product.description}`.toLowerCase();
    if (!haystack.includes(search.toLowerCase())) return false;
  }
  if (category && product.categorySlug !== category) return false;
  if (brand && product.brandSlug !== brand) return false;
  if (minPrice !== undefined && product.price < minPrice) return false;
  if (maxPrice !== undefined && product.price > maxPrice) return false;
  if (color && !product.colors.includes(color)) return false;
  if (size && !product.sizes.includes(size)) return false;

  return true;
}

function sortProducts(list, sort) {
  const sorted = [...list];
  switch (sort) {
    case 'price-asc':
      return sorted.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return sorted.sort((a, b) => b.price - a.price);
    case 'rating':
      return sorted.sort((a, b) => b.rating - a.rating);
    case 'newest':
    default:
      return sorted.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.id - a.id);
  }
}

export async function listProducts(filters = {}) {
  const catalog = readCatalog();
  const page = Number(filters.page ?? 1);
  const limit = Number(filters.limit ?? 9);
  const filtered = sortProducts(
    visibleProducts(catalog).filter((item) => matches(item, filters)),
    filters.sort
  );

  return delay({
    data: filtered.slice((page - 1) * limit, page * limit).map((item) => toSummary(item, catalog)),
    meta: {
      page,
      limit,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
    },
  });
}

export async function getProductBySlug(slug) {
  const catalog = readCatalog();
  const product = visibleProducts(catalog).find((item) => item.slug === slug);

  if (!product) {
    const error = new Error('Produk tidak ditemukan.');
    error.code = 'PRODUCT_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  const category = catalog.categories.find((item) => item.slug === product.categorySlug);
  const brand = catalog.brands.find((item) => item.slug === product.brandSlug);

  return delay({
    data: {
      ...product,
      category: category ? { slug: category.slug, name: category.name } : null,
      brand: brand ? { slug: brand.slug, name: brand.name } : null,
      image: product.images[0],
    },
  });
}

export async function listRelatedProducts(slug, limit = 4) {
  const catalog = readCatalog();
  const product = visibleProducts(catalog).find((item) => item.slug === slug);
  if (!product) return delay({ data: [] });

  const visible = visibleProducts(catalog);

  // Real catalogue APIs fill "related" with several signals. Start with the
  // same category, then the same brand, then the best-rated remaining items, so
  // the rail always has something useful even when a category is small.
  const sameCategory = visible.filter(
    (item) => item.slug !== slug && item.categorySlug === product.categorySlug
  );
  const sameBrand = visible.filter(
    (item) =>
      item.slug !== slug &&
      item.brandSlug === product.brandSlug &&
      item.categorySlug !== product.categorySlug
  );
  const rest = visible
    .filter(
      (item) =>
        item.slug !== slug &&
        item.categorySlug !== product.categorySlug &&
        item.brandSlug !== product.brandSlug
    )
    .sort((a, b) => b.rating - a.rating);

  const related = [...sameCategory, ...sameBrand, ...rest].slice(0, limit);

  return delay({ data: related.map((item) => toSummary(item, catalog)) });
}

export async function listCategories() {
  return delay({ data: readCatalog().categories });
}

export async function listBrands() {
  return delay({ data: readCatalog().brands });
}

export async function listFilters() {
  return delay({ data: productFilters });
}
