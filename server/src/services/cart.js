import { createCartStore } from '../db/cart.js';

/**
 * Cart service. Binds the store to the app's pool so the controllers stay free
 * of SQL, and gives the router one object to mount.
 */
export function createCartService(pool) {
  const store = createCartStore(pool);

  return {
    read: (owner) => store.read(owner),
    add: (owner, item) => store.add(owner, item),
    updateQuantity: (owner, itemId, quantity) => store.updateQuantity(owner, itemId, quantity),
    remove: (owner, itemId) => store.remove(owner, itemId),
    clear: (owner) => store.clear(owner),
  };
}
