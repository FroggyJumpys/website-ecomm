import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';

/**
 * The three wishlist endpoints over HTTP: authentication, the response shapes
 * the frontend service already expects, validation, and isolation between two
 * signed-in customers.
 */

let app;

const account = {
  name: 'Sari Wulandari',
  email: 'sari@badekor.id',
  phone: '081234567890',
  password: 'rahasia123',
};

const other = {
  name: 'Rani BaDekor',
  email: 'rani@badekor.id',
  phone: '081100000000',
  password: 'rahasia123',
};

let categoryId;
let productId;

async function signIn(overrides = {}) {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/v1/auth/register')
    .send({ ...account, ...overrides })
    .expect(201);
  return { agent, user: response.body.data };
}

async function insertProduct(overrides = {}) {
  const item = {
    slug: 'kursi-rotan',
    name: 'Kursi Rotan',
    price: 1_500_000,
    stock: 4,
    isActive: true,
    ...overrides,
  };

  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, price, rating, review_count, stock, material,
            dimensions, description, colors, sizes, images, is_new, is_trending, is_active
          )
          VALUES ($1, $2, $3, $4, 4.5, 12, $5, 'Rotan', '50 × 55 × 80 cm',
                  'Kursi rotan untuk ruang tamu.', ARRAY['Rotan natural'], ARRAY['Standar'],
                  ARRAY['/images/products/product3.jpg'], false, true, $6)
       RETURNING id`,
    [item.slug, item.name, categoryId, item.price, item.stock, item.isActive]
  );

  return rows[0].id;
}

beforeAll(async () => {
  await migrateTestDatabase();
  app = createApp({ pool: testPool, authRateLimitMax: 10_000 });
});

beforeEach(async () => {
  await resetDatabase();

  const { rows } = await testPool.query(
    `INSERT INTO tbl_kategori (slug, name, description, image, sort_order)
          VALUES ('kursi', 'Kursi', '', '', 0) RETURNING id`
  );
  categoryId = rows[0].id;
  productId = await insertProduct();
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('authentication', () => {
  it('refuses every wishlist route without a session', async () => {
    await request(app).get('/api/v1/users/me/wishlist').expect(401);
    await request(app).post('/api/v1/users/me/wishlist').send({ productId }).expect(401);
    await request(app).delete(`/api/v1/users/me/wishlist/${productId}`).expect(401);
  });

  it('refuses a stale session after the password changed elsewhere', async () => {
    const { agent } = await signIn();
    const otherDevice = request.agent(app);
    await otherDevice
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: account.password })
      .expect(200);

    await agent
      .post('/api/v1/users/me/password')
      .send({ currentPassword: account.password, newPassword: 'rahasia456' })
      .expect(200);

    await otherDevice.get('/api/v1/users/me/wishlist').expect(401);
  });
});

describe('GET /api/v1/users/me/wishlist', () => {
  it('returns an empty list for a new account', async () => {
    const { agent } = await signIn();

    const response = await agent.get('/api/v1/users/me/wishlist').expect(200);
    expect(response.body).toEqual({ data: [] });
  });

  it('returns saved items newest first with the fields the page uses', async () => {
    const second = await insertProduct({ slug: 'meja-ulin', name: 'Meja Ulin' });
    const { agent } = await signIn();

    await agent.post('/api/v1/users/me/wishlist').send({ productId }).expect(200);
    await agent.post('/api/v1/users/me/wishlist').send({ productId: second }).expect(200);

    const response = await agent.get('/api/v1/users/me/wishlist').expect(200);

    expect(response.body.data.map((item) => item.id)).toEqual([second, productId]);
    expect(response.body.data[0]).toMatchObject({
      slug: 'meja-ulin',
      name: 'Meja Ulin',
      category: { slug: 'kursi', name: 'Kursi' },
    });
    expect(response.body.data[0].colors).toEqual(['Rotan natural']);
    expect(response.body.data[0].sizes).toEqual(['Standar']);
  });

  it('never exposes another customer’s saves', async () => {
    const { agent: sariAgent } = await signIn();
    const { agent: raniAgent } = await signIn(other);

    await raniAgent.post('/api/v1/users/me/wishlist').send({ productId }).expect(200);

    const response = await sariAgent.get('/api/v1/users/me/wishlist').expect(200);
    expect(response.body.data).toEqual([]);
  });

  it('hides a product the admin deactivated', async () => {
    const { agent } = await signIn();
    await agent.post('/api/v1/users/me/wishlist').send({ productId }).expect(200);

    await testPool.query('UPDATE tbl_produk SET is_active = false WHERE id = $1', [productId]);

    const response = await agent.get('/api/v1/users/me/wishlist').expect(200);
    expect(response.body.data).toEqual([]);
  });

  it('always returns a plain list, with no pagination envelope', async () => {
    const { agent } = await signIn();
    await agent.post('/api/v1/users/me/wishlist').send({ productId }).expect(200);

    const response = await agent.get('/api/v1/users/me/wishlist').expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body).not.toHaveProperty('meta');
  });
});

describe('POST /api/v1/users/me/wishlist', () => {
  it('saves the product and returns it', async () => {
    const { agent } = await signIn();

    const response = await agent
      .post('/api/v1/users/me/wishlist')
      .send({ productId })
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: productId,
      name: 'Kursi Rotan',
      price: 1_500_000,
    });
  });

  it('answers 200 the second time too, with one row', async () => {
    const { agent } = await signIn();

    await agent.post('/api/v1/users/me/wishlist').send({ productId }).expect(200);
    const again = await agent.post('/api/v1/users/me/wishlist').send({ productId }).expect(200);

    expect(again.body.data.id).toBe(productId);

    const list = await agent.get('/api/v1/users/me/wishlist').expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('ignores an owner id supplied by the client', async () => {
    const { agent: sariAgent, user: sari } = await signIn();
    const { user: rani } = await signIn(other);

    await sariAgent
      .post('/api/v1/users/me/wishlist')
      .send({ productId, userId: rani.id })
      .expect(200);

    // Saved for the session's owner, not the id in the body.
    const mine = await sariAgent.get('/api/v1/users/me/wishlist').expect(200);
    expect(mine.body.data).toHaveLength(1);
    expect(sari.id).not.toBe(rani.id);
  });

  it('rejects an unknown product with 404 PRODUCT_NOT_FOUND', async () => {
    const { agent } = await signIn();

    const response = await agent
      .post('/api/v1/users/me/wishlist')
      .send({ productId: 999_999 })
      .expect(404);

    expect(response.body.error).toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
      message: 'Produk ini tidak ada di katalog kami.',
    });
  });

  it('rejects an inactive product with 404', async () => {
    const hidden = await insertProduct({ slug: 'disembunyikan', isActive: false });
    const { agent } = await signIn();

    const response = await agent
      .post('/api/v1/users/me/wishlist')
      .send({ productId: hidden })
      .expect(404);

    expect(response.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('accepts an active product with no stock', async () => {
    const soldOut = await insertProduct({ slug: 'habis', stock: 0 });
    const { agent } = await signIn();

    await agent.post('/api/v1/users/me/wishlist').send({ productId: soldOut }).expect(200);
  });

  it('rejects a missing product id with 422', async () => {
    const { agent } = await signIn();

    const response = await agent.post('/api/v1/users/me/wishlist').send({}).expect(422);

    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { field: 'productId', message: 'ID produk wajib diisi.' },
    });
  });

  it('rejects a string id with 422', async () => {
    const { agent } = await signIn();

    const response = await agent
      .post('/api/v1/users/me/wishlist')
      .send({ productId: '5' })
      .expect(422);

    expect(response.body.error.details.message).toBe('ID produk harus berupa angka.');
  });

  it('rejects a fractional id with 422', async () => {
    const { agent } = await signIn();

    const response = await agent
      .post('/api/v1/users/me/wishlist')
      .send({ productId: 1.5 })
      .expect(422);

    expect(response.body.error.details.message).toBe('ID produk harus berupa angka bulat.');
  });

  it('rejects a negative id with 422', async () => {
    const { agent } = await signIn();

    const response = await agent
      .post('/api/v1/users/me/wishlist')
      .send({ productId: -3 })
      .expect(422);

    expect(response.body.error.details.message).toBe('ID produk tidak valid.');
  });
});

describe('DELETE /api/v1/users/me/wishlist/:productId', () => {
  it('removes the saved product and returns null', async () => {
    const { agent } = await signIn();
    await agent.post('/api/v1/users/me/wishlist').send({ productId }).expect(200);

    const response = await agent
      .delete(`/api/v1/users/me/wishlist/${productId}`)
      .expect(200);

    expect(response.body).toEqual({ data: null });
    const list = await agent.get('/api/v1/users/me/wishlist').expect(200);
    expect(list.body.data).toEqual([]);
  });

  it('succeeds for a product that was never saved', async () => {
    const { agent } = await signIn();

    await agent.delete(`/api/v1/users/me/wishlist/${productId}`).expect(200);
  });

  it('cannot remove another customer’s saved product', async () => {
    const { agent: sariAgent } = await signIn();
    const { agent: raniAgent } = await signIn(other);

    await raniAgent.post('/api/v1/users/me/wishlist').send({ productId }).expect(200);
    await sariAgent.delete(`/api/v1/users/me/wishlist/${productId}`).expect(200);

    const theirs = await raniAgent.get('/api/v1/users/me/wishlist').expect(200);
    expect(theirs.body.data).toHaveLength(1);
  });

  it('rejects a non-numeric id with 422', async () => {
    const { agent } = await signIn();

    const response = await agent.delete('/api/v1/users/me/wishlist/abc').expect(422);

    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { field: 'id', message: 'ID produk harus berupa angka.' },
    });
  });

  it('rejects zero with 422', async () => {
    const { agent } = await signIn();

    const response = await agent.delete('/api/v1/users/me/wishlist/0').expect(422);
    expect(response.body.error.details.message).toBe('ID produk tidak valid.');
  });
});
