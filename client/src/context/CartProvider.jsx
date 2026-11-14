import { useCallback, useMemo, useState } from 'react';
import { CartContext } from './cartContext.js';

function clampQuantity(quantity, stock) {
  const max = Math.max(1, stock);
  return Math.min(max, Math.max(1, quantity));
}

/**
 * In-memory cart for the mock phase. Items are keyed by product + variant so
 * adding the same sofa in two colours creates two lines, while adding the same
 * variant twice increases its quantity.
 */
export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

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
