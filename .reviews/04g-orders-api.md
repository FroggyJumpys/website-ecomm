# 04g — Orders API

- **Status:** Awaiting review <!-- Awaiting review | Changes requested | Approved -->
- **Phase:** 4 – Backend
- **Date:** 2026-11-17
- **Author:** agent / opencode
- **Reviewer:** _unassigned_

## Summary

Turns a signed-in customer's server cart into an immutable order in one database transaction:
address, prices, item names and images are snapshotted onto the order, stock is deducted per product,
and the cart is emptied — or none of it happens. A required `Idempotency-Key` makes a retry after a
lost response return the order already placed instead of charging twice. Order history is paginated
with full-history status counts, and detail is owner-scoped.

Backend only. The frontend still uses its mock; adapting checkout and the orders pages is step 05.

## Files added / changed

| File | Change |
| --- | --- |
| `server/db/migrations/007_order_checkout.sql` | New. Nullable `shipping_method`, `idempotency_key`, `request_fingerprint`; three CHECK constraints and the key/fingerprint pair check; partial unique `(user_id, idempotency_key)`; `order_number_sequence` starting at `greatest(1000, highest existing suffix + 1)` |
| `server/src/db/cart.js` | `remove`/`clear` now lock the existing cart row (`lockExistingCart`) instead of reading it unlocked. Prerequisite for checkout, which holds that row while snapshotting lines |
| `server/src/validators/orders.js` | New. `checkoutSchema` (strict), `idempotencyHeaderSchema`, `orderListSchema`, `orderNumberParamsSchema`, `ORDER_STATUS_VALUES` |
| `server/src/lib/checkout.js` | New. Shipping/payment policy, `checkoutFingerprint`, `toSafeOrderMoney`, `calculateOrderTotals`, `formatOrderNumber` |
| `server/src/db/orders.js` | New. `createOrderStore` (`get`, `list`) and exported `readOrderById`; snapshot-only reads, batched children, repeatable-read history |
| `server/src/db/checkout.js` | New. `createCheckoutStore(pool).create(userId, input, key)` — the whole transaction |
| `server/src/services/orders.js` | New. Binds both stores to the pool |
| `server/src/controllers/orders.js` | New. `create`, `index`, `show` |
| `server/src/routes/orders.js` | New. `POST /orders` behind `requireAuth` |
| `server/src/routes/index.js` | Mounts `/orders` |
| `server/src/routes/users.js` | Adds `GET /me/orders` and `GET /me/orders/:orderNumber` behind the existing `requireAuth` |
| `README.md` | Order endpoints, retry rules, shipping/payment ids and rates, order-number allocation, step-05 notes |
| `server/src/__tests__/cart-queries.integration.test.js` | Two lock-regression tests for remove/clear (`pg_blocking_pids`) |
| `server/src/__tests__/orders-validators.test.js` | New. Request contracts |
| `server/src/__tests__/checkout-policy.test.js` | New. Rates, labels, fingerprint, exact money, number formatting |
| `server/src/__tests__/orders-schema.integration.test.js` | New. Columns, constraints, uniqueness, sequence start on isolated schemas |
| `server/src/__tests__/orders-queries.integration.test.js` | New. Snapshot reads, sorting, paging, counts, privacy, overflow |
| `server/src/__tests__/checkout.integration.test.js` | New. Transaction, validation, rollback, retries |
| `server/src/__tests__/checkout-concurrency.integration.test.js` | New. Seven contention cases |
| `server/src/__tests__/orders-api.integration.test.js` | New. 21 HTTP cases |

`004_pesanan.sql` and `006_cart_merge_marker.sql` were not edited.

## Contract

All under `/api/v1`. Every route requires the session cookie; the owner is always `req.user.id`.

| Method | Path | Response |
| --- | --- | --- |
| POST | `/orders` | `201 { data: order, meta: { replayed: false } }` |
| POST | `/orders` (retry) | `200 { data: order, meta: { replayed: true } }` |
| GET | `/users/me/orders?page=&limit=&status=` | `200 { data: order[], meta: { page, limit, total, totalPages, statusCounts } }` |
| GET | `/users/me/orders/:orderNumber` | `200 { data: order }`, or `404 ORDER_NOT_FOUND` |

