import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { pool, withTransaction } from '../config/db.js';
import { brands, categories, products } from '../../db/seeds/catalog.js';

/**
 * Development seed. Safe to run repeatedly: every row is matched on a natural
 * key (slug, email, order number) and updated in place, so re-seeding does not
 * duplicate rows or break the mock-era order numbers the UI links to.
 *
 * What it resets on every run: the password of the two demo accounts, and every
 * catalogue field. What it leaves alone: rows a reviewer created themselves
 * (registered users, their addresses, their orders).
 *
 * Run with `npm run db:seed` after `npm run db:migrate`.
 */

const DEMO_PASSWORD = 'rahasia123';

const DEMO_USERS = [
  {
    name: 'Sari Wulandari',
    email: 'sari@badekor.id',
    phone: '081234567890',
    role: 'customer',
  },
  {
    name: 'Rani BaDekor',
    email: 'admin@badekor.id',
    phone: '081100000000',
    role: 'admin',
  },
];

/** Shipping addresses, keyed by the demo user's email. */
const ADDRESSES = {
  'sari@badekor.id': [
    {
      label: 'Rumah',
      recipient: 'Sari Wulandari',
      phone: '081234567890',
      street: 'Jl. Kayu Tangi II No. 18, Kompleks Banjar Indah',
      district: 'Banjarmasin Utara',
      city: 'Banjarmasin',
      province: 'Kalimantan Selatan',
      postalCode: '70123',
      notes: 'Pagarnya hijau, bel di sebelah kanan.',
      isDefault: true,
    },
    {
      label: 'Kantor',
      recipient: 'Sari Wulandari',
      phone: '081234567890',
      street: 'Jl. Jend. A. Yani Km 4,5, Ruko Sentra Niaga No. 7',
      district: 'Banjarmasin Timur',
      city: 'Banjarmasin',
      province: 'Kalimantan Selatan',
      postalCode: '70249',
      notes: 'Titip ke resepsionis lantai dua bila saya sedang di luar.',
      isDefault: false,
    },
  ],
  'admin@badekor.id': [
    {
      label: 'Rumah',
      recipient: 'Rani BaDekor',
      phone: '081100000000',
      street: 'Jl. Pierre Tendean No. 21',
      district: 'Banjarmasin Tengah',
      city: 'Banjarmasin',
      province: 'Kalimantan Selatan',
      postalCode: '70111',
      notes: '',
      isDefault: true,
    },
  ],
};

/** One order line, with the product snapshot the order keeps forever. */
function line(slug, { quantity = 1, color, size } = {}) {
  const product = products.find((item) => item.slug === slug);

  if (!product) {
    throw new Error(`Seed error: unknown product slug "${slug}" in an order line`);
  }

  return {
    productSlug: product.slug,
    productName: product.name,
    image: product.images[0] ?? '',
    unitPrice: product.price,
    quantity,
    color: color ?? product.colors[0] ?? '',
    size: size ?? product.sizes[0] ?? '',
  };
}

/**
 * Orders are ported from the mock so /akun/pesanan has something to show.
 * Totals are computed here rather than typed in, so the
 * `tbl_pesanan_total_matches` constraint can never be violated by a typo.
 */
const ORDERS = [
  {
    orderNumber: 'BD-2026-0417',
    userEmail: 'sari@badekor.id',
    createdAt: '2026-11-05T10:20:00+08:00',
    status: 'processing',
    paymentMethod: 'Transfer bank BCA',
    trackingNumber: null,
    cancellationReason: null,
    items: [line('sofa-ulin-l-shape', { color: 'Abu hangat' }), line('kursi-bar-rotan', { quantity: 2, color: 'Rotan natural' })],
    history: [{ status: 'processing', at: '2026-11-05T10:20:00+08:00' }],
  },
  {
    orderNumber: 'BD-2026-0392',
    userEmail: 'sari@badekor.id',
    createdAt: '2026-10-18T14:05:00+08:00',
    status: 'shipped',
    paymentMethod: 'Virtual account BNI',
    trackingNumber: 'JNE-8821-4410',
    cancellationReason: null,
    items: [line('sofa-rotan-teras', { color: 'Rotan natural' }), line('kursi-bar-rotan', { quantity: 2, color: 'Hitam' })],
    history: [
      { status: 'processing', at: '2026-10-18T14:05:00+08:00' },
      { status: 'shipped', at: '2026-10-20T09:40:00+08:00' },
    ],
  },
  {
    orderNumber: 'BD-2026-0351',
    userEmail: 'sari@badekor.id',
    createdAt: '2026-09-22T11:30:00+08:00',
    status: 'completed',
    paymentMethod: 'Kartu kredit',
    trackingNumber: 'JNE-7710-2038',
    cancellationReason: null,
    items: [line('sofa-ulin-l-shape', { color: 'Krem' })],
    history: [
      { status: 'processing', at: '2026-09-22T11:30:00+08:00' },
      { status: 'shipped', at: '2026-09-24T08:15:00+08:00' },
      { status: 'completed', at: '2026-09-27T13:05:00+08:00' },
    ],
  },
  {
    orderNumber: 'BD-2026-0307',
    userEmail: 'sari@badekor.id',
    createdAt: '2026-08-30T08:45:00+08:00',
    status: 'cancelled',
    paymentMethod: 'Transfer bank BCA',
    trackingNumber: null,
    shippingCost: 85000,
    cancellationReason:
      'Dibatalkan karena jadwal pengiriman ke alamat tujuan bentrok. Dana dikembalikan penuh.',
    items: [line('kursi-bar-rotan', { color: 'Rotan natural' })],
    history: [
      { status: 'processing', at: '2026-08-30T08:45:00+08:00' },
      { status: 'cancelled', at: '2026-08-31T16:20:00+08:00' },
    ],
  },
];

