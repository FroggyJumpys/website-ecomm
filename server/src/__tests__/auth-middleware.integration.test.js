import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createApp } from '../app.js';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { createRequireAuth, requireRole } from '../middleware/auth.js';
import { signSessionToken } from '../lib/session.js';
import { env } from '../config/env.js';
import { errorHandler } from '../middleware/error-handler.js';

let app;

beforeAll(async () => {
  await migrateTestDatabase();
  app = createApp({ pool: testPool, authRateLimitMax: 10_000 });
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestDatabase();
});

/** A tiny app that mounts the real guards in front of a protected handler. */
function guardedApp() {
  const testApp = express();
  testApp.use(cookieParser());
  const requireAuth = createRequireAuth(testPool);

  testApp.get('/customer', requireAuth, (req, res) => res.json({ data: req.user }));
  testApp.get('/admin', requireAuth, requireRole('admin'), (req, res) =>
    res.json({ data: req.user })
  );
  testApp.use(errorHandler);

  return testApp;
}

async function createUser({ role }) {
  const { rows } = await testPool.query(
    `INSERT INTO tbl_pengguna (name, email, phone, password_hash, role)
          VALUES ($1, $2, $3, 'hash', $4)
       RETURNING id, role`,
    [`Pengguna ${role}`, `${role}@badekor.id`, '081200000000', role]
  );

  return rows[0];
}

function cookieFor(user) {
  return `${env.COOKIE_NAME}=${signSessionToken(user)}`;
}

describe('createRequireAuth', () => {
  it('attaches the database user, not the token payload', async () => {
    const user = await createUser({ role: 'customer' });

    const response = await request(guardedApp())
      .get('/customer')
      .set('Cookie', cookieFor({ id: user.id }));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: user.id, role: 'customer' });
  });

  it('rejects a request with no cookie', async () => {
    const response = await request(guardedApp()).get('/customer');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('requireRole', () => {
  it('lets an admin through', async () => {
    const user = await createUser({ role: 'admin' });

    const response = await request(guardedApp())
      .get('/admin')
      .set('Cookie', cookieFor({ id: user.id }));

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('admin');
  });

  it('refuses a customer with 403 FORBIDDEN', async () => {
    const user = await createUser({ role: 'customer' });

    const response = await request(guardedApp())
      .get('/admin')
      .set('Cookie', cookieFor({ id: user.id }));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('reads the role from the database, so a demoted admin loses access at once', async () => {
    const user = await createUser({ role: 'admin' });
    const cookie = cookieFor({ id: user.id });

    await request(guardedApp()).get('/admin').set('Cookie', cookie).expect(200);

    await testPool.query(`UPDATE tbl_pengguna SET role = 'customer' WHERE id = $1`, [user.id]);

    await request(guardedApp()).get('/admin').set('Cookie', cookie).expect(403);
  });
});

describe('health endpoints', () => {
  it('keeps the auth routes mounted next to the health checks', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('returns the standard error shape for an unknown auth path', async () => {
    const response = await request(app).get('/api/v1/auth/nope');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
