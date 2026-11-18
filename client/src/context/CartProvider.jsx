import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CartContext } from './cartContext.js';
import {
  addCartItem,
  clearCart,
  fetchCart,
  removeCartItem,
  updateCartItemQuantity,
} from '../services/cart.js';

/**
 * Server-backed cart.
 *
 * The Express cart is the source of truth: a guest is identified by an
 * httpOnly cookie the first successful write sets, and a signed-in customer by
 * the session cookie. Every mutation answers with the whole cart, which is
 * written straight into the React Query cache, so the header count, the cart
 * page and checkout all read one snapshot.
 *
 * The UI keeps addressing lines by their stable `key` (`product::color::size`),
 * while the API addresses them by item id; the provider does that translation
 * so the existing screens do not have to know about ids.
 */
export function CartProvider({ children }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['cart'],
    queryFn: fetchCart,
    staleTime: 0,
  });

  const storeCart = useCallback(
    (payload) => {
      if (payload?.data) queryClient.setQueryData(['cart'], payload);
      return payload;
    },
    [queryClient]
  );

  const addMutation = useMutation({ mutationFn: addCartItem, onSuccess: storeCart });
  const quantityMutation = useMutation({
    mutationFn: updateCartItemQuantity,
    onSuccess: storeCart,
  });
  const removeMutation = useMutation({ mutationFn: removeCartItem, onSuccess: storeCart });
  const clearMutation = useMutation({ mutationFn: clearCart, onSuccess: storeCart });

  const items = useMemo(() => query.data?.data?.items ?? [], [query.data]);

  const addItem = useCallback(
    (product, { color = '', size = '', quantity = 1 } = {}) =>
      addMutation.mutateAsync({ productId: product.id, color, size, quantity }),
    [addMutation]
  );

  const updateQuantity = useCallback(
    (key, quantity) => {
      const item = items.find((line) => line.key === key);

      if (!item) {
        return Promise.reject(new Error('Baris keranjang tidak ditemukan. Muat ulang halaman.'));
      }

      return quantityMutation.mutateAsync({ id: item.id, quantity });
    },
    [items, quantityMutation]
  );

  const removeItem = useCallback(
    (key) => {
      const item = items.find((line) => line.key === key);

      if (!item) {
        return Promise.reject(new Error('Baris keranjang tidak ditemukan. Muat ulang halaman.'));
      }

      return removeMutation.mutateAsync(item.id);
    },
    [items, removeMutation]
  );

  const clear = useCallback(() => clearMutation.mutateAsync(), [clearMutation]);

  /** Re-read after login (guest merge) or checkout (server emptied it). */
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
    [queryClient]
  );

  const value = useMemo(() => {
    const cart = query.data?.data;

    return {
      items,
      count: cart?.count ?? 0,
      subtotal: cart?.subtotal ?? 0,
      canCheckout: cart?.canCheckout ?? false,
      addItem,
      updateQuantity,
      removeItem,
      clear,
      refresh,
      isPending: query.isPending,
      isError: query.isError,
      error: query.error,
      refetch: query.refetch,
      mutating:
        addMutation.isPending ||
        quantityMutation.isPending ||
        removeMutation.isPending ||
        clearMutation.isPending,
    };
  }, [
    items,
    query.data,
    query.isPending,
    query.isError,
    query.error,
    query.refetch,
    addItem,
    updateQuantity,
    removeItem,
    clear,
    refresh,
    addMutation.isPending,
    quantityMutation.isPending,
    removeMutation.isPending,
    clearMutation.isPending,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
