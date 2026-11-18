import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';

let app;

const account = {
  name: 'Sari Wulandari',
  email: 'sari@badekor.id',
  phone: '081234567890',
  password: 'rahasia123',
};

const address = (overrides = {}) => ({
  label: 'Rumah',
  recipient: 'Sari Wulandari',
  phone: '081234567890',
  street: 'Jl. Kayu Tangi II No. 18, Banjarmasin',
  district: 'Banjarmasin Utara',
  city: 'Banjarmasin',
  province: 'Kalimantan Selatan',
  postalCode: '70123',
  notes: '',
  isDefault: false,
  ...overrides,
});

/** A signed-in agent, plus the other customer used for isolation checks. */
async function signIn(overrides = {}) {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/v1/auth/register')
    .send({ ...account, ...overrides })
    .expect(201);
  return { agent, user: response.body.data };
}

/** A second agent for an account that already exists — another device. */
async function signInAgain(password = account.password) {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: account.email, password }).expect(200);
  return agent;
}

beforeAll(async () => {
  await migrateTestDatabase();
  // Both limiters get their own dedicated tests below; raising them here keeps
  // a test that signs in or changes a password from inheriting the previous
  // test's count, since ids restart after each reset.
  app = createApp({ pool: testPool, authRateLimitMax: 10_000, passwordRateLimitMax: 10_000 });
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('authentication', () => {
  it('refuses every account route without a session', async () => {
    await request(app).patch('/api/v1/users/me').send({ name: 'Hantu' }).expect(401);
    await request(app)
      .post('/api/v1/users/me/password')
      .send({ currentPassword: 'rahasia123', newPassword: 'rahasia456' })
      .expect(401);
    await request(app).get('/api/v1/users/me/addresses').expect(401);
    await request(app).post('/api/v1/users/me/addresses').send(address()).expect(401);
    await request(app).patch('/api/v1/users/me/addresses/1').send(address()).expect(401);
    await request(app).delete('/api/v1/users/me/addresses/1').expect(401);
    await request(app).post('/api/v1/users/me/addresses/1/default').expect(401);
  });
});

describe('PATCH /api/v1/users/me', () => {
  it('saves the profile and returns the public user', async () => {
    const { agent } = await signIn();

    const response = await agent
      .patch('/api/v1/users/me')
      .send({ name: 'Sari W.', phone: '6281234567891' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      name: 'Sari W.',
      phone: '081234567891',
      email: account.email,
      role: 'customer',
    });
    expect(response.body.data).not.toHaveProperty('passwordHash');
  });

  it('is reflected by GET /auth/me afterwards', async () => {
    const { agent } = await signIn();

    await agent.patch('/api/v1/users/me').send({ name: 'Nama Baru' }).expect(200);

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.name).toBe('Nama Baru');
  });

  it('never exposes the session token version', async () => {
    const { agent } = await signIn();

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data).not.toHaveProperty('tokenVersion');
    expect(me.body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate email with 409 and a field detail', async () => {
    await signIn({ email: 'lain@badekor.id' });
    const { agent } = await signIn();

    const response = await agent
      .patch('/api/v1/users/me')
      .send({ email: 'lain@badekor.id', currentPassword: account.password });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: 'EMAIL_TAKEN',
      details: { field: 'email' },
    });
  });

  it('changes the email when the current password is supplied', async () => {
    const { agent } = await signIn();

    const response = await agent
      .patch('/api/v1/users/me')
      .send({ email: 'sari.baru@badekor.id', currentPassword: account.password });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ email: 'sari.baru@badekor.id' });
    expect(response.body.data).not.toHaveProperty('currentPassword');
  });

  it('refuses an email change with no current password', async () => {
    const { agent } = await signIn();

    const response = await agent
      .patch('/api/v1/users/me')
      .send({ email: 'sari.baru@badekor.id' });

    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { field: 'currentPassword' },
    });
  });

  it('refuses an email change with the wrong current password', async () => {
    const { agent } = await signIn();

    const response = await agent
      .patch('/api/v1/users/me')
      .send({ email: 'sari.baru@badekor.id', currentPassword: 'salah-total' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'INVALID_PASSWORD',
      details: { field: 'currentPassword' },
    });

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.email).toBe(account.email);
  });

  it('does not need the password when only the name changes', async () => {
    const { agent } = await signIn();

    await agent.patch('/api/v1/users/me').send({ name: 'Sari W.' }).expect(200);
  });

  it('rejects an empty patch with 422', async () => {
    const { agent } = await signIn();

    const response = await agent.patch('/api/v1/users/me').send({});

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid field with 422 and its message', async () => {
    const { agent } = await signIn();

    const response = await agent.patch('/api/v1/users/me').send({ email: 'bukan-email' });

    expect(response.status).toBe(422);
    expect(response.body.error.details).toEqual({
      field: 'email',
      message: 'Format email belum benar. Contoh: nama@email.com',
    });
  });

  it('cannot escalate its own role', async () => {
    const { agent, user } = await signIn();

    await agent.patch('/api/v1/users/me').send({ name: 'Sari', role: 'admin' }).expect(200);

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.role).toBe('customer');
    expect(me.body.data.id).toBe(user.id);
  });
});

