import { createContext, useContext } from 'react';

/**
 * Minimal cart store for the product page. Step 03g builds the cart page,
 * line editing and checkout on top of it; keeping the state here (instead of
 * inside the page) means those screens already have a single source of truth.
 *
 * `addItem` receives the full product plus the selected colour/size/quantity so
 * the line can be identified before the cart API exists in step 04f.
 */
export const CartContext = createContext(null);

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error('useCart must be used within a CartProvider.');
  }

  return context;
}
