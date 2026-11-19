/**
 * Payment status vocabulary, kept in one module so the confirmation page, the
 * order detail and the history list cannot disagree about wording or colour.
 *
 * `unpaid` is the absence of an attempt; the rest mirror the server's
 * `tbl_pembayaran.status`.
 */

export const PAYMENT_STATUS = {
  unpaid: {
    label: 'Belum dibayar',
    tone: 'neutral',
    description: 'Pilih pembayaran untuk menyelesaikan pesanan ini.',
  },
  pending: {
    label: 'Menunggu pembayaran',
    tone: 'warning',
    description: 'Pembayaran sudah dibuat tapi belum diterima. Selesaikan sebelum batas waktu.',
  },
  paid: {
    label: 'Lunas',
    tone: 'success',
    description: 'Pembayaran sudah kami terima. Pesanan masuk antrean produksi.',
  },
  failed: {
    label: 'Pembayaran gagal',
    tone: 'danger',
    description: 'Pembayaran tidak berhasil. Kamu bisa mencoba lagi dengan metode lain.',
  },
  expired: {
    label: 'Kedaluwarsa',
    tone: 'danger',
    description: 'Batas waktu pembayaran sudah lewat. Buat pembayaran baru untuk melanjutkan.',
  },
  refunded: {
    label: 'Dana dikembalikan',
    tone: 'neutral',
    description: 'Pembayaran sudah dikembalikan ke metode pembayaran semula.',
  },
};

export function paymentStatusMeta(status) {
  return PAYMENT_STATUS[status] ?? PAYMENT_STATUS.unpaid;
}

/**
 * How long a payment attempt still has, as a clock the QRIS block can draw.
 *
 * The server stays the authority on expiry — an attempt is expired because a
 * verified notification or a provider status says so, never because this
 * countdown reached zero. `known` is false when the server sent no deadline,
 * which is the case for orders that never started a payment.
 */
export function paymentExpiry(expiresAt, now = Date.now()) {
  const until = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;

  if (Number.isNaN(until)) return { known: false, expired: false, minutes: 0, seconds: 0 };

  const remaining = until - now;

  if (remaining <= 0) return { known: true, expired: true, minutes: 0, seconds: 0 };

  return {
    known: true,
    expired: false,
    minutes: Math.floor(remaining / 60_000),
    seconds: Math.floor((remaining % 60_000) / 1_000),
  };
}

/** "11 menit 08 detik" — a countdown, not a date. */
export function formatRemaining({ minutes, seconds }) {
  if (minutes > 0) return `${minutes} menit ${String(seconds).padStart(2, '0')} detik`;

  return `${seconds} detik`;
}

/**
 * Whether the confirmation page should offer a payment button. The server is
 * still the authority; this only decides whether the button is worth showing.
 */
export function canPayOrder(order) {
  if (!order || order.status === 'cancelled') return false;
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') return false;

  return true;
}
