import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createPaymentService } from '../services/payments.js';
import { notificationSignature } from '../lib/payments.js';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';

/**
 * Payments over HTTP, against a real database and a fake provider.
 *
 * The fake provider is the point of this suite: no test reaches Midtrans, so the
 * suite is deterministic, but everything else is real — the checkout, the rows,
 * the signature check, the deduplication and the precedence rules.
 *
 * The URLs are the contract a reviewer can reproduce with curl; the tests assert
 * the same behaviour.
 */

const SERVER_KEY = 'SB-Mid-server-test-key';
const CLIENT_KEY = 'SB-Mid-client-test-key';

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

let app;
let provider;
let categoryId;

function buildProvider() {
  return {
    name: 'midtrans',
    configured: true,
    createTransaction: vi.fn(async () => ({
      token: 'snap-token-1',
      redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token-1',
    })),
    fetchStatus: vi.fn(async () => ({
      transaction_status: 'settlement',
      status_code: '200',
      gross_amount: '0.00',
      fraud_status: 'accept',
      transaction_id: 'tx-sync-1',
      payment_type: 'bank_transfer',
    })),
  };
}

function buildApp() {
  provider = buildProvider();

  const paymentService = createPaymentService(testPool, {
    provider,
    serverKey: SERVER_KEY,
    clientKey: CLIENT_KEY,
    isProduction: false,
    scriptUrl: 'https://app.sandbox.midtrans.com/snap/snap.js',
    clientOrigin: 'http://localhost:5173',
    expiryMinutes: 120,
  });

  return createApp({ pool: testPool, authRateLimitMax: 10_000, paymentService });
}

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
                  ARRAY['Rotan natural'], ARRAY['Standar'],
                  ARRAY['/images/products/product3.jpg'], false, true, true)
       RETURNING id`,
    [item.slug, item.name, categoryId, item.price, item.stock]
  );

  return rows[0].id;
}

async function insertAddress(userId) {
  const { rows } = await testPool.query(
    `INSERT INTO tbl_alamat (user_id, label, recipient, phone, street, district, city,
                             province, postal_code, notes, is_default)
          VALUES ($1, 'Rumah', 'Sari Wulandari', '081234567890', 'Jl. Kayu Tangi 1',
                  'Banjarmasin Utara', 'Banjarmasin', 'Kalimantan Selatan', '70123',
                  'Pagar hitam.', true)
       RETURNING id`,
    [userId]
  );

  return rows[0].id;
}

async function signIn({ as = account } = {}) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/register').send(as).expect(201);

  return { agent, user: response.body.data };
}

/** Registers, saves an address, fills the cart and checks out. */
async function placeOrder({ as = account, quantity = 1, paymentMethod = 'bca' } = {}) {
  const { agent, user } = await signIn({ as });
  const addressId = await insertAddress(user.id);
  const productId = await insertProduct();

  await agent
    .post('/api/v1/cart/items')
    .send({ productId, color: 'Rotan natural', size: 'Standar', quantity })
    .expect(200);

  const response = await agent
    .post('/api/v1/orders')
    .set('Idempotency-Key', `payment-test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .send({ addressId, shippingMethod: 'reguler', paymentMethod })
    .expect(201);

  return { agent, user, order: response.body.data };
}

async function paymentRows(orderNumber) {
  const { rows } = await testPool.query(
    `SELECT p.*, o.payment_status
       FROM tbl_pembayaran p
       JOIN tbl_pesanan o ON o.id = p.order_id
      WHERE o.order_number = $1
      ORDER BY p.attempt_no`,
    [orderNumber]
  );

  return rows;
}

async function orderPaymentStatus(orderNumber) {
  const { rows } = await testPool.query(
    'SELECT payment_status FROM tbl_pesanan WHERE order_number = $1',
    [orderNumber]
  );

  return rows[0].payment_status;
}

/**
 * A notification signed the way Midtrans signs it, so the only thing a test
 * varies is the thing it wants to test.
 */
function signedNotification(orderNumber, { grossAmount, status = 'settlement', ...rest } = {}) {
  const body = {
    order_id: orderNumber,
    status_code: '200',
    gross_amount: grossAmount,
    transaction_status: status,
    transaction_id: `tx-${status}-1`,
    payment_type: 'bank_transfer',
    fraud_status: 'accept',
    currency: 'IDR',
    ...rest,
  };

  body.signature_key = notificationSignature({
    orderId: body.order_id,
    statusCode: body.status_code,
    grossAmount: body.gross_amount,
    serverKey: SERVER_KEY,
  });

  return body;
}

beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();

  const { rows } = await testPool.query(
    `INSERT INTO tbl_kategori (slug, name, description, image, sort_order)
          VALUES ('kursi', 'Kursi', '', '', 0) RETURNING id`
  );
  categoryId = rows[0].id;
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('GET /api/v1/payments/config', () => {
  it('hands the browser the public Snap settings and never the server key', async () => {
    const response = await request(app).get('/api/v1/payments/config').expect(200);

    expect(response.body.data).toEqual({
      enabled: true,
      clientKey: CLIENT_KEY,
      scriptUrl: 'https://app.sandbox.midtrans.com/snap/snap.js',
      isProduction: false,
    });
    expect(JSON.stringify(response.body)).not.toContain(SERVER_KEY);
  });
});

describe('POST /api/v1/orders/:orderNumber/payments', () => {
  it('creates a Snap transaction priced from the stored order', async () => {
    const { agent, order } = await placeOrder();

    const response = await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(201);

    expect(response.body.data.payment).toMatchObject({
      status: 'pending',
      canPay: true,
      method: 'Transfer bank BCA',
    });
    expect(response.body.data.snap.token).toBe('snap-token-1');
    expect(response.body.data.snap.clientKey).toBe(CLIENT_KEY);

    expect(provider.createTransaction).toHaveBeenCalledTimes(1);

    const payload = provider.createTransaction.mock.calls[0][0];

    expect(payload.transaction_details).toEqual({
      order_id: order.orderNumber,
      gross_amount: order.total,
    });
    expect(payload.enabled_payments).toEqual(['bca_va']);

    const [attempt] = await paymentRows(order.orderNumber);

    expect(attempt.attempt_no).toBe(1);
    expect(attempt.provider_order_id).toBe(order.orderNumber);
    expect(attempt.snap_token).toBe('snap-token-1');
    expect(attempt.status).toBe('pending');
    expect(attempt.payment_status).toBe('pending');
    expect(await orderPaymentStatus(order.orderNumber)).toBe('pending');
  });

  it('reuses a pending attempt instead of creating a second provider order', async () => {
    const { agent, order } = await placeOrder();

    const first = await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(201);
    const second = await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(201);

    expect(second.body.data.snap.token).toBe(first.body.data.snap.token);
    expect(provider.createTransaction).toHaveBeenCalledTimes(1);
    expect(await paymentRows(order.orderNumber)).toHaveLength(1);
  });

  it('records a failed attempt and retries with a new provider order id', async () => {
    const { agent, order } = await placeOrder();

    provider.createTransaction.mockRejectedValueOnce(new Error('gateway timeout'));

    const failure = await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(502);

    expect(failure.body.error.code).toBe('PAYMENT_PROVIDER_ERROR');
    expect(await orderPaymentStatus(order.orderNumber)).toBe('failed');

    const retry = await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(201);

    expect(retry.body.data.snap.token).toBe('snap-token-1');

    const attempts = await paymentRows(order.orderNumber);

    expect(attempts).toHaveLength(2);
    expect(attempts[0].status).toBe('failed');
    expect(attempts[1].provider_order_id).toBe(`${order.orderNumber}-2`);
    expect(await orderPaymentStatus(order.orderNumber)).toBe('pending');
  });

  it('requires the owner’s session and refuses another customer’s order', async () => {
    const { order } = await placeOrder();

    await request(app).post(`/api/v1/orders/${order.orderNumber}/payments`).expect(401);

    const { agent: otherAgent } = await signIn({ as: other });

    const response = await otherAgent
      .post(`/api/v1/orders/${order.orderNumber}/payments`)
      .expect(404);

    expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
  });

  it('refuses a cancelled order and a paid order', async () => {
    const { agent, order } = await placeOrder();

    await testPool.query(`UPDATE tbl_pesanan SET status = 'cancelled' WHERE order_number = $1`, [
      order.orderNumber,
    ]);

    const cancelled = await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(409);
    expect(cancelled.body.error.code).toBe('ORDER_CANCELLED');

    await testPool.query(
      `UPDATE tbl_pesanan SET status = 'processing', payment_status = 'paid' WHERE order_number = $1`,
      [order.orderNumber]
    );

    const paid = await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(409);
    expect(paid.body.error.code).toBe('ORDER_ALREADY_PAID');
  });
});

