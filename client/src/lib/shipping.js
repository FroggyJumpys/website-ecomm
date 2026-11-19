/**
 * Delivery and payment choices offered at checkout.
 *
 * Costs are whole Rupiah integers so they can be added to the cart subtotal
 * without rounding. `label` is the value stored on the order (`payment_method`);
 * 04g will persist the same strings, so the labels must not be renamed without
 * a migration.
 */

export const SHIPPING_OPTIONS = [
  {
    id: 'reguler',
    label: 'Reguler',
    carrier: 'JNE / J&T',
    cost: 85000,
    estimate: '3–5 hari kerja',
    description: 'Untuk kursi, meja kerja, dan paket yang bisa diangkat satu orang.',
  },
  {
    id: 'kargo',
    label: 'Kargo mebel',
    carrier: 'BaDekor Cargo',
    cost: 250000,
    estimate: '5–8 hari kerja',
    description: 'Sofa dan lemari dikirim dengan truk, termasuk bantuan turun barang.',
  },
  {
    id: 'workshop',
    label: 'Ambil di workshop',
    carrier: 'Jl. Kayu Tangi, Banjarmasin',
    cost: 0,
    estimate: 'Siap 2 hari kerja',
    description: 'Gratis. Kami bantu muat ke kendaraan Anda.',
  },
];

export const PAYMENT_OPTIONS = [
  {
    id: 'bca',
    label: 'Transfer bank BCA',
    detail: 'Virtual account BCA, otomatis terverifikasi',
    instructions: [
      'Buat pesanan, lalu tekan tombol bayar untuk membuka halaman pembayaran aman.',
      'Pilih BCA Virtual Account dan bayar lewat m-banking, ATM, atau kantor cabang.',
      'Pesanan otomatis terverifikasi setelah pembayaran masuk.',
    ],
  },
  {
    id: 'bni-va',
    label: 'Virtual account BNI',
    detail: 'Nomor VA dibuat otomatis oleh Midtrans',
    instructions: [
      'Buat pesanan, lalu tekan tombol bayar untuk membuka halaman pembayaran aman.',
      'Nomor virtual account BNI muncul di halaman pembayaran dan bisa dibayar lewat m-banking, ATM, atau kantor cabang.',
      'Pesanan otomatis terverifikasi setelah pembayaran masuk.',
    ],
  },
  {
    id: 'qris',
    label: 'QRIS',
    detail: 'Pindai satu kode QR dari m-banking atau e-wallet apa pun',
    instructions: [
      'Buat pesanan, lalu tekan tombol bayar untuk membuka halaman pembayaran aman.',
      'Kode QR khusus pesanan ini muncul beserta batas waktunya. Pindai dengan aplikasi m-banking atau e-wallet yang mendukung QRIS.',
      'Pesanan otomatis terverifikasi setelah Midtrans mengonfirmasi pembayaran. Status tetap menunggu sampai konfirmasi itu masuk.',
    ],
  },
  {
    id: 'kartu',
    label: 'Kartu kredit',
    detail: 'Halaman aman Midtrans, 3D Secure',
    instructions: [
      'Buat pesanan, lalu tekan tombol bayar untuk membuka halaman pembayaran aman.',
      'Masukkan data kartu di halaman Midtrans, bukan di BaDekor. Kartu dengan 3D Secure akan meminta kode OTP.',
      'Pesanan mulai disiapkan setelah pembayaran berhasil.',
    ],
  },
];

export const DEFAULT_SHIPPING_ID = SHIPPING_OPTIONS[0].id;
export const DEFAULT_PAYMENT_ID = PAYMENT_OPTIONS[0].id;

export function findShippingOption(id) {
  return SHIPPING_OPTIONS.find((option) => option.id === id) ?? SHIPPING_OPTIONS[0];
}

export function findPaymentOption(id) {
  return PAYMENT_OPTIONS.find((option) => option.id === id) ?? PAYMENT_OPTIONS[0];
}

/**
 * Payment instructions for a placed order. The order only stores the payment
 * label, so a label that no longer exists falls back to a generic sentence.
 */
export function paymentInstructions(paymentMethod) {
  return (
    PAYMENT_OPTIONS.find((option) => option.label === paymentMethod)?.instructions ?? [
      'Tim BaDekor akan menghubungi kamu lewat WhatsApp untuk petunjuk pembayaran.',
    ]
  );
}
