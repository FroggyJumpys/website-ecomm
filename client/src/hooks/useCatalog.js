import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  fetchProducts,
  fetchProduct,
  fetchRelatedProducts,
  fetchCategories,
  fetchBrands,
  fetchFilterOptions,
} from '../services/catalog.js';

/**
 * Server-state hooks. Components never call services directly, and every query
 * exposes `isPending` / `isError` / `error` so screens can render real states.
 */

export function useProducts(params = {}) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => fetchProducts(params),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(slug) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: () => fetchProduct(slug),
    enabled: Boolean(slug),
  });
}

export function useRelatedProducts(slug, limit = 4) {
  return useQuery({
    queryKey: ['product', slug, 'related', limit],
    queryFn: () => fetchRelatedProducts(slug, limit),
    enabled: Boolean(slug),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBrands() {
  return useQuery({
    queryKey: ['brands'],
    queryFn: fetchBrands,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFilterOptions() {
  return useQuery({
    queryKey: ['products', 'filters'],
    queryFn: fetchFilterOptions,
    staleTime: 5 * 60 * 1000,
  });
}
