import { createAddressStore } from '../db/addresses.js';

/**
 * Address service. The only job here is to bind the store to the pool the app
 * was built with, so controllers stay free of SQL and of connection handling.
 */
export function createAddressService(pool) {
  const store = createAddressStore(pool);

  return {
    list: (userId) => store.list(userId),
    create: (userId, address) => store.create(userId, address),
    update: (userId, id, address) => store.update(userId, id, address),
    remove: (userId, id) => store.remove(userId, id),
    setDefault: (userId, id) => store.setDefault(userId, id),
  };
}
