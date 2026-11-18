import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors.js';

/**
 * Which image paths a catalogue record may reference.
 *
 * Two shapes are allowed, and nothing else:
 *
 *  - a seeded storefront asset under `/images/`, which the client already
 *    serves from `client/public/images`;
 *  - a file produced by the upload endpoint, `/api/v1/media/catalog/<uuid>.webp`.
 *
 * That deliberately excludes external URLs, protocol-relative URLs, query and
 * fragment suffixes, backslashes and any `..` segment. The API never fetches a
 * remote image, so a stored path can only ever point at a file this project
 * produced or ships.
 */

const IMAGE_MESSAGE = 'Gunakan path gambar yang diawali /images/ atau hasil unggahan.';

/** `/images/<segments>.<jpg|jpeg|png|webp>` with no empty, `.` or `..` segment. */
const SEEDED_IMAGE_PATTERN =
  /^\/images\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/;

/** A generated upload path; the filename is the only part the media route trusts. */
const UPLOAD_IMAGE_PATTERN =
  /^\/api\/v1\/media\/catalog\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

const MAX_PATH_LENGTH = 512;

export function catalogImagePath(value) {
  const path = typeof value === 'string' ? value.trim() : '';

  if (path.length === 0 || path.length > MAX_PATH_LENGTH) throw invalidImage();

  // Reject the traversal forms before the shape check, so an accepted-looking
  // prefix like `/images/` cannot smuggle a `..` segment through.
  if (path.includes('..') || path.includes('\\') || path.includes('\0')) throw invalidImage();
  if (path.includes('?') || path.includes('#')) throw invalidImage();

  if (!SEEDED_IMAGE_PATTERN.test(path) && !UPLOAD_IMAGE_PATTERN.test(path)) throw invalidImage();

  return path;
}

function invalidImage() {
  return new AppError(422, 'VALIDATION_ERROR', IMAGE_MESSAGE, {
    field: 'image',
    message: IMAGE_MESSAGE,
  });
}

/** A categorised path with the field name the caller's form uses. */
export function catalogImagePathFor(field) {
  return (value) => {
    try {
      return catalogImagePath(value);
    } catch (error) {
      if (error instanceof AppError) {
        throw new AppError(422, 'VALIDATION_ERROR', IMAGE_MESSAGE, {
          field,
          message: IMAGE_MESSAGE,
        });
      }

      throw error;
    }
  };
}

const MISSING_MESSAGE =
  'Gambar ini tidak ditemukan di server. Unggah ulang atau pilih gambar lain.';

/**
 * Checks that a stored image path really points at a file.
 *
 * The format check in `catalogImagePath` runs in the validator and cannot see
 * the disk, so a path can be well-formed and still be a typo. This is the layer
 * that notices: a seeded `/images/...` path must resolve to a file under the
 * client's image directory, and an upload path must resolve to one of the
 * generated UUID names.
 *
 * Upload paths are accepted on their filename alone. Their directory is written
 * only by the upload endpoint, and a file that has since been deleted is a
 * broken link rather than a security problem — refusing here would also make
 * every product unsavable on a deployment that prunes old uploads.
 */
export function createCatalogImagePolicy({ publicImageRoot } = {}) {
  /** True when `relative` resolves inside `root` and the file is readable. */
  async function seededFileExists(relative) {
    if (!publicImageRoot) return false;

    const root = path.resolve(publicImageRoot);
    const target = path.resolve(root, relative);

    // Defence in depth: `catalogImagePath` already rejects `..`, but a resolved
    // path outside the root must never be read even if that check changes.
    if (target !== root && !target.startsWith(root + path.sep)) return false;

    try {
      await fs.access(target, fs.constants.R_OK);
      return true;
    } catch {
      // A missing directory means the client has not been built yet; that is a
      // "missing" answer, not a server fault.
      return false;
    }
  }

  async function assertPath(value, field) {
    if (UPLOAD_IMAGE_PATTERN.test(value)) return;

    if (await seededFileExists(value.slice('/images/'.length))) return;

    throw new AppError(422, 'VALIDATION_ERROR', MISSING_MESSAGE, {
      field,
      message: MISSING_MESSAGE,
    });
  }

  return {
    /** For `images: string[]` on a product. */
    async assertImages(values) {
      for (const value of values) await assertPath(value, 'images');
    },

    /** For the single `image` on a category; an empty value is allowed. */
    async assertImage(value) {
      if (!value) return;
      await assertPath(value, 'image');
    },
  };
}