describe('POST /api/v1/payments/midtrans/notification', () => {
  async function startedOrder() {
    const { agent, order } = await placeOrder();
    await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(201);

    return order;
  }

  it('applies a signed settlement to the payment and the order', async () => {
    const order = await startedOrder();

    const response = await request(app)
      .post('/api/v1/payments/midtrans/notification')
      .send(signedNotification(order.orderNumber, { grossAmount: `${order.total}.00` }))
      .expect(200);

    expect(response.body.data).toEqual({ received: true, outcome: 'applied', applied: true });

    const [attempt] = await paymentRows(order.orderNumber);

    expect(attempt.status).toBe('paid');
    expect(attempt.transaction_id).toBe('tx-settlement-1');
    expect(attempt.paid_at).not.toBeNull();
    expect(await orderPaymentStatus(order.orderNumber)).toBe('paid');

    const { rows } = await testPool.query(
      `SELECT outcome, transaction_status FROM tbl_notifikasi_pembayaran WHERE provider_order_id = $1`,
      [order.orderNumber]
    );

    expect(rows).toEqual([{ outcome: 'applied', transaction_status: 'settlement' }]);
  });

  it('acknowledges a replayed notification without applying it twice', async () => {
    const order = await startedOrder();
    const body = signedNotification(order.orderNumber, { grossAmount: `${order.total}.00` });

    await request(app).post('/api/v1/payments/midtrans/notification').send(body).expect(200);

    const paidAt = (await paymentRows(order.orderNumber))[0].paid_at;

    const replay = await request(app)
      .post('/api/v1/payments/midtrans/notification')
      .send(body)
      .expect(200);

    expect(replay.body.data).toEqual({ received: true, outcome: 'duplicate', applied: false });

    const attempts = await paymentRows(order.orderNumber);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].paid_at.toISOString()).toBe(paidAt.toISOString());
    expect(await orderPaymentStatus(order.orderNumber)).toBe('paid');

    const { rows } = await testPool.query(
      'SELECT count(*)::int AS count FROM tbl_notifikasi_pembayaran'
    );
    expect(rows[0].count).toBe(1);
  });

  it('rejects a forged signature and changes nothing', async () => {
    const order = await startedOrder();
    const forged = signedNotification(order.orderNumber, { grossAmount: `${order.total}.00` });
    forged.signature_key = 'b'.repeat(128);

    const response = await request(app)
      .post('/api/v1/payments/midtrans/notification')
      .send(forged)
      .expect(401);

    expect(response.body.error.code).toBe('INVALID_PAYMENT_SIGNATURE');
    expect(await orderPaymentStatus(order.orderNumber)).toBe('pending');

    const { rows } = await testPool.query(
      'SELECT count(*)::int AS count FROM tbl_notifikasi_pembayaran'
    );
    expect(rows[0].count).toBe(0);
  });

  it('refuses an amount that disagrees with the stored charge', async () => {
    const order = await startedOrder();

    const response = await request(app)
      .post('/api/v1/payments/midtrans/notification')
      .send(signedNotification(order.orderNumber, { grossAmount: '1.00' }))
      .expect(200);

    expect(response.body.data).toEqual({
      received: true,
      outcome: 'amount_mismatch',
      applied: false,
    });
    expect(await orderPaymentStatus(order.orderNumber)).toBe('pending');

    const [attempt] = await paymentRows(order.orderNumber);
    expect(attempt.status).toBe('pending');
  });

  it('acknowledges a notification for an unknown order', async () => {
    const response = await request(app)
      .post('/api/v1/payments/midtrans/notification')
      .send(signedNotification('BD-2026-9999', { grossAmount: '1000.00' }))
      .expect(200);

    expect(response.body.data.outcome).toBe('unknown_order');

    const { rows } = await testPool.query(
      `SELECT outcome, order_id FROM tbl_notifikasi_pembayaran WHERE provider_order_id = 'BD-2026-9999'`
    );
    expect(rows).toEqual([{ outcome: 'unknown_order', order_id: null }]);
  });

  it('ignores a late pending notification after a settlement', async () => {
    const order = await startedOrder();
    const settled = signedNotification(order.orderNumber, { grossAmount: `${order.total}.00` });

    await request(app).post('/api/v1/payments/midtrans/notification').send(settled).expect(200);

    const late = signedNotification(order.orderNumber, {
      grossAmount: `${order.total}.00`,
      status: 'pending',
      transaction_id: 'tx-pending-late',
    });

    const response = await request(app)
      .post('/api/v1/payments/midtrans/notification')
      .send(late)
      .expect(200);

    expect(response.body.data).toEqual({ received: true, outcome: 'stale', applied: false });
    expect(await orderPaymentStatus(order.orderNumber)).toBe('paid');
    expect((await paymentRows(order.orderNumber))[0].status).toBe('paid');
  });

  it('marks an expired attempt as expired', async () => {
    const order = await startedOrder();

    const response = await request(app)
      .post('/api/v1/payments/midtrans/notification')
      .send(
        signedNotification(order.orderNumber, {
          grossAmount: `${order.total}.00`,
          status: 'expire',
          transaction_id: 'tx-expire-1',
        })
      )
      .expect(200);

    expect(response.body.data.outcome).toBe('applied');
    expect(await orderPaymentStatus(order.orderNumber)).toBe('expired');
    expect((await paymentRows(order.orderNumber))[0].status).toBe('expired');
  });

  it('rejects a payload that is not in IDR', async () => {
    const order = await startedOrder();

    const response = await request(app)
      .post('/api/v1/payments/midtrans/notification')
      .send(
        signedNotification(order.orderNumber, {
          grossAmount: `${order.total}.00`,
          currency: 'USD',
        })
      )
      .expect(422);

    expect(response.body.error.code).toBe('PAYMENT_CURRENCY_MISMATCH');
  });

  it('rejects a body that does not satisfy the notification contract', async () => {
    const response = await request(app)
      .post('/api/v1/payments/midtrans/notification')
      .send({ order_id: 'BD-2026-0401' })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/orders/:orderNumber/payments/sync', () => {
  it('reconciles the status from the provider without trusting the browser', async () => {
    const { agent, order } = await placeOrder();
    await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(201);

    provider.fetchStatus.mockResolvedValueOnce({
      transaction_status: 'settlement',
      status_code: '200',
      gross_amount: `${order.total}.00`,
      fraud_status: 'accept',
      transaction_id: 'tx-sync-1',
      payment_type: 'bank_transfer',
    });

    const response = await agent
      .post(`/api/v1/orders/${order.orderNumber}/payments/sync`)
      .expect(200);

    expect(response.body.data).toMatchObject({ status: 'paid', outcome: 'applied' });
    expect(provider.fetchStatus).toHaveBeenCalledWith(order.orderNumber);
    expect(await orderPaymentStatus(order.orderNumber)).toBe('paid');
  });

  it('answers 404 when no payment was ever started', async () => {
    const { agent, order } = await placeOrder();

    const response = await agent
      .post(`/api/v1/orders/${order.orderNumber}/payments/sync`)
      .expect(404);

    expect(response.body.error.code).toBe('PAYMENT_NOT_FOUND');
  });
});