Checkout body — strict, no other field accepted:

```json
{ "addressId": 1, "shippingMethod": "reguler", "paymentMethod": "bca" }
```

Header: `Idempotency-Key: <16–128 chars of A-Z a-z 0-9 _ ->`.

Shipping: `reguler` 85000, `kargo` 250000, `workshop` 0. Payment: `bca` → "Transfer bank BCA",
`bni-va` → "Virtual account BNI", `kartu` → "Kartu kredit". Both lists mirror
`client/src/lib/shipping.js`. No payment provider is called and no card field is accepted.

Order shape: `orderNumber`, `createdAt`, `status`, `items[{productId, slug, name, image, price,
quantity, color, size}]`, `subtotal`, `shippingCost`, `discount`, `total`, `shippingMethod`,
`shippingAddress{recipient, phone, street, district, city, province, postalCode, notes}`,
`paymentMethod`, `trackingNumber`, `cancellationReason`, `timeline[{status, at, note}]`. Retry keys,
request fingerprints and owner ids are never exposed.

Errors used: `422 VALIDATION_ERROR` (field-named), `400 CART_EMPTY`, `404 ADDRESS_NOT_FOUND`,
`404 ORDER_NOT_FOUND`, `409 PRODUCT_UNAVAILABLE`, `409 INSUFFICIENT_STOCK`
(`details: { productId, available, requested }`), `422 INVALID_VARIANT`, `409 IDEMPOTENCY_CONFLICT`,
`409 ORDER_TOTAL_TOO_LARGE`, `401 UNAUTHENTICATED`.

## How to run and verify

```sh
# Database (Docker on port 5433 in this environment)
powershell -ExecutionPolicy Bypass -File .superpowers/sdd/04c-catalog-api/ensure-db.ps1

npm run lint
npm test                    # 14 files, 203 tests
npm run test:integration     # 22 files, 379 tests
npm run build               # succeeds; the >500 kB chunk warning predates this step
git diff --check
```

Integration suites share one `_test` database and truncate it between tests, so run **one**
integration command at a time. Targeted runs used during the step:

```sh
npm run test:integration -- cart-queries
npm run test:integration -- cart-merge
npm run test:integration -- orders-schema
npm run test:integration -- orders-queries
npm run test:integration -- checkout.integration
npm run test:integration -- checkout-concurrency
npm run test:integration -- orders-api
```

Live check against the development database (`npm run db:migrate` applied `007_order_checkout.sql`;
`GET /api/v1/health/db` returned `{"status":"ok","database":"up"}`):

```sh
curl -X POST localhost:4000/api/v1/auth/login -c jar.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"sari@badekor.id","password":"rahasia123"}'
curl localhost:4000/api/v1/users/me/addresses -b jar.txt     # pick an owned address id
curl -X POST localhost:4000/api/v1/cart/items -b jar.txt \
  -H 'Content-Type: application/json' \
  -d '{"productId":1,"color":"Abu hangat","size":"3 dudukan","quantity":1}'
curl -X POST localhost:4000/api/v1/orders -b jar.txt \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: 9f1c1c1e-6a3b-4a0e-8f2d-7c5b4a392817' \
  -d '{"addressId":8,"shippingMethod":"kargo","paymentMethod":"bni-va"}'
curl 'localhost:4000/api/v1/users/me/orders?page=1&limit=10&status=all' -b jar.txt
curl localhost:4000/api/v1/users/me/orders/BD-2026-1000 -b jar.txt
```

Observed on the live run: `201` with `BD-2026-1000` at `kargo`/`bni-va`; the same key and body
answered `200` with `meta.replayed: true` and the identical order; stock went 6 → 5 and the cart
emptied; history returned the order with `statusCounts.all = 1`; detail matched the creation
response; another customer's order number returned `404 ORDER_NOT_FOUND`; a malformed number
returned `422` with `details.field = "orderNumber"`; a different body under the used key returned
`409 IDEMPOTENCY_CONFLICT`; a missing header returned `422` with `details.field = "idempotencyKey"`;
an empty cart returned `400 CART_EMPTY`; the admin account using the customer's address returned
`404 ADDRESS_NOT_FOUND` and saw an empty history. The throwaway account, its address, order and cart
were deleted and the product stock reset afterwards; the development database is back at the seed
counts (2 users, 3 addresses, 4 orders, 0 carts).