describe('POST /api/v1/users/me/password', () => {
  it('changes the password and keeps this device signed in', async () => {
    const { agent } = await signIn();

    const response = await agent
      .post('/api/v1/users/me/password')
      .send({ currentPassword: account.password, newPassword: 'rahasia456' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null });

    // The controller re-issues the cookie with the bumped token version, so the
    // device that made the change is not logged out by its own action.
    await agent.get('/api/v1/auth/me').expect(200);
  });

  it('signs out a session that was signed in before the change', async () => {
    const { agent: thisDevice } = await signIn();
    const otherDevice = await signInAgain();

    await otherDevice.get('/api/v1/auth/me').expect(200);

    await thisDevice
      .post('/api/v1/users/me/password')
      .send({ currentPassword: account.password, newPassword: 'rahasia456' })
      .expect(200);

    // The old token still verifies cryptographically, but its version is stale.
    const response = await otherDevice.get('/api/v1/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');

    await thisDevice.get('/api/v1/auth/me').expect(200);
  });

  it('lets the new password sign in and stops the old one', async () => {
    const { agent } = await signIn();

    await agent
      .post('/api/v1/users/me/password')
      .send({ currentPassword: account.password, newPassword: 'rahasia456' })
      .expect(200);

    const fresh = request.agent(app);
    await fresh
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: 'rahasia456' })
      .expect(200);

    const old = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: account.password });
    expect(old.status).toBe(401);
  });

  it('rejects a wrong current password with 400 INVALID_PASSWORD', async () => {
    const { agent } = await signIn();

    const response = await agent
      .post('/api/v1/users/me/password')
      .send({ currentPassword: 'salah-total', newPassword: 'rahasia456' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'INVALID_PASSWORD',
      details: { field: 'currentPassword' },
    });
  });

  it('rejects reusing the current password with 400 SAME_PASSWORD', async () => {
    const { agent } = await signIn();

    const response = await agent
      .post('/api/v1/users/me/password')
      .send({ currentPassword: account.password, newPassword: account.password });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SAME_PASSWORD');
  });

  it('rejects a weak new password with 422', async () => {
    const { agent } = await signIn();

    const response = await agent
      .post('/api/v1/users/me/password')
      .send({ currentPassword: account.password, newPassword: 'pendek' });

    expect(response.status).toBe(422);
    expect(response.body.error.details.field).toBe('newPassword');
  });

  it('rate-limits repeated attempts per account', async () => {
    const limited = createApp({
      pool: testPool,
      authRateLimitMax: 10_000,
      passwordRateLimitMax: 2,
    });
    const agent = request.agent(limited);
    await agent.post('/api/v1/auth/register').send(account).expect(201);

    const body = { currentPassword: 'salah-total', newPassword: 'rahasia456' };
    await agent.post('/api/v1/users/me/password').send(body).expect(400);
    await agent.post('/api/v1/users/me/password').send(body).expect(400);

    const response = await agent.post('/api/v1/users/me/password').send(body);
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });
});

