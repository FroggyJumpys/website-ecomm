/**
 * Single source of truth for routes used by the header, footer and router.
 * Keep these in sync with the route table in src/App.jsx.
 */
export const routes = {
  home: '/',
  shop: '/toko',
  product: (slug = ':slug') => `/produk/${slug}`,
  wishlist: '/favorit',
  cart: '/keranjang',
  checkout: '/pembayaran',
  orderComplete: (orderNumber = ':orderNumber') => `/pesanan/${orderNumber}/selesai`,
  login: '/masuk',
  register: '/daftar',
  account: '/akun',
  profile: '/akun/profil',
  addresses: '/akun/alamat',
  orders: '/akun/pesanan',
  accountOrder: (orderNumber = ':orderNumber') => `/akun/pesanan/${orderNumber}`,
  admin: '/admin',
  adminProducts: '/admin/produk',
  adminOrders: '/admin/pesanan',
  adminOrder: (orderNumber = ':orderNumber') => `/admin/pesanan/${orderNumber}`,
};

/**
 * Only in-app paths may be used as a post-sign-in destination. Absolute URLs
 * and protocol-relative paths are rejected so `?redirect=` cannot be turned
 * into an open redirect, and the auth pages never redirect to themselves.
 */
export function safeRedirect(target, fallback = routes.account) {
  if (typeof target !== 'string' || !target.startsWith('/')) return fallback;
  if (target.startsWith('//')) return fallback;
  if (target.startsWith(routes.login) || target.startsWith(routes.register)) return fallback;
  return target;
}

export const primaryNav = [
  { label: 'Beranda', to: routes.home },
  { label: 'Koleksi', to: routes.shop },
  { label: 'Ruang Tamu', to: `${routes.shop}?kategori=sofa` },
  { label: 'Kamar', to: `${routes.shop}?kategori=tempat-tidur` },
  { label: 'Ruang Kerja', to: `${routes.shop}?kategori=meja-kerja` },
];

export const accountNav = [
  { label: 'Ringkasan akun', to: routes.account },
  { label: 'Pesanan', to: routes.orders },
  { label: 'Profil', to: routes.profile },
  { label: 'Alamat', to: routes.addresses },
  { label: 'Favorit', to: routes.wishlist },
  { label: 'Keranjang', to: routes.cart },
];

export const adminNav = [
  { label: 'Ringkasan', to: routes.admin },
  { label: 'Produk', to: routes.adminProducts },
  { label: 'Pesanan', to: routes.adminOrders },
];
