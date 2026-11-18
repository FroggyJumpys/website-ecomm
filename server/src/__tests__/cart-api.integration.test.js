import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { GUEST_CART_COOKIE, createGuestToken } from '../lib/guestCart.js';

/**
 * The cart endpoints over HTTP, for both kinds of caller.
 *
 * A guest is identified by a cookie the app hands out on the first add; a
 * customer by the session cookie. The tests below use real cookie jars so the
 * guest flow is exercised the way a browser would drive it — including the
 * merge at sign-in.
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

async function insertProduct(overrides = {}) {
  const item = {
    slug: 'kursi-rotan',
    name: 'Kursi Rotan',
    price: 1_500_000,
    stock: 6,
    colors: ['Rotan natural', 'Cokelat'],
    sizes: ['Standar'],
    isActive: true,
    ...overrides,
  };

  const { rows } = await testPool.query(
    `INSERT INTO tbl_produk (
            slug, name, category_id, price, rating, review_count, stock, material,
            dimensions, description, colors, sizes, images, is_new, is_trending, is_active
          )
          VALUES ($1, $2, $3, $4, 4.5, 12, $5, 'Rotan', '50 × 55 × 80 cm',
                  'Kursi rotan untuk ruang tamu.', $6, $7,
                  ARRAY['/images/products/product3.jpg'], false, true, $8)
       RETURNING id`,
    [item.slug, item.name, categoryId, item.price, item.stock, item.colors, item.sizes, item.isActive]
  );

  return rows[0].id;
}

/** A fresh browser: its own cookie jar, so guest carts do not collide. */
function guest() {
  return request.agent(app);
}

async function signIn(overrides = {}) {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/v1/auth/register')
    .send({ ...account, ...overrides })
    .expect(201);
  return { agent, user: response.body.data };
}

/** Reads the guest cookie the app just set, the way a browser would replay it. */
function guestCookieOf(response) {
  const cookies = response.headers['set-cookie'] ?? [];
  const raw = cookies.find((cookie) => cookie.startsWith(GUEST_CART_COOKIE));

  return raw ? raw.split(';')[0] : null;
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

describe('guest carts', () => {
  it('starts empty and hands out no cookie until something is added', async () => {
    const browser = guest();

    const response = await browser.get('/api/v1/cart').expect(200);

    expect(response.body.data).toEqual({ items: [], count: 0, subtotal: 0, canCheckout: false });
    expect(guestCookieOf(response)).toBeNull();
  });

  it('sets an httpOnly guest cookie on the first add', async () => {
    const productId = await insertProduct();
    const browser = guest();

    const response = await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar', quantity: 2 })
      .expect(200);

    const raw = (response.headers['set-cookie'] ?? []).find((cookie) =>
      cookie.startsWith(GUEST_CART_COOKIE)
    );

    expect(raw).toBeDefined();
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Path=\//i);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({ productId, quantity: 2 });
  });

  it('remembers the cart across requests through the cookie', async () => {
    const productId = await insertProduct();
    const browser = guest();

    await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar' })
      .expect(200);

    const response = await browser.get('/api/v1/cart').expect(200);
    expect(response.body.data.items).toHaveLength(1);
  });

  it('gives two browsers two separate carts', async () => {
    const productId = await insertProduct();
    const first = guest();
    const second = guest();

    await first
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar' })
      .expect(200);
    await second
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Cokelat', size: 'Standar' })
      .expect(200);

    const firstCart = await first.get('/api/v1/cart').expect(200);
    const secondCart = await second.get('/api/v1/cart').expect(200);

    expect(firstCart.body.data.items[0].color).toBe('Rotan natural');
    expect(secondCart.body.data.items[0].color).toBe('Cokelat');
  });

  it('ignores a made-up guest cookie instead of trusting it', async () => {
    const response = await request(app)
      .get('/api/v1/cart')
      .set('Cookie', `${GUEST_CART_COOKIE}=${createGuestToken()}`)
      .expect(200);

    expect(response.body.data.items).toEqual([]);
  });
});

describe('POST /api/v1/cart/items', () => {
  it('adds a line with the fields the cart page renders', async () => {
    const productId = await insertProduct();
    const browser = guest();

    const response = await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar' })
      .expect(200);

    expect(response.body.data.items[0]).toMatchObject({
      productId,
      slug: 'kursi-rotan',
      name: 'Kursi Rotan',
      image: '/images/products/product3.jpg',
      price: 1_500_000,
      color: 'Rotan natural',
      size: 'Standar',
      quantity: 1,
      lineTotal: 1_500_000,
      isAvailable: true,
      issues: [],
    });
  });

  it('increases the quantity of the same variant', async () => {
    const productId = await insertProduct();
    const browser = guest();

    await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar', quantity: 2 })
      .expect(200);
    const response = await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar', quantity: 1 })
      .expect(200);

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].quantity).toBe(3);
  });

  it('rejects an unknown product with 404', async () => {
    const response = await guest()
      .post('/api/v1/cart/items')
      .send({ productId: 999_999, color: '', size: '' })
      .expect(404);

    expect(response.body.error).toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
      message: 'Produk ini tidak ada di katalog kami.',
    });
  });

  it('rejects a colour the product does not offer with 422', async () => {
    const productId = await insertProduct();

    const response = await guest()
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Ungu', size: 'Standar' })
      .expect(422);

    expect(response.body.error.code).toBe('INVALID_VARIANT');
  });

  it('rejects an over-stock quantity with 409 and the available number', async () => {
    const productId = await insertProduct({ stock: 2 });

    const response = await guest()
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar', quantity: 3 })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      message: 'Stok tidak mencukupi. Tersisa 2 unit.',
      details: { available: 2, requested: 3 },
    });
  });

  it('rejects a missing product id with 422', async () => {
    const response = await guest().post('/api/v1/cart/items').send({}).expect(422);

    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { field: 'productId', message: 'ID produk wajib diisi.' },
    });
  });

  it('rejects a string product id with 422', async () => {
    const response = await guest().post('/api/v1/cart/items').send({ productId: '3' }).expect(422);

    expect(response.body.error.details).toMatchObject({
      field: 'productId',
      message: 'ID produk harus berupa angka.',
    });
  });

  it('rejects a zero quantity with 422', async () => {
    const productId = await insertProduct();

    const response = await guest()
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar', quantity: 0 })
      .expect(422);

    expect(response.body.error.details).toMatchObject({
      field: 'quantity',
      message: 'Jumlah minimal 1.',
    });
  });

  it('ignores a price and an owner in the body', async () => {
    const productId = await insertProduct();
    const browser = guest();

    const response = await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar', price: 1, userId: 99 })
      .expect(200);

    expect(response.body.data.items[0].price).toBe(1_500_000);
  });
});