describe('addresses', () => {
  it('creates the first address as the default', async () => {
    const { agent } = await signIn();

    const response = await agent.post('/api/v1/users/me/addresses').send(address());

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ label: 'Rumah', isDefault: true });
  });

  it('lists the customer’s addresses only', async () => {
    const sari = await signIn();
    const rani = await signIn({ email: 'rani@badekor.id', phone: '081100000000' });

    await sari.agent.post('/api/v1/users/me/addresses').send(address({ label: 'Rumah Sari' }));
    await rani.agent.post('/api/v1/users/me/addresses').send(address({ label: 'Rumah Rani' }));

    const sariList = await sari.agent.get('/api/v1/users/me/addresses').expect(200);

    expect(sariList.body.data).toHaveLength(1);
    expect(sariList.body.data[0].label).toBe('Rumah Sari');
  });

  it('updates, defaults and deletes an address', async () => {
    const { agent } = await signIn();
    const created = await agent.post('/api/v1/users/me/addresses').send(address());
    const id = created.body.data.id;
    const second = await agent
      .post('/api/v1/users/me/addresses')
      .send(address({ label: 'Kantor' }));

    const updated = await agent
      .patch(`/api/v1/users/me/addresses/${id}`)
      .send(address({ label: 'Rumah Sari', city: 'Martapura' }));
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ label: 'Rumah Sari', city: 'Martapura' });

    await agent.post(`/api/v1/users/me/addresses/${second.body.data.id}/default`).expect(200);
    const afterDefault = await agent.get('/api/v1/users/me/addresses').expect(200);
    expect(afterDefault.body.data.filter((item) => item.isDefault)).toHaveLength(1);

    await agent.delete(`/api/v1/users/me/addresses/${second.body.data.id}`).expect(200);
    const afterDelete = await agent.get('/api/v1/users/me/addresses').expect(200);
    expect(afterDelete.body.data).toHaveLength(1);
    expect(afterDelete.body.data[0]).toMatchObject({ id, isDefault: true });
  });

  it('treats another customer’s address as not found', async () => {
    const sari = await signIn();
    const rani = await signIn({ email: 'rani@badekor.id', phone: '081100000000' });
    const theirs = await rani.agent.post('/api/v1/users/me/addresses').send(address());
    const id = theirs.body.data.id;

    const patch = await sari.agent
      .patch(`/api/v1/users/me/addresses/${id}`)
      .send(address({ label: 'Dibajak' }));
    expect(patch.status).toBe(404);
    expect(patch.body.error.code).toBe('ADDRESS_NOT_FOUND');

    await sari.agent.delete(`/api/v1/users/me/addresses/${id}`).expect(404);
    await sari.agent.post(`/api/v1/users/me/addresses/${id}/default`).expect(404);

    const theirsAfter = await rani.agent.get('/api/v1/users/me/addresses').expect(200);
    expect(theirsAfter.body.data).toHaveLength(1);
  });

  it('rejects a non-numeric address id without hitting the database', async () => {
    const { agent } = await signIn();

    const response = await agent.patch('/api/v1/users/me/addresses/abc').send(address());

    expect(response.status).toBe(422);
    expect(response.body.error.details).toMatchObject({ field: 'id' });
  });

  it('rejects an invalid address with 422 and the field', async () => {
    const { agent } = await signIn();

    const response = await agent
      .post('/api/v1/users/me/addresses')
      .send(address({ postalCode: '701' }));

    expect(response.status).toBe(422);
    expect(response.body.error.details.field).toBe('postalCode');
  });

  it('returns 404 for an unknown address id', async () => {
    const { agent } = await signIn();

    const response = await agent.delete('/api/v1/users/me/addresses/999999');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ADDRESS_NOT_FOUND');
  });
});

describe('existing routes', () => {
  it('keeps the catalogue public and the health check intact', async () => {
    await request(app).get('/api/v1/products').expect(200);
    await request(app).get('/api/v1/health').expect(200);
  });

  it('does not expose an admin route through /users', async () => {
    const { agent } = await signIn();
    await agent.get('/api/v1/users').expect(404);
  });
});
