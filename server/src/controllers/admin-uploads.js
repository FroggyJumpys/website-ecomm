import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../lib/errors.js';
import { MEDIA_FILENAME_PATTERN } from '../services/admin-storage.js';

/**
 * The upload endpoint and the media route.
 *
 * Uploads are handled entirely in memory: the file never lands on disk until
 * `sharp` has decoded it and re-encoded it as WebP, which is what makes a
 * hostile input unable to occupy a path in the upload directory. The write
 * itself is atomic inside the image store.
 *
 * Two limits sit in front of the encoder. The rate limiter stops one admin
 * account from filling the disk, and the work limiter stops a burst from
 * starting more `sharp` jobs than the process can hold, because image decoding
 * is the most memory-hungry thing this server does.
 */

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const FILE_REQUIRED_MESSAGE = 'Pilih gambar yang ingin diunggah.';
const TOO_LARGE_MESSAGE = 'Gambar terlalu besar. Maksimal 5 MB.';
const UNEXPECTED_FIELD_MESSAGE = 'Unggah satu gambar saja lewat kolom gambar.';

/**
 * Wraps multer's callback API so its own error codes become the API's codes.
 *
 * Multer reports a missing file by leaving `req.file` undefined; every other
 * failure arrives as an `MulterError` whose code decides the response.
 */
function parseMultipart(req, res, next) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 2 },
  }).single('image');

  upload(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'UPLOAD_TOO_LARGE', TOO_LARGE_MESSAGE));
      }

      return next(new AppError(422, 'UPLOAD_FILE_REQUIRED', UNEXPECTED_FIELD_MESSAGE));
    }

    return next(error);
  });
}

/**
 * Per-admin upload budget.
 *
 * Keyed on the account rather than the IP: an office behind one NAT would share
 * an IP budget, and an attacker with many addresses would not be slowed at all.
 * `requireAuth` is always mounted first, so `req.user` is guaranteed here.
 */
export function createUploadLimiter({ limitPerWindow = 20, windowMs = 15 * 60 * 1000 } = {}) {
  return rateLimit({
    windowMs,
    limit: limitPerWindow,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `admin-upload:${req.user.id}`,
    handler: (_req, _res, next) => {
      next(
        new AppError(
          429,
          'TOO_MANY_UPLOADS',
          'Terlalu banyak unggahan. Coba lagi beberapa menit lagi.'
        )
      );
    },
  });
}

/**
 * Caps how many images are being encoded at once.
 *
 * `sharp` already uses a thread pool, but a burst of large decodes can still
 * exhaust memory; queueing here keeps the process responsive for everybody else
 * and turns a genuine overload into a `503` the panel can retry rather than an
 * out-of-memory crash. Requests that cannot be queued are refused immediately
 * instead of waiting for a slot that may never come.
 */
export function createImageWorkLimiter({ maxConcurrent = 2, maxQueued = 4 } = {}) {
  let running = 0;
  const queue = [];

  function release() {
    running -= 1;

    const next = queue.shift();
    if (next) next();
  }

  return function limitImageWork(req, res, next) {
    if (running < maxConcurrent) {
      running += 1;
      res.on('close', release);
      return next();
    }

    if (queue.length >= maxQueued) {
      return next(
        new AppError(503, 'UPLOAD_BUSY', 'Server sedang sibuk. Coba unggah lagi sebentar lagi.')
      );
    }

    queue.push(() => {
      running += 1;
      res.on('close', release);
      next();
    });
  };
}

export function createUploadController(imageStore, { uploadDir }) {
  return {
    /** POST /api/v1/admin/uploads */
    async upload(req, res) {
      if (!req.file?.buffer?.length) {
        throw new AppError(422, 'UPLOAD_FILE_REQUIRED', FILE_REQUIRED_MESSAGE);
      }

      const saved = await imageStore.save(req.file.buffer);

      res.status(201).json({
        data: {
          path: saved.path,
          width: saved.width,
          height: saved.height,
          size: saved.size,
        },
      });
    },

    /**
     * GET /api/v1/media/catalog/:filename
     *
     * The filename is checked against the generated pattern *before* it is
     * joined to a path, so `..`, a nested path or a differently named file can
     * never reach the filesystem. The directory listing is never exposed: the
     * only files reachable here are the ones the upload endpoint named.
     */
    showMedia(req, res, next) {
      const { filename } = req.params;

      if (!MEDIA_FILENAME_PATTERN.test(filename)) {
        return next(new AppError(404, 'MEDIA_NOT_FOUND', 'Gambar ini tidak ditemukan.'));
      }

      const file = path.join(uploadDir, filename);

      res.set({
        'Content-Type': 'image/webp',
        'X-Content-Type-Options': 'nosniff',
        // Immutable: the name is a UUID, so a changed image is a new URL.
        'Cache-Control': 'public, max-age=31536000, immutable',
      });

      res.sendFile(file, (error) => {
        if (!error) return;

        if (error.code === 'ENOENT') {
          return next(new AppError(404, 'MEDIA_NOT_FOUND', 'Gambar ini tidak ditemukan.'));
        }

        return next(error);
      });
    },
  };
}

/**
 * Timing-safe existence probe used by the catalogue service before a product
 * save accepts an upload path. A missing file is reported as a validation
 * error on the field the operator can fix.
 */
export async function mediaFileExists(uploadDir, filename) {
  if (!MEDIA_FILENAME_PATTERN.test(filename)) return false;

  try {
    await fs.promises.access(path.join(uploadDir, filename), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export { parseMultipart };
