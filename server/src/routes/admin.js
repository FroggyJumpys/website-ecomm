import { Router } from 'express';
import { createRequireAuth, requireRole } from '../middleware/auth.js';
import { createVerifyAdminOrigin } from '../middleware/admin-origin.js';
import {
  createImageWorkLimiter,
  createUploadController,
  createUploadLimiter,
  parseMultipart,
} from '../controllers/admin-uploads.js';
import { createAdminControllers } from '../controllers/admin-catalog.js';
import { createAdminOrderControllers } from '../controllers/admin-orders.js';
import { createAdminCatalogService } from '../services/admin-catalog.js';
import { createAdminOrderService } from '../services/admin-orders.js';
import { createImageStore } from '../services/admin-storage.js';

/**
 * `/api/v1/admin` — the staff-only surface.
 *
 * Every route here is behind three gates, in this order:
 *
 *  1. `requireAuth` re-reads the account from the database, so a demoted or
 *     deleted account cannot keep using a token issued while it was an admin;
 *  2. `requireRole('admin')` reads the role from that row, never from the token;
 *  3. `verifyAdminOrigin` refuses a write a browser reports as cross-site.
 *
 * The order matters for uploads in particular: the auth gates run before the
 * multipart parser and before any file is written, so a refused request costs
 * no disk and no decode.
 *
 * Routes are mounted behind the gates for reads as well, on purpose: the admin
 * list shows hidden products and every customer's orders, so there is no
 * version of these endpoints that is safe to serve publicly.
 */
export function createAdminRouter({
  pool,
  uploadDir,
  publicImageDir,
  clientOrigin,
  uploadLimit,
  uploadWindowMs,
}) {
  const router = Router();
  const imageStore = createImageStore({ rootDir: uploadDir });
  const uploads = createUploadController(imageStore, { uploadDir });
  const controllers = createAdminControllers(createAdminCatalogService(pool, { publicImageDir }));
  const orderControllers = createAdminOrderControllers(createAdminOrderService(pool));

  router.use(
    createRequireAuth(pool),
    requireRole('admin'),
    createVerifyAdminOrigin({ clientOrigin })
  );

  router.get('/products', controllers.products.index);
  router.get('/products/:id', controllers.products.show);
  router.post('/products', controllers.products.create);
  router.patch('/products/:id', controllers.products.update);
  router.delete('/products/:id', controllers.products.remove);

  router.get('/categories', controllers.categories.index);
  router.post('/categories', controllers.categories.create);
  router.patch('/categories/:id', controllers.categories.update);
  router.delete('/categories/:id', controllers.categories.remove);

  router.get('/brands', controllers.brands.index);
  router.post('/brands', controllers.brands.create);
  router.patch('/brands/:id', controllers.brands.update);
  router.delete('/brands/:id', controllers.brands.remove);

  router.get('/orders', orderControllers.index);
  router.get('/orders/:orderNumber', orderControllers.show);
  router.patch('/orders/:orderNumber/status', orderControllers.updateStatus);

  const uploadLimiter = createUploadLimiter({
    limitPerWindow: uploadLimit,
    windowMs: uploadWindowMs,
  });
  const imageWorkLimiter = createImageWorkLimiter();

  router.post('/uploads', uploadLimiter, parseMultipart, imageWorkLimiter, uploads.upload);

  return router;
}
