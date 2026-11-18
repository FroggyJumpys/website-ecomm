import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../app.js';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';

/**
 * The upload endpoint and the media route that serves what it stored.
 *
 * Two things are being proved here. First, authorisation: only an admin may
 * write a file, and nothing is written when the gate says no. Second, that the
 * bytes which reach the browser are the ones this API produced — the media
 * route accepts only a generated UUID filename, so a request for a traversal
 * path or a source file is a 404 rather than a file read.
 */

const admin = {
  name: 'Admin BaDekor',
  email: 'admin@badekor.id',
  phone: '081200000000',
  password: 'rahasia123',
};

const customer = {
  name: 'Sari Wulandari',
  email: 'sari@badekor.id',
  phone: '081234567890',
  password: 'rahasia123',
};

let app;
let uploadDir;
let publicImageDir;

async function png({ width = 10, height = 10 } = {}) {
  return sharp({ create: { width, height, channels: 3, background: { r: 90, g: 60, b: 30 } } })
    .png()
    .toBuffer();
}

async function signIn(as) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/register').send(as).expect(201);

  return { agent, user: response.body.data };
}

async function signInAdmin() {
  const session = await signIn(admin);
  await testPool.query(`UPDATE tbl_pengguna SET role = 'admin' WHERE id = $1`, [session.user.id]);

  return session;
}

async function listUploads() {
  try {
    return (await fs.readdir(uploadDir)).sort();
  } catch {
    return [];
  }
}

/** A fresh app over the shared directories, for tests that need their own limits. */
function buildApp(overrides = {}) {
  return createApp({
    pool: testPool,
    uploadDir,
    publicImageDir,
    ...overrides,
  });
}

beforeAll(async () => {
  await migrateTestDatabase();

  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'badekor-uploads-'));
  publicImageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'badekor-public-'));

  // The shared app keeps the production limit; the rate-limit test builds its
  // own instance so its budget does not leak into every other case.
  app = buildApp();
});

beforeEach(async () => {
  await resetDatabase();
  await fs.rm(uploadDir, { recursive: true, force: true });
  await fs.mkdir(uploadDir, { recursive: true });

  // A fresh app per test: the rate limiter keeps its counter on the app, and
  // `resetDatabase` restarts identity, so a shared instance would accumulate
  // one budget across tests that all own user id 1.
  app = buildApp();
});

afterAll(async () => {
  await fs.rm(uploadDir, { recursive: true, force: true });
  await fs.rm(publicImageDir, { recursive: true, force: true });
  await closeTestDatabase();
});

describe('authorisation', () => {
  it('refuses a guest and writes nothing', async () => {
    await request(app)
      .post('/api/v1/admin/uploads')
      .attach('image', await png(), { filename: 'kursi.png', contentType: 'image/png' })
      .expect(401)
      .expect((response) => expect(response.body.error.code).toBe('UNAUTHENTICATED'));

    expect(await listUploads()).toEqual([]);
  });

  it('refuses a signed-in customer and writes nothing', async () => {
    const { agent } = await signIn(customer);

    await agent
      .post('/api/v1/admin/uploads')
      .attach('image', await png(), { filename: 'kursi.png', contentType: 'image/png' })
      .expect(403)
      .expect((response) => expect(response.body.error.code).toBe('FORBIDDEN'));

    expect(await listUploads()).toEqual([]);
  });

  it('refuses a token whose account was demoted after sign-in', async () => {
    const { agent, user } = await signInAdmin();
    await testPool.query(`UPDATE tbl_pengguna SET role = 'customer' WHERE id = $1`, [user.id]);

    await agent
      .post('/api/v1/admin/uploads')
      .attach('image', await png(), { filename: 'kursi.png', contentType: 'image/png' })
      .expect(403);
  });
});

