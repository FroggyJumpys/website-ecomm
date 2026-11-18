import { parseQuery } from '../lib/validation.js';
import { productQuerySchema, relatedQuerySchema } from '../validators/catalog.js';
import {
  getProducts,
  getProduct,
  getRelatedProducts,
  getCategories,
  getBrands,
  getFilterOptions,
} from '../services/catalog.js';

/**
 * Catalogue controllers. Each one validates the query string, calls the
 * service and returns the `{ data, meta? }` envelope the client already reads.
 */

function poolOf(req) {
  return req.app.locals.pool;
}

/** GET /api/v1/products */
export async function indexProducts(req, res) {
  const filters = parseQuery(productQuerySchema, req.query);
  const result = await getProducts(poolOf(req), filters);

  res.status(200).json(result);
}

/** GET /api/v1/products/filters */
export async function indexFilters(req, res) {
  const options = await getFilterOptions(poolOf(req));

  res.status(200).json({ data: options });
}

/** GET /api/v1/products/:slug */
export async function showProduct(req, res) {
  const product = await getProduct(poolOf(req), req.params.slug);

  res.status(200).json({ data: product });
}

/** GET /api/v1/products/:slug/related */
export async function indexRelatedProducts(req, res) {
  const { limit } = parseQuery(relatedQuerySchema, req.query);
  const related = await getRelatedProducts(poolOf(req), req.params.slug, limit);

  res.status(200).json({ data: related });
}

/** GET /api/v1/categories */
export async function indexCategories(req, res) {
  const categories = await getCategories(poolOf(req));

  res.status(200).json({ data: categories });
}

/** GET /api/v1/brands */
export async function indexBrands(req, res) {
  const brands = await getBrands(poolOf(req));

  res.status(200).json({ data: brands });
}
