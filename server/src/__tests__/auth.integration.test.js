import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

/**
 * End-to-end tests against a real PostgreSQL database.
 *
 * The suite is deliberately opt-in: `npm test` stays database-free, and this
 * file is only collected by `vitest.integration.config.js`. It refuses to run
 * unless TEST_DATABASE_URL points at a database whose name contains "test",
 * because it applies migrations and deletes the rows it created.
 *
 * The environment has to be set before `config/env.js` is imported, which is
 * why the modules below are imported dynamically.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Point it at a disposable database, e.g. ' +
      'TEST_DATABASE_URL=postgres://ba_dekor:ba_dekor@localhost:5432/ba_dekor_test npm run test:integration'
  );
}

const databaseName = decodeURIComponent(new URL(TEST_DATABASE_URL).pathname);

if (!/test/i.test(databaseName)) {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}": the database name must contain "test".`
  );
}

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = 'integration-test-secret-0123456789';
process.env.BCRYPT_ROUNDS = '4';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../app.js');
const { env } = await import('../config/env.js');
const { pool, closePool } = await import('../config/db.js');
const { runMigrations } = await import('../db/migrate.js');
const { errorHandler } = await import('../middleware/error-handler.js');
const { requireAuth, requireAdmin } = await import('../middleware/auth.js');
const { createAuthLimiter } = await import('../middleware/rate-limit.js');

const PASSWORD = 'rahasia123';
const TEST_EMAIL_SUFFIX = '@badekor.test';

/** A fresh address per test, so tests never depend on each other's rows. */
function uniqueEmail(prefix = 'pelanggan') {
  return `${prefix}-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
}

/** The `name=value` part of the session Set-Cookie header, if one was sent. */
function sessionCookie(response) {
  const header = response.headers['set-cookie'] ?? [];
  const cookies = Array.isArray(header) ? header : [header];

  return cookies.find((cookie) => cookie.startsWith(`${env.COOKIE_NAME}=`)) ?? null;
}

function cookiePair(setCookie) {
  return setCookie.split(';')[0];
}

async function registerUser(email, overrides = {}) {
  return request(app)
    .post('/api/v1/auth/register')
    .send({
      name: 'Sari Wulandari',
      email,
      phone: '081234567890',
      password: PASSWORD,
      ...overrides,
    });
}

async function insertUser({ role = 'customer' } = {}) {
  const email = uniqueEmail(role);
  const passwordHash = await bcrypt.hash(PASSWORD, env.BCRYPT_ROUNDS);

  const { rows } = await pool.query(
    `INSERT INTO tbl_pengguna (name, email, phone, password_hash, role)
          VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
    ['Sari Wulandari', email, '081234567890', passwordHash, role]
  );

  return { id: rows[0].id, email };
}

async function signIn(agent, email) {
  return agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
}

beforeAll(async () => {
  await runMigrations(pool);
});

afterAll(async () => {
  await pool.query('DELETE FROM tbl_pengguna WHERE email LIKE $1', [`%${TEST_EMAIL_SUFFIX}`]);
  await closePool();
});

