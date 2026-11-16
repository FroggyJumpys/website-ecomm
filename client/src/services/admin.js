import { apiRequest } from './http.js';
import { USE_MOCKS } from '../lib/config.js';
import * as mock from '../mocks/admin.js';

/**
 * Admin (panel toko) services. Every call is admin-only on the server; the
 * client guard in `RequireAdmin` only keeps the screens out of a customer's
 * way, it is not the security boundary.
 */

/* ------------------------------------------------------------------ orders */

export function fetchAdminOrders() {
  if (USE_MOCKS) return mock.listAllOrders();

  return apiRequest('/admin/orders');
}

export function fetchAdminOrder(orderNumber) {
  if (USE_MOCKS) return mock.getAdminOrder(orderNumber);

  return apiRequest(`/admin/orders/${encodeURIComponent(orderNumber)}`);
}

export function updateAdminOrderStatus({ orderNumber, status }) {
  if (USE_MOCKS) return mock.updateOrderStatus(orderNumber, status);

  return apiRequest(`/admin/orders/${encodeURIComponent(orderNumber)}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

/* --------------------------------------------------------------- catalogue */

export function fetchAdminProducts() {
  if (USE_MOCKS) return mock.listProductsForAdmin();

  return apiRequest('/admin/products');
}

export function createProduct(payload) {
  if (USE_MOCKS) return mock.createProduct(payload);

  return apiRequest('/admin/products', { method: 'POST', body: payload });
}

export function updateProduct({ id, ...payload }) {
  if (USE_MOCKS) return mock.updateProduct(id, payload);

  return apiRequest(`/admin/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload });
}

export function deleteProduct(id) {
  if (USE_MOCKS) return mock.deleteProduct(id);

  return apiRequest(`/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchAdminTaxonomy() {
  if (USE_MOCKS) return mock.listTaxonomyForAdmin();

  const [categories, brands] = await Promise.all([
    apiRequest('/admin/categories'),
    apiRequest('/admin/brands'),
  ]);

  return { data: { categories: categories.data, brands: brands.data } };
}

export function createCategory(payload) {
  if (USE_MOCKS) return mock.createCategory(payload);

  return apiRequest('/admin/categories', { method: 'POST', body: payload });
}

export function updateCategory({ id, ...payload }) {
  if (USE_MOCKS) return mock.updateCategory(id, payload);

  return apiRequest(`/admin/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload });
}

export function deleteCategory(id) {
  if (USE_MOCKS) return mock.deleteCategory(id);

  return apiRequest(`/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function createBrand(payload) {
  if (USE_MOCKS) return mock.createBrand(payload);

  return apiRequest('/admin/brands', { method: 'POST', body: payload });
}

export function updateBrand({ id, ...payload }) {
  if (USE_MOCKS) return mock.updateBrand(id, payload);

  return apiRequest(`/admin/brands/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload });
}

export function deleteBrand(id) {
  if (USE_MOCKS) return mock.deleteBrand(id);

  return apiRequest(`/admin/brands/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
