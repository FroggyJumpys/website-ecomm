import { createContext, useContext } from 'react';

/**
 * Cart access for every screen that touches it: the product page, the header
 * count, the cart page and checkout. `CartProvider` keeps the server snapshot
 * in one React Query entry, so those screens cannot disagree about a line.
 *
 * `addItem` receives the full product plus the selected colour/size/quantity;
 * the provider sends only the ids the API accepts.
 */
export const CartContext = createContext(null);

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error('useCart must be used within a CartProvider.');
  }

  return context;
}
