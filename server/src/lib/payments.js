import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Midtrans policy: everything this project decides about a payment before or
 * after the provider is involved, expressed as pure functions.
 *
 * The rules that matter:
 *
 *  - **The amount is ours.** A Snap payload is built from the stored order, and
 *    a webhook amount must equal the attempt's stored amount.
 *  - **A notification is only evidence if its signature verifies.** Midtrans
 *    signs `sha512(order_id + status_code + gross_amount + server_key)`; the
 *    comparison is constant-time and the raw strings are used exactly as sent.
 *  - **Payment state only moves forward.** A replayed or late `pending` must not
 *    undo a `settlement`, and only a `refund` may follow `paid`.
 */

/** Payment states stored on a payment attempt and mirrored on the order. */
export const PAYMENT_STATUSES = Object.freeze(['pending', 'paid', 'failed', 'expired', 'refunded']);

/**
 * Which Midtrans `transaction_status` (plus fraud result) means what here.
 *
 * `authorize` is a card authorisation awaiting capture, so it is still pending —
 * treating it as paid would promise an order before the money is captured.
 * `deny` and `cancel` both mean this attempt will never be paid.
 */
export function mapTransactionStatus({ transactionStatus, fraudStatus }) {
  switch (transactionStatus) {
    case 'capture':
      if (fraudStatus === 'accept') return 'paid';
      if (fraudStatus === 'deny') return 'failed';
      // `challenge` (and anything unexpected) is a manual review: not paid yet.
      return 'pending';
    case 'settlement':
      return 'paid';
    case 'pending':
    case 'authorize':
      return 'pending';
    case 'deny':
    case 'cancel':
    case 'failure':
      return 'failed';
    case 'expire':
      return 'expired';
    case 'refund':
    case 'partial_refund':
      return 'refunded';
    default:
      return null;
  }
}

/**
 * Moves a payment forward. Returns `null` when the incoming state must be
 * ignored, which is how a replayed or out-of-order notification is absorbed
 * without rewriting history.
 *
 * Deliberate exceptions:
 *  - `failed`/`expired` → `paid` is allowed. Money arriving is always applied,
 *    even if a VA settled a moment after the expiry we displayed.
 *  - `paid` → anything but `refunded` is refused, so a late `pending` cannot
 *    make a paid order look unpaid.
 */
export function nextPaymentStatus(current, incoming) {
  if (!PAYMENT_STATUSES.includes(incoming)) return null;
  if (current === incoming) return null;
  if (current === 'refunded') return null;
  if (current === 'paid') return incoming === 'refunded' ? 'refunded' : null;
  if (incoming === 'refunded') return null;
  if (incoming === 'pending' && (current === 'failed' || current === 'expired')) return null;

  return incoming;
}

/** The Snap script for the mode we are in. Both URLs are public. */
export function snapScriptUrl({ production }) {
  return production
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';
}

/**
 * Midtrans signs a notification with
 * `sha512(order_id + status_code + gross_amount + server_key)`.
 *
 * The operands are joined as received — no trimming, no amount normalisation —
 * because the signature was computed over the exact strings.
 */
