import { AppError } from '../lib/errors.js';
import {
  listProducts,
  findProductBySlug,
  listRelatedProducts,
  listCategories,
  listBrands,
  listFilterOptions,
} from '../db/catalog.js';

/**
 * Catalogue services. Thin by design: the shape translation lives in the query
 * layer, so a controller gets exactly the JSON body it returns.
 */

export function getProducts(pool, filters) {
  return listProducts(pool, filters);
}

export function getCategories(pool) {
  return listCategories(pool);
}

export function getBrands(pool) {
  return listBrands(pool);
}

export function getFilterOptions(pool) {
  return listFilterOptions(pool);
}

/** 404 rather than an empty body: a missing product is a real not-found. */
export async function getProduct(pool, slug) {
  const product = await findProductBySlug(pool, slug);

  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Produk tidak ditemukan.');
  }

  return product;
}

/**
 * A missing source product is not an error here: the detail page only asks for
 * related products once it has a product, and a stale slug should leave the
 * rail empty rather than break the page.
 */
export async function getRelatedProducts(pool, slug, limit) {
  return listRelatedProducts(pool, slug, limit);
}
