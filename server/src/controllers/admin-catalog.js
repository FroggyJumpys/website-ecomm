import { parseBody, parseQuery } from '../lib/validation.js';
import {
  adminIdParamsSchema,
  brandPatchSchema,
  brandSchema,
  categoryPatchSchema,
  categorySchema,
  productCreateSchema,
  productDeleteSchema,
  productListQuerySchema,
  productPatchSchema,
} from '../validators/admin.js';

/**
 * Admin catalogue controllers: HTTP only.
 *
 * Each handler validates in the same order — route id, then body or query, then
 * the service — so a malformed URL is reported before a malformed payload, and
 * nothing reaches the database on either failure. The route id goes through
 * `parseBody` rather than `parseParams` because `req.params` is already an
 * object; the schema wraps it so the error still names the field `id`.
 *
 * The response statuses are the contract step 05 binds to: `201` only for a
 * creation, `200` for reads, updates and deletes, and a delete answers with
 * `{ data: null }` so the panel has one envelope shape to unwrap everywhere.
 */
export function createAdminControllers(service) {
  /** Route ids are strings; this turns one into a number or throws a 422. */
  function idFrom(params) {
    return parseBody(adminIdParamsSchema, { id: params.id }).id;
  }

  return {
    products: {
      /** GET /admin/products */
      async index(req, res) {
        const filters = parseQuery(productListQuerySchema, req.query);
        const { data, meta } = await service.listProducts(filters);

        res.status(200).json({ data, meta });
      },

      /** GET /admin/products/:id */
      async show(req, res) {
        const id = idFrom(req.params);
        const product = await service.getProduct(id);

        res.status(200).json({ data: product });
      },

      /** POST /admin/products */
      async create(req, res) {
        const input = parseBody(productCreateSchema, req.body);
        const product = await service.createProduct(input);

        res.status(201).json({ data: product });
      },

      /** PATCH /admin/products/:id */
      async update(req, res) {
        const id = idFrom(req.params);
        const patch = parseBody(productPatchSchema, req.body);
        const { expectedVersion, ...fields } = patch;
        const product = await service.updateProduct(id, fields, expectedVersion);

        res.status(200).json({ data: product });
      },

      /** DELETE /admin/products/:id */
      async remove(req, res) {
        const id = idFrom(req.params);
        const { expectedVersion } = parseBody(productDeleteSchema, req.body);

        await service.removeProduct(id, expectedVersion);

        res.status(200).json({ data: null });
      },
    },

    categories: {
      /** GET /admin/categories, and the brand selector in the same response. */
      async index(_req, res) {
        const { categories } = await service.listTaxonomy();

        res.status(200).json({ data: categories });
      },

      /** POST /admin/categories */
      async create(req, res) {
        const input = parseBody(categorySchema, req.body);
        const category = await service.createCategory(input);

        res.status(201).json({ data: category });
      },

      /** PATCH /admin/categories/:id */
      async update(req, res) {
        const id = idFrom(req.params);
        const patch = parseBody(categoryPatchSchema, req.body);
        const category = await service.updateCategory(id, patch);

        res.status(200).json({ data: category });
      },

      /** DELETE /admin/categories/:id */
      async remove(req, res) {
        const id = idFrom(req.params);
        await service.removeCategory(id);

        res.status(200).json({ data: null });
      },
    },

    brands: {
      /** GET /admin/brands */
      async index(_req, res) {
        const { brands } = await service.listTaxonomy();

        res.status(200).json({ data: brands });
      },

      /** POST /admin/brands */
      async create(req, res) {
        const input = parseBody(brandSchema, req.body);
        const brand = await service.createBrand(input);

        res.status(201).json({ data: brand });
      },

      /** PATCH /admin/brands/:id */
      async update(req, res) {
        const id = idFrom(req.params);
        const patch = parseBody(brandPatchSchema, req.body);
        const brand = await service.updateBrand(id, patch);

        res.status(200).json({ data: brand });
      },

      /** DELETE /admin/brands/:id */
      async remove(req, res) {
        const id = idFrom(req.params);
        await service.removeBrand(id);

        res.status(200).json({ data: null });
      },
    },
  };
}
