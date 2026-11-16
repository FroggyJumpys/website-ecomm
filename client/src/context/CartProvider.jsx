import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartContext } from './cartContext.js';

/**
 * The cart lives in browser storage during the mock phase so a reload — or the
 * trip through /masuk that checkout requires — does not empty it. Step 04f
 * replaces this with `tbl_keranjang` and a guest-token merge on sign-in.
 */
const STORAGE_KEY = 'badekor.mock.cart';

function clampQuantity(quantity, stock) {
  const max = Math.max(1, stock);
  return Math.min(max, Math.max(1, quantity));
}

function readStoredItems() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (Array.isArray(parsed)) {
      return parsed.filter((item) => item && typeof item.key === 'string' && Number(item.quantity) > 0);
    }
  } catch {
    /* unreadable or blocked storage: start with an empty cart */
  }

  return [];
}

/**
 * Cart state for the mock phase. Items are keyed by product + variant so adding
 * the same sofa in two colours creates two lines, while adding the same variant
 * twice increases its quantity.
 */
export function CartProvider({ children }) {
  const [items, setItems] = useState(readStoredItems);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage blocked or full: the cart still works for this page load */
    }
  }, [items]);

  const addItem = useCallback((product, { color = '', size = '', quantity = 1 } = {}) => {
    setItems((current) => {
      const key = `${product.id}::${color}::${size}`;
      const stock = Number(product.stock) || 0;
      const existing = current.find((item) => item.key === key);

      if (existing) {
        return current.map((item) =>
          item.key === key
            ? { ...item, quantity: clampQuantity(item.quantity + quantity, stock) }
            : item
        );
      }

      return [
        ...current,
        {
          key,
          productId: product.id,
          slug: product.slug,
          name: product.name,
          image: product.image ?? product.images?.[0] ?? '',
          price: product.price,
          stock,
          color,
          size,
          quantity: clampQuantity(quantity, stock),
        },
      ];
    });
  }, []);

  const removeItem = useCallback((key) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const updateQuantity = useCallback((key, quantity) => {
    setItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, quantity: clampQuantity(quantity, item.stock) } : item
      )
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return { items, addItem, removeItem, updateQuantity, clear, count, subtotal };
  }, [items, addItem, removeItem, updateQuantity, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
