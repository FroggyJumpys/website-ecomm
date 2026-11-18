import { apiRequest, toQuery } from './http.js';

/**
 * Account services for the customer area: profile, password, addresses and
 * order history. The owner is always the session cookie's user; no call names
 * a user id.
 */

export function updateProfile(payload) {
  return apiRequest('/users/me', { method: 'PATCH', body: payload });
}

export function changePassword(payload) {
  return apiRequest('/users/me/password', { method: 'POST', body: payload });
}

export function fetchAddresses() {
  return apiRequest('/users/me/addresses');
}

export function createAddress(payload) {
  return apiRequest('/users/me/addresses', { method: 'POST', body: payload });
}

export function updateAddress({ id, ...payload }) {
  return apiRequest(`/users/me/addresses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function deleteAddress(id) {
  return apiRequest(`/users/me/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function setDefaultAddress(id) {
  return apiRequest(`/users/me/addresses/${encodeURIComponent(id)}/default`, { method: 'POST' });
}

/** `GET /users/me/orders` is paginated and filtered server-side. */
export function fetchOrders(params = {}) {
  return apiRequest(`/users/me/orders${toQuery(params)}`);
}

export function fetchOrder(orderNumber) {
  return apiRequest(`/users/me/orders/${encodeURIComponent(orderNumber)}`);
}
