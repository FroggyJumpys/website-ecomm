import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';

/**
 * The admin order API over HTTP.
 *
 * Four things are pinned here that no lower-level test can:
 *
 *  1. **The gate.** Guest, customer and admin sessions are exercised on every
 *     route, including the write-origin check a browser adds.
 *  2. **The listing contract.** Every customer's orders, newest first, with the
 *     owner attached, pagination and chips whose counts are scoped by the search
 *     but not by the selected status.
 *  3. **The transition contract.** Forward-only, terminal completion and
 *     cancellation, an idempotent same-status retry, and the `409` that names
 *     both the current state and the states that are still allowed.
 *  4. **The cancellation side effect.** Cancelling returns each line to stock
 *     exactly once, records a reason the customer can read, and survives a
 *     concurrent duplicate.
 */

const PASSWORD = 'rahasia123';
const DEFAULT_REASON = 'Pesanan dibatalkan oleh admin toko.';

let app;
let categoryId;
let userSeq;
let orderSeq;
let productSeq;

async function signedIn(role = 'customer', overrides = {}) {
  userSeq += 1;

  const as = {
    name: overrides.name ?? (role === 'admin' ? `Admin ${userSeq}` : `Pelanggan ${userSeq}`),
    email: overrides.email ?? `${role}${userSeq}@badekor.test`,
    phone: '081200000000',
    password: PASSWORD,
  };

  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/register').send(as).expect(201);

  if (role === 'admin') {
    await testPool.query(`UPDATE tbl_pengguna SET role = 'admin' WHERE id = $1`, [
      response.body.data.id,
    ]);
  }

  return { agent, user: response.body.data, as };
}

