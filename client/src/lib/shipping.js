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
    detail: 'Verifikasi manual, maksimal 1×24 jam',
    instructions: [
      'Transfer ke rekening BCA 1234567890 a/n PT BaDekor Karya Banjar.',
      'Cantumkan nomor pesanan pada berita transfer.',
      'Kirim bukti transfer ke WhatsApp 0811 0000 000 agar pesanan segera diproses.',
    ],
  },
  {
    id: 'bni-va',
    label: 'Virtual account BNI',
    detail: 'Nomor VA dikirim setelah pesanan dibuat',
    instructions: [
      'Nomor virtual account dikirim ke email dan WhatsApp kamu.',
      'Bayar lewat m-banking, ATM, atau kantor cabang BNI.',
      'Pesanan otomatis terverifikasi setelah pembayaran masuk.',
    ],
  },
  {
    id: 'kartu',
    label: 'Kartu kredit',
    detail: 'Tautan pembayaran aman, 3D Secure',
    instructions: [
      'Tautan pembayaran aman dikirim ke email kamu.',
      'Pembayaran diproses oleh penyedia pembayaran, bukan disimpan BaDekor.',
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
