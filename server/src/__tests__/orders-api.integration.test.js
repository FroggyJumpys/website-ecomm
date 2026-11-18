import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';

/**
 * The three order endpoints over HTTP.
 *
 * Checkout is the only write a customer can make here: it spends the cart they
 * filled in 04f. History and detail are reads. Everything is owner-scoped from
 * the session, so the tests below always drive a real cookie jar and assert
 * that one customer can never see or spend another's.
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

const KEY = 'checkout-test-key-0001';

let categoryId;

async function insertProduct(overrides = {}) {
  const item = {
    slug: 'kursi-rotan',
    name: 'Kursi Rotan',
    price: 1_500_000,
    stock: 6,
    ...overrides,
  };

  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, price, rating, review_count, stock, material,
            dimensions, description, colors, sizes, images, is_new, is_trending, is_active
          )
          VALUES ($1, $2, $3, $4, 4.5, 12, $5, 'Rotan', '50 × 55 × 80 cm',
                  'Kursi rotan untuk ruang tamu.',
                  ARRAY['Rotan natural', 'Cokelat'], ARRAY['Standar'],
                  ARRAY['/images/products/product3.jpg'], false, true, true)
       RETURNING id`,
    [item.slug, item.name, categoryId, item.price, item.stock]
  );

  return rows[0].id;
}

async function signIn({ as = account } = {}) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/register').send(as).expect(201);

  return { agent, user: response.body.data };
}

async function insertAddress(userId) {
  const { rows } = await testPool.query(
    `INSERT INTO tbl_alamat (user_id, label, recipient, phone, street, district, city,
                             province, postal_code, notes, is_default)
          VALUES ($1, 'Rumah', 'Penerima', '081234567890', 'Jl. Kayu Tangi 1',
                  'Banjarmasin Utara', 'Banjarmasin', 'Kalimantan Selatan', '70123',
                  'Pagar hitam.', true)
       RETURNING id`,
    [userId]
  );

  return rows[0].id;
}

async function stockOf(productId) {
  const { rows } = await testPool.query('SELECT stock FROM tbl_produk WHERE id = $1', [productId]);
  return rows[0].stock;
}

async function count(table) {
  const { rows } = await testPool.query(`SELECT count(*)::int AS count FROM ${table}`);
  return rows[0].count;
}

function checkoutRequest(agent, body, key = KEY) {
  const request_ = agent.post('/api/v1/orders').send(body);
  return key === null ? request_ : request_.set('Idempotency-Key', key);
}

async function fillCart(agent, productId, overrides = {}) {
  await agent
    .post('/api/v1/cart/items')
    .send({ productId, color: 'Rotan natural', size: 'Standar', ...overrides })
    .expect(200);
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
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('POST /api/v1/orders', () => {
  it('creates the order and clears the server cart', async () => {
    const { agent, user } = await signIn();
    const addressId = await insertAddress(user.id);
    const productId = await insertProduct({ stock: 6 });
    await fillCart(agent, productId, { quantity: 2 });

    const response = await checkoutRequest(agent, {
      addressId,
      shippingMethod: 'reguler',
      paymentMethod: 'bca',
    }).expect(201);

    expect(response.body.meta).toEqual({ replayed: false });
    expect(response.body.data).toMatchObject({
      orderNumber: expect.stringMatching(/^BD-\d{4}-\d{4,}$/),
      status: 'processing',
      subtotal: 3_000_000,
      shippingCost: 85_000,
      discount: 0,
      total: 3_085_000,
      shippingMethod: 'reguler',
      paymentMethod: 'Transfer bank BCA',
      trackingNumber: null,
      cancellationReason: null,
      shippingAddress: {
        recipient: 'Penerima',
        phone: '081234567890',
        street: 'Jl. Kayu Tangi 1',
        district: 'Banjarmasin Utara',
        city: 'Banjarmasin',
        province: 'Kalimantan Selatan',
        postalCode: '70123',
        notes: 'Pagar hitam.',
      },
    });
    expect(response.body.data.items).toEqual([
      {
        productId,
        slug: 'kursi-rotan',
        name: 'Kursi Rotan',
        image: '/images/products/product3.jpg',
        price: 1_500_000,
        quantity: 2,
        color: 'Rotan natural',
        size: 'Standar',
      },
    ]);
    expect(response.body.data.timeline).toHaveLength(1);
    expect(response.body.data.timeline[0].status).toBe('processing');

    // No retry identity or owner leaks into the representation.
    expect(response.body.data).not.toHaveProperty('idempotencyKey');
    expect(response.body.data).not.toHaveProperty('requestFingerprint');
    expect(response.body.data).not.toHaveProperty('userId');

    await agent
      .get('/api/v1/cart')
      .expect(200)
      .expect((cart) => expect(cart.body.data.items).toEqual([]));

    expect(await stockOf(productId)).toBe(4);
  });

  it('replays the committed order and answers 200 with replayed: true', async () => {
    const { agent, user } = await signIn();
    const addressId = await insertAddress(user.id);
    const productId = await insertProduct({ stock: 6 });
    await fillCart(agent, productId, { quantity: 2 });

    const first = await checkoutRequest(agent, {
      addressId,
      shippingMethod: 'reguler',
      paymentMethod: 'bca',
    }).expect(201);

    const second = await checkoutRequest(agent, {
      addressId,
      shippingMethod: 'reguler',
      paymentMethod: 'bca',
    }).expect(200);

    expect(second.body.meta).toEqual({ replayed: true });
    expect(second.body.data.orderNumber).toBe(first.body.data.orderNumber);
    expect(await count('tbl_pesanan')).toBe(1);
    expect(await stockOf(productId)).toBe(4);
  });

  it('requires a session', async () => {
    const browser = request(app);

    const response = await browser
      .post('/api/v1/orders')
      .set('Idempotency-Key', KEY)
      .send({ addressId: 1, shippingMethod: 'reguler', paymentMethod: 'bca' })
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(await count('tbl_pesanan')).toBe(0);
  });

  it('rejects a request with no idempotency key before touching the cart', async () => {
    const { agent, user } = await signIn();
    const addressId = await insertAddress(user.id);
    const productId = await insertProduct();
    await fillCart(agent, productId);

    const response = await checkoutRequest(
      agent,
      { addressId, shippingMethod: 'reguler', paymentMethod: 'bca' },
      null
    ).expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toMatchObject({ field: 'idempotencyKey' });
    expect((await agent.get('/api/v1/cart').expect(200)).body.data.items).toHaveLength(1);
    expect(await count('tbl_pesanan')).toBe(0);
  });

  it('names the field for an unknown shipping method', async () => {
    const { agent, user } = await signIn();
    const addressId = await insertAddress(user.id);
    const productId = await insertProduct();
    await fillCart(agent, productId);

    const response = await checkoutRequest(agent, {
      addressId,
      shippingMethod: 'instan',
      paymentMethod: 'bca',
    }).expect(422);

    expect(response.body.error.details).toEqual({
      field: 'shippingMethod',
      message: 'Metode pengiriman tidak dikenal.',
    });
    // A validation failure must not spend the cart.
    expect((await agent.get('/api/v1/cart').expect(200)).body.data.items).toHaveLength(1);
  });

  it('refuses a body that carries prices or a card number', async () => {
    const { agent, user } = await signIn();
    const addressId = await insertAddress(user.id);
    const productId = await insertProduct();
    await fillCart(agent, productId);

    for (const extra of [{ total: 1 }, { items: [] }, { cardNumber: '4111111111111111' }]) {
      const response = await checkoutRequest(agent, {
        addressId,
        shippingMethod: 'reguler',
        paymentMethod: 'bca',
        ...extra,
      }).expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }

    expect(await count('tbl_pesanan')).toBe(0);
  });

  it('cannot spend another customer’s address', async () => {
    const { agent } = await signIn();
    const { user: stranger } = await signIn({ as: other });
    const foreignAddressId = await insertAddress(stranger.id);
    const productId = await insertProduct();
    await fillCart(agent, productId);

    const response = await checkoutRequest(agent, {
      addressId: foreignAddressId,
      shippingMethod: 'reguler',
      paymentMethod: 'bca',
    }).expect(404);

    expect(response.body.error.code).toBe('ADDRESS_NOT_FOUND');
    expect((await agent.get('/api/v1/cart').expect(200)).body.data.items).toHaveLength(1);
    expect(await count('tbl_pesanan')).toBe(0);
  });

  it('refuses an empty cart with the mock’s CART_EMPTY contract', async () => {
    const { agent, user } = await signIn();
    const addressId = await insertAddress(user.id);

    const response = await checkoutRequest(agent, {
      addressId,
      shippingMethod: 'reguler',
      paymentMethod: 'bca',
    }).expect(400);

    expect(response.body.error).toEqual({
      code: 'CART_EMPTY',
      message: 'Keranjangmu masih kosong.',
    });
  });

  it('refuses a different request under a committed key', async () => {
    const { agent, user } = await signIn();
    const addressId = await insertAddress(user.id);
    const productId = await insertProduct();
    await fillCart(agent, productId);

    await checkoutRequest(agent, {
      addressId,
      shippingMethod: 'reguler',
      paymentMethod: 'bca',
    }).expect(201);

    const response = await checkoutRequest(agent, {
      addressId,
      shippingMethod: 'kargo',
      paymentMethod: 'bca',
    }).expect(409);

    expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('keeps two customers separate under the same key', async () => {
    const sari = await signIn();
    const rani = await signIn({ as: other });
    const sariAddress = await insertAddress(sari.user.id);
    const raniAddress = await insertAddress(rani.user.id);
    const productId = await insertProduct({ stock: 6 });

    await fillCart(sari.agent, productId);
    await fillCart(rani.agent, productId, { color: 'Cokelat' });

    const first = await checkoutRequest(sari.agent, {
      addressId: sariAddress,
      shippingMethod: 'reguler',
      paymentMethod: 'bca',
    }).expect(201);

    const second = await checkoutRequest(rani.agent, {
      addressId: raniAddress,
      shippingMethod: 'reguler',
      paymentMethod: 'bca',
    }).expect(201);

    expect(second.body.data.orderNumber).not.toBe(first.body.data.orderNumber);
  });
});

describe('GET /api/v1/users/me/orders', () => {
  async function placeOrders(agent, user, count) {
    const addressId = await insertAddress(user.id);
    const numbers = [];

    for (let index = 0; index < count; index += 1) {
      const productId = await insertProduct({ slug: `produk-${index}`, name: `Produk ${index}` });
      await fillCart(agent, productId);

      const response = await checkoutRequest(
        agent,
        { addressId, shippingMethod: 'reguler', paymentMethod: 'bca' },
        `checkout-list-key-${String(index).padStart(4, '0')}`
      ).expect(201);

      numbers.push(response.body.data.orderNumber);
    }

    return numbers;
  }

  it('returns the newest order first with paging metadata and status counts', async () => {
    const { agent, user } = await signIn();
    const [first, second, third] = await placeOrders(agent, user, 3);

    await testPool.query(`UPDATE tbl_pesanan SET status = 'shipped' WHERE order_number = $1`, [
      second,
    ]);

    const response = await agent
      .get('/api/v1/users/me/orders?page=1&limit=2&status=all')
      .expect(200);

    expect(response.body.data.map((order) => order.orderNumber)).toEqual([third, second]);
    expect(response.body.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      statusCounts: { all: 3, processing: 2, shipped: 1, completed: 0, cancelled: 0 },
    });
    expect(response.body.data[0].items).toHaveLength(1);
    expect(response.body.data[0]).not.toHaveProperty('idempotencyKey');
    expect(first).toBeDefined();
  });

  it('filters by status while still counting every order', async () => {
    const { agent, user } = await signIn();
    const [, second] = await placeOrders(agent, user, 3);
    await testPool.query(`UPDATE tbl_pesanan SET status = 'completed' WHERE order_number = $1`, [
      second,
    ]);

    const response = await agent
      .get('/api/v1/users/me/orders?status=completed')
      .expect(200);

    expect(response.body.data.map((order) => order.orderNumber)).toEqual([second]);
    expect(response.body.meta.total).toBe(1);
    expect(response.body.meta.statusCounts.all).toBe(3);
  });

  it('applies the documented defaults', async () => {
    const { agent, user } = await signIn();
    await placeOrders(agent, user, 1);

    const response = await agent.get('/api/v1/users/me/orders').expect(200);

    expect(response.body.meta).toMatchObject({ page: 1, limit: 10, total: 1 });
  });

  it('rejects an unknown status, a repeated parameter and a bad page', async () => {
    const { agent } = await signIn();

    for (const query of ['status=refunded', 'page=dua', 'page=0', 'limit=101', 'page=1&page=2']) {
      const response = await agent.get(`/api/v1/users/me/orders?${query}`).expect(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.field).toBeTruthy();
    }
  });

  it('requires a session', async () => {
    await request(app).get('/api/v1/users/me/orders').expect(401);
  });

  it('never lists another customer’s orders', async () => {
    const sari = await signIn();
    const rani = await signIn({ as: other });
    await placeOrders(sari.agent, sari.user, 2);

    const response = await rani.agent.get('/api/v1/users/me/orders').expect(200);

    expect(response.body.data).toEqual([]);
    expect(response.body.meta.statusCounts.all).toBe(0);
  });
});

describe('GET /api/v1/users/me/orders/:orderNumber', () => {
  it('returns one owned order', async () => {
    const { agent, user } = await signIn();
    const addressId = await insertAddress(user.id);
    const productId = await insertProduct();
    await fillCart(agent, productId);

    const created = await checkoutRequest(agent, {
      addressId,
      shippingMethod: 'reguler',
      paymentMethod: 'bca',
    }).expect(201);

    const response = await agent
      .get(`/api/v1/users/me/orders/${created.body.data.orderNumber}`)
      .expect(200);

    expect(response.body.data).toEqual(created.body.data);
  });

  it('shows the same 404 for a missing and another customer’s order', async () => {
    const sari = await signIn();
    const rani = await signIn({ as: other });
    const addressId = await insertAddress(sari.user.id);
    const productId = await insertProduct();
    await fillCart(sari.agent, productId);

    const created = await checkoutRequest(sari.agent, {
      addressId,
      shippingMethod: 'reguler',
      paymentMethod: 'bca',
    }).expect(201);

    const foreign = await rani.agent
      .get(`/api/v1/users/me/orders/${created.body.data.orderNumber}`)
      .expect(404);
    const missing = await rani.agent
      .get('/api/v1/users/me/orders/BD-2026-9999')
      .expect(404);

    expect(foreign.body).toEqual(missing.body);
    expect(foreign.body.error.code).toBe('ORDER_NOT_FOUND');
  });

  it('rejects a malformed order number with the field named', async () => {
    const { agent } = await signIn();

    const response = await agent.get('/api/v1/users/me/orders/not-a-number').expect(422);

    expect(response.body.error.details).toEqual({
      field: 'orderNumber',
      message: 'Nomor pesanan tidak valid.',
    });
  });

  it('requires a session', async () => {
    await request(app).get('/api/v1/users/me/orders/BD-2026-1000').expect(401);
  });
});

describe('customer status writes', () => {
  it('exposes no route for a customer to change an order’s status', async () => {
    const { agent, user } = await signIn();
    const addressId = await insertAddress(user.id);
    const productId = await insertProduct();
    await fillCart(agent, productId);

    const created = await checkoutRequest(agent, {
      addressId,
      shippingMethod: 'reguler',
      paymentMethod: 'bca',
    }).expect(201);

    const number = created.body.data.orderNumber;

    for (const method of ['patch', 'put', 'delete']) {
      await agent[method](`/api/v1/users/me/orders/${number}`)
        .send({ status: 'completed' })
        .expect(404);
      await agent[method](`/api/v1/orders/${number}`)
        .send({ status: 'completed' })
        .expect(404);
    }

    // An admin status change is 04i's job; nothing here may have moved it.
    expect(await agent.get(`/api/v1/users/me/orders/${number}`).expect(200)).toMatchObject({
      body: { data: { status: 'processing' } },
    });
  });
});
