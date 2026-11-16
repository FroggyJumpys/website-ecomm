import { products as seedProducts } from './products.js';
import { categories as seedCategories, brands as seedBrands } from './taxonomy.js';

/**
 * Catalogue storage for the mock phase.
 *
 * Before 03i the storefront read the static seed arrays directly, which meant an
 * admin edit could never reach it. Everything now reads this one store, seeded
 * from the same arrays on first use, so creating a product in the panel and
 * reloading /toko shows the same catalogue — the way 04h/04c will behave once
 * both sides read `tbl_produk`.
 *
 * `isActive` is added here: the schema has it (04a) and the admin needs to hide
 * a product without deleting its history.
 */

const CATALOG_KEY = 'badekor.mock.catalog';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function seedCatalog() {
  return {
    products: seedProducts.map((product) => ({ isActive: true, ...product })),
    categories: seedCategories.map((category) => ({ ...category })),
    brands: seedBrands.map((brand) => ({ ...brand })),
  };
}

export function writeCatalog(catalog) {
  try {
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
  } catch {
    /* storage blocked or full: the session keeps the in-memory copy */
  }
}

export function readCatalog() {
  try {
    const raw = window.localStorage.getItem(CATALOG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (
      parsed &&
      Array.isArray(parsed.products) &&
      Array.isArray(parsed.categories) &&
      Array.isArray(parsed.brands)
    ) {
      return parsed;
    }
  } catch {
    /* unreadable payload: fall through and reseed */
  }

  const initial = seedCatalog();
  writeCatalog(initial);
  return initial;
}

/** Deep copy for code that only reads, so no caller can mutate the store. */
export function snapshotCatalog() {
  return clone(readCatalog());
}
