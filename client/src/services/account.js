import { apiRequest } from './http.js';
import { USE_MOCKS } from '../lib/config.js';
import * as mock from '../mocks/account.js';
import {
  changePassword as mockChangePassword,
  getSessionUserId,
  updateProfile as mockUpdateProfile,
} from '../mocks/auth.js';

/**
 * Account services for the customer area. The real endpoints arrive with 04d
 * (profile, password, addresses) and 04g (orders) under the same payloads.
 */

function requireUserId() {
  const id = getSessionUserId();

  if (!id) {
    const error = new Error('Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.');
    error.code = 'UNAUTHENTICATED';
    error.status = 401;
    throw error;
  }

  return id;
}

export function updateProfile(payload) {
  if (USE_MOCKS) return mockUpdateProfile(payload);

  return apiRequest('/users/me', { method: 'PATCH', body: payload });
}

export function changePassword(payload) {
  if (USE_MOCKS) return mockChangePassword(payload);

  return apiRequest('/users/me/password', { method: 'POST', body: payload });
}

export function fetchAddresses() {
  if (USE_MOCKS) return mock.listAddresses(requireUserId());

  return apiRequest('/users/me/addresses');
}

export function createAddress(payload) {
  if (USE_MOCKS) return mock.createAddress(requireUserId(), payload);

  return apiRequest('/users/me/addresses', { method: 'POST', body: payload });
}

export function updateAddress({ id, ...payload }) {
  if (USE_MOCKS) return mock.updateAddress(requireUserId(), id, payload);

  return apiRequest(`/users/me/addresses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function deleteAddress(id) {
  if (USE_MOCKS) return mock.deleteAddress(requireUserId(), id);

  return apiRequest(`/users/me/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function setDefaultAddress(id) {
  if (USE_MOCKS) return mock.setDefaultAddress(requireUserId(), id);

  return apiRequest(`/users/me/addresses/${encodeURIComponent(id)}/default`, { method: 'POST' });
}

export function fetchOrders() {
  if (USE_MOCKS) return mock.listOrders(requireUserId());

  return apiRequest('/users/me/orders');
}

export function fetchOrder(orderNumber) {
  if (USE_MOCKS) return mock.getOrder(requireUserId(), orderNumber);

  return apiRequest(`/users/me/orders/${encodeURIComponent(orderNumber)}`);
}
