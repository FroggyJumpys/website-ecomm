import { Router } from 'express';
import {
  indexProducts,
  indexFilters,
  showProduct,
  indexRelatedProducts,
  indexCategories,
  indexBrands,
} from '../controllers/catalog.js';

/**
 * Public catalogue routes: `/products`, `/products/filters`,
 * `/products/:slug`, `/products/:slug/related`, `/categories` and `/brands`.
 *
 * No session is required to browse. Like the frontend mock, a product that is
 * not active is treated as missing, so `is_active` is enforced in SQL rather
 * than here.
 *
 * `/products/filters` is registered before `/products/:slug`, otherwise
 * Express would read "filters" as a slug.
 */
export function createCatalogRouter() {
  const router = Router();

  router.get('/categories', indexCategories);
  router.get('/brands', indexBrands);

  router.get('/products', indexProducts);
  router.get('/products/filters', indexFilters);
  router.get('/products/:slug/related', indexRelatedProducts);
  router.get('/products/:slug', showProduct);

  return router;
}