export function notificationSignature({ orderId, statusCode, grossAmount, serverKey }) {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`, 'utf8')
    .digest('hex');
}

/** Constant-time comparison that also rejects a length mismatch. */
export function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');

  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyNotificationSignature(body, serverKey) {
  if (!serverKey) return false;
  if (typeof body?.signature_key !== 'string') return false;

  const expected = notificationSignature({
    orderId: body.order_id,
    statusCode: body.status_code,
    grossAmount: body.gross_amount,
    serverKey,
  });

  return safeEqualHex(expected, body.signature_key);
}

/**
 * A stable identity for one provider event. A retried notification repeats the
 * same values and therefore the same key; two genuinely different events (a
 * `pending` then a `settlement`) differ in `transaction_status` or `status_code`.
 *
 * The signature is included so a forged body cannot pre-empt a real event's key.
 */
export function notificationFingerprint(body) {
  const canonical = JSON.stringify([
    body.order_id,
    body.transaction_id ?? '',
    body.transaction_status,
    body.status_code,
    body.fraud_status ?? '',
    body.gross_amount,
    body.signature_key,
  ]);

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Midtrans sends Rupiah amounts as decimal text (`"1500000.00"`). Rupiah has no
 * practical subunit, so a non-zero fraction means we cannot represent the
 * charge exactly and must refuse rather than round.
 */
export function parseProviderAmount(text) {
  if (typeof text !== 'string') return null;

  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;

  const fraction = match[2] ?? '';
  if (fraction !== '' && !/^0+$/.test(fraction)) return null;

  return BigInt(match[1]);
}

export function grossAmountMatches(text, expected) {
  const parsed = parseProviderAmount(text);

  return parsed !== null && parsed === BigInt(expected);
}

/**
 * `BD-2026-0417` for the first attempt, `BD-2026-0417-2` for the next. Midtrans
 * refuses to create a second transaction with the same `order_id`, so a retry
 * after expiry must use a new one while the order number stays stable.
 */
export function providerOrderIdFor(orderNumber, attemptNumber) {
  return attemptNumber <= 1 ? orderNumber : `${orderNumber}-${attemptNumber}`;
}

/** Which Snap channels a checkout choice maps to. */
export function enabledPaymentsFor(methodId) {
  switch (methodId) {
    case 'bca':
      return ['bca_va'];
    case 'bni-va':
      return ['bni_va'];
    case 'qris':
      // Snap's code for QRIS across issuers (GoPay, OVO, DANA, bank apps).
      return ['other_qris'];
    case 'kartu':
      return ['credit_card'];
    default:
      return null;
  }
}

/**
 * The QR image for a QRIS attempt.
 *
 * Midtrans reports `actions` on the transaction status, and the QRIS entry is
 * `generate_qr_code`. Only an `https:` URL is accepted: the value ends up in an
 * `<img src>`, so a response can never turn into a `javascript:` or `data:` URL,
 * and anything malformed is treated as "no image yet" instead of an error.
 */
export function qrCodeUrl(actions) {
  if (!Array.isArray(actions)) return null;

  const action = actions.find(
    (candidate) => candidate?.name === 'generate_qr_code' && typeof candidate.url === 'string'
  );

  if (!action) return null;

  try {
    const url = new URL(action.url);

    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Midtrans truncates item names at 50 characters; do it here so the total check stays exact. */
function itemName(name) {
  const value = typeof name === 'string' && name.trim() !== '' ? name.trim() : 'Produk BaDekor';

  return value.length > 50 ? `${value.slice(0, 47)}...` : value;
}

/**
 * The Snap request for a stored order.
 *
 * `item_details` must add up to `gross_amount`, so the payload is assembled from
 * the same integers the order was priced with and then checked. A mismatch is a
 * programming error and throws rather than sending a total we cannot explain.
 */
export function buildSnapPayload({
  order,
  providerOrderId,
  customer = {},
  clientOrigin,
  expiryMinutes = 120,
}) {
  const itemDetails = order.items.map((item) => ({
    id: String(item.productId ?? item.slug),
    price: item.price,
    quantity: item.quantity,
    name: itemName(item.name),
  }));

  if (order.shippingCost > 0) {
    itemDetails.push({
      id: 'ongkos-kirim',
      price: order.shippingCost,
      quantity: 1,
      name: 'Ongkos kirim',
    });
  }

  if (order.discount > 0) {
    itemDetails.push({
      id: 'diskon',
      price: -order.discount,
      quantity: 1,
      name: 'Diskon',
    });
  }

  const sum = itemDetails.reduce((total, line) => total + line.price * line.quantity, 0);

  if (sum !== order.total) {
    throw new Error(
      `Snap item total ${sum} does not match order total ${order.total} for ${order.orderNumber}`
    );
  }

  const enabledPayments = enabledPaymentsFor(order.paymentMethodId ?? order.paymentMethod);

  if (!enabledPayments) {
    throw new Error(`No Midtrans channel configured for payment method ${order.paymentMethod}`);
  }

  const payload = {
    transaction_details: {
      order_id: providerOrderId,
      gross_amount: order.total,
    },
    item_details: itemDetails,
    customer_details: {
      first_name: itemName(customer.name ?? order.shippingAddress?.recipient ?? 'Pelanggan'),
      email: customer.email ?? undefined,
      phone: customer.phone ?? order.shippingAddress?.phone ?? undefined,
    },
    enabled_payments: enabledPayments,
    callbacks: clientOrigin
      ? { finish: `${clientOrigin}/pesanan/${order.orderNumber}/selesai` }
      : undefined,
    expiry: { unit: 'minutes', duration: expiryMinutes },
    custom_field1: order.orderNumber,
  };

  if (order.paymentMethodId === 'kartu') {
    payload.credit_card = { secure: true };
  }

  return payload;
}

/**
 * Distinguishes "no attempt yet" from "the last attempt is still usable".
 * A pending attempt with a token and some time left is reused instead of
 * creating a second provider order for the same intent.
 */
export function attemptUsable({ status, snapToken, expiresAt }, now = new Date()) {
  if (status !== 'pending' || !snapToken) return false;
  if (!expiresAt) return true;

  return new Date(expiresAt).getTime() > now.getTime();
}
