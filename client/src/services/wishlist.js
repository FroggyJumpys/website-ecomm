import { apiRequest } from './http.js';
import { USE_MOCKS } from '../lib/config.js';
import * as mock from '../mocks/wishlist.js';
import { getSessionUserId } from '../mocks/auth.js';

/**
 * Wishlist services. Step 04e replaces the mock with `tbl_favorit` behind these
 * same calls; the page and the heart buttons never know the difference.
 */

function requireUserId() {
  const id = getSessionUserId();

  if (!id) {
    const error = new Error('Sesi kamu sudah berakhir. Masuk lagi untuk menyimpan favorit.');
    error.code = 'UNAUTHENTICATED';
    error.status = 401;
    throw error;
  }

  return id;
}

export function fetchWishlist() {
  if (USE_MOCKS) return mock.listWishlist(requireUserId());

  return apiRequest('/users/me/wishlist');
}

export function addToWishlist(productId) {
  if (USE_MOCKS) return mock.addToWishlist(requireUserId(), productId);

  return apiRequest('/users/me/wishlist', { method: 'POST', body: { productId } });
}

export function removeFromWishlist(productId) {
  if (USE_MOCKS) return mock.removeFromWishlist(requireUserId(), productId);

  return apiRequest(`/users/me/wishlist/${encodeURIComponent(productId)}`, { method: 'DELETE' });
}
