import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  testPool,
  migrateTestDatabase,
  resetDatabase,
  closeTestDatabase,
} from '../test/db.js';
import { createOrderStore } from '../db/orders.js';
import { registerUser } from '../services/auth.js';

/**
 * Order history and detail reads.
 *
 * An order is a record, not a view: the address and the prices were copied onto
 * it when it was placed, so deleting the address or renaming the product must
 * not change what the customer sees. Every read is owner-scoped, and a missing
 * order and another customer's order are indistinguishable.
 */

const store = createOrderStore(testPool);

let sari;
let rani;
let categoryId;

async function insertProduct(overrides = {}) {
  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, price, rating, review_count, stock, material,
            dimensions, description, colors, sizes, images, is_new, is_trending, is_active
          )
          VALUES ($1, $2, $3, $4, 4.5, 12, 10, 'Rotan', '50 × 55 × 80 cm',
                  'Kursi rotan.', ARRAY['Rotan natural'], ARRAY['Standar'],
                  ARRAY['/images/products/product3.jpg'], false, true, true)
       RETURNING id`,
    [overrides.slug ?? 'kursi-rotan', overrides.name ?? 'Kursi Rotan', categoryId, 1_500_000]
  );

  return rows[0].id;
}

async function insertOrder({ userId = sari.id, ...overrides } = {}) {
  const row = {
    order_number: 'BD-2026-0417',
    subtotal: 1_500_000,
    shipping_cost: 85_000,
    discount: 0,
    total: 1_585_000,
    payment_method: 'Transfer bank BCA',
    shipping_recipient: 'Sari Wulandari',
    shipping_phone: '081234567890',
    shipping_street: 'Jl. Kayu Tangi 1',
    shipping_district: 'Banjarmasin Utara',
    shipping_city: 'Banjarmasin',
    shipping_province: 'Kalimantan Selatan',
    shipping_postal_code: '70123',
    shipping_notes: 'Pagar hitam, titip ke satpam.',
    created_at: '2026-11-05T10:20:00+08:00',
    ...overrides,
  };

  const columns = Object.keys(row);
  const { rows } = await testPool.query(
    `INSERT INTO tbl_pesanan (user_id, ${columns.join(', ')})
          VALUES ($1, ${columns.map((_, index) => `$${index + 2}`).join(', ')})
       RETURNING id`,
    [userId, ...Object.values(row)]
  );

  return rows[0].id;
}

async function insertItem(orderId, overrides = {}) {
  const row = {
    product_name: 'Kursi Rotan',
    product_slug: 'kursi-rotan',
    image: '/images/products/product3.jpg',
    unit_price: 1_500_000,
    quantity: 1,
    color: 'Rotan natural',
    size: 'Standar',
    created_at: '2026-11-05T10:20:00+08:00',
    ...overrides,
  };

  const columns = Object.keys(row);
  const { rows } = await testPool.query(
    `INSERT INTO tbl_item_pesanan (order_id, ${columns.join(', ')})
          VALUES ($1, ${columns.map((_, index) => `$${index + 2}`).join(', ')})
       RETURNING id`,
    [orderId, ...Object.values(row)]
  );

  return rows[0].id;
}

async function insertEvent(orderId, overrides = {}) {
  const row = {
    status: 'processing',
    note: '',
    created_at: '2026-11-05T10:20:00+08:00',
    ...overrides,
  };

  await testPool.query(
    `INSERT INTO tbl_riwayat_status_pesanan (order_id, status, note, created_at)
          VALUES ($1, $2, $3, $4)`,
    [orderId, row.status, row.note, row.created_at]
  );
}

beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();

  const { rows } = await testPool.query(
    `INSERT INTO tbl_kategori (slug, name, description, image, sort_order)
          VALUES ('kursi', 'Kursi', '', '', 0) RETURNING id`
  );
  categoryId = rows[0].id;

  sari = await registerUser(testPool, {
    name: 'Sari Wulandari',
    email: 'sari@badekor.id',
    phone: '081234567890',
    password: 'rahasia123',
  });
  rani = await registerUser(testPool, {
    name: 'Rani BaDekor',
    email: 'rani@badekor.id',
    phone: '081100000000',
    password: 'rahasia123',
  });
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('get', () => {
  it('returns the full order in the shape the account pages render', async () => {
    const productId = await insertProduct();
    const orderId = await insertOrder({ shipping_method: 'reguler' });
    await insertItem(orderId, { product_id: productId });
    await insertEvent(orderId);

    const order = await store.get(sari.id, 'BD-2026-0417');

    expect(order).toEqual({
      orderNumber: 'BD-2026-0417',
      createdAt: '2026-11-05T02:20:00.000Z',
      status: 'processing',
      items: [
        {
          productId,
          slug: 'kursi-rotan',
          name: 'Kursi Rotan',
          image: '/images/products/product3.jpg',
          price: 1_500_000,
          quantity: 1,
          color: 'Rotan natural',
          size: 'Standar',
        },
      ],
      subtotal: 1_500_000,
      shippingCost: 85_000,
      discount: 0,
      total: 1_585_000,
      shippingMethod: 'reguler',
      shippingAddress: {
        recipient: 'Sari Wulandari',
        phone: '081234567890',
        street: 'Jl. Kayu Tangi 1',
        district: 'Banjarmasin Utara',
        city: 'Banjarmasin',
        province: 'Kalimantan Selatan',
        postalCode: '70123',
        notes: 'Pagar hitam, titip ke satpam.',
      },
      paymentMethod: 'Transfer bank BCA',
      // Orders written before step 05b have no policy id; the payment state is
      // `unpaid` because nothing was ever sent to a provider for them.
      paymentMethodId: null,
      paymentStatus: 'unpaid',
      trackingNumber: null,
      cancellationReason: null,
      timeline: [{ status: 'processing', at: '2026-11-05T02:20:00.000Z', note: '' }],
    });
  });

  it('never exposes the retry identity or the owner', async () => {
    const orderId = await insertOrder({
      idempotency_key: 'checkout-abcdef0123456789',
      request_fingerprint: 'a'.repeat(64),
    });
    await insertItem(orderId);
    await insertEvent(orderId);

    const order = await store.get(sari.id, 'BD-2026-0417');

    expect(Object.keys(order).sort()).toEqual([
      'cancellationReason',
      'createdAt',
      'discount',
      'items',
      'orderNumber',
      'paymentMethod',
      'paymentMethodId',
      'paymentStatus',
      'shippingAddress',
      'shippingCost',
      'shippingMethod',
      'status',
      'subtotal',
      'timeline',
      'total',
      'trackingNumber',
    ]);
    expect(order).not.toHaveProperty('idempotencyKey');
    expect(order).not.toHaveProperty('requestFingerprint');
    expect(order).not.toHaveProperty('userId');
  });

  it('reads a legacy order without a shipping method as null', async () => {
    const orderId = await insertOrder();
    await insertItem(orderId);
    await insertEvent(orderId);

    expect((await store.get(sari.id, 'BD-2026-0417')).shippingMethod).toBeNull();
  });

  it('keeps the snapshot after the address and the product change or vanish', async () => {
    const productId = await insertProduct();
    const orderId = await insertOrder();
    await insertItem(orderId, { product_id: productId });
    await insertEvent(orderId);

    await testPool.query(
      `UPDATE tbl_produk SET name = 'Kursi Rotan Baru', price = 9_999_000 WHERE id = $1`,
      [productId]
    );
    await testPool.query('UPDATE tbl_pengguna SET name = $1 WHERE id = $2', [
      'Nama Baru',
      sari.id,
    ]);
    await testPool.query('DELETE FROM tbl_produk WHERE id = $1', [productId]);

    const order = await store.get(sari.id, 'BD-2026-0417');

    expect(order.items[0]).toMatchObject({
      productId: null,
      name: 'Kursi Rotan',
      price: 1_500_000,
    });
    expect(order.shippingAddress.recipient).toBe('Sari Wulandari');
  });

  it('returns a cancellation reason and tracking number when they exist', async () => {
    const orderId = await insertOrder({
      status: 'cancelled',
      tracking_number: 'JNE-8821-4410',
      cancellation_reason: 'Jadwal pengiriman bentrok.',
    });
    await insertItem(orderId);
    await insertEvent(orderId);
    await insertEvent(orderId, {
      status: 'cancelled',
      created_at: '2026-11-06T08:00:00+08:00',
    });

    const order = await store.get(sari.id, 'BD-2026-0417');

    expect(order).toMatchObject({
      status: 'cancelled',
      trackingNumber: 'JNE-8821-4410',
      cancellationReason: 'Jadwal pengiriman bentrok.',
    });
    expect(order.timeline.map((event) => event.status)).toEqual(['processing', 'cancelled']);
  });

  it('sorts items by creation order and timeline oldest first', async () => {
    const orderId = await insertOrder();
    await insertItem(orderId, { product_name: 'Kedua', created_at: '2026-11-05T10:25:00+08:00' });
    await insertItem(orderId, { product_name: 'Pertama', created_at: '2026-11-05T10:20:00+08:00' });
    await insertEvent(orderId, { status: 'processing' });
    await insertEvent(orderId, { status: 'shipped', created_at: '2026-11-06T09:00:00+08:00' });
    await insertEvent(orderId, { status: 'completed', created_at: '2026-11-08T13:00:00+08:00' });

    const order = await store.get(sari.id, 'BD-2026-0417');

    expect(order.items.map((item) => item.name)).toEqual(['Pertama', 'Kedua']);
    expect(order.timeline.map((event) => event.status)).toEqual([
      'processing',
      'shipped',
      'completed',
    ]);
  });

  it('breaks a timeline tie with the identity column, not the planner order', async () => {
    const orderId = await insertOrder();
    await insertItem(orderId);
    const at = '2026-11-05T10:20:00+08:00';
    await insertEvent(orderId, { status: 'cancelled', created_at: at });
    await insertEvent(orderId, { status: 'processing', created_at: at });

    const order = await store.get(sari.id, 'BD-2026-0417');

    // Both events claim the same instant. The id tie-break makes the pair
    // deterministic across requests instead of planner-dependent.
    expect(order.timeline.map((event) => event.status)).toEqual(['cancelled', 'processing']);
  });

  it('reports a missing order as not found', async () => {
    await expect(store.get(sari.id, 'BD-2026-9999')).rejects.toMatchObject({
      status: 404,
      code: 'ORDER_NOT_FOUND',
      message: 'Pesanan ini tidak ditemukan.',
    });
  });

  it('cannot tell another owner’s order from one that does not exist', async () => {
    const orderId = await insertOrder({ userId: rani.id });
    await insertItem(orderId);
    await insertEvent(orderId);

    const foreign = await store.get(sari.id, 'BD-2026-0417').catch((error) => error);
    const missing = await store.get(sari.id, 'BD-2026-9999').catch((error) => error);

    expect(foreign).toMatchObject({ status: 404, code: 'ORDER_NOT_FOUND' });
    expect(foreign.message).toBe(missing.message);
    expect(foreign.details).toEqual(missing.details);
  });

  it('refuses a total it cannot represent exactly', async () => {
    // Passed as text: the point of the test is that the database holds a value
    // JSON cannot carry, and the read must refuse it rather than round it.
    const orderId = await insertOrder({
      subtotal: '9007199254740993',
      shipping_cost: 0,
      total: '9007199254740993',
    });
    await insertItem(orderId);
    await insertEvent(orderId);

    await expect(store.get(sari.id, 'BD-2026-0417')).rejects.toMatchObject({
      status: 409,
      code: 'ORDER_TOTAL_TOO_LARGE',
    });
  });

  it('refuses an item price it cannot represent exactly', async () => {
    const orderId = await insertOrder();
    await insertItem(orderId, { unit_price: '9007199254740993' });
    await insertEvent(orderId);

    await expect(store.get(sari.id, 'BD-2026-0417')).rejects.toMatchObject({
      status: 409,
      code: 'ORDER_TOTAL_TOO_LARGE',
    });
  });
});

describe('list', () => {
  async function seedHistory() {
    const statuses = ['processing', 'shipped', 'completed', 'cancelled'];

    for (const [index, status] of statuses.entries()) {
      const orderId = await insertOrder({
        order_number: `BD-2026-05${String(index).padStart(2, '0')}`,
        status,
        created_at: `2026-11-0${index + 1}T10:00:00+08:00`,
      });
      await insertItem(orderId, { product_name: `Barang ${index}` });
      await insertEvent(orderId, { status: 'processing' });
      if (status !== 'processing') {
        await insertEvent(orderId, { status, created_at: `2026-11-0${index + 1}T12:00:00+08:00` });
      }
    }
  }

  it('returns newest first with paging metadata', async () => {
    await seedHistory();

    const { orders, meta } = await store.list(sari.id, { page: 1, limit: 2, status: 'all' });

    expect(orders.map((order) => order.orderNumber)).toEqual(['BD-2026-0503', 'BD-2026-0502']);
    expect(meta).toEqual({
      page: 1,
      limit: 2,
      total: 4,
      totalPages: 2,
      statusCounts: { all: 4, processing: 1, shipped: 1, completed: 1, cancelled: 1 },
    });
    expect(orders[0].items).toHaveLength(1);
    expect(orders[0].timeline.length).toBeGreaterThan(0);
  });

  it('returns the second page', async () => {
    await seedHistory();

    const { orders, meta } = await store.list(sari.id, { page: 2, limit: 2, status: 'all' });

    expect(orders.map((order) => order.orderNumber)).toEqual(['BD-2026-0501', 'BD-2026-0500']);
    expect(meta.page).toBe(2);
  });

  it('filters before paging and counts every status across the whole history', async () => {
    await seedHistory();

    const { orders, meta } = await store.list(sari.id, {
      page: 1,
      limit: 10,
      status: 'completed',
    });

    expect(orders.map((order) => order.orderNumber)).toEqual(['BD-2026-0502']);
    expect(meta.total).toBe(1);
    expect(meta.totalPages).toBe(1);
    // The badges above the list show the whole history, not the filtered page.
    expect(meta.statusCounts).toEqual({
      all: 4,
      processing: 1,
      shipped: 1,
      completed: 1,
      cancelled: 1,
    });
  });

  it('returns an empty page past the end instead of failing', async () => {
    await seedHistory();

    const { orders, meta } = await store.list(sari.id, { page: 99, limit: 10, status: 'all' });

    expect(orders).toEqual([]);
    expect(meta).toMatchObject({ page: 99, total: 4, totalPages: 1 });
  });

  it('reports zero pages for an owner with no orders', async () => {
    const { orders, meta } = await store.list(rani.id, { page: 1, limit: 10, status: 'all' });

    expect(orders).toEqual([]);
    expect(meta).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
      statusCounts: { all: 0, processing: 0, shipped: 0, completed: 0, cancelled: 0 },
    });
  });

  it('never lists another owner’s orders or counts them', async () => {
    await seedHistory();
    await insertOrder({ userId: rani.id, order_number: 'BD-2026-0800' });

    const { orders, meta } = await store.list(rani.id, { page: 1, limit: 10, status: 'all' });

    expect(orders.map((order) => order.orderNumber)).toEqual(['BD-2026-0800']);
    expect(meta.statusCounts.all).toBe(1);
  });

  it('keeps a stable order when two orders share a timestamp', async () => {
    const timestamp = '2026-11-05T10:00:00+08:00';
    const first = await insertOrder({ order_number: 'BD-2026-0600', created_at: timestamp });
    const second = await insertOrder({ order_number: 'BD-2026-0601', created_at: timestamp });
    await insertItem(first);
    await insertItem(second);

    const { orders } = await store.list(sari.id, { page: 1, limit: 10, status: 'all' });

    // Same instant, so the query must fall back to id DESC — newest row first —
    // rather than returning whatever the planner happened to produce.
    expect(orders.map((order) => order.orderNumber)).toEqual(['BD-2026-0601', 'BD-2026-0600']);
    expect(orders[0].items).toHaveLength(1);
  });

  it('does not send one query per order', async () => {
    await seedHistory();

    let queries = 0;
    const counted = {
      query: (...args) => {
        queries += 1;
        return testPool.query(...args);
      },
      connect: (...args) => testPool.connect(...args),
    };

    await createOrderStore(counted).list(sari.id, { page: 1, limit: 10, status: 'all' });
    const onePage = queries;

    queries = 0;
    await createOrderStore(counted).list(sari.id, { page: 1, limit: 1, status: 'all' });

    // Page size must not change the number of statements: items and events are
    // fetched in one statement each, not per order.
    expect(onePage).toBe(queries);
    expect(onePage).toBeLessThanOrEqual(8);
  });
});
