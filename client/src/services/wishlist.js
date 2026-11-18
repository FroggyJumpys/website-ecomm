import { apiRequest } from './http.js';

/**
 * Wishlist services. The owner is the session cookie's user, so a product id
 * in the body can never nominate somebody else's list.
 */

export function fetchWishlist() {
  return apiRequest('/users/me/wishlist');
}

export function addToWishlist(productId) {
  return apiRequest('/users/me/wishlist', { method: 'POST', body: { productId } });
}

export function removeFromWishlist(productId) {
  return apiRequest(`/users/me/wishlist/${encodeURIComponent(productId)}`, { method: 'DELETE' });
}