async function insertProduct({ stock = 10 } = {}) {
  productSeq += 1;

  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, price, rating, review_count, stock,
            material, dimensions, description, colors, sizes, images,
            is_new, is_trending, is_active
          )
          VALUES ($1, 'Kursi Rotan', $2, 1500000, 4.5, 10, $3,
                  'Rotan', '50 × 55 × 80 cm', 'Kursi rotan untuk ruang tamu.',
                  ARRAY['Rotan natural'], ARRAY['Standar'],
                  ARRAY['/images/products/product1.jpg'], false, false, true)
       RETURNING id, slug, name, price`,
    [`kursi-${productSeq}`, categoryId, stock]
  );

  return rows[0];
}

async function line(productId, overrides = {}) {
  const { rows } = await testPool.query(
    'SELECT id, slug, name, price FROM tbl_produk WHERE id = $1',
    [productId]
  );
  const product = rows[0];

  return {
    productId,
    slug: product.slug,
    name: product.name,
    price: product.price,
    quantity: 1,
    ...overrides,
  };
}

async function insertOrder({
  userId,
  status = 'processing',
  createdAt = '2026-11-01T10:00:00+08:00',
  items,
  orderNumber,
  cancellationReason = null,
}) {
  orderSeq += 1;

  const number = orderNumber ?? `BD-2026-${1000 + orderSeq}`;
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const { rows } = await testPool.query(
    `INSERT INTO tbl_pesanan (
            order_number, user_id, status, subtotal, shipping_cost, discount, total,
            payment_method, tracking_number, cancellation_reason,
            shipping_recipient, shipping_phone, shipping_street, shipping_district,
            shipping_city, shipping_province, shipping_postal_code, shipping_notes,
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, 0, 0, $4, 'Transfer bank BCA', NULL, $5,
                  'Penerima', '081234567890', 'Jl. Kayu Tangi 1', 'Banjarmasin Utara',
                  'Banjarmasin', 'Kalimantan Selatan', '70123', '', $6, $6)
       RETURNING id`,
    [number, userId, status, subtotal, cancellationReason, createdAt]
  );

  const orderId = rows[0].id;

  for (const item of items) {
    await testPool.query(
      `INSERT INTO tbl_item_pesanan (
              order_id, product_id, product_name, product_slug, image,
              unit_price, quantity, color, size
            )
            VALUES ($1, $2, $3, $4, '/images/products/product1.jpg', $5, $6, '', '')`,
      [orderId, item.productId ?? null, item.name, item.slug, item.price, item.quantity]
    );
  }

  await testPool.query(
    `INSERT INTO tbl_riwayat_status_pesanan (order_id, status, created_at, updated_at)
          VALUES ($1, 'processing', $2, $2)`,
    [orderId, createdAt]
  );

  if (status !== 'processing') {
    await testPool.query(
      `INSERT INTO tbl_riwayat_status_pesanan (order_id, status, created_at, updated_at)
            VALUES ($1, $2, $3, $3)`,
      [orderId, status, createdAt]
    );
  }

  return { id: orderId, orderNumber: number };
}

async function stockOf(productId) {
  const { rows } = await testPool.query('SELECT stock FROM tbl_produk WHERE id = $1', [productId]);
  return rows[0]?.stock;
}

async function countEvents(orderId, status) {
  const { rows } = await testPool.query(
    'SELECT count(*)::int AS total FROM tbl_riwayat_status_pesanan WHERE order_id = $1 AND status = $2',
    [orderId, status]
  );
  return rows[0].total;
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
  userSeq = 0;
  orderSeq = 0;
  productSeq = 0;
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('GET /api/v1/admin/orders', () => {
  it('lists every customer’s orders newest first with the owner attached', async () => {
    const admin = await signedIn('admin');
    const sari = await signedIn();
    const rani = await signedIn();
    const product = await insertProduct();

    const first = await insertOrder({
      userId: sari.user.id,
      createdAt: '2026-11-01T10:00:00+08:00',
      items: [await line(product.id, { quantity: 2 })],
    });
    const second = await insertOrder({
      userId: sari.user.id,
      status: 'shipped',
      createdAt: '2026-11-02T10:00:00+08:00',
      items: [await line(product.id)],
    });
    const third = await insertOrder({
      userId: rani.user.id,
      status: 'completed',
      createdAt: '2026-11-03T10:00:00+08:00',
      items: [await line(product.id)],
    });

    const response = await admin.agent.get('/api/v1/admin/orders').expect(200);

    expect(response.body.data.map((order) => order.orderNumber)).toEqual([
      third.orderNumber,
      second.orderNumber,
      first.orderNumber,
    ]);
    expect(response.body.data[0].customer).toEqual({
      id: rani.user.id,
      name: rani.as.name,
      email: rani.as.email,
      phone: rani.as.phone,
    });
    expect(response.body.data[0].items).toHaveLength(1);
    expect(response.body.data[0].timeline.map((entry) => entry.status)).toEqual([
      'processing',
      'completed',
    ]);
    expect(response.body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
      statusCounts: { all: 3, processing: 1, shipped: 1, completed: 1, cancelled: 0 },
    });
  });

  it('filters by status while the chips keep counting the whole search', async () => {
    const admin = await signedIn('admin');
    const customer = await signedIn();
    const product = await insertProduct();
    const item = await line(product.id);

    await insertOrder({ userId: customer.user.id, items: [item] });
    await insertOrder({ userId: customer.user.id, status: 'shipped', items: [item] });
    await insertOrder({ userId: customer.user.id, status: 'cancelled', items: [item] });

    const response = await admin.agent.get('/api/v1/admin/orders?status=shipped').expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].status).toBe('shipped');
    expect(response.body.meta.total).toBe(1);
    expect(response.body.meta.statusCounts).toEqual({
      all: 3,
      processing: 1,
      shipped: 1,
      completed: 0,
      cancelled: 1,
    });
  });

  it('searches the order number and the customer name or email as literals', async () => {
    const admin = await signedIn('admin');
    const sari = await signedIn('customer', { name: 'Sari Wulandari' });
    const rani = await signedIn('customer', { name: 'Rani BaDekor' });
    const product = await insertProduct();
    const item = await line(product.id);

    const sariOrder = await insertOrder({ userId: sari.user.id, items: [item] });
    const raniOrder = await insertOrder({ userId: rani.user.id, items: [item] });

    const byNumber = await admin.agent
      .get(`/api/v1/admin/orders?search=${encodeURIComponent(sariOrder.orderNumber)}`)
      .expect(200);
    expect(byNumber.body.data.map((order) => order.orderNumber)).toEqual([sariOrder.orderNumber]);

    const byName = await admin.agent.get('/api/v1/admin/orders?search=sari').expect(200);
    expect(byName.body.data.map((order) => order.orderNumber)).toEqual([sariOrder.orderNumber]);

    const byEmail = await admin.agent
      .get(`/api/v1/admin/orders?search=${encodeURIComponent(rani.as.email)}`)
      .expect(200);
    expect(byEmail.body.data.map((order) => order.orderNumber)).toEqual([raniOrder.orderNumber]);

    // `%` and `_` are LIKE metacharacters; a search box must treat them as text.
    const wildcard = await admin.agent.get('/api/v1/admin/orders?search=%25').expect(200);
    expect(wildcard.body.data).toEqual([]);
    expect(wildcard.body.meta.total).toBe(0);
  });

  it('scopes the chip counts to the search but not to the selected status', async () => {
    const admin = await signedIn('admin');
    const sari = await signedIn('customer', { name: 'Sari Wulandari' });
    const rani = await signedIn('customer', { name: 'Rani BaDekor' });
    const product = await insertProduct();
    const item = await line(product.id);

    await insertOrder({ userId: sari.user.id, items: [item] });
    await insertOrder({ userId: sari.user.id, status: 'shipped', items: [item] });
    await insertOrder({ userId: rani.user.id, status: 'shipped', items: [item] });

    const response = await admin.agent
      .get('/api/v1/admin/orders?search=sari&status=shipped')
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta.statusCounts).toMatchObject({
      all: 2,
      processing: 1,
      shipped: 1,
      completed: 0,
      cancelled: 0,
    });
  });

  it('pages the list without losing the total', async () => {
    const admin = await signedIn('admin');
    const customer = await signedIn();
    const product = await insertProduct();
    const item = await line(product.id);

    for (let index = 1; index <= 3; index += 1) {
      await insertOrder({
        userId: customer.user.id,
        createdAt: `2026-11-0${index}T10:00:00+08:00`,
        items: [item],
      });
    }

    const response = await admin.agent.get('/api/v1/admin/orders?page=2&limit=2').expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('returns an empty page when no order matches', async () => {
    const admin = await signedIn('admin');

    const response = await admin.agent.get('/api/v1/admin/orders').expect(200);

    expect(response.body.data).toEqual([]);
    expect(response.body.meta).toMatchObject({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      statusCounts: { all: 0, processing: 0, shipped: 0, completed: 0, cancelled: 0 },
    });
  });

  it('rejects invalid query parameters with the offending field', async () => {
    const admin = await signedIn('admin');

    for (const [query, field] of [
      ['page=0', 'page'],
      ['page=dua', 'page'],
      ['limit=101', 'limit'],
      ['status=refunded', 'status'],
      ['status=shipped&status=completed', 'status'],
      [`search=${'a'.repeat(101)}`, 'search'],
    ]) {
      const response = await admin.agent.get(`/api/v1/admin/orders?${query}`).expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.field).toBe(field);
    }
  });
});

describe('GET /api/v1/admin/orders/:orderNumber', () => {
  it('returns another customer’s order with its owner and snapshots', async () => {
    const admin = await signedIn('admin');
    const customer = await signedIn();
    const product = await insertProduct();
    const order = await insertOrder({
      userId: customer.user.id,
      items: [await line(product.id, { quantity: 2 })],
    });

    const response = await admin.agent.get(`/api/v1/admin/orders/${order.orderNumber}`).expect(200);

    expect(response.body.data).toMatchObject({
      orderNumber: order.orderNumber,
      status: 'processing',
      customer: { id: customer.user.id, name: customer.as.name, email: customer.as.email },
      items: [{ productId: product.id, quantity: 2, price: 1_500_000 }],
    });
  });

  it('answers 404 for an unknown number and 422 for a malformed one', async () => {
    const admin = await signedIn('admin');

    const missing = await admin.agent.get('/api/v1/admin/orders/BD-2026-9999').expect(404);
    expect(missing.body.error.code).toBe('ORDER_NOT_FOUND');

    const malformed = await admin.agent.get('/api/v1/admin/orders/not-a-number').expect(422);
    expect(malformed.body.error.details.field).toBe('orderNumber');
  });
});

describe('PATCH /api/v1/admin/orders/:orderNumber/status', () => {
  it('moves an order forward and shows the event to the customer', async () => {
    const admin = await signedIn('admin');
    const customer = await signedIn();
    const product = await insertProduct();
    const order = await insertOrder({
      userId: customer.user.id,
      items: [await line(product.id)],
    });

    const response = await admin.agent
      .patch(`/api/v1/admin/orders/${order.orderNumber}/status`)
      .send({ status: 'shipped' })
      .expect(200);

    expect(response.body.data.status).toBe('shipped');
    expect(response.body.data.timeline.map((entry) => entry.status)).toEqual([
      'processing',
      'shipped',
    ]);

    const history = await customer.agent
      .get(`/api/v1/users/me/orders/${order.orderNumber}`)
      .expect(200);

    expect(history.body.data.status).toBe('shipped');
    expect(history.body.data.timeline.at(-1).status).toBe('shipped');
  });

  it('answers a same-status retry without adding a second event', async () => {
    const admin = await signedIn('admin');
    const customer = await signedIn();
    const product = await insertProduct();
    const order = await insertOrder({
      userId: customer.user.id,
      items: [await line(product.id)],
    });

    const response = await admin.agent
      .patch(`/api/v1/admin/orders/${order.orderNumber}/status`)
      .send({ status: 'processing' })
      .expect(200);

    expect(response.body.data.status).toBe('processing');
    expect(response.body.data.timeline).toHaveLength(1);
    expect(await countEvents(order.id, 'processing')).toBe(1);
  });

  it('records a tracking number and clears it without a timeline event', async () => {
    const admin = await signedIn('admin');
    const customer = await signedIn();
    const product = await insertProduct();
    const order = await insertOrder({
      userId: customer.user.id,
      items: [await line(product.id)],
    });

    const shipped = await admin.agent
      .patch(`/api/v1/admin/orders/${order.orderNumber}/status`)
      .send({ status: 'shipped', trackingNumber: ' JNE-8821-4410 ' })
      .expect(200);

    expect(shipped.body.data.trackingNumber).toBe('JNE-8821-4410');
    expect(shipped.body.data.timeline).toHaveLength(2);

    const cleared = await admin.agent
      .patch(`/api/v1/admin/orders/${order.orderNumber}/status`)
      .send({ status: 'shipped', trackingNumber: '' })
      .expect(200);

    expect(cleared.body.data.trackingNumber).toBeNull();
    expect(cleared.body.data.timeline).toHaveLength(2);
  });

  it('restores stock and records a reason when an order is cancelled', async () => {
    const admin = await signedIn('admin');
    const customer = await signedIn();
    const product = await insertProduct({ stock: 10 });
    const order = await insertOrder({
      userId: customer.user.id,
      items: [await line(product.id, { quantity: 2 })],
    });

    const response = await admin.agent
      .patch(`/api/v1/admin/orders/${order.orderNumber}/status`)
      .send({ status: 'cancelled' })
      .expect(200);

    expect(response.body.data.status).toBe('cancelled');
    expect(response.body.data.cancellationReason).toBe(DEFAULT_REASON);
    expect(response.body.data.timeline.map((entry) => entry.status)).toEqual([
      'processing',
      'cancelled',
    ]);
    expect(await stockOf(product.id)).toBe(12);

    const again = await admin.agent
      .patch(`/api/v1/admin/orders/${order.orderNumber}/status`)
      .send({ status: 'cancelled' })
      .expect(200);

    expect(again.body.data.status).toBe('cancelled');
    expect(await stockOf(product.id)).toBe(12);
    expect(await countEvents(order.id, 'cancelled')).toBe(1);
  });

  it('restocks only once when two cancellations arrive together', async () => {
    const admin = await signedIn('admin');
    const customer = await signedIn();
    const product = await insertProduct({ stock: 10 });
    const order = await insertOrder({
      userId: customer.user.id,
      items: [await line(product.id, { quantity: 2 })],
    });

    const path = `/api/v1/admin/orders/${order.orderNumber}/status`;
    const responses = await Promise.all([
      admin.agent.patch(path).send({ status: 'cancelled' }),
      admin.agent.patch(path).send({ status: 'cancelled' }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('cancelled');
    }

    expect(await stockOf(product.id)).toBe(12);
    expect(await countEvents(order.id, 'cancelled')).toBe(1);
  });

  it('skips the stock restore for a line whose product was deleted', async () => {
    const admin = await signedIn('admin');
    const customer = await signedIn();
    const kept = await insertProduct({ stock: 10 });
    const deleted = await insertProduct({ stock: 4 });
    const order = await insertOrder({
      userId: customer.user.id,
      items: [await line(kept.id, { quantity: 2 }), await line(deleted.id)],
    });

    await testPool.query('DELETE FROM tbl_produk WHERE id = $1', [deleted.id]);

    await admin.agent
      .patch(`/api/v1/admin/orders/${order.orderNumber}/status`)
      .send({ status: 'cancelled' })
      .expect(200);

    expect(await stockOf(kept.id)).toBe(12);
  });

  it('refuses backward moves and leaves a terminal status alone', async () => {
    const admin = await signedIn('admin');
    const customer = await signedIn();
    const product = await insertProduct();
    const item = await line(product.id);
    const completed = await insertOrder({
      userId: customer.user.id,
      status: 'completed',
      items: [item],
    });
    const shipped = await insertOrder({
      userId: customer.user.id,
      status: 'shipped',
      items: [item],
    });

    const fromCompleted = await admin.agent
      .patch(`/api/v1/admin/orders/${completed.orderNumber}/status`)
      .send({ status: 'cancelled' })
      .expect(409);

    expect(fromCompleted.body.error.code).toBe('ORDER_STATUS_CONFLICT');
    expect(fromCompleted.body.error.details).toEqual({
      from: 'completed',
      to: 'cancelled',
      allowed: [],
    });

    const backward = await admin.agent
      .patch(`/api/v1/admin/orders/${shipped.orderNumber}/status`)
      .send({ status: 'processing' })
      .expect(409);

    expect(backward.body.error.details).toEqual({
      from: 'shipped',
      to: 'processing',
      allowed: ['completed', 'cancelled'],
    });

    const unchanged = await admin.agent
      .get(`/api/v1/admin/orders/${completed.orderNumber}`)
      .expect(200);

    expect(unchanged.body.data.status).toBe('completed');
  });

  it('rejects an unknown status, an unknown field or a missing status', async () => {
    const admin = await signedIn('admin');
    const customer = await signedIn();
    const product = await insertProduct();
    const order = await insertOrder({
      userId: customer.user.id,
      items: [await line(product.id)],
    });
    const path = `/api/v1/admin/orders/${order.orderNumber}/status`;

    for (const [body, field] of [
      [{ status: 'refunded' }, 'status'],
      [{ status: 'shipped', total: 1 }, '(root)'],
      [{}, 'status'],
      [{ status: 'shipped', trackingNumber: 42 }, 'trackingNumber'],
      [{ status: 'shipped', trackingNumber: 'x'.repeat(65) }, 'trackingNumber'],
    ]) {
      const response = await admin.agent.patch(path).send(body).expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.field).toBe(field);
    }
  });

  it('answers 404 for an unknown order and 422 for a malformed number', async () => {
    const admin = await signedIn('admin');

    const missing = await admin.agent
      .patch('/api/v1/admin/orders/BD-2026-9999/status')
      .send({ status: 'shipped' })
      .expect(404);
    expect(missing.body.error.code).toBe('ORDER_NOT_FOUND');

    const malformed = await admin.agent
      .patch('/api/v1/admin/orders/not-a-number/status')
      .send({ status: 'shipped' })
      .expect(422);
    expect(malformed.body.error.details.field).toBe('orderNumber');
  });

  it('refuses a cross-site write and leaves the order untouched', async () => {
    const admin = await signedIn('admin');
    const customer = await signedIn();
    const product = await insertProduct();
    const order = await insertOrder({
      userId: customer.user.id,
      items: [await line(product.id)],
    });

    const response = await admin.agent
      .patch(`/api/v1/admin/orders/${order.orderNumber}/status`)
      .set('Origin', 'https://evil.example')
      .send({ status: 'shipped' })
      .expect(403);

    expect(response.body.error.code).toBe('CROSS_SITE_REQUEST');

    const unchanged = await admin.agent
      .get(`/api/v1/admin/orders/${order.orderNumber}`)
      .expect(200);
    expect(unchanged.body.data.status).toBe('processing');
  });
});

describe('admin order authorization', () => {
  it('refuses guests and customers on every route', async () => {
    const guest = request.agent(app);
    const customer = await signedIn();
    const product = await insertProduct();
    const order = await insertOrder({
      userId: customer.user.id,
      items: [await line(product.id)],
    });

    const paths = [
      ['get', '/api/v1/admin/orders'],
      ['get', `/api/v1/admin/orders/${order.orderNumber}`],
      ['patch', `/api/v1/admin/orders/${order.orderNumber}/status`],
    ];

    for (const [method, path] of paths) {
      const asGuest = await guest[method](path).send({ status: 'shipped' }).expect(401);
      expect(asGuest.body.error.code).toBe('UNAUTHENTICATED');

      const asCustomer = await customer.agent[method](path).send({ status: 'shipped' }).expect(403);
      expect(asCustomer.body.error.code).toBe('FORBIDDEN');
    }
  });
});
