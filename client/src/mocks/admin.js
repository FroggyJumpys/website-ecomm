import { readCatalog, writeCatalog } from './catalogStore.js';
import { readOrdersByUser, writeOrdersByUser } from './account.js';
import { listUsers } from './auth.js';
import { ORDER_STATUS } from '../lib/orderStatus.js';
import { slugify } from '../lib/format.js';

/**
 * Admin-side mock backend (panel toko). It reads the same storage the customer
 * mocks write, so an order placed at checkout shows up here immediately, and
 * joins each order to its customer instead of keeping a second copy.
 *
 * Payloads match the admin endpoints of 04h/04i; step 05 swaps the module, not
 * the screens.
 */

const LATENCY_MS = 240;

const STATUS_VALUES = Object.keys(ORDER_STATUS);

function delay(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function toAdminOrder(order, user) {
  return {
    ...order,
    customer: user
      ? { id: user.id, name: user.name, email: user.email, phone: user.phone }
      : null,
  };
}

/** Every customer's orders, newest first. */
export async function listAllOrders() {
  const users = await listUsers();
  const byUser = readOrdersByUser();
  const orders = [];

  for (const user of users) {
    for (const order of byUser[user.id] ?? []) {
      orders.push(toAdminOrder(order, user));
    }
  }

  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return delay({ data: orders });
}

/** Locates one order across every customer's history, with its owner. */
async function locateOrder(orderNumber) {
  const users = await listUsers();
  const byUser = readOrdersByUser();

  for (const user of users) {
    const list = byUser[user.id] ?? [];
    const index = list.findIndex((order) => order.orderNumber === orderNumber);

    if (index !== -1) {
      return { user, byUser, userId: user.id, index, order: list[index] };
    }
  }

  return null;
}

/** One order plus its customer, for the panel's detail screen. */
export async function getAdminOrder(orderNumber) {
  const found = await locateOrder(orderNumber);

  if (!found) throw adminError('ORDER_NOT_FOUND', 'Pesanan ini tidak ditemukan.', 404);

  return delay({ data: toAdminOrder(found.order, found.user) });
}

/**
 * Moves an order to a new status and appends the event to its timeline, the
 * same history the customer sees. Cancelling records a reason so the customer
 * screen never shows an empty cancellation block; reopening clears it.
 */
export async function updateOrderStatus(orderNumber, status) {
  if (!STATUS_VALUES.includes(status)) {
    throw adminError('VALIDATION_ERROR', 'Status pesanan tidak dikenal.', 400);
  }

  const found = await locateOrder(orderNumber);

  if (!found) throw adminError('ORDER_NOT_FOUND', 'Pesanan ini tidak ditemukan.', 404);

  const { user, byUser, userId, index, order: existing } = found;

  if (existing.status === status) {
    return delay({ data: toAdminOrder(existing, user) });
  }

  const now = new Date().toISOString();
  const timeline = Array.isArray(existing.timeline) ? [...existing.timeline] : [];

  if (!timeline.some((entry) => entry.status === status)) {
    timeline.push({ status, at: now });
  }

  const updated = {
    ...existing,
    status,
    timeline,
    cancellationReason:
      status === 'cancelled'
        ? existing.cancellationReason ?? 'Pesanan dibatalkan oleh admin toko.'
        : null,
  };

  byUser[userId] = byUser[userId].map((order, orderIndex) =>
    orderIndex === index ? updated : order
  );
  writeOrdersByUser(byUser);

  return delay({ data: toAdminOrder(updated, user) });
}

/* ------------------------------------------------------------- catalogue */

function adminError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function clean(value) {
  return String(value ?? '').trim();
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item)).filter(Boolean);
}

