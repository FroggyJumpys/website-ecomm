import { products } from './products.js';
import { toSummary } from './index.js';

/**
 * Mock wishlist backend. Saved product ids live per user in browser storage so
 * the reviewer can save, remove and reload without losing the list; step 04e
 * replaces this with `tbl_favorit` behind the same payloads.
 *
 * Items are returned newest first and carry the variant options the row needs
 * to move a product into the cart, so 04e must include `colors` and `sizes` in
 * its item payload too.
 */

const WISHLIST_KEY = 'badekor.mock.wishlists';
const LATENCY_MS = 240;

function delay(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function wishlistError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function readStore() {
  try {
    const raw = window.localStorage.getItem(WISHLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* unreadable payload: fall through and reseed */
  }

  const initial = seedWishlist();
  writeStore(initial);
  return initial;
}

function writeStore(value) {
  try {
    window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(value));
  } catch {
    /* storage blocked or full: the mock keeps working for this page load */
  }
}

/** Sari starts with three saved products; the admin account starts empty. */
function seedWishlist() {
  return { 1: [5, 10, 1], 2: [] };
}

function toItem(product) {
  return { ...toSummary(product), colors: product.colors, sizes: product.sizes };
}

export async function listWishlist(userId) {
  const store = readStore();
  const ids = Array.isArray(store[userId]) ? store[userId] : [];
  const items = ids
    .map((id) => products.find((product) => product.id === id))
    .filter(Boolean)
    .map(toItem);

  return delay({ data: items });
}

/** Idempotent: saving the same product twice must not create a duplicate row. */
export async function addToWishlist(userId, productId) {
  const product = products.find((item) => item.id === Number(productId));

  if (!product) {
    throw wishlistError(
      'PRODUCT_NOT_FOUND',
      'Produk ini tidak ada di katalog kami.',
      404
    );
  }

  const store = readStore();
  const ids = Array.isArray(store[userId]) ? store[userId] : [];

  if (!ids.includes(product.id)) {
    store[userId] = [product.id, ...ids];
    writeStore(store);
  }

  return delay({ data: toItem(product) });
}

export async function removeFromWishlist(userId, productId) {
  const store = readStore();
  const ids = Array.isArray(store[userId]) ? store[userId] : [];

  store[userId] = ids.filter((id) => id !== Number(productId));
  writeStore(store);

  return delay({ data: null });
}