describe('GET /api/v1/orders/:orderNumber/payments', () => {
  it('reports no attempt before a payment starts, without creating one', async () => {
    const { agent, order } = await placeOrder({ paymentMethod: 'qris' });

    const response = await agent.get(`/api/v1/orders/${order.orderNumber}/payments`).expect(200);

    expect(response.body.data.payment).toEqual({
      status: 'unpaid',
      canPay: true,
      method: 'QRIS',
      attempt: null,
    });
    expect(provider.createTransaction).not.toHaveBeenCalled();
    expect(await paymentRows(order.orderNumber)).toHaveLength(0);
  });

  it('returns the stored QRIS code and the deadline the page counts down', async () => {
    const { agent, order } = await placeOrder({ paymentMethod: 'qris' });
    await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(201);

    // A pending answer is the one that carries the transaction-specific code.
    provider.fetchStatus.mockResolvedValueOnce({
      transaction_status: 'pending',
      status_code: '201',
      gross_amount: `${order.total}.00`,
      fraud_status: 'accept',
      transaction_id: 'tx-qris-pending',
      payment_type: 'qris',
      actions: [
        {
          name: 'generate_qr_code',
          method: 'GET',
          url: 'https://api.sandbox.midtrans.com/v2/qris/tx-qris-pending/qr-code',
        },
      ],
    });

    await agent.post(`/api/v1/orders/${order.orderNumber}/payments/sync`).expect(200);

    const response = await agent.get(`/api/v1/orders/${order.orderNumber}/payments`).expect(200);

    expect(response.body.data.payment).toMatchObject({
      status: 'pending',
      method: 'QRIS',
      attempt: {
        paymentType: 'qris',
        qrCodeUrl: 'https://api.sandbox.midtrans.com/v2/qris/tx-qris-pending/qr-code',
      },
    });
    expect(response.body.data.payment.attempt.expiresAt).toEqual(expect.any(String));
    expect((await paymentRows(order.orderNumber))[0].qr_code_url).toBe(
      'https://api.sandbox.midtrans.com/v2/qris/tx-qris-pending/qr-code'
    );
  });

  it('requires the owner’s session', async () => {
    const { order } = await placeOrder({ paymentMethod: 'qris' });

    await request(app).get(`/api/v1/orders/${order.orderNumber}/payments`).expect(401);

    const { agent: otherAgent } = await signIn({ as: other });

    const response = await otherAgent
      .get(`/api/v1/orders/${order.orderNumber}/payments`)
      .expect(404);

    expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
  });
});

