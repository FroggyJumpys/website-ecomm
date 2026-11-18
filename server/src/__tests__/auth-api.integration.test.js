import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { env } from '../config/env.js';
import { signSessionToken } from '../lib/session.js';

const registration = {
  name: 'Sari Wulandari',
  email: 'sari@badekor.id',
  phone: '081234567890',
  password: 'rahasia123',
};

let app;

beforeAll(async () => {
  await migrateTestDatabase();
  // The functional tests below sign in far more often than a real user would;
  // the limiter gets its own test with a deliberately small limit.
  app = createApp({ pool: testPool, authRateLimitMax: 10_000 });
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestDatabase();
});

/** Pulls the session cookie out of a Set-Cookie header. */
function sessionCookie(response) {
  const cookies = response.headers['set-cookie'] ?? [];
  return cookies.find((cookie) => cookie.startsWith(`${env.COOKIE_NAME}=`)) ?? '';
}

async function registerAndSignIn() {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/register').send(registration).expect(201);
  return agent;
}

describe('POST /api/v1/auth/register', () => {
  it('creates a customer, starts a session and returns no credential fields', async () => {
    const response = await request(app).post('/api/v1/auth/register').send(registration);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      name: 'Sari Wulandari',
      email: 'sari@badekor.id',
      phone: '081234567890',
      role: 'customer',
    });
    expect(response.body.data).not.toHaveProperty('password');
    expect(response.body.data).not.toHaveProperty('passwordHash');
    expect(sessionCookie(response)).not.toBe('');
  });

  it('marks the cookie httpOnly, lax, rooted and unreadable from JavaScript', async () => {
    const response = await request(app).post('/api/v1/auth/register').send(registration);
    const cookie = sessionCookie(response).toLowerCase();

    expect(cookie).toContain('httponly');
    expect(cookie).toContain('samesite=lax');
    expect(cookie).toContain('path=/');
    expect(cookie).not.toContain('secure');
  });

  it('ignores a role sent in the payload', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...registration, role: 'admin' });

    expect(response.status).toBe(201);
    expect(response.body.data.role).toBe('customer');
  });

  it('rejects a duplicate email with a 409 and a field-level detail', async () => {
    await request(app).post('/api/v1/auth/register').send(registration).expect(201);

    const response = await request(app).post('/api/v1/auth/register').send(registration);

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: 'EMAIL_TAKEN',
      details: { field: 'email' },
    });
  });

  it('rejects an invalid payload with 422 and the first field message', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...registration, email: 'not-an-email' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual({
      field: 'email',
      message: 'Format email belum benar. Contoh: nama@email.com',
    });
  });

  it('rejects an empty body', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({});
    expect(response.status).toBe(422);
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/register').send(registration).expect(201);
  });

  it('signs in and refreshes the session cookie', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'SARI@badekor.id', password: 'rahasia123' });

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe('sari@badekor.id');
    expect(sessionCookie(response)).not.toBe('');
  });

  it('rejects a wrong password with 401 and no cookie', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'sari@badekor.id', password: 'salah-total' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(sessionCookie(response)).toBe('');
  });

  it('rejects an unknown email with the same message', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@badekor.id', password: 'rahasia123' });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Email atau kata sandi salah.');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the signed-in user for a valid cookie', async () => {
    const agent = await registerAndSignIn();

    const response = await agent.get('/api/v1/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe('sari@badekor.id');
  });

  it('returns 401 without a cookie', async () => {
    const response = await request(app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 for a tampered cookie', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${env.COOKIE_NAME}=not-a-real-token`);

    expect(response.status).toBe(401);
  });

  it('returns 401 when the account no longer exists', async () => {
    const user = await testPool.query(
      `INSERT INTO tbl_pengguna (name, email, phone, password_hash)
       VALUES ('Dihapus', 'dihapus@badekor.id', '081200000000', 'hash')
       RETURNING id`
    );

    const token = signSessionToken({ id: user.rows[0].id });
    await testPool.query('DELETE FROM tbl_pengguna WHERE id = $1', [user.rows[0].id]);

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${env.COOKIE_NAME}=${token}`);

    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the session cookie so the next me request is unauthenticated', async () => {
    const agent = await registerAndSignIn();

    const response = await agent.post('/api/v1/auth/logout');

    expect(response.status).toBe(200);
    expect(sessionCookie(response).toLowerCase()).toContain('expires=thu, 01 jan 1970');
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('succeeds even when nobody is signed in', async () => {
    const response = await request(app).post('/api/v1/auth/logout');
    expect(response.status).toBe(200);
  });
});

describe('auth rate limiting', () => {
  it('rejects repeated failed sign-ins with 429 and a Bahasa Indonesia message', async () => {
    const limited = createApp({ pool: testPool, authRateLimitMax: 2, authRateLimitWindowMs: 60_000 });

    const body = { email: 'nobody@badekor.id', password: 'rahasia123' };
    await request(limited).post('/api/v1/auth/login').send(body).expect(401);
    await request(limited).post('/api/v1/auth/login').send(body).expect(401);

    const response = await request(limited).post('/api/v1/auth/login').send(body);

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(response.body.error.message).toBeTruthy();
  });
});