/** Keeps slugs unique without making the operator invent a suffix by hand. */
function uniqueSlug(collection, wanted, exceptId) {
  const taken = new Set(
    collection.filter((item) => item.id !== exceptId).map((item) => item.slug)
  );
  const base = wanted || 'item';

  if (!taken.has(base)) return base;

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function withTaxonomy(product, catalog) {
  const category = catalog.categories.find((item) => item.slug === product.categorySlug);
  const brand = catalog.brands.find((item) => item.slug === product.brandSlug);

  return {
    ...product,
    category: category ? { slug: category.slug, name: category.name } : null,
    brand: brand ? { slug: brand.slug, name: brand.name } : null,
  };
}

/** Every product, including the ones hidden from the storefront, newest id first. */
export async function listProductsForAdmin() {
  const catalog = readCatalog();
  const products = [...catalog.products].sort((a, b) => b.id - a.id);

  return delay({ data: products.map((product) => withTaxonomy(product, catalog)) });
}

function normalizeProduct(payload, catalog, id) {
  const name = clean(payload.name);

  if (!name) throw adminError('VALIDATION_ERROR', 'Nama produk wajib diisi.', 400);

  const price = Math.round(Number(payload.price) || 0);
  const stock = Math.max(0, Math.round(Number(payload.stock) || 0));
  const compareAt = payload.compareAtPrice ? Math.round(Number(payload.compareAtPrice)) : null;

  if (!catalog.categories.some((category) => category.slug === payload.categorySlug)) {
    throw adminError('VALIDATION_ERROR', 'Pilih kategori yang terdaftar.', 400);
  }
  if (!catalog.brands.some((brand) => brand.slug === payload.brandSlug)) {
    throw adminError('VALIDATION_ERROR', 'Pilih merek yang terdaftar.', 400);
  }

  return {
    id,
    slug: uniqueSlug(catalog.products, clean(payload.slug) || slugify(name), id),
    name,
    categorySlug: payload.categorySlug,
    brandSlug: payload.brandSlug,
    price,
    compareAtPrice: compareAt && compareAt > price ? compareAt : null,
    rating: Number(payload.rating) || 0,
    reviewCount: Number(payload.reviewCount) || 0,
    stock,
    material: clean(payload.material),
    dimensions: clean(payload.dimensions),
    colors: stringList(payload.colors),
    sizes: stringList(payload.sizes),
    images: stringList(payload.images),
    isNew: Boolean(payload.isNew),
    isTrending: Boolean(payload.isTrending),
    isActive: payload.isActive !== false,
    description: clean(payload.description),
  };
}

export async function createProduct(payload) {
  const catalog = readCatalog();
  const id = Math.max(0, ...catalog.products.map((product) => product.id)) + 1;
  const product = normalizeProduct(payload, catalog, id);

  catalog.products = [...catalog.products, product];
  writeCatalog(catalog);

  return delay({ data: withTaxonomy(product, catalog) });
}

export async function updateProduct(id, payload) {
  const catalog = readCatalog();
  const index = catalog.products.findIndex((product) => String(product.id) === String(id));

  if (index === -1) {
    throw adminError('PRODUCT_NOT_FOUND', 'Produk ini tidak ditemukan.', 404);
  }

  const product = normalizeProduct(
    { ...catalog.products[index], ...payload },
    catalog,
    catalog.products[index].id
  );

  catalog.products = catalog.products.map((item) =>
    String(item.id) === String(id) ? product : item
  );
  writeCatalog(catalog);

  return delay({ data: withTaxonomy(product, catalog) });
}

export async function deleteProduct(id) {
  const catalog = readCatalog();
  const exists = catalog.products.some((product) => String(product.id) === String(id));

  if (!exists) {
    throw adminError('PRODUCT_NOT_FOUND', 'Produk ini tidak ditemukan.', 404);
  }

  catalog.products = catalog.products.filter((product) => String(product.id) !== String(id));
  writeCatalog(catalog);

  return delay({ data: null });
}

/* ----------------------------------------------------- categories/brands */

function productCount(catalog, field, slug) {
  return catalog.products.filter((product) => product[field] === slug).length;
}

export async function listTaxonomyForAdmin() {
  const catalog = readCatalog();

  return delay({
    data: {
      categories: catalog.categories.map((category) => ({
        ...category,
        productCount: productCount(catalog, 'categorySlug', category.slug),
      })),
      brands: catalog.brands.map((brand) => ({
        ...brand,
        productCount: productCount(catalog, 'brandSlug', brand.slug),
      })),
    },
  });
}

function normalizeCategory(payload, catalog, id) {
  const name = clean(payload.name);

  if (!name) throw adminError('VALIDATION_ERROR', 'Nama kategori wajib diisi.', 400);

  return {
    id,
    slug: uniqueSlug(catalog.categories, clean(payload.slug) || slugify(name), id),
    name,
    description: clean(payload.description),
    image: clean(payload.image),
  };
}

function normalizeBrand(payload, catalog, id) {
  const name = clean(payload.name);

  if (!name) throw adminError('VALIDATION_ERROR', 'Nama merek wajib diisi.', 400);

  return {
    id,
    slug: uniqueSlug(catalog.brands, clean(payload.slug) || slugify(name), id),
    name,
  };
}

function assertUnused(catalog, field, slug, label) {
  const used = catalog.products.some((product) => product[field] === slug);

  if (used) {
    throw adminError(
      'TAXONOMY_IN_USE',
      `${label} ini masih dipakai produk. Pindahkan produknya dulu sebelum menghapus.`,
      409
    );
  }
}

export async function createCategory(payload) {
  const catalog = readCatalog();
  const id = Math.max(0, ...catalog.categories.map((item) => item.id)) + 1;
  const category = normalizeCategory(payload, catalog, id);

  catalog.categories = [...catalog.categories, category];
  writeCatalog(catalog);

  return delay({ data: { ...category, productCount: 0 } });
}

export async function updateCategory(id, payload) {
  const catalog = readCatalog();
  const existing = catalog.categories.find((item) => String(item.id) === String(id));

  if (!existing) throw adminError('CATEGORY_NOT_FOUND', 'Kategori ini tidak ditemukan.', 404);

  const category = normalizeCategory({ ...existing, ...payload }, catalog, existing.id);
  const renamed = category.slug !== existing.slug;

  catalog.categories = catalog.categories.map((item) =>
    String(item.id) === String(id) ? category : item
  );

  // Products point at the slug, so a rename has to carry them along.
  if (renamed) {
    catalog.products = catalog.products.map((product) =>
      product.categorySlug === existing.slug ? { ...product, categorySlug: category.slug } : product
    );
  }

  writeCatalog(catalog);

  return delay({ data: category });
}

export async function deleteCategory(id) {
  const catalog = readCatalog();
  const existing = catalog.categories.find((item) => String(item.id) === String(id));

  if (!existing) throw adminError('CATEGORY_NOT_FOUND', 'Kategori ini tidak ditemukan.', 404);

  assertUnused(catalog, 'categorySlug', existing.slug, 'Kategori');

  catalog.categories = catalog.categories.filter((item) => String(item.id) !== String(id));
  writeCatalog(catalog);

  return delay({ data: null });
}

export async function createBrand(payload) {
  const catalog = readCatalog();
  const id = Math.max(0, ...catalog.brands.map((item) => item.id)) + 1;
  const brand = normalizeBrand(payload, catalog, id);

  catalog.brands = [...catalog.brands, brand];
  writeCatalog(catalog);

  return delay({ data: { ...brand, productCount: 0 } });
}

export async function updateBrand(id, payload) {
  const catalog = readCatalog();
  const existing = catalog.brands.find((item) => String(item.id) === String(id));

  if (!existing) throw adminError('BRAND_NOT_FOUND', 'Merek ini tidak ditemukan.', 404);

  const brand = normalizeBrand({ ...existing, ...payload }, catalog, existing.id);
  const renamed = brand.slug !== existing.slug;

  catalog.brands = catalog.brands.map((item) => (String(item.id) === String(id) ? brand : item));

  if (renamed) {
    catalog.products = catalog.products.map((product) =>
      product.brandSlug === existing.slug ? { ...product, brandSlug: brand.slug } : product
    );
  }

  writeCatalog(catalog);

  return delay({ data: brand });
}

export async function deleteBrand(id) {
  const catalog = readCatalog();
  const existing = catalog.brands.find((item) => String(item.id) === String(id));

  if (!existing) throw adminError('BRAND_NOT_FOUND', 'Merek ini tidak ditemukan.', 404);

  assertUnused(catalog, 'brandSlug', existing.slug, 'Merek');

  catalog.brands = catalog.brands.filter((item) => String(item.id) !== String(id));
  writeCatalog(catalog);

  return delay({ data: null });
}
