import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/authContext.js';
import {
  createBrand,
  createCategory,
  createProduct,
  deleteBrand,
  deleteCategory,
  deleteProduct,
  fetchAdminOrder,
  fetchAdminOrders,
  fetchAdminProducts,
  fetchAdminTaxonomy,
  updateAdminOrderStatus,
  updateBrand,
  updateCategory,
  updateProduct,
} from '../services/admin.js';

/**
 * Admin server-state. Queries only run for an admin, so a customer session
 * never spends a request on a 403.
 */

export function useAdminOrders() {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['admin', 'orders'],
    queryFn: fetchAdminOrders,
    enabled: isAdmin,
  });
}

export function useAdminOrder(orderNumber) {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['admin', 'order', orderNumber],
    queryFn: () => fetchAdminOrder(orderNumber),
    enabled: isAdmin && Boolean(orderNumber),
  });
}

/**
 * A status change touches the order list, the order itself and the customer's
 * own history, so all three are refreshed rather than patched by hand.
 */
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAdminOrderStatus,
    onSuccess: (_payload, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'order', variables.orderNumber] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useAdminProducts() {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['admin', 'products'],
    queryFn: fetchAdminProducts,
    enabled: isAdmin,
  });
}

export function useAdminTaxonomy() {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['admin', 'taxonomy'],
    queryFn: fetchAdminTaxonomy,
    enabled: isAdmin,
  });
}

/**
 * A catalogue change is visible in two places — the panel and the storefront —
 * so every mutation refreshes both sets of queries.
 */
function useCatalogMutation(mutationFn) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const key of ['products', 'product', 'categories', 'brands', 'admin']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export function useCreateProduct() {
  return useCatalogMutation(createProduct);
}

export function useUpdateProduct() {
  return useCatalogMutation(updateProduct);
}

export function useDeleteProduct() {
  return useCatalogMutation(deleteProduct);
}

export function useCreateCategory() {
  return useCatalogMutation(createCategory);
}

export function useUpdateCategory() {
  return useCatalogMutation(updateCategory);
}

export function useDeleteCategory() {
  return useCatalogMutation(deleteCategory);
}

export function useCreateBrand() {
  return useCatalogMutation(createBrand);
}

export function useUpdateBrand() {
  return useCatalogMutation(updateBrand);
}

export function useDeleteBrand() {
  return useCatalogMutation(deleteBrand);
}

/**
 * The create/update/delete triple for a category or a brand. One hook so the
 * shared panel can switch kind without calling hooks conditionally.
 */
export function useTaxonomyMutations(kind) {
  const categoryCreate = useCreateCategory();
  const categoryUpdate = useUpdateCategory();
  const categoryDelete = useDeleteCategory();
  const brandCreate = useCreateBrand();
  const brandUpdate = useUpdateBrand();
  const brandDelete = useDeleteBrand();

  return kind === 'category'
    ? { create: categoryCreate, update: categoryUpdate, remove: categoryDelete }
    : { create: brandCreate, update: brandUpdate, remove: brandDelete };
}
