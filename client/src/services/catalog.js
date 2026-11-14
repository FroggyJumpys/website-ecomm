import { apiRequest, toQuery } from './http.js';
import { USE_MOCKS } from '../lib/config.js';
import * as mock from '../mocks/index.js';

/**
 * Catalogue services. Set VITE_USE_MOCKS=false (step 05 turns that over) to
 * resolve from the Express API with the same payloads the mocks return.
 */

export function fetchProducts(params = {}) {
  if (USE_MOCKS) return mock.listProducts(params);
  return apiRequest(`/products${toQuery(params)}`);
}

export function fetchProduct(slug) {
  if (USE_MOCKS) return mock.getProductBySlug(slug);
  return apiRequest(`/products/${encodeURIComponent(slug)}`);
}

export function fetchRelatedProducts(slug, limit = 4) {
  if (USE_MOCKS) return mock.listRelatedProducts(slug, limit);
  return apiRequest(`/products/${encodeURIComponent(slug)}/related${toQuery({ limit })}`);
}

export function fetchCategories() {
  if (USE_MOCKS) return mock.listCategories();
  return apiRequest('/categories');
}

export function fetchBrands() {
  if (USE_MOCKS) return mock.listBrands();
  return apiRequest('/brands');
}

export function fetchFilterOptions() {
  if (USE_MOCKS) return mock.listFilters();
  return apiRequest('/products/filters');
}
