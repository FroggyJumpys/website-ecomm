/**
 * Order status vocabulary. One module so the order list, the detail page, the
 * status filter and the future admin screens cannot disagree about labels or
 * colours. Statuses mirror what 04g/04i will store.
 */

export const ORDER_STATUS = {
  processing: {
    label: 'Diproses',
    tone: 'warning',
    description: 'Pesananmu sedang disiapkan di workshop Banjarmasin.',
  },
  shipped: {
    label: 'Dikirim',
    tone: 'accent',
    description: 'Paket sedang dalam perjalanan ke alamat tujuan.',
  },
  completed: {
    label: 'Selesai',
    tone: 'success',
    description: 'Pesanan sudah diterima. Terima kasih sudah memesan.',
  },
  cancelled: {
    label: 'Dibatalkan',
    tone: 'danger',
    description: 'Pesanan ini dibatalkan dan tidak diproses lebih lanjut.',
  },
};

/** The happy path, in order. `cancelled` is deliberately not part of it. */
export const ORDER_FLOW = ['processing', 'shipped', 'completed'];

/**
 * Which moves the server accepts, mirrored from `server/src/lib/orderTransitions.js`.
 * `completed` and `cancelled` are terminal; the panel must not offer anything
 * else, because a rejected move would be a `409 ORDER_STATUS_CONFLICT`.
 */
export const NEXT_STATUSES = {
  processing: ['shipped', 'cancelled'],
  shipped: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function allowedNextStatuses(status) {
  return NEXT_STATUSES[status] ?? [];
}

export const ORDER_FILTERS = [
  { value: 'all', label: 'Semua' },
  { value: 'processing', label: 'Diproses' },
  { value: 'shipped', label: 'Dikirim' },
  { value: 'completed', label: 'Selesai' },
  { value: 'cancelled', label: 'Dibatalkan' },
];

export function statusMeta(status) {
  return ORDER_STATUS[status] ?? ORDER_STATUS.processing;
}