describe('QRIS payments', () => {
  it('creates a Snap transaction on the QRIS channel only', async () => {
    const { agent, order } = await placeOrder({ paymentMethod: 'qris' });

    expect(order.paymentMethod).toBe('QRIS');

    const response = await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(201);

    expect(response.body.data.payment).toMatchObject({
      status: 'pending',
      canPay: true,
      method: 'QRIS',
    });

    const payload = provider.createTransaction.mock.calls[0][0];

    expect(payload.enabled_payments).toEqual(['other_qris']);
    expect(payload.credit_card).toBeUndefined();
    expect(payload.transaction_details).toEqual({
      order_id: order.orderNumber,
      gross_amount: order.total,
    });
  });

  it('keeps the order pending until a signed settlement arrives', async () => {
    const { agent, order } = await placeOrder({ paymentMethod: 'qris' });
    await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(201);

    expect(await orderPaymentStatus(order.orderNumber)).toBe('pending');

    const stillPending = await request(app)
      .post('/api/v1/payments/midtrans/notification')
      .send(
        signedNotification(order.orderNumber, {
          grossAmount: `${order.total}.00`,
          status: 'pending',
          status_code: '201',
          transaction_id: 'tx-qris-still-pending',
          payment_type: 'qris',
        })
      )
      .expect(200);

    // A repeat of the state the attempt is already in changes nothing, and in
    // particular does not make the order look paid.
    expect(stillPending.body.data.applied).toBe(false);
    expect(await orderPaymentStatus(order.orderNumber)).toBe('pending');

    const settled = await request(app)
      .post('/api/v1/payments/midtrans/notification')
      .send(
        signedNotification(order.orderNumber, {
          grossAmount: `${order.total}.00`,
          status: 'settlement',
          transaction_id: 'tx-qris-settled',
          payment_type: 'qris',
        })
      )
      .expect(200);

    expect(settled.body.data).toMatchObject({ outcome: 'applied', applied: true });
    expect(await orderPaymentStatus(order.orderNumber)).toBe('paid');

    const [attempt] = await paymentRows(order.orderNumber);

    expect(attempt.status).toBe('paid');
    expect(attempt.payment_type).toBe('qris');
    expect(attempt.paid_at).not.toBeNull();
  });

  it('marks a QRIS attempt expired and still offers a retry', async () => {
    const { agent, order } = await placeOrder({ paymentMethod: 'qris' });
    await agent.post(`/api/v1/orders/${order.orderNumber}/payments`).expect(201);

    const response = await request(app)
      .post('/api/v1/payments/midtrans/notification')
      .send(
        signedNotification(order.orderNumber, {
          grossAmount: `${order.total}.00`,
          status: 'expire',
          transaction_id: 'tx-qris-expire',
          payment_type: 'qris',
        })
      )
      .expect(200);

    expect(response.body.data.outcome).toBe('applied');
    expect(await orderPaymentStatus(order.orderNumber)).toBe('expired');
    expect((await paymentRows(order.orderNumber))[0].status).toBe('expired');

    // The code is dead, so the page must be able to start a new attempt.
    const state = await agent.get(`/api/v1/orders/${order.orderNumber}/payments`).expect(200);

    expect(state.body.data.payment).toMatchObject({ status: 'expired', canPay: true });
  });
});