## Decisions and trade-offs

- **Checkout reads the server cart, not a client payload.** Prices, totals and item lists never
  arrive from the browser, so no tampered payload can change a charge. The cost is a step-05
  frontend adapter.
- **`Idempotency-Key` is required, not optional.** An optional key is the one a client forgets
  exactly when a response is lost. The fingerprint covers `[addressId, shippingMethod,
  paymentMethod]` and deliberately **not** the cart, so a replay still works after the cart was
  emptied or refilled. A new purchase needs a new key; this stops duplicate commits for one key, not
  a deliberate double order.
- **All-or-nothing stock, unlike the 04f merge.** Merging keeps what fits because the guest cart is
  about to disappear; checkout instead fails the whole request with the remaining quantity named.
  Silently reducing what someone is buying is worse than making them look.
- **Aggregated per product.** `tbl_produk.stock` is shared across variants and the cart read only
  checks per line, so `canCheckout` is not authoritative; checkout sums every variant.
- **Money is never a float.** Prices are cast to text in SQL, multiplied and summed as `BigInt`, and
  only converted once the result is proven to be a safe integer; anything larger is
  `409 ORDER_TOTAL_TOO_LARGE`. Casting matters: the global BIGINT parser turns 9007199254740993 into
  ...992 before any check could see it.
- **One global sequence, year in `Asia/Makassar`.** `MAX(order_number)+1` lets two concurrent
  checkouts draw the same number; a per-year reset collides at rollover. The sequence starts at
  `greatest(1000, highest suffix + 1)` so a clean migrate-then-seed database cannot collide with the
  demo orders' static numbers.
- **The cart row is retained after checkout**, and `remove`/`clear` now take the same lock. That
  narrow change in `cart.js` is the prerequisite that makes "delete during checkout" queue instead
  of emptying a cart mid-snapshot.
- **History counts the whole history.** `statusCounts` ignores the filter and the page; the filter
  chips on the orders page would otherwise show only what the current page happened to contain.
- **Retries re-read the order.** A replay returns the order as it stands now, so a status changed by
  an admin since is reflected; it is not a byte-for-byte recording of the first response.

## Not done / deferred

- No frontend integration. Step 05 must send `{ addressId, shippingMethod, paymentMethod }` plus the
  header, reuse the key after an uncertain failure, rotate it for a new purchase, and refresh the
  server cart instead of clearing it a second time. If the client and API are ever cross-origin, the
  idempotency header must be added to the deliberate CORS configuration in step 05.
- No admin status transitions, cancellation/restocking or tracking updates — step 04i. 04g writes
  only the initial `processing` event.
- No real payment processing, stock reservation, discount engine or shipping calculator.
- No customer-facing cancel endpoint.

## Out of scope / noticed

- The error handler still turns malformed JSON into a `500` instead of a `400`; noticed in earlier
  steps and left alone here.
- 04f's guest cookies are unsigned and read via `req.cookies`, and are set before a write succeeds.
  Checkout revalidates stock independently and does not depend on either behaviour, so neither was
  changed.
- `git status` here shows only line-ending warnings from `git diff --check`; no whitespace errors.

## Open questions for the reviewer

1. Is a required `Idempotency-Key` the right strictness, or should the API accept a checkout without
   one (accepting that a lost response can duplicate an order)?
2. Should checkout reduce quantities to fit — as the guest merge does — instead of failing the whole
   cart? This implementation fails it, deliberately.
3. Is a single global order-number sequence with a WITA year acceptable, given that a new year
   continues the previous year's numbering (`BD-2027-1042`)?
4. Is it right that `statusCounts` ignores the selected filter, so the chips show the whole history?

## Reviewer feedback

_To be filled in by the reviewer._
