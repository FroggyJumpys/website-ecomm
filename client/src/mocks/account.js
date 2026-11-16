import { readCatalog } from './catalogStore.js';
import { normalizePhone } from '../lib/validation.js';

/**
 * Mock account data: shipping addresses and order history.
 *
 * Orders and addresses are stored per user id in browser storage so the
 * reviewer can edit, delete and reload without losing the demo. The payloads
 * match what 04d/04g will return; step 05 swaps this module for the API.
 */

const ADDRESSES_KEY = 'badekor.mock.addresses';
const ORDERS_KEY = 'badekor.mock.orders';
const LATENCY_MS = 260;

function delay(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function accountError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readStore(key, seed) {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;

    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* unreadable payload: fall through and reseed */
  }

  const initial = seed();
  writeStore(key, initial);
  return initial;
}

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked or full: the mock keeps working for this page load */
  }
}

function clean(value) {
  return String(value ?? '').trim();
}

function seedAddresses() {
  const home = {
    id: 1,
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
  };

  const office = {
    id: 2,
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
  };

  return {
    1: [home, office],
    2: [
      {
        id: 1,
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
}

function line(productId, { quantity = 1, color, size } = {}) {
  const product = readCatalog().products.find((item) => item.id === productId);

  return {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    image: product.images[0],
    price: product.price,
    quantity,
    color: color ?? product.colors[0] ?? '',
    size: size ?? product.sizes[0] ?? '',
  };
}

function makeOrder({
  orderNumber,
  createdAt,
  status,
  items,
  shippingCost = 0,
  discount = 0,
  address,
  paymentMethod,
  trackingNumber = null,
  timeline,
  cancellationReason = null,
}) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    orderNumber,
    createdAt,
    status,
    items,
    subtotal,
    shippingCost,
    discount,
    total: subtotal + shippingCost - discount,
    shippingAddress: clone(address),
    paymentMethod,
    trackingNumber,
    timeline,
    cancellationReason,
  };
}

function seedOrders() {
  const home = seedAddresses()[1][0];

  return {
    1: [
      makeOrder({
        orderNumber: 'BD-2026-0417',
        createdAt: '2026-11-05T10:20:00+08:00',
        status: 'processing',
        items: [
          line(1, { color: 'Abu hangat' }),
          line(10, { quantity: 2, color: 'Rotan natural' }),
        ],
        address: home,
        paymentMethod: 'Transfer bank BCA',
        timeline: [{ status: 'processing', at: '2026-11-05T10:20:00+08:00' }],
      }),
      makeOrder({
        orderNumber: 'BD-2026-0392',
        createdAt: '2026-10-18T14:05:00+08:00',
        status: 'shipped',
        items: [line(7, { color: 'Rotan natural' }), line(10, { quantity: 2, color: 'Hitam' })],
        address: home,
        paymentMethod: 'Virtual account BNI',
        trackingNumber: 'JNE-8821-4410',
        timeline: [
          { status: 'processing', at: '2026-10-18T14:05:00+08:00' },
          { status: 'shipped', at: '2026-10-20T09:40:00+08:00' },
        ],
      }),
      makeOrder({
        orderNumber: 'BD-2026-0351',
        createdAt: '2026-09-22T11:30:00+08:00',
        status: 'completed',
        items: [line(1, { color: 'Krem' })],
        address: home,
        paymentMethod: 'Kartu kredit',
        trackingNumber: 'JNE-7710-2038',
        timeline: [
          { status: 'processing', at: '2026-09-22T11:30:00+08:00' },
          { status: 'shipped', at: '2026-09-24T08:15:00+08:00' },
          { status: 'completed', at: '2026-09-27T13:05:00+08:00' },
        ],
      }),
      makeOrder({
        orderNumber: 'BD-2026-0307',
        createdAt: '2026-08-30T08:45:00+08:00',
        status: 'cancelled',
        items: [line(10, { color: 'Rotan natural' })],
        shippingCost: 85000,
        address: home,
        paymentMethod: 'Transfer bank BCA',
        timeline: [
          { status: 'processing', at: '2026-08-30T08:45:00+08:00' },
          { status: 'cancelled', at: '2026-08-31T16:20:00+08:00' },
        ],
        cancellationReason:
          'Dibatalkan karena jadwal pengiriman ke alamat tujuan bentrok. Dana dikembalikan penuh.',
      }),
    ],
    2: [],
  };
}

/* ----------------------------------------------------------------- addresses */

export async function listAddresses(userId) {
  const store = readStore(ADDRESSES_KEY, seedAddresses);
  const list = Array.isArray(store[userId]) ? store[userId] : [];

  return delay({
    data: clone([...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))),
  });
}

function normalizeAddress(payload, id) {
  return {
    id,
    label: clean(payload.label),
    recipient: clean(payload.recipient),
    phone: normalizePhone(clean(payload.phone)),
    street: clean(payload.street),
    district: clean(payload.district),
    city: clean(payload.city),
    province: clean(payload.province),
    postalCode: clean(payload.postalCode),
    notes: clean(payload.notes),
    isDefault: Boolean(payload.isDefault),
  };
}

export async function createAddress(userId, payload) {
  const store = readStore(ADDRESSES_KEY, seedAddresses);
  const list = Array.isArray(store[userId]) ? [...store[userId]] : [];
  const id = Math.max(0, ...list.map((item) => Number(item.id) || 0)) + 1;
  const address = normalizeAddress(payload, id);

  if (list.length === 0) address.isDefault = true;

  const next = address.isDefault ? list.map((item) => ({ ...item, isDefault: false })) : list;

  store[userId] = [...next, address];
  writeStore(ADDRESSES_KEY, store);

  return delay({ data: clone(address) });
}

