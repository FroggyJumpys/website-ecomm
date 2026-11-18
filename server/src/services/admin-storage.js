import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { AppError } from '../lib/errors.js';

/**
 * Local image storage for the admin catalogue.
 *
 * Uploads are the only place this API accepts bytes from outside, so the
 * pipeline is deliberately lossy: every file is decoded, rotated by its EXIF
 * orientation, metadata-stripped, resized and re-encoded as WebP. Nothing of
 * the original survives, which means an SVG carrying script, a polyglot that
 * passes a magic-byte check, or a JPEG with an embedded payload cannot reach
 * the browser through the media route.
 *
 * The filename is generated, never derived from the upload, so a hostile
 * filename has no path to influence. Writes are atomic: the bytes land in a
 * `.tmp` file first and are renamed into place, so a failed encode never leaves
 * a half-written `.webp` for the media route to serve.
 */

/** What the media route will serve; also the only name `save` produces. */
export const MEDIA_FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

/** The public URL prefix the API advertises for stored images. */
export const MEDIA_PUBLIC_PREFIX = '/api/v1/media/catalog';

const MAX_OUTPUT_SIDE = 2000;
const MAX_INPUT_SIDE = 8192;
const MAX_INPUT_PIXELS = 16_000_000;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

const INVALID_MESSAGE =
  'Berkas ini bukan gambar JPG, PNG, atau WebP yang bisa dipakai. Coba unggah gambar lain.';
const TOO_LARGE_MESSAGE = 'Gambar terlalu besar. Maksimal 5 MB dan 2000 piksel per sisi.';

function invalid(status = 422, code = 'UPLOAD_INVALID_IMAGE', message = INVALID_MESSAGE) {
  return new AppError(status, code, message);
}

/** The default upload root: `server/uploads/catalog`, next to the source tree. */
export function defaultUploadRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads', 'catalog');
}

/**
 * Decodes, validates and re-encodes. Split from `save` so the checks read as
 * one ordered list rather than being interleaved with file handling.
 */
async function toWebp(buffer, process) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw invalid();

  let pipeline;

  try {
    // `limitInputPixels` is the decoder's own guard; it runs before the image
    // is materialised, so a packed-pixel bomb fails without exhausting memory.
    pipeline = process(buffer, { limitInputPixels: MAX_INPUT_PIXELS });
    const metadata = await pipeline.metadata();

    if (!ACCEPTED_FORMATS.has(metadata.format)) throw invalid();
    // An animated WebP would silently keep only its first frame; refuse it
    // rather than return a still the operator did not upload.
    if ((metadata.pages ?? 1) > 1) throw invalid();
    if (!metadata.width || !metadata.height) throw invalid();
    if (metadata.width > MAX_INPUT_SIDE || metadata.height > MAX_INPUT_SIDE) {
      throw invalid(413, 'UPLOAD_TOO_LARGE', TOO_LARGE_MESSAGE);
    }
    if (metadata.width * metadata.height > MAX_INPUT_PIXELS) {
      throw invalid(413, 'UPLOAD_TOO_LARGE', TOO_LARGE_MESSAGE);
    }

    const output = await pipeline
      .rotate()
      .resize({
        width: MAX_OUTPUT_SIDE,
        height: MAX_OUTPUT_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    return output;
  } catch (error) {
    if (error instanceof AppError) throw error;

    // Anything `sharp` throws — corrupt bytes, an unsupported container, a
    // pixel-limit trip — is a client error, never a 500.
    if (error.message?.includes('pixel limit'))
      throw invalid(413, 'UPLOAD_TOO_LARGE', TOO_LARGE_MESSAGE);

    throw invalid();
  }
}

export function createImageStore({ rootDir = defaultUploadRoot(), process = sharp } = {}) {
  let ready;

  async function ensureDir() {
    if (!ready) ready = fs.mkdir(rootDir, { recursive: true });
    return ready;
  }

  return {
    /** Where the files actually live; the media route serves from here. */
    rootDir,

    /**
     * Stores one image and returns what the client needs: the URL path to save
     * on the product, plus the dimensions and byte size for the response.
     */
    async save(buffer) {
      await ensureDir();

      const { data, info } = await toWebp(buffer, process);
      const filename = `${randomUUID()}.webp`;
      const target = path.join(rootDir, filename);
      const temporary = `${target}.tmp`;

      try {
        // `wx` fails if the name somehow exists, rather than clobbering it.
        await fs.writeFile(temporary, data, { flag: 'wx' });
        await fs.rename(temporary, target);
      } catch (error) {
        await fs.rm(temporary, { force: true });
        throw error;
      }

      const stat = await fs.stat(target);

      return {
        filename,
        path: `${MEDIA_PUBLIC_PREFIX}/${filename}`,
        width: info.width,
        height: info.height,
        size: stat.size,
      };
    },
  };
}
