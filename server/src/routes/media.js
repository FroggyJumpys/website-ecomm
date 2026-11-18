import { Router } from 'express';
import { AppError } from '../lib/errors.js';
import { createUploadController } from '../controllers/admin-uploads.js';
import { createImageStore } from '../services/admin-storage.js';

/**
 * `/api/v1/media` — public read-only access to uploaded catalogue images.
 *
 * Deliberately unauthenticated: a product photo is shown on the storefront, in
 * an order confirmation and in the admin panel, and every one of those is an
 * `<img src>` that cannot carry a session header. The route is safe to expose
 * because filenames are server-generated UUIDs and the pattern check refuses
 * anything else, so the set of reachable files is exactly the set the upload
 * endpoint created.
 */
export function createMediaRouter({ uploadDir }) {
  const router = Router();
  const imageStore = createImageStore({ rootDir: uploadDir });
  const controller = createUploadController(imageStore, { uploadDir });

  router.get('/catalog/:filename', controller.showMedia);

  /**
   * Anything else under `/media` is the same answer as a bad filename.
   *
   * Express normalises `..` segments in the URL before routing, so a traversal
   * attempt does not even reach `:filename` — it lands here. Reporting
   * `MEDIA_NOT_FOUND` rather than the generic `NOT_FOUND` keeps the media
   * surface answering with one code and confirms no file was read.
   */
  router.use((_req, _res, next) => {
    next(new AppError(404, 'MEDIA_NOT_FOUND', 'Gambar ini tidak ditemukan.'));
  });

  return router;
}
