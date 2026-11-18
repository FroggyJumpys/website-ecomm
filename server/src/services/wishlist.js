import { createWishlistStore } from '../db/wishlist.js';

/**
 * Wishlist service. It binds the store to the app's pool so the controllers
 * stay free of SQL, and gives the router one object to mount.
 */
export function createWishlistService(pool) {
  const store = createWishlistStore(pool);

  return {
    list: (userId) => store.list(userId),
    save: (userId, productId) => store.save(userId, productId),
    remove: (userId, productId) => store.remove(userId, productId),
  };
}