export async function updateAddress(userId, id, payload) {
  const store = readStore(ADDRESSES_KEY, seedAddresses);
  const list = Array.isArray(store[userId]) ? [...store[userId]] : [];
  const index = list.findIndex((item) => String(item.id) === String(id));

  if (index === -1) {
    throw accountError('ADDRESS_NOT_FOUND', 'Alamat ini tidak ditemukan.', 404);
  }

  const address = normalizeAddress(payload, list[index].id);
  const next = list.map((item) => (item.id === address.id ? address : item));

  store[userId] = address.isDefault
    ? next.map((item) => ({ ...item, isDefault: item.id === address.id }))
    : next;
  writeStore(ADDRESSES_KEY, store);

  return delay({ data: clone(address) });
}

export async function deleteAddress(userId, id) {
  const store = readStore(ADDRESSES_KEY, seedAddresses);
  const list = Array.isArray(store[userId]) ? [...store[userId]] : [];
  const index = list.findIndex((item) => String(item.id) === String(id));

  if (index === -1) {
    throw accountError('ADDRESS_NOT_FOUND', 'Alamat ini tidak ditemukan.', 404);
  }

  const [removed] = list.splice(index, 1);

  if (removed.isDefault && list.length > 0) {
    list[0] = { ...list[0], isDefault: true };
  }

  store[userId] = list;
  writeStore(ADDRESSES_KEY, store);

  return delay({ data: null });
}

export async function setDefaultAddress(userId, id) {
  const store = readStore(ADDRESSES_KEY, seedAddresses);
  const list = Array.isArray(store[userId]) ? [...store[userId]] : [];
  const index = list.findIndex((item) => String(item.id) === String(id));

  if (index === -1) {
    throw accountError('ADDRESS_NOT_FOUND', 'Alamat ini tidak ditemukan.', 404);
  }

  store[userId] = list.map((item) => ({
    ...item,
    isDefault: String(item.id) === String(id),
  }));
  writeStore(ADDRESSES_KEY, store);

  return delay({ data: null });
}

/* -------------------------------------------------------------------- orders */

export async function listOrders(userId) {
  const store = readStore(ORDERS_KEY, seedOrders);
  const list = Array.isArray(store[userId]) ? store[userId] : [];

  return delay({
    data: clone([...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))),
  });
}

export async function getOrder(userId, orderNumber) {
  const store = readStore(ORDERS_KEY, seedOrders);
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  const order = list.find((item) => item.orderNumber === orderNumber);

  if (!order) {
    throw accountError('ORDER_NOT_FOUND', 'Pesanan ini tidak ditemukan.', 404);
  }

  return delay({ data: clone(order) });
}

/**
 * Raw order store keyed by user id. The admin mocks (03h–03j) need every
 * customer's orders, so they read the same storage instead of keeping a second
 * copy. Returned by value: callers must not mutate it.
 */
export function readOrdersByUser() {
  return clone(readStore(ORDERS_KEY, seedOrders));
}

/**
 * Raw writer for the order store. Only the admin mock moves an order's status;
 * customers add orders through `createOrder`. Kept beside the reader so the
 * storage key stays private to this module.
 */
export function writeOrdersByUser(store) {
  writeStore(ORDERS_KEY, store);
}

/**
 * Next `BD-<year>-<sequence>` number for a customer. Sequences continue from the
 * highest number already stored, so two orders placed in the same session cannot
 * collide.
 */
function nextOrderNumber(orders) {
  const year = new Date().getFullYear();
  const pattern = new RegExp(`^BD-${year}-(\\d+)$`);
  const highest = orders.reduce((max, order) => {
    const match = pattern.exec(order.orderNumber ?? '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `BD-${year}-${String(highest + 1).padStart(4, '0')}`;
}

/**
 * Places an order from the cart. Product names, prices and the shipping address
 * are copied onto the order, exactly as tbl_pesanan/tbl_item_pesanan will store
 * them, so a later price change never rewrites history.
 *
 * Stock is deliberately not decremented here: 04g does that in a database
 * transaction, and pretending to do it in the mock would only put the seeded
 * catalogue out of step with the checkout demo.
 */
export async function createOrder(userId, payload) {
  const store = readStore(ORDERS_KEY, seedOrders);
  const list = Array.isArray(store[userId]) ? [...store[userId]] : [];
  const now = new Date().toISOString();

  const items = (payload.items ?? []).map((item) => ({
    productId: item.productId,
    slug: item.slug,
    name: item.name,
    image: item.image,
    price: item.price,
    quantity: item.quantity,
    color: item.color ?? '',
    size: item.size ?? '',
  }));

  if (items.length === 0) {
    throw accountError('CART_EMPTY', 'Keranjangmu kosong. Tambahkan produk sebelum membayar.', 400);
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingCost = Number(payload.shippingCost) || 0;
  const order = {
    orderNumber: nextOrderNumber(list),
    createdAt: now,
    status: 'processing',
    items,
    subtotal,
    shippingCost,
    discount: 0,
    total: subtotal + shippingCost,
    shippingAddress: normalizeAddress(payload.address ?? {}, payload.address?.id ?? 0),
    paymentMethod: clean(payload.paymentMethod),
    trackingNumber: null,
    timeline: [{ status: 'processing', at: now }],
    cancellationReason: null,
  };

  store[userId] = [order, ...list];
  writeStore(ORDERS_KEY, store);

  return delay({ data: clone(order) });
}
