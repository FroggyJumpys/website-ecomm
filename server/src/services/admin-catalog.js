import { createAdminCatalogStore } from '../db/admin-catalog.js';
import { createAdminProductStore } from '../db/admin-products.js';
import { createAdminTaxonomyStore } from '../db/admin-taxonomy.js';
import { createCatalogImagePolicy } from '../lib/catalogImages.js';

/**
 * Admin catalogue service.
 *
 * The service is thin on purpose. Every write that needs a lock, a version
 * check or a slug allocation lives in the `db/` stores, because those decisions
 * have to happen inside one transaction and cannot be expressed in JavaScript
 * safely. What is left here is the work that spans a store and something else:
 *
 *  - image **existence**, which needs the filesystem and therefore cannot live
 *    in a Zod schema;
 *  - the split between "list products" and "list the taxonomy selectors",
 *    which are two different reads with different shapes;
 *  - binding one pool to all three stores so the HTTP layer never sees them.
 *
 * The image policy runs before any write. A path that is well-formed but points
 * at nothing is the one validation failure a schema cannot catch, and letting
 * it through would store a product whose picture is a broken link.
 */
export function createAdminCatalogService(pool, { publicImageDir } = {}) {
  const catalog = createAdminCatalogStore(pool);
  const products = createAdminProductStore(pool);
  const taxonomy = createAdminTaxonomyStore(pool);
  const images = createCatalogImagePolicy({ publicImageRoot: publicImageDir });

  return {
    /** GET /admin/products */
    listProducts(filters) {
      return catalog.listProducts(filters);
    },

    /** GET /admin/products/:id */
    getProduct(id) {
      return catalog.getProduct(id);
    },

    /** POST /admin/products */
    async createProduct(input) {
      await images.assertImages(input.images);
      return products.create(input);
    },

    /** PATCH /admin/products/:id */
    async updateProduct(id, patch, expectedVersion) {
      if (patch.images) await images.assertImages(patch.images);
      return products.update(id, patch, expectedVersion);
    },

    /** DELETE /admin/products/:id */
    removeProduct(id, expectedVersion) {
      return products.remove(id, expectedVersion);
    },

    /** GET /admin/categories and GET /admin/brands, in one call for the selectors. */
    async listTaxonomy() {
      const [categories, brands] = await Promise.all([
        catalog.listCategories(),
        catalog.listBrands(),
      ]);

      return { categories, brands };
    },

    async createCategory(input) {
      await images.assertImage(input.image);
      return taxonomy.createCategory(input);
    },

    async updateCategory(id, patch) {
      if (patch.image !== undefined) await images.assertImage(patch.image);
      return taxonomy.updateCategory(id, patch);
    },

    removeCategory(id) {
      return taxonomy.removeCategory(id);
    },

    async createBrand(input) {
      return taxonomy.createBrand(input);
    },

    updateBrand(id, patch) {
      return taxonomy.updateBrand(id, patch);
    },

    removeBrand(id) {
      return taxonomy.removeBrand(id);
    },
  };
}
