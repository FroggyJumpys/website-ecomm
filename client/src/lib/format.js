const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/**
 * Format a whole-Rupiah amount: 1250000 -> "Rp 1.250.000".
 * The API always sends integers; never format floats here.
 */
export function formatIDR(amount) {
  if (amount === null || amount === undefined) return '';
  return rupiah.format(amount).replace(/\u00a0/g, ' ');
}

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatDate(value) {
  if (!value) return '';
  return dateFormatter.format(new Date(value));
}

const timeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
});

/** The clock time a deadline falls on: "14.05", in the customer's own zone. */
export function formatTime(value) {
  if (!value) return '';
  return timeFormatter.format(new Date(value));
}

/** Percentage saved, rounded down, for strike-through compare pricing. */
export function discountPercent(price, compareAtPrice) {
  if (!compareAtPrice || compareAtPrice <= price) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

/** "Sofa Ulin L-Shape" -> "sofa-ulin-l-shape" for URLs. */
export function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
