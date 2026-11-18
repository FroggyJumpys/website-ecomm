import { apiRequest, toQuery } from './http.js';

/** Catalogue services against the public storefront endpoints. */

export function fetchProducts(params = {}) {
  return apiRequest(`/products${toQuery(params)}`);
}

export function fetchProduct(slug) {
  return apiRequest(`/products/${encodeURIComponent(slug)}`);
}

export function fetchRelatedProducts(slug, limit = 4) {
  return apiRequest(`/products/${encodeURIComponent(slug)}/related${toQuery({ limit })}`);
}

export function fetchCategories() {
  return apiRequest('/categories');
}

export function fetchBrands() {
  return apiRequest('/brands');
}

export function fetchFilterOptions() {
  return apiRequest('/products/filters');
}