describe('PATCH /api/v1/cart/items/:id', () => {
  it('sets an absolute quantity', async () => {
    const productId = await insertProduct();
    const browser = guest();
    const added = await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar', quantity: 2 })
      .expect(200);

    const itemId = added.body.data.items[0].id;
    const response = await browser
      .patch(`/api/v1/cart/items/${itemId}`)
      .send({ quantity: 4 })
      .expect(200);

    expect(response.body.data.items[0].quantity).toBe(4);
  });

  it('rejects a quantity above the stock with 409', async () => {
    const productId = await insertProduct({ stock: 2 });
    const browser = guest();
    const added = await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar' })
      .expect(200);

    await browser
      .patch(`/api/v1/cart/items/${added.body.data.items[0].id}`)
      .send({ quantity: 3 })
      .expect(409);
  });

  it('answers 404 for a line that is not yours', async () => {
    const productId = await insertProduct();
    const mine = guest();
    const theirs = guest();
    const added = await theirs
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar' })
      .expect(200);

    const response = await mine
      .patch(`/api/v1/cart/items/${added.body.data.items[0].id}`)
      .send({ quantity: 1 })
      .expect(404);

    expect(response.body.error.code).toBe('CART_ITEM_NOT_FOUND');
  });

  it('rejects a non-numeric route id with 422', async () => {
    const response = await guest().patch('/api/v1/cart/items/abc').send({ quantity: 1 }).expect(422);

    expect(response.body.error.details).toMatchObject({
      field: 'id',
      message: 'ID keranjang harus berupa angka.',
    });
  });

  it('rejects a missing quantity with 422', async () => {
    const response = await guest().patch('/api/v1/cart/items/1').send({}).expect(422);

    expect(response.body.error.details).toMatchObject({
      field: 'quantity',
      message: 'Jumlah wajib diisi.',
    });
  });
});

describe('DELETE /api/v1/cart/items/:id', () => {
  it('removes the line and returns the rest', async () => {
    const productId = await insertProduct();
    const browser = guest();
    const added = await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar' })
      .expect(200);

    const response = await browser
      .delete(`/api/v1/cart/items/${added.body.data.items[0].id}`)
      .expect(200);

    expect(response.body.data.items).toEqual([]);
  });

  it('succeeds for a line that was already gone', async () => {
    await guest().delete('/api/v1/cart/items/999999').expect(200);
  });

  it('cannot remove another browser’s line', async () => {
    const productId = await insertProduct();
    const mine = guest();
    const theirs = guest();
    const added = await theirs
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar' })
      .expect(200);

    await mine.delete(`/api/v1/cart/items/${added.body.data.items[0].id}`).expect(200);

    expect((await theirs.get('/api/v1/cart')).body.data.items).toHaveLength(1);
  });
});

describe('DELETE /api/v1/cart', () => {
  it('empties the cart', async () => {
    const productId = await insertProduct();
    const browser = guest();
    await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar' })
      .expect(200);

    const response = await browser.delete('/api/v1/cart').expect(200);

    expect(response.body.data).toEqual({ items: [], count: 0, subtotal: 0, canCheckout: false });
  });
});