describe('POST /api/v1/auth/register', () => {
  it('creates a customer, starts a session and returns only the public user', async () => {
    const email = uniqueEmail();

    const response = await registerUser(email.toUpperCase(), {
      name: '  Sari Wulandari  ',
      phone: '+62 812-3456-7890',
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({
      id: expect.any(Number),
      name: 'Sari Wulandari',
      email,
      phone: '081234567890',
      role: 'customer',
    });

    const cookie = sessionCookie(response);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookiePair(cookie));
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(email);

    const { rows } = await pool.query(
      'SELECT password_hash, role FROM tbl_pengguna WHERE email = $1',
      [email]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('customer');
    expect(rows[0].password_hash).not.toBe(PASSWORD);
    expect(rows[0].password_hash.startsWith('$2')).toBe(true);
    expect(await bcrypt.compare(PASSWORD, rows[0].password_hash)).toBe(true);
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const email = uniqueEmail();
    await registerUser(email).expect(201);

    const response = await registerUser(email);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
    expect(sessionCookie(response)).toBeNull();
  });

  it('lets only one of two simultaneous registrations win the email', async () => {
    const email = uniqueEmail();
    const payload = {
      name: 'Sari Wulandari',
      email,
      phone: '081234567890',
      password: PASSWORD,
    };

    const responses = await Promise.all([
      request(app).post('/api/v1/auth/register').send(payload),
      request(app).post('/api/v1/auth/register').send(payload),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  });

  it('reports every invalid field in details.fields', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      name: 'S',
      email: 'bukan-email',
      phone: '123',
      password: 'pendek',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(response.body.error.details.fields)).toEqual(
      expect.arrayContaining(['name', 'email', 'phone', 'password'])
    );
  });

  it('cannot be used to create an admin', async () => {
    const email = uniqueEmail();

    const response = await registerUser(email, { role: 'admin' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    const { rows } = await pool.query(
      'SELECT count(*)::int AS count FROM tbl_pengguna WHERE email = $1',
      [email]
    );
    expect(rows[0].count).toBe(0);
  });

  it('rejects a password longer than bcrypt can hash', async () => {
    const response = await registerUser(uniqueEmail(), { password: `a1${'x'.repeat(71)}` });

    expect(response.status).toBe(400);
    expect(response.body.error.details.fields.password).toContain('72');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('signs in with a differently cased email and sets the session cookie', async () => {
    const email = uniqueEmail();
    await registerUser(email).expect(201);

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: email.toUpperCase(), password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ email, role: 'customer' });
    expect(response.body.data).not.toHaveProperty('password_hash');

    const cookie = sessionCookie(response);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure');
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const email = uniqueEmail();
    await registerUser(email).expect(201);

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'salah12345' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail(), password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toEqual(unknownEmail.body.error);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(sessionCookie(wrongPassword)).toBeNull();
  });

  it('rejects a malformed payload with 400', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bukan-email', password: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the signed-in user', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    await registerUser(email).expect(201);
    await signIn(agent, email).expect(200);

    const response = await agent.get('/api/v1/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ email, role: 'customer' });
  });

  it('rejects a guest', async () => {
    const response = await request(app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a tampered token', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    await registerUser(email).expect(201);
    const login = await signIn(agent, email).expect(200);
    const cookie = cookiePair(sessionCookie(login));

    const response = await request(app).get('/api/v1/auth/me').set('Cookie', `${cookie}x`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an expired token', async () => {
    const { id } = await insertUser();
    const token = jwt.sign({}, env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: String(id),
      expiresIn: '-1s',
    });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${env.COOKIE_NAME}=${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a valid token whose account was deleted', async () => {
    const { id } = await insertUser();
    const token = jwt.sign({}, env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: String(id),
      expiresIn: '5m',
    });

    await pool.query('DELETE FROM tbl_pengguna WHERE id = $1', [id]);

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${env.COOKIE_NAME}=${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the cookie, ends access and works for a guest too', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    await registerUser(email).expect(201);
    await signIn(agent, email).expect(200);
    await agent.get('/api/v1/auth/me').expect(200);

    const response = await agent.post('/api/v1/auth/logout');

    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();
    expect(sessionCookie(response)).toContain('Expires=Thu, 01 Jan 1970');

    await agent.get('/api/v1/auth/me').expect(401);

    const guest = await request(app).post('/api/v1/auth/logout');
    expect(guest.status).toBe(200);
  });
});

describe('route guards', () => {
  const probe = express();
  probe.use(cookieParser());
  probe.get('/probe', requireAuth, requireAdmin, (req, res) => {
    res.json({ data: req.user });
  });
  probe.use(errorHandler);

  it('lets an admin through', async () => {
    const agent = request.agent(app);
    const { email } = await insertUser({ role: 'admin' });
    await signIn(agent, email).expect(200);

    const response = await agent.get('/probe');

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('admin');
  });

  it('refuses a customer with 403', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    await registerUser(email).expect(201);
    await signIn(agent, email).expect(200);

    const response = await agent.get('/probe');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses a guest with 401', async () => {
    const response = await request(probe).get('/probe');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('auth rate limit', () => {
  it('answers 429 in the standard error shape once the window is used up', async () => {
    const limited = express();
    limited.get(
      '/ping',
      createAuthLimiter({ windowMs: 60_000, limit: 2, skip: () => false }),
      (req, res) => res.json({ ok: true })
    );
    limited.use(errorHandler);

    await request(limited).get('/ping').expect(200);
    await request(limited).get('/ping').expect(200);

    const response = await request(limited).get('/ping');

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });
});