async function upsertCategories(client) {
  const idBySlug = new Map();

  for (const [index, category] of categories.entries()) {
    const { rows } = await client.query(
      `INSERT INTO tbl_kategori (slug, name, description, image, sort_order)
            VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE
            SET name        = EXCLUDED.name,
                description = EXCLUDED.description,
                image       = EXCLUDED.image,
                sort_order  = EXCLUDED.sort_order
         RETURNING id`,
      [category.slug, category.name, category.description, category.image, index]
    );

    idBySlug.set(category.slug, rows[0].id);
  }

  return idBySlug;
}

async function upsertBrands(client) {
  const idBySlug = new Map();

  for (const brand of brands) {
    const { rows } = await client.query(
      `INSERT INTO tbl_merek (slug, name)
            VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE
            SET name = EXCLUDED.name
         RETURNING id`,
      [brand.slug, brand.name]
    );

    idBySlug.set(brand.slug, rows[0].id);
  }

  return idBySlug;
}

async function upsertProducts(client, categoryIds, brandIds) {
  for (const product of products) {
    const categoryId = categoryIds.get(product.categorySlug);
    const brandId = brandIds.get(product.brandSlug);

    if (!categoryId) {
      throw new Error(`Seed error: unknown category "${product.categorySlug}"`);
    }

    await client.query(
      `INSERT INTO tbl_produk (
              slug, name, category_id, brand_id, price, compare_at_price, rating,
              review_count, stock, material, dimensions, description, colors,
              sizes, images, is_new, is_trending
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (slug) DO UPDATE
            SET name             = EXCLUDED.name,
                category_id      = EXCLUDED.category_id,
                brand_id         = EXCLUDED.brand_id,
                price            = EXCLUDED.price,
                compare_at_price = EXCLUDED.compare_at_price,
                rating           = EXCLUDED.rating,
                review_count     = EXCLUDED.review_count,
                stock            = EXCLUDED.stock,
                material         = EXCLUDED.material,
                dimensions       = EXCLUDED.dimensions,
                description      = EXCLUDED.description,
                colors           = EXCLUDED.colors,
                sizes            = EXCLUDED.sizes,
                images           = EXCLUDED.images,
                is_new           = EXCLUDED.is_new,
                is_trending      = EXCLUDED.is_trending`,
      [
        product.slug,
        product.name,
        categoryId,
        brandId ?? null,
        product.price,
        product.compareAtPrice,
        product.rating,
        product.reviewCount,
        product.stock,
        product.material,
        product.dimensions,
        product.description,
        product.colors,
        product.sizes,
        product.images,
        product.isNew,
        product.isTrending,
      ]
    );
  }
}

async function upsertUsers(client) {
  const idByEmail = new Map();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, env.BCRYPT_ROUNDS);

  for (const user of DEMO_USERS) {
    const { rows } = await client.query(
      `INSERT INTO tbl_pengguna (name, email, phone, password_hash, role)
            VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
            SET name          = EXCLUDED.name,
                phone         = EXCLUDED.phone,
                password_hash = EXCLUDED.password_hash,
                role          = EXCLUDED.role
         RETURNING id`,
      [user.name, user.email, user.phone, passwordHash, user.role]
    );

    idByEmail.set(user.email, rows[0].id);
  }

  return idByEmail;
}

