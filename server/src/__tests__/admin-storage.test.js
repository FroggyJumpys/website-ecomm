import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createImageStore, MEDIA_FILENAME_PATTERN } from '../services/admin-storage.js';

/**
 * Image storage.
 *
 * This is the one place in the API that accepts bytes from outside, so the
 * tests are about what it refuses as much as what it produces: an SVG can carry
 * script, a polyglot file can pass a magic-byte check, and a packed-pixel image
 * can exhaust memory during decoding. Everything is re-encoded through `sharp`
 * into WebP precisely so that none of the original bytes survive, and the
 * output filename is generated so a hostile original name can never choose a
 * path.
 *
 * The directory is a real temporary one: a mocked filesystem would not prove
 * the atomic write or the cleanup-on-failure behaviour that protects it from
 * leaving half-written files behind.
 */

let rootDir;
let store;

async function listFiles() {
  try {
    return (await fs.readdir(rootDir)).sort();
  } catch {
    return [];
  }
}

/** A PNG of the requested size, optionally carrying EXIF metadata. */
async function png({ width = 10, height = 10, withExif = false } = {}) {
  let image = sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 80, b: 40 } },
  }).png();

  if (withExif) {
    image = image.withMetadata({
      exif: {
        IFD0: { Copyright: 'BaDekor', Software: 'unit-test' },
        GPS: { GPSLatitudeRef: 'S', GPSLatitude: '3/1 19/1 0/1' },
      },
    });
  }

  return image.toBuffer();
}

async function jpeg({ width = 10, height = 10 } = {}) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 90, b: 200 } },
  })
    .jpeg()
    .toBuffer();
}

async function webp({ width = 10, height = 10 } = {}) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .webp()
    .toBuffer();
}

beforeAll(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'badekor-images-'));
});

beforeEach(async () => {
  await fs.rm(rootDir, { recursive: true, force: true });
  await fs.mkdir(rootDir, { recursive: true });
  store = createImageStore({ rootDir });
});

afterAll(async () => {
  await fs.rm(rootDir, { recursive: true, force: true });
});

describe('save', () => {
  it('re-encodes a PNG to WebP under a generated name', async () => {
    const saved = await store.save(await png());

    expect(saved.filename).toMatch(MEDIA_FILENAME_PATTERN);
    expect(saved.path).toBe(`/api/v1/media/catalog/${saved.filename}`);
    expect(saved.width).toBe(10);
    expect(saved.height).toBe(10);
    expect(saved.size).toBeGreaterThan(0);

    const bytes = await fs.readFile(path.join(rootDir, saved.filename));
    expect(bytes.length).toBe(saved.size);

    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(10);
    expect(metadata.height).toBe(10);
  });

  it('accepts JPEG and WebP input', async () => {
    const fromJpeg = await store.save(await jpeg());
    const fromWebp = await store.save(await webp());

    for (const saved of [fromJpeg, fromWebp]) {
      const metadata = await sharp(
        await fs.readFile(path.join(rootDir, saved.filename))
      ).metadata();
      expect(metadata.format).toBe('webp');
    }

    expect(await listFiles()).toHaveLength(2);
  });

  it('strips EXIF and GPS metadata', async () => {
    const saved = await store.save(await png({ withExif: true }));
    const metadata = await sharp(await fs.readFile(path.join(rootDir, saved.filename))).metadata();

    // A shop does not need to republish the photographer's GPS coordinates.
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it('shrinks a long image to the maximum side without enlarging a small one', async () => {
    const wide = await store.save(await png({ width: 3000, height: 10 }));
    expect(wide.width).toBe(2000);
    expect(wide.height).toBe(7);

    const small = await store.save(await png({ width: 10, height: 10 }));
    expect(small.width).toBe(10);
    expect(small.height).toBe(10);
  });

  it('keeps concurrent saves apart', async () => {
    const [first, second] = await Promise.all([store.save(await png()), store.save(await png())]);

    expect(first.filename).not.toBe(second.filename);
    expect(await listFiles()).toHaveLength(2);
  });

  it('leaves nothing behind when encoding fails', async () => {
    const failing = createImageStore({
      rootDir,
      process: () => {
        throw new Error('encoder exploded');
      },
    });

    await expect(failing.save(await png())).rejects.toBeDefined();

    const leftovers = await listFiles();
    expect(leftovers.filter((file) => file.endsWith('.tmp'))).toEqual([]);
    expect(leftovers.filter((file) => file.endsWith('.webp'))).toEqual([]);
  });
});

describe('rejection', () => {
  /** Every refusal must be a client error with a stable code. */
  async function expectRefusal(bytes, { status = 422, code = 'UPLOAD_INVALID_IMAGE' } = {}) {
    await expect(store.save(bytes)).rejects.toMatchObject({ status, code });
    expect(await listFiles()).toEqual([]);
  }

  /** Dimensions are refused with 413 — the file is a real image, just too big. */
  async function expectTooLarge(bytes) {
    await expectRefusal(bytes, { status: 413, code: 'UPLOAD_TOO_LARGE' });
  }

  it('refuses an SVG even though it is a valid image to a browser', async () => {
    // SVG is XML: it can carry script and external references, and it is the
    // classic image-upload XSS payload.
    await expectRefusal(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'));
  });

  it('refuses a GIF', async () => {
    await expectRefusal(
      await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
        .gif()
        .toBuffer()
    );
  });

  it('refuses bytes that are not an image at all', async () => {
    await expectRefusal(Buffer.from('this is not an image, it is a text file'));
  });

  it('refuses a truncated PNG', async () => {
    const full = await png({ width: 100, height: 100 });
    await expectRefusal(full.subarray(0, 40));
  });

  it('refuses an image whose side exceeds the limit', async () => {
    // The metadata check runs before any resize, so the decoder never has to
    // handle a raster this large.
    await expectTooLarge(await png({ width: 9000, height: 1 }));
  });

  it('refuses an image with too many decoded pixels', async () => {
    await expectTooLarge(await png({ width: 5000, height: 4000 }));
  });

  it('refuses an empty buffer', async () => {
    await expectRefusal(Buffer.alloc(0));
  });
});
