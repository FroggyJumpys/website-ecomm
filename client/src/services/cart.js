import { apiRequest } from './http.js';

/**
 * Cart services.
 *
 * The server owns the cart: a guest is identified by an httpOnly cookie the
 * first successful write sets, and a signed-in customer by the session cookie.
 * Every call answers with the whole cart, so the provider replaces its cache
 * rather than patching it by hand.
 */

export function fetchCart() {
  return apiRequest('/cart');
}

export function addCartItem({ productId, color = '', size = '', quantity = 1 }) {
  return apiRequest('/cart/items', {
    method: 'POST',
    body: { productId, color, size, quantity },
  });
}

export function updateCartItemQuantity({ id, quantity }) {
  return apiRequest(`/cart/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { quantity },
  });
}

export function removeCartItem(id) {
  return apiRequest(`/cart/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function clearCart() {
  return apiRequest('/cart', { method: 'DELETE' });
}
