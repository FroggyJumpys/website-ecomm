import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  testPool,
  migrateTestDatabase,
  resetDatabase,
  closeTestDatabase,
} from '../test/db.js';
import { createCheckoutStore } from '../db/checkout.js';
import { createCartStore } from '../db/cart.js';
import { registerUser } from '../services/auth.js';

/**
 * Checkout: one transaction that either turns the whole cart into an order or
 * changes nothing.
 *
 * The interesting failures are the ones that leave a half-order behind: stock
 * taken for a checkout that failed, an order written for stock that was already
 * gone, or a retry charging the customer twice. Each is asserted against the
 * database, not against the return value alone.
 */

const checkout = createCheckoutStore(testPool);
const cart = createCartStore(testPool);

let sari;
let rani;
let categoryId;

function checkoutInput(overrides = {}) {
  return { addressId: sari.addressId, shippingMethod: 'reguler', paymentMethod: 'bca', ...overrides };
}

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
    [
      item.slug,
      item.name,
      categoryId,
      item.price,
      item.stock,
      item.colors,
      item.sizes,
      item.isActive,
    ]
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

async function stockOf(productId) {
  const { rows } = await testPool.query('SELECT stock FROM tbl_produk WHERE id = $1', [productId]);
  return rows[0].stock;
}