describe('uploading', () => {
  it('stores a PNG as WebP and serves it back', async () => {
    const { agent } = await signInAdmin();

    const response = await agent
      .post('/api/v1/admin/uploads')
      .attach('image', await png({ width: 40, height: 30 }), {
        filename: 'kursi.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(response.body.data).toMatchObject({ width: 40, height: 30 });
    expect(response.body.data.size).toBeGreaterThan(0);
    expect(response.body.data.path).toMatch(/^\/api\/v1\/media\/catalog\/[0-9a-f-]{36}\.webp$/);

    const media = await request(app).get(response.body.data.path).expect(200);

    expect(media.headers['content-type']).toBe('image/webp');
    expect(media.headers['x-content-type-options']).toBe('nosniff');
    expect(media.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await sharp(media.body).metadata()).format).toBe('webp');
  });

  it('rejects a request with no file part', async () => {
    const { agent } = await signInAdmin();

    await agent
      .post('/api/v1/admin/uploads')
      .field('catatan', 'tanpa gambar')
      .expect(422)
      .expect((response) => expect(response.body.error.code).toBe('UPLOAD_FILE_REQUIRED'));

    expect(await listUploads()).toEqual([]);
  });

  it('rejects a second file part', async () => {
    const { agent } = await signInAdmin();

    await agent
      .post('/api/v1/admin/uploads')
      .attach('image', await png(), { filename: 'a.png', contentType: 'image/png' })
      .attach('image', await png(), { filename: 'b.png', contentType: 'image/png' })
      .expect(422);

    expect(await listUploads()).toEqual([]);
  });

  it('rejects a file larger than the limit', async () => {
    const { agent } = await signInAdmin();
    const oversized = Buffer.alloc(6 * 1024 * 1024, 1);

    await agent
      .post('/api/v1/admin/uploads')
      .attach('image', oversized, { filename: 'besar.png', contentType: 'image/png' })
      .expect(413)
      .expect((response) => expect(response.body.error.code).toBe('UPLOAD_TOO_LARGE'));

    expect(await listUploads()).toEqual([]);
  });

  it('rejects a text file named as a PNG and an SVG', async () => {
    const { agent } = await signInAdmin();

    await agent
      .post('/api/v1/admin/uploads')
      .attach('image', Buffer.from('just some text'), {
        filename: 'palsu.png',
        contentType: 'image/png',
      })
      .expect(422)
      .expect((response) => expect(response.body.error.code).toBe('UPLOAD_INVALID_IMAGE'));

    await agent
      .post('/api/v1/admin/uploads')
      .attach('image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
        filename: 'jahat.svg',
        contentType: 'image/svg+xml',
      })
      .expect(422);

    expect(await listUploads()).toEqual([]);
  });

  it('rejects corrupt PNG bytes', async () => {
    const { agent } = await signInAdmin();
    const bytes = (await png({ width: 50, height: 50 })).subarray(0, 30);

    await agent
      .post('/api/v1/admin/uploads')
      .attach('image', bytes, { filename: 'rusak.png', contentType: 'image/png' })
      .expect(422);

    expect(await listUploads()).toEqual([]);
  });

  it('rate-limits repeated uploads per admin', async () => {
    // Its own app instance: the limiter's counter lives in the app, so a shared
    // one would spend the budget of every test that ran before this.
    const limited = buildApp({ adminUploadLimit: 2, adminUploadWindowMs: 60_000 });
    const agent = request.agent(limited);
    const registered = await agent.post('/api/v1/auth/register').send(admin).expect(201);
    await testPool.query(`UPDATE tbl_pengguna SET role = 'admin' WHERE id = $1`, [
      registered.body.data.id,
    ]);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await agent
        .post('/api/v1/admin/uploads')
        .attach('image', await png(), { filename: `k${attempt}.png`, contentType: 'image/png' })
        .expect(201);
    }

    await agent
      .post('/api/v1/admin/uploads')
      .attach('image', await png(), { filename: 'ketiga.png', contentType: 'image/png' })
      .expect(429)
      .expect((response) => expect(response.body.error.code).toBe('TOO_MANY_UPLOADS'));

    expect(await listUploads()).toHaveLength(2);
  });

  it('rejects a cross-site request before writing anything', async () => {
    const { agent } = await signInAdmin();

    await agent
      .post('/api/v1/admin/uploads')
      .set('Origin', 'http://evil.test')
      .attach('image', await png(), { filename: 'kursi.png', contentType: 'image/png' })
      .expect(403)
      .expect((response) => expect(response.body.error.code).toBe('CROSS_SITE_REQUEST'));

    await agent
      .post('/api/v1/admin/uploads')
      .set('Sec-Fetch-Site', 'cross-site')
      .attach('image', await png(), { filename: 'kursi.png', contentType: 'image/png' })
      .expect(403);

    expect(await listUploads()).toEqual([]);
  });

  it('accepts a request with no origin headers, as a CLI client sends', async () => {
    const { agent } = await signInAdmin();

    await agent
      .post('/api/v1/admin/uploads')
      .attach('image', await png(), { filename: 'kursi.png', contentType: 'image/png' })
      .expect(201);
  });

  it('serves an uploaded file to a freshly built app over the same directory', async () => {
    const { agent } = await signInAdmin();

    const response = await agent
      .post('/api/v1/admin/uploads')
      .attach('image', await png(), { filename: 'kursi.png', contentType: 'image/png' })
      .expect(201);

    // A restart rebuilds the app but not the disk, which is why the storage
    // directory has to be a persisted volume rather than process memory.
    const restarted = buildApp();

    await request(restarted).get(response.body.data.path).expect(200);
  });
});

describe('media route', () => {
  it.each([
    'not-a-uuid.webp',
    '../008_product_version.sql',
    '..%2f008_product_version.sql',
    '%2e%2e%2fsecret.webp',
    '00000000-0000-0000-0000-000000000000.png',
  ])('refuses %s with a JSON 404', async (filename) => {
    const response = await request(app).get(`/api/v1/media/catalog/${filename}`).expect(404);

    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.error.code).toBe('MEDIA_NOT_FOUND');
  });

  it('is public', async () => {
    const { agent } = await signInAdmin();
    const upload = await agent
      .post('/api/v1/admin/uploads')
      .attach('image', await png(), { filename: 'kursi.png', contentType: 'image/png' })
      .expect(201);

    // No cookie, no session: the storefront and the order history both hotlink
    // these files from an <img> tag.
    await request(app).get(upload.body.data.path).expect(200);
  });
});