async function seedAddresses(client, userIdByEmail) {
  for (const [email, list] of Object.entries(ADDRESSES)) {
    const userId = userIdByEmail.get(email);

    // Only seed a user who has no addresses yet, so addresses edited in the UI
    // survive a re-seed.
    const { rows: existing } = await client.query(
      'SELECT count(*)::int AS count FROM tbl_alamat WHERE user_id = $1',
      [userId]
    );

    if (existing[0].count > 0) continue;

    for (const address of list) {
      await client.query(
        `INSERT INTO tbl_alamat (
                user_id, label, recipient, phone, street, district, city,
                province, postal_code, notes, is_default
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId,
          address.label,
          address.recipient,
          address.phone,
          address.street,
          address.district,
          address.city,
          address.province,
          address.postalCode,
          address.notes,
          address.isDefault,
        ]
      );
    }
  }
}

async function seedOrders(client, userIdByEmail) {
  for (const order of ORDERS) {
    const userId = userIdByEmail.get(order.userEmail);

    const subtotal = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const shippingCost = order.shippingCost ?? 0;
    const discount = order.discount ?? 0;

    const { rows } = await client.query(
      `INSERT INTO tbl_pesanan (
              order_number, user_id, status, subtotal, shipping_cost, discount,
              total, payment_method, tracking_number, cancellation_reason,
              shipping_recipient, shipping_phone, shipping_street, shipping_district,
              shipping_city, shipping_province, shipping_postal_code, shipping_notes,
              created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                    $15, $16, $17, $18, $19, $19)
       ON CONFLICT (order_number) DO NOTHING
         RETURNING id`,
      [
        order.orderNumber,
        userId,
        order.status,
        subtotal,
        shippingCost,
        discount,
        subtotal + shippingCost - discount,
        order.paymentMethod,
        order.trackingNumber,
        order.cancellationReason,
        ADDRESSES[order.userEmail][0].recipient,
        ADDRESSES[order.userEmail][0].phone,
        ADDRESSES[order.userEmail][0].street,
        ADDRESSES[order.userEmail][0].district,
        ADDRESSES[order.userEmail][0].city,
        ADDRESSES[order.userEmail][0].province,
        ADDRESSES[order.userEmail][0].postalCode,
        ADDRESSES[order.userEmail][0].notes,
        order.createdAt,
      ]
    );

    // Already seeded: leave the order and its lines alone.
    if (rows.length === 0) continue;

    const orderId = rows[0].id;

    for (const item of order.items) {
      await client.query(
        `INSERT INTO tbl_item_pesanan (
                order_id, product_id, product_name, product_slug, image,
                unit_price, quantity, color, size, created_at, updated_at
              )
              VALUES ($1, (SELECT id FROM tbl_produk WHERE slug = $2), $3, $4, $5,
                      $6, $7, $8, $9, $10, $10)`,
        [
          orderId,
          item.productSlug,
          item.productName,
          item.productSlug,
          item.image,
          item.unitPrice,
          item.quantity,
          item.color,
          item.size,
          order.createdAt,
        ]
      );
    }

    for (const entry of order.history) {
      await client.query(
        `INSERT INTO tbl_riwayat_status_pesanan (order_id, status, created_at, updated_at)
              VALUES ($1, $2, $3, $3)`,
        [orderId, entry.status, entry.at]
      );
    }
  }
}

async function seed() {
  await withTransaction(async (client) => {
    const categoryIds = await upsertCategories(client);
    const brandIds = await upsertBrands(client);
    await upsertProducts(client, categoryIds, brandIds);

    const userIdByEmail = await upsertUsers(client);
    await seedAddresses(client, userIdByEmail);
    await seedOrders(client, userIdByEmail);
  });

  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*) FROM tbl_pengguna)  AS users,
      (SELECT count(*) FROM tbl_alamat)    AS addresses,
      (SELECT count(*) FROM tbl_kategori)  AS categories,
      (SELECT count(*) FROM tbl_merek)     AS brands,
      (SELECT count(*) FROM tbl_produk)    AS products,
      (SELECT count(*) FROM tbl_pesanan)   AS orders
  `);

  const summary = rows[0];
  console.log(
    `[db] seed complete: ${summary.users} users, ${summary.addresses} addresses, ` +
      `${summary.categories} categories, ${summary.brands} brands, ` +
      `${summary.products} products, ${summary.orders} orders`
  );
  console.log(`[db] demo logins: sari@badekor.id / admin@badekor.id (password ${DEMO_PASSWORD})`);
}

seed()
  .catch((error) => {
    console.error('[db] seed failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