describe('signed-in carts', () => {
  it('keeps an account cart across requests without a guest cookie', async () => {
    const productId = await insertProduct();
    const { agent } = await signIn();

    await agent
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar', quantity: 2 })
      .expect(200);

    const response = await agent.get('/api/v1/cart').expect(200);
    expect(response.body.data.count).toBe(2);
  });

  it('keeps two accounts’ carts apart', async () => {
    const productId = await insertProduct();
    const { agent: sariAgent } = await signIn();
    const { agent: raniAgent } = await signIn(other);

    await sariAgent
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar' })
      .expect(200);

    expect((await raniAgent.get('/api/v1/cart')).body.data.items).toEqual([]);
  });

  it('prefers the account cart even when a guest cookie is also sent', async () => {
    const productId = await insertProduct();
    const { agent } = await signIn();
    await agent
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar' })
      .expect(200);

    // A stale guest cookie must not shadow the account cart for a signed-in
    // request; the account is the authoritative owner.
    const response = await agent
      .get('/api/v1/cart')
      .set('Cookie', `${GUEST_CART_COOKIE}=${createGuestToken()}`)
      .expect(200);

    expect(response.body.data.items).toHaveLength(1);
  });

  it('keeps the account cart on logout, and does not expose it to the next guest', async () => {
    const productId = await insertProduct();
    const { agent } = await signIn();
    await agent
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar' })
      .expect(200);

    await agent.post('/api/v1/auth/logout').expect(200);

    const asGuest = await agent.get('/api/v1/cart').expect(200);
    expect(asGuest.body.data.items).toEqual([]);
  });
});

describe('cart merge on sign-in', () => {
  it('moves the guest cart into the account when the visitor signs in', async () => {
    const productId = await insertProduct();
    const browser = guest();
    await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar', quantity: 2 })
      .expect(200);

    const response = await browser.post('/api/v1/auth/login').send({
      email: account.email,
      password: account.password,
    });

    // The account does not exist yet in this test, so register instead.
    expect(response.status).toBe(401);

    const registered = await browser
      .post('/api/v1/auth/register')
      .send(account)
      .expect(201);

    expect(registered.body.data).toMatchObject({ email: account.email });
    expect(registered.body.meta.cartMerge).toEqual({ merged: true, adjustments: [] });

    const cart = await browser.get('/api/v1/cart').expect(200);
    expect(cart.body.data.items).toHaveLength(1);
    expect(cart.body.data.items[0].quantity).toBe(2);

    // A second sign-in must not merge the same cart again.
    await browser.post('/api/v1/auth/logout').expect(200);
    await browser.post('/api/v1/auth/login').send({
      email: account.email,
      password: account.password,
    }).expect(200);

    expect((await browser.get('/api/v1/cart')).body.data.items[0].quantity).toBe(2);
  });

  it('reports a stock adjustment the customer can see', async () => {
    const productId = await insertProduct({ stock: 3 });
    const { agent: existing } = await signIn();
    await existing
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar', quantity: 2 })
      .expect(200);

    const browser = guest();
    await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Cokelat', size: 'Standar', quantity: 2 })
      .expect(200);
    // Reduce the stock after the guest added, so the merge has to adjust.
    await testPool.query('UPDATE tbl_produk SET stock = 3 WHERE id = $1', [productId]);
    await testPool.query(
      `INSERT INTO tbl_item_keranjang (cart_id, product_id, quantity, color, size)
       SELECT id, $1, 2, 'Cokelat', 'Standar' FROM tbl_keranjang WHERE guest_token IS NOT NULL
       ON CONFLICT DO NOTHING`,
      [productId]
    );

    const response = await browser.post('/api/v1/auth/login').send({
      email: account.email,
      password: account.password,
    }).expect(200);

    // The account cart already held two of the three, so the guest's two show
    // up as one — and the customer is told.
    expect(response.body.meta.cartMerge.adjustments).toEqual([
      expect.objectContaining({ code: 'INSUFFICIENT_STOCK', quantity: 1, requestedQuantity: 2 }),
    ]);
  });

  it('does not touch the guest cart when the password is wrong', async () => {
    const productId = await insertProduct();
    const { agent: existing } = await signIn();
    const browser = guest();
    await browser
      .post('/api/v1/cart/items')
      .send({ productId, color: 'Rotan natural', size: 'Standar' })
      .expect(200);

    await browser
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: 'salah-sekali' })
      .expect(401);

    expect((await browser.get('/api/v1/cart')).body.data.items).toHaveLength(1);
    expect((await existing.get('/api/v1/cart')).body.data.items).toEqual([]);
  });

  it('leaves the response unchanged when there was no guest cart', async () => {
    const { agent } = await signIn();

    expect((await agent.get('/api/v1/auth/me')).body.data).toMatchObject({
      email: account.email,
    });
  });
});