async function count(table) {
  const { rows } = await testPool.query(`SELECT count(*)::int AS count FROM ${table}`);
  return rows[0].count;
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
  sari.addressId = await insertAddress(sari.id);

  rani = await registerUser(testPool, {
    name: 'Rani BaDekor',
    email: 'rani@badekor.id',
    phone: '081100000000',
    password: 'rahasia123',
  });
  rani.addressId = await insertAddress(rani.id);
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('create', () => {
  it('turns one cart line into a processing order and takes the stock', async () => {
    const productId = await insertProduct({ stock: 6 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });

    const { order, replayed } = await checkout.create(
      sari.id,
      checkoutInput(),
      'checkout-aaaaaaaaaaaaaaa1'
    );

    expect(replayed).toBe(false);
    expect(order).toMatchObject({
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
        recipient: 'Sari Wulandari',
        phone: '081234567890',
        street: 'Jl. Kayu Tangi 1',
        district: 'Banjarmasin Utara',
        city: 'Banjarmasin',
        province: 'Kalimantan Selatan',
        postalCode: '70123',
        notes: 'Pagar hitam.',
      },
    });
    expect(order.orderNumber).toMatch(/^BD-\d{4}-\d{4,}$/);
    expect(order.items).toEqual([
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
    expect(order.timeline).toHaveLength(1);
    expect(order.timeline[0]).toMatchObject({ status: 'processing', note: '' });

    expect(await stockOf(productId)).toBe(4);
    expect(await count('tbl_pesanan')).toBe(1);
    expect(await count('tbl_item_pesanan')).toBe(1);
    expect(await count('tbl_riwayat_status_pesanan')).toBe(1);
    expect((await cart.read({ userId: sari.id })).items).toEqual([]);
  });

  it('keeps the created cart row after checkout', async () => {
    const productId = await insertProduct();
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    await checkout.create(sari.id, checkoutInput(), 'checkout-aaaaaaaaaaaaaaa2');

    // The row stays so the next add does not have to race to recreate it, and
    // so a second checkout of an empty cart is a clean CART_EMPTY.
    expect(await count('tbl_keranjang')).toBe(1);
  });

  it('charges the current database price, not whatever the cart was read at', async () => {
    const productId = await insertProduct({ price: 1_500_000 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    await testPool.query('UPDATE tbl_produk SET price = 1_750_000 WHERE id = $1', [productId]);

    const { order } = await checkout.create(
      sari.id,
      checkoutInput(),
      'checkout-aaaaaaaaaaaaaaa3'
    );

    expect(order.subtotal).toBe(1_750_000);
    expect(order.items[0].price).toBe(1_750_000);
  });

  it('combines every variant of one product into one stock deduction', async () => {
    const productId = await insertProduct({ stock: 5 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });
    await cart.add({ userId: sari.id }, { productId, color: 'Cokelat', size: 'Standar', quantity: 2 });

    const { order } = await checkout.create(
      sari.id,
      checkoutInput(),
      'checkout-aaaaaaaaaaaaaaa4'
    );

    expect(order.items).toHaveLength(2);
    expect(await stockOf(productId)).toBe(1);
  });

  it('handles several products and keeps the cart insertion order', async () => {
    const first = await insertProduct({ slug: 'pertama', name: 'Pertama', price: 1_000_000 });
    const second = await insertProduct({ slug: 'kedua', name: 'Kedua', price: 250_000, stock: 9 });

    await cart.add({ userId: sari.id }, { productId: first, color: 'Rotan natural', size: 'Standar' });
    await cart.add({ userId: sari.id }, { productId: second, color: 'Cokelat', size: 'Standar', quantity: 3 });

    const { order } = await checkout.create(
      sari.id,
      checkoutInput(),
      'checkout-aaaaaaaaaaaaaaa5'
    );

    expect(order.items.map((item) => item.name)).toEqual(['Pertama', 'Kedua']);
    expect(order.subtotal).toBe(1_750_000);
    expect(await stockOf(first)).toBe(5);
    expect(await stockOf(second)).toBe(6);
  });

  it('accepts every shipping and payment combination at its own rate', async () => {
    let index = 0;

    for (const [shippingMethod, shippingCost] of [
      ['reguler', 85_000],
      ['kargo', 250_000],
      ['workshop', 0],
    ]) {
      for (const [paymentMethod, label] of [
        ['bca', 'Transfer bank BCA'],
        ['bni-va', 'Virtual account BNI'],
        ['qris', 'QRIS'],
        ['kartu', 'Kartu kredit'],
      ]) {
        index += 1;
        const productId = await insertProduct({
          slug: `produk-${index}`,
          name: `Produk ${index}`,
          price: 100_000,
        });

        await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

        const { order } = await checkout.create(
          sari.id,
          checkoutInput({ shippingMethod, paymentMethod }),
          `checkout-aaaaaaaaaaaaaa${String(index).padStart(2, '0')}`
        );

        expect(order).toMatchObject({
          shippingMethod,
          shippingCost,
          paymentMethod: label,
          total: 100_000 + shippingCost,
        });
      }
    }
  });

  it('only empties the buyer’s cart', async () => {
    const productId = await insertProduct();
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });
    await cart.add({ userId: rani.id }, { productId, color: 'Cokelat', size: 'Standar' });

    await checkout.create(sari.id, checkoutInput(), 'checkout-aaaaaaaaaaaaaaa6');

    expect((await cart.read({ userId: sari.id })).items).toEqual([]);
    expect((await cart.read({ userId: rani.id })).items).toHaveLength(1);
  });

  it('rejects a missing address', async () => {
    const productId = await insertProduct();
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    await expect(
      checkout.create(sari.id, checkoutInput({ addressId: 999_999 }), 'checkout-aaaaaaaaaaaaaaa7')
    ).rejects.toMatchObject({ status: 404, code: 'ADDRESS_NOT_FOUND' });
  });

  it('cannot use another customer’s address', async () => {
    const productId = await insertProduct();
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    await expect(
      checkout.create(sari.id, checkoutInput({ addressId: rani.addressId }), 'checkout-aaaaaaaaaaaaaaa8')
    ).rejects.toMatchObject({ status: 404, code: 'ADDRESS_NOT_FOUND' });

    expect(await count('tbl_pesanan')).toBe(0);
    expect((await cart.read({ userId: sari.id })).items).toHaveLength(1);
  });

  it('rejects an empty cart with the mock’s existing code', async () => {
    await expect(
      checkout.create(sari.id, checkoutInput(), 'checkout-aaaaaaaaaaaaaaa9')
    ).rejects.toMatchObject({
      status: 400,
      code: 'CART_EMPTY',
      message: 'Keranjangmu masih kosong.',
    });
  });

  it('rejects an inactive product', async () => {
    const productId = await insertProduct();
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });
    await testPool.query('UPDATE tbl_produk SET is_active = false WHERE id = $1', [productId]);

    await expect(
      checkout.create(sari.id, checkoutInput(), 'checkout-aaaaaaaaaaaaaa10')
    ).rejects.toMatchObject({
      status: 409,
      code: 'PRODUCT_UNAVAILABLE',
      details: { productId },
    });

    expect(await stockOf(productId)).toBe(6);
    expect(await count('tbl_pesanan')).toBe(0);
  });

  it('rejects a variant the catalogue no longer offers', async () => {
    const productId = await insertProduct();
    await cart.add({ userId: sari.id }, { productId, color: 'Cokelat', size: 'Standar' });
    await testPool.query(`UPDATE tbl_produk SET colors = ARRAY['Rotan natural'] WHERE id = $1`, [
      productId,
    ]);

    await expect(
      checkout.create(sari.id, checkoutInput(), 'checkout-aaaaaaaaaaaaaa11')
    ).rejects.toMatchObject({
      status: 422,
      code: 'INVALID_VARIANT',
      details: { productId },
    });

    expect((await cart.read({ userId: sari.id })).items).toHaveLength(1);
  });

  it('rejects a stock shortage for the combined quantity of one product', async () => {
    // Two variants that each fit, but not together: the cart read only checks
    // per line, so only checkout sees this. Seeded directly, because the cart
    // write path would already refuse the second variant.
    const productId = await insertProduct({ stock: 3 });
    const { rows } = await testPool.query(
      `INSERT INTO tbl_keranjang (user_id) VALUES ($1) RETURNING id`,
      [sari.id]
    );
    await testPool.query(
      `INSERT INTO tbl_item_keranjang (cart_id, product_id, quantity, color, size)
            VALUES ($1, $2, 2, 'Rotan natural', 'Standar')`,
      [rows[0].id, productId]
    );
    await testPool.query(
      `INSERT INTO tbl_item_keranjang (cart_id, product_id, quantity, color, size)
            VALUES ($1, $2, 2, 'Cokelat', 'Standar')`,
      [rows[0].id, productId]
    );

    await expect(
      checkout.create(sari.id, checkoutInput(), 'checkout-aaaaaaaaaaaaaa12')
    ).rejects.toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      details: { productId, available: 3, requested: 4 },
    });

    expect(await stockOf(productId)).toBe(3);
    expect(await count('tbl_pesanan')).toBe(0);
    expect(await count('tbl_item_pesanan')).toBe(0);
  });

  it('rejects a stock shortage created after the cart was filled', async () => {
    const productId = await insertProduct({ stock: 6 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar', quantity: 4 });
    await testPool.query('UPDATE tbl_produk SET stock = 2 WHERE id = $1', [productId]);

    await expect(
      checkout.create(sari.id, checkoutInput(), 'checkout-aaaaaaaaaaaaaa13')
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: { productId, available: 2, requested: 4 },
    });

    // No silent reduction: the customer is told, the cart still holds four.
    expect((await cart.read({ userId: sari.id })).items[0].quantity).toBe(4);
  });

  it('refuses a price it cannot represent exactly', async () => {
    // The price is seeded as text so the database really holds a value a JSON
    // number cannot carry; checkout must refuse it, not round it down.
    const productId = await insertProduct({ price: '9007199254740993', stock: 2 });
    const { rows } = await testPool.query(
      `INSERT INTO tbl_keranjang (user_id) VALUES ($1) RETURNING id`,
      [sari.id]
    );
    await testPool.query(
      `INSERT INTO tbl_item_keranjang (cart_id, product_id, quantity, color, size)
            VALUES ($1, $2, 1, 'Rotan natural', 'Standar')`,
      [rows[0].id, productId]
    );

    await expect(
      checkout.create(sari.id, checkoutInput(), 'checkout-aaaaaaaaaaaaaa14')
    ).rejects.toMatchObject({ status: 409, code: 'ORDER_TOTAL_TOO_LARGE' });

    expect(await stockOf(productId)).toBe(2);
    expect(await count('tbl_pesanan')).toBe(0);
  });

  it('rolls back the order, stock and cart when a later write fails', async () => {
    const productId = await insertProduct({ stock: 6 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });

    // A trigger that fires after the order, its items, its status event and the
    // stock decrement have all happened: exactly the shape of a crash that must
    // not leave a half-finished checkout behind.
    await testPool.query(`
      CREATE OR REPLACE FUNCTION checkout_test_fail_on_cart_delete()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'injected failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await testPool.query(`
      CREATE TRIGGER checkout_test_fail_on_cart_delete
        BEFORE DELETE ON tbl_item_keranjang
        FOR EACH ROW EXECUTE FUNCTION checkout_test_fail_on_cart_delete()
    `);

    try {
      await expect(
        checkout.create(sari.id, checkoutInput(), 'checkout-aaaaaaaaaaaaaa15')
      ).rejects.toThrow(/injected failure/);
    } finally {
      await testPool.query('DROP TRIGGER IF EXISTS checkout_test_fail_on_cart_delete ON tbl_item_keranjang');
      await testPool.query('DROP FUNCTION IF EXISTS checkout_test_fail_on_cart_delete()');
    }

    expect(await count('tbl_pesanan')).toBe(0);
    expect(await count('tbl_item_pesanan')).toBe(0);
    expect(await count('tbl_riwayat_status_pesanan')).toBe(0);
    expect(await stockOf(productId)).toBe(6);
    expect((await cart.read({ userId: sari.id })).items).toHaveLength(1);
  });

  it('does not leave a key behind when the attempt fails', async () => {
    await expect(
      checkout.create(sari.id, checkoutInput(), 'checkout-aaaaaaaaaaaaaa16')
    ).rejects.toMatchObject({ code: 'CART_EMPTY' });

    const productId = await insertProduct();
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    // The same key, retried after the customer fixed the problem, must work:
    // nothing was committed, so there is nothing to replay.
    const { replayed } = await checkout.create(
      sari.id,
      checkoutInput(),
      'checkout-aaaaaaaaaaaaaa16'
    );

    expect(replayed).toBe(false);
  });
});

describe('retries', () => {
  it('returns the same order for the same key and input, without charging twice', async () => {
    const productId = await insertProduct({ stock: 6 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar', quantity: 2 });

    const first = await checkout.create(sari.id, checkoutInput(), 'checkout-bbbbbbbbbbbbbbb1');
    const second = await checkout.create(sari.id, checkoutInput(), 'checkout-bbbbbbbbbbbbbbb1');

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.order).toEqual(first.order);
    expect(await count('tbl_pesanan')).toBe(1);
    expect(await stockOf(productId)).toBe(4);
  });

  it('replays after the address and the product were changed or deleted', async () => {
    const productId = await insertProduct();
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    const first = await checkout.create(sari.id, checkoutInput(), 'checkout-bbbbbbbbbbbbbbb2');

    await testPool.query('DELETE FROM tbl_alamat WHERE id = $1', [sari.addressId]);
    await testPool.query('DELETE FROM tbl_produk WHERE id = $1', [productId]);

    const second = await checkout.create(sari.id, checkoutInput(), 'checkout-bbbbbbbbbbbbbbb2');

    expect(second.replayed).toBe(true);
    // Same order, same money, same snapshot text. The product row is gone, so
    // the "buy again" link is now null — that is the one field a deletion is
    // allowed to change, and the item still renders from its snapshot.
    expect(second.order).toEqual({
      ...first.order,
      items: first.order.items.map((item) => ({ ...item, productId: null })),
    });
    expect(second.order.shippingAddress).toEqual(first.order.shippingAddress);
  });

  it('replays after the cart was refilled, and leaves the new items alone', async () => {
    const first = await insertProduct({ slug: 'pertama', name: 'Pertama' });
    const second = await insertProduct({ slug: 'kedua', name: 'Kedua', stock: 4 });
    await cart.add({ userId: sari.id }, { productId: first, color: 'Rotan natural', size: 'Standar' });

    const original = await checkout.create(sari.id, checkoutInput(), 'checkout-bbbbbbbbbbbbbbb3');

    await cart.add({ userId: sari.id }, { productId: second, color: 'Cokelat', size: 'Standar' });
    const replay = await checkout.create(sari.id, checkoutInput(), 'checkout-bbbbbbbbbbbbbbb3');

    expect(replay.replayed).toBe(true);
    expect(replay.order.orderNumber).toBe(original.order.orderNumber);
    // The lost-response retry must not eat the cart the customer filled while
    // waiting, and must not take that stock.
    expect((await cart.read({ userId: sari.id })).items.map((item) => item.productId)).toEqual([
      second,
    ]);
    expect(await stockOf(second)).toBe(4);
    expect(await count('tbl_pesanan')).toBe(1);
  });

  it('refuses the same key with a different request', async () => {
    const productId = await insertProduct();
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    await checkout.create(sari.id, checkoutInput(), 'checkout-bbbbbbbbbbbbbbb4');

    await expect(
      checkout.create(
        sari.id,
        checkoutInput({ shippingMethod: 'kargo' }),
        'checkout-bbbbbbbbbbbbbbb4'
      )
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });

    expect(await count('tbl_pesanan')).toBe(1);
  });

  it('lets two customers use the same key independently', async () => {
    const productId = await insertProduct({ stock: 6 });
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });
    await cart.add({ userId: rani.id }, { productId, color: 'Cokelat', size: 'Standar' });

    const sariOrder = await checkout.create(sari.id, checkoutInput(), 'checkout-bbbbbbbbbbbbbbb5');
    const raniOrder = await checkout.create(
      rani.id,
      checkoutInput({ addressId: rani.addressId }),
      'checkout-bbbbbbbbbbbbbbb5'
    );

    expect(raniOrder.replayed).toBe(false);
    expect(raniOrder.order.orderNumber).not.toBe(sariOrder.order.orderNumber);
    expect(await count('tbl_pesanan')).toBe(2);
    expect(await stockOf(productId)).toBe(4);
  });

  it('does not treat a retry as a replay after an admin changed the status', async () => {
    const productId = await insertProduct();
    await cart.add({ userId: sari.id }, { productId, color: 'Rotan natural', size: 'Standar' });

    await checkout.create(sari.id, checkoutInput(), 'checkout-bbbbbbbbbbbbbbb6');
    await testPool.query(`UPDATE tbl_pesanan SET status = 'shipped' WHERE user_id = $1`, [sari.id]);

    const replay = await checkout.create(sari.id, checkoutInput(), 'checkout-bbbbbbbbbbbbbbb6');

    expect(replay.replayed).toBe(true);
    expect(replay.order.status).toBe('shipped');
  });
});
