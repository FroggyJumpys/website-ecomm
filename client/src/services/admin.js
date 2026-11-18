import { apiRequest, apiUpload, toQuery } from './http.js';

/**
 * Admin (panel toko) services. Every call is admin-only on the server; the
 * client guard in `RequireAdmin` only keeps the screens out of a customer's
 * way, it is not the security boundary.
 *
 * Two server contracts shape the write calls:
 *
 *  - product PATCH and DELETE carry `expectedVersion` from the read that
 *    produced the form, so a sale or a second operator cannot be overwritten;
 *  - images are stored by uploading them first and sending the returned path.
 */

/* ------------------------------------------------------------------ orders */

export function fetchAdminOrders(params = {}) {
  return apiRequest(`/admin/orders${toQuery(params)}`);
}

export function fetchAdminOrder(orderNumber) {
  return apiRequest(`/admin/orders/${encodeURIComponent(orderNumber)}`);
}

export function updateAdminOrderStatus({ orderNumber, status, trackingNumber }) {
  const body = { status };

  // Omitting the field leaves the stored number alone; "" clears it.
  if (trackingNumber !== undefined) body.trackingNumber = trackingNumber;

  return apiRequest(`/admin/orders/${encodeURIComponent(orderNumber)}/status`, {
    method: 'PATCH',
    body,
  });
}

/* --------------------------------------------------------------- catalogue */

export function fetchAdminProducts(params = {}) {
  return apiRequest(`/admin/products${toQuery(params)}`);
}

export function createProduct(payload) {
  return apiRequest('/admin/products', { method: 'POST', body: payload });
}

export function updateProduct({ id, ...payload }) {
  return apiRequest(`/admin/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function deleteProduct({ id, expectedVersion }) {
  return apiRequest(`/admin/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: { expectedVersion },
  });
}

export function uploadProductImage(file) {
  const formData = new FormData();
  formData.append('image', file);

  return apiUpload('/admin/uploads', formData);
}

export async function fetchAdminTaxonomy() {
  const [categories, brands] = await Promise.all([
    apiRequest('/admin/categories'),
    apiRequest('/admin/brands'),
  ]);

  return { data: { categories: categories.data, brands: brands.data } };
}

export function createCategory(payload) {
  return apiRequest('/admin/categories', { method: 'POST', body: payload });
}

export function updateCategory({ id, ...payload }) {
  return apiRequest(`/admin/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function deleteCategory(id) {
  return apiRequest(`/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function createBrand(payload) {
  return apiRequest('/admin/brands', { method: 'POST', body: payload });
}

export function updateBrand({ id, ...payload }) {
  return apiRequest(`/admin/brands/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload });
}

export function deleteBrand(id) {
  return apiRequest(`/admin/brands/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
