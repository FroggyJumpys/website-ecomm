# BaDekor

Mebel kayu ulin dan anyaman rotan buatan pengrajin Banjarmasin, Kalimantan Selatan. This
repository is a fullstack ecommerce application built as a group project: a React storefront, an
Express API and a PostgreSQL database.

The original static Tailwind template is kept in [`legacy-template/`](./legacy-template) as a
design reference only. Nothing in it is built or deployed.

## Stack

| Layer    | Technology                                                    |
| -------- | ------------------------------------------------------------- |
| Frontend | React 19 (JavaScript), Vite 8, React Router 7, Tailwind CSS 4 |
| Backend  | Node.js 22+, Express 5, Zod, JWT in an httpOnly cookie        |
| Database | PostgreSQL, accessed with `pg` and plain SQL migrations       |
| Tooling  | ESLint 9 (flat config), Prettier, Vitest, Supertest           |

Tailwind uses v4's CSS-first configuration: design tokens live in `@theme` inside
`client/src/index.css`. There is no `tailwind.config.js`.

## Requirements

- Node.js `>=22.12` and npm
- PostgreSQL 15+ (local install or Docker)

## Getting started

```sh
# 1. Install all workspace dependencies
npm install

# 2. Start PostgreSQL (skip if you already run Postgres locally)
#    If port 5432 is already taken (e.g. a native PostgreSQL service), publish the
#    container on another port instead: put `DB_PORT=5433` in a root `.env` (docker
#    compose reads it) and set DATABASE_URL in server/.env to the same port.
docker compose up -d db

# 3. Configure the API
cp server/.env.example server/.env

# 4. Apply migrations and load the seed data (catalogue, demo accounts)
npm run db:migrate
npm run db:seed

# 5. Run the API and the Vite dev server together
npm run dev
```

Then open <http://localhost:5173>. The API listens on <http://localhost:4000> and the client
reaches it through the `/api` proxy configured in `client/vite.config.js`, which keeps the auth
cookie first-party. Every screen reads the Express API: there is no mock mode, so the API and the
seeded database must be running too.

## Scripts

Run from the repository root.

| Script                     | What it does                                |
| -------------------------- | ------------------------------------------- |
| `npm run dev`              | API (nodemon) + Vite dev server together    |
| `npm run dev:client`       | Vite dev server only                        |
| `npm run dev:server`       | Express API only                            |
| `npm run build`            | Production build of the client              |
| `npm start`                | Start the API without nodemon               |
| `npm run lint`             | ESLint over `client/` and `server/`         |
| `npm run format`           | Prettier over the whole repo                |
| `npm test`                 | Unit tests (no database required)           |
| `npm run test:all`         | Unit and integration tests together         |
| `npm run test:integration` | PostgreSQL-backed integration tests         |
| `npm run db:migrate`       | Apply pending SQL migrations                |
| `npm run db:seed`          | Load seed data (idempotent, safe to re-run) |

## Layout

```
client/                 React application
  src/{components,pages,layouts,hooks,services,context,lib,assets}
  public/images/        Imagery carried over from the template
server/                 Express API
  src/{config,routes,controllers,services,middleware,db,validators,lib}
  db/migrations/        Forward-only .sql migrations
  db/seeds/             Catalogue, demo accounts, addresses and orders
  uploads/catalog/      Uploaded product images (git-ignored, back this up)
legacy-template/        Original static HTML, reference only
.reviews/               One review note per development step
AGENTS.md               Conventions, working rules and the development roadmap
```

## Environment variables

See [`server/.env.example`](./server/.env.example). Copy it to `server/.env`; that file is
git-ignored. `JWT_SECRET` must be at least 24 characters, and a real value is required when
`NODE_ENV=production`. `CLIENT_ORIGIN` must match the browser origin that calls the API, because
the session cookie is sent with credentials.

The client reads one optional variable, documented in [`client/.env.example`](./client/.env.example):
`VITE_API_BASE_URL`, which defaults to `/api/v1`. Leaving it at the default is correct whenever
`/api` is proxied to Express — which is what both the Vite dev server and the production web server
do.

Midtrans keys go in `server/.env` as `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY` and
`MIDTRANS_MERCHANT_ID`, with `MIDTRANS_IS_PRODUCTION=false` for sandbox. `MIDTRANS_EXPIRY_MINUTES`
(default 120) sets how long a Snap transaction stays payable, and `MIDTRANS_SNAP_SCRIPT_URL`
overrides the script host that is otherwise derived from `MIDTRANS_IS_PRODUCTION`. The legacy `MT_*`
names are accepted as aliases. All of them are optional: without keys the API still boots and the
payment endpoints answer `503 PAYMENT_NOT_CONFIGURED`, so the shop runs before the credentials exist.
Sandbox keys start with `SB-Mid-`; a production key in a development checkout is a mistake, not a
shortcut.

`docker-compose.yml` publishes the database on `${DB_PORT:-5432}`. If something else already owns
5432 (a native PostgreSQL service, for example), create a root `.env` containing `DB_PORT=5433`
and set `DATABASE_URL` in `server/.env` to `...@localhost:5433/ba_dekor`. Both `.env` files are
git-ignored, so the defaults stay correct for everyone else.

## API

Base path `/api/v1`. Errors always use the shape `{ "error": { "code", "message", "details?" } }`.

| Method | Path                                         | Description                                            |
| ------ | -------------------------------------------- | ------------------------------------------------------ |
| GET    | `/health`                                    | Liveness probe, does not touch the DB                  |
| GET    | `/health/db`                                 | Readiness probe, pings PostgreSQL                      |
| POST   | `/auth/register`                             | Create a customer account and start a session          |
| POST   | `/auth/login`                                | Sign in and set the session cookie                     |
| POST   | `/auth/logout`                               | Clear the session cookie                               |
| GET    | `/auth/me`                                   | The signed-in user, or `401`                           |
| GET    | `/categories`                                | Categories with active product counts                  |
| GET    | `/brands`                                    | Brands                                                 |
| GET    | `/products/filters`                          | Colours, sizes, price range, sort options              |
| GET    | `/products`                                  | Product summaries, filtered and paginated              |
| GET    | `/products/:slug`                            | Full product detail, or `404 PRODUCT_NOT_FOUND`        |
| GET    | `/products/:slug/related`                    | Related summaries for the detail rail                  |
| PATCH  | `/users/me`                                  | Update the signed-in customer's name, email and phone  |
| POST   | `/users/me/password`                         | Change password (requires the current one)             |
| GET    | `/users/me/addresses`                        | The customer's shipping addresses                      |
| POST   | `/users/me/addresses`                        | Create an address                                      |
| PATCH  | `/users/me/addresses/:id`                    | Update an address                                      |
| DELETE | `/users/me/addresses/:id`                    | Delete an address                                      |
| POST   | `/users/me/addresses/:id/default`            | Make an address the default                            |
| GET    | `/users/me/wishlist`                         | The signed-in customer's saved products, newest first  |
| POST   | `/users/me/wishlist`                         | Save a product (`{ "productId": 5 }`); idempotent      |
| DELETE | `/users/me/wishlist/:productId`              | Remove a saved product; idempotent                     |
| GET    | `/cart`                                      | The caller's cart, guest or signed in                  |
| POST   | `/cart/items`                                | Add a product variant, or increase its quantity        |
| PATCH  | `/cart/items/:id`                            | Set a line's quantity                                  |
| DELETE | `/cart/items/:id`                            | Remove a line                                          |
| DELETE | `/cart`                                      | Empty the cart                                         |
| POST   | `/orders`                                    | Turn the signed-in customer's cart into an order       |
| GET    | `/users/me/orders`                           | Order history, paginated, with status counts           |
| GET    | `/users/me/orders/:orderNumber`              | One owned order, or `404 ORDER_NOT_FOUND`              |
| POST   | `/orders/:orderNumber/payments`              | Create or reuse a Snap transaction for an owned order  |
| GET    | `/orders/:orderNumber/payments`              | Stored payment state: attempt, QRIS code, expiry       |
| POST   | `/orders/:orderNumber/payments/sync`         | Reconcile the payment with the provider                |
| GET    | `/payments/config`                           | Public Snap script URL, client key, availability       |
| POST   | `/payments/midtrans/notification`            | Midtrans webhook; signature-checked, no session        |
| GET    | `/admin/products`                            | Admin product list, hidden included                    |
| GET    | `/admin/products/:id`                        | One product, hidden included                           |
| POST   | `/admin/products`                            | Create a product                                       |
| PATCH  | `/admin/products/:id`                        | Partial update; requires `expectedVersion`             |
| DELETE | `/admin/products/:id`                        | Delete; requires `expectedVersion`                     |
| GET    | `/admin/categories`, `/admin/brands`         | Taxonomy for the admin selectors                       |
| POST   | `/admin/categories`, `/admin/brands`         | Create a taxonomy row                                  |
| PATCH  | `/admin/categories/:id`, `/admin/brands/:id` | Rename or re-slug                                      |
| DELETE | `/admin/categories/:id`, `/admin/brands/:id` | Delete, or `409 TAXONOMY_IN_USE`                       |
| GET    | `/admin/orders`                              | Every customer's orders, paginated, with status counts |
| GET    | `/admin/orders/:orderNumber`                 | One order plus its customer                            |
| PATCH  | `/admin/orders/:orderNumber/status`          | Move the status and optionally set the tracking number |
| POST   | `/admin/uploads`                             | Multipart image upload, one `image` part               |
| GET    | `/media/catalog/:file`                       | Public delivery of an uploaded image                   |

### Account endpoints

`/users/*` requires the session cookie and only ever touches the signed-in customer's own rows;
another customer's address id returns `404 ADDRESS_NOT_FOUND` rather than `403`, so ids cannot be
probed. Address changes run in a transaction that locks the owner's account row, which is what keeps
"at most one default address" true under concurrent requests; deleting the default promotes the
oldest remaining address.

```sh
curl -X PATCH localhost:4000/api/v1/users/me -b cookies.txt \
  -H 'Content-Type: application/json' -d '{"name":"Nama Baru"}'
curl -X POST localhost:4000/api/v1/users/me/password -b cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"rahasia123","newPassword":"rahasia456"}'
```

Changing the password signs every other device out: the session token carries the account's
`token_version`, the change increments it, and the device that made the change receives a fresh
cookie. Changing the email requires the current password.

### Wishlist endpoints

`/users/me/wishlist` requires the session cookie and always operates on `req.user`, so a product id
in the body cannot nominate an owner. A saved row is a relationship (`tbl_favorit`), not a snapshot:
each read joins `tbl_produk`, so the customer sees today's price and stock, and a product the admin
hides stops appearing until it is reactivated.

- Items are newest-saved first and carry the product summary plus `colors` and `sizes`, which the
  row needs to put the product in the cart.
- `POST` answers `200` for a first save and a repeat, so a retry is not an error; the unique
  `(user_id, product_id)` constraint makes the duplicate a no-op, including two simultaneous tabs.
- `DELETE` answers `200` even when nothing was saved — the caller asked for the product not to be
  there, and it is not.
- Saving a missing or inactive product is `404 PRODUCT_NOT_FOUND`. An invalid id is `422` before any
  SQL runs. Saving an active product with no stock is allowed.

```sh
curl -X POST localhost:4000/api/v1/users/me/wishlist -b cookies.txt \
  -H 'Content-Type: application/json' -d '{"productId":5}'
curl localhost:4000/api/v1/users/me/wishlist -b cookies.txt
curl -X DELETE localhost:4000/api/v1/users/me/wishlist/5 -b cookies.txt
```

### Cart endpoints

The cart works before sign-in. A visitor is identified by a random token in an httpOnly cookie
(`ba_dekor_guest_cart`); only its SHA-256 digest is stored, so a database dump cannot be replayed as a
cookie. A signed-in request uses the account instead, and a session cookie that is present but invalid
is a `401` rather than a silent fallback to guest ownership — otherwise an expired session would split
one customer's cart in two.

- `POST /cart/items` takes `{ "productId": 3, "color": "Rotan natural", "size": "", "quantity": 2 }`;
  colour/size default to `""` and quantity to `1`. Adding the same variant again raises its quantity;
  a different colour is its own line. Adding is **not** idempotent — use `PATCH` to set a quantity.
- `PATCH /cart/items/:id` sets an absolute quantity. `0` is rejected: removal is `DELETE`.
- Stock belongs to the product, not the variant, so the check sums every variant of that product
  already in the cart. Over-stock is `409 INSUFFICIENT_STOCK` with `details: { available, requested }`.
- A colour or size the product does not offer is `422 INVALID_VARIANT`; a product that asks for a
  choice will not accept `""`. A missing or inactive product is `404 PRODUCT_NOT_FOUND`.
- Every response returns the whole cart — `items`, `count`, `subtotal`, `canCheckout`. Prices are read
  live from `tbl_produk`, and a line the catalogue changed underneath the customer stays visible with
  `issues` and `isAvailable: false`, which makes `canCheckout` false. Totals that would exceed
  JavaScript's safe integer range are refused with `409 CART_TOTAL_TOO_LARGE` rather than rounded.
- **Nothing is reserved.** Adding to a cart never touches stock; checkout re-reads it in 04g.
- Signing in merges the guest cart into the account cart and clears the guest cookie. The account's own
  lines keep their stock first, then guest lines are added oldest-first; whatever does not fit is
  reported in `meta.cartMerge.adjustments`, and `merged` says whether anything moved. A wrong password
  leaves the guest cart untouched. The guest row is kept with `merged_at` set, so a write that was in
  flight cannot resurrect a spent token.
- Signing out keeps the account cart on the server: it is never handed to the next visitor as a guest.

```sh
curl -X POST localhost:4000/api/v1/cart/items -c jar.txt -b jar.txt \
  -H 'Content-Type: application/json' -d '{"productId":3,"color":"Rotan natural","quantity":2}'
curl localhost:4000/api/v1/cart -b jar.txt
curl -X PATCH localhost:4000/api/v1/cart/items/1 -b jar.txt \
  -H 'Content-Type: application/json' -d '{"quantity":3}'
curl -X DELETE localhost:4000/api/v1/cart/items/1 -b jar.txt
```

### Order endpoints

Checkout spends the **server-side** cart. The request names what the customer chose, never what it
costs: `{ "addressId": 1, "shippingMethod": "reguler", "paymentMethod": "bca" }`. Prices, totals,
item lists and the owner are read from the database, so a tampered payload cannot change the charge,
and any extra field — `total`, `items`, a card number — is a `422` rather than a silently ignored key.

The `Idempotency-Key` header is required (16–128 characters of `A-Z a-z 0-9 _ -`). It is what makes a
lost response safe: a retry with the same key and the same body returns the order already placed
(`200`, `meta.replayed: true`) instead of charging the customer twice or eating a cart they refilled
while waiting. A different body under a used key is `409 IDEMPOTENCY_CONFLICT`. A genuinely new
purchase needs a new key.

- `POST /orders` answers `201` for a new order and `200` for a replay.
- Shipping is a flat rate chosen from a fixed list: `reguler` Rp 85.000, `kargo` Rp 250.000,
  `workshop` Rp 0. Payment is chosen from `bca` → "Transfer bank BCA", `bni-va` → "Virtual account
  BNI", `qris` → "QRIS", `kartu` → "Kartu kredit". The policy id is stored beside the label
  (`payment_method_id`), so the provider channel is never recovered by parsing display text. Checkout
  itself contacts no provider and accepts no card data: the order and its payment attempt are
  separate steps, described under _Payment endpoints_.
- Checkout is **all or nothing**. The whole cart is validated against current stock, aggregated per
  product across its variants, then the order, its item snapshots, its first status event, the stock
  deduction and the cart clearing commit together — or none of them do. Unlike the guest merge,
  quantities are never reduced to fit: a shortage is `409 INSUFFICIENT_STOCK` and the customer is
  told what is left.
- An inactive product is `409 PRODUCT_UNAVAILABLE`, a variant the catalogue dropped is
  `422 INVALID_VARIANT`, an empty cart is `400 CART_EMPTY`, and an address that is not the caller's is
  `404 ADDRESS_NOT_FOUND`.
- The order keeps its own copy of the address, the item names, images and prices, so editing or
  deleting an address or product later does not rewrite history.
- `GET /users/me/orders` takes `page` (default 1), `limit` (default 10, max 100) and
  `status` (`all` by default, else one of the four). `meta.statusCounts` covers the customer's
  **whole** history, not the page or the filter, so the filter chips stay honest.
- There is no customer endpoint that changes a status, cancels an order or sets tracking: that is the
  admin API described under _Admin order endpoints_ below.

```sh
# Sign in, then fill the cart from the real catalogue
curl -X POST localhost:4000/api/v1/auth/login -c jar.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"sari@badekor.id","password":"rahasia123"}'
curl localhost:4000/api/v1/users/me/addresses -b jar.txt          # take an address id
curl -X POST localhost:4000/api/v1/cart/items -b jar.txt \
  -H 'Content-Type: application/json' -d '{"productId":3,"color":"Rotan natural","quantity":2}'

# Check out
curl -X POST localhost:4000/api/v1/orders -b jar.txt \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: 9f1c1c1e-6a3b-4a0e-8f2d-7c5b4a392817' \
  -d '{"addressId":1,"shippingMethod":"reguler","paymentMethod":"bca"}'

# Retry with the same key after an uncertain network failure: same order, no second charge
curl -X POST localhost:4000/api/v1/orders -b jar.txt \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: 9f1c1c1e-6a3b-4a0e-8f2d-7c5b4a392817' \
  -d '{"addressId":1,"shippingMethod":"reguler","paymentMethod":"bca"}'

curl 'localhost:4000/api/v1/users/me/orders?page=1&limit=10&status=all' -b jar.txt
curl localhost:4000/api/v1/users/me/orders/BD-2026-1000 -b jar.txt
```

Order numbers are `BD-<year>-<sequence>`, allocated from one PostgreSQL sequence. The year is read in
`Asia/Makassar` (WITA), where the shop operates, and the sequence never resets, so a new year cannot
reissue an old number. The migration starts it at `greatest(1000, highest existing suffix + 1)`, which
keeps a clean migrate-then-seed database clear of the demo orders' static numbers.

### Payment endpoints

Online payment uses **Midtrans Snap** in sandbox mode. The order comes first and the payment attempt
second: checkout commits the order without calling the provider, then the confirmation page asks for
a Snap token. That ordering is deliberate — a provider outage leaves a payable order with a retry
button instead of losing the purchase.

- **The server prices everything.** `gross_amount` is read from the stored order
  (subtotal + shipping − discount). The browser never sends an amount, and a Snap payload whose items
  do not add up to the total throws before the provider is called.
- **`POST /orders/:orderNumber/payments` requires the session** and only works on an order the caller
  owns. It answers `201` with the Snap token and redirect URL; calling it again while the attempt is
  still payable returns the same token instead of opening a second transaction.
- **Every attempt is its own row.** Midtrans refuses a reused `order_id`, so a retry after an expiry
  becomes `BD-2026-1000-2` and the earlier attempt stays in `tbl_pembayaran` for reconciliation.
- **QRIS is a payment choice, not a step inside the provider.** `qris` maps to Snap's `other_qris`
  channel, so a customer who chooses it at checkout is not asked to choose again on Midtrans. Snap
  shows the transaction-specific dynamic code with its instructions and expiry on its own page.
- **The QR code is stored, not regenerated.** `GET /orders/:orderNumber/payments` returns the newest
  attempt with `qrCodeUrl` and `expiresAt`, so the order page redraws the same code after a reload
  instead of opening a second provider transaction. `qrCodeUrl` comes from the provider's
  `generate_qr_code` action and is only kept when it is an `https:` URL, which makes it safe to use as
  an `<img src>`. A `pending` answer that carries the code counts as no status change, so the code and
  the channel are recorded separately from the status transition.
- **Scanning a code is not a payment.** The order stays `pending` until a signature-checked
  notification (or a `sync` that asks the provider) reports a settlement; the Snap success page and
  the on-screen countdown prove nothing on their own. An expiry moves the attempt to `expired` and the
  page offers a retry, which starts a new attempt and therefore a new code.
- **`tbl_pesanan.payment_status`** is one of `unpaid`, `pending`, `paid`, `failed`, `expired`,
  `refunded`, and it only moves forward. The single deliberate exception is `failed`/`expired` →
  `paid`, because a late settlement can still arrive after a retry was shown as failed.
- **`sync` asks the provider** for the authoritative status. It exists because a webhook cannot reach
  a developer machine, and it is what the page calls when the Snap popup closes.
- **The webhook is the only truth for "paid".** The browser's `onSuccess` triggers a `sync`; it never
  writes a status itself. A notification is signature-checked
  (`sha512(order_id + status_code + gross_amount + server key)`), the amount must equal the attempt's
  `gross_amount`, and the currency must be `IDR`. A replay is recognised by a `sha256` fingerprint
  unique per `(provider, key)` and answered `200` so Midtrans stops retrying. Unknown orders, stale
  transitions and amount mismatches are recorded in `tbl_notifikasi_pembayaran` with their outcome and
  are acknowledged too, because a non-2xx response only causes more retries.
- **No card data is stored**, and the server key never leaves the server. `/payments/config` returns
  the client key because Snap needs it in the browser; that key is public by design.

| Error                           | When                                              |
| ------------------------------- | ------------------------------------------------- |
| `503 PAYMENT_NOT_CONFIGURED`    | No Midtrans credentials in the environment        |
| `401 INVALID_PAYMENT_SIGNATURE` | The notification signature does not match         |
| `422 PAYMENT_CURRENCY_MISMATCH` | A notification in a currency other than IDR       |
| `502 PAYMENT_PROVIDER_ERROR`    | Midtrans could not be reached or refused the call |
| `404 ORDER_NOT_FOUND`           | No such order, or it belongs to another customer  |

```sh
# Public configuration. The server key must never appear in this response
curl localhost:4000/api/v1/payments/config

# Start (or resume) the payment for one owned order
curl -X POST localhost:4000/api/v1/orders/BD-2026-1000/payments -b jar.txt

# Stored payment state: the attempt, the QRIS code and the deadline. No provider call.
curl localhost:4000/api/v1/orders/BD-2026-1000/payments -b jar.txt

# Ask the provider for the real status when no webhook can reach you
curl -X POST localhost:4000/api/v1/orders/BD-2026-1000/payments/sync -b jar.txt
```

#### Testing the webhook locally

Midtrans must reach the API from the internet, so a local webhook needs a tunnel:

```sh
# 1. Expose the API (the path below must be the full public URL)
ngrok http 4000

# 2. Midtrans dashboard > Settings > Configuration, then set
#    Payment Notification URL to
#    https://<tunnel-host>/api/v1/payments/midtrans/notification
#
# 3. Pay in the sandbox popup and watch the server log. The notification is
#    only applied when its signature verifies against MIDTRANS_SERVER_KEY.
```

Without a tunnel, `POST /orders/:orderNumber/payments/sync` takes the same reconciliation path — it
reads the status from the provider over an outbound call, so nothing has to reach the machine. The
sandbox payment flow can be exercised end to end that way; only the notification itself stays
unverified until a tunnel or a deployed environment exists.

To exercise **QRIS** in the sandbox, check out with `paymentMethod: "qris"` and press _Bayar
sekarang_. The code can be paid from a QRIS-capable sandbox wallet, or simulated from the transaction
detail in the Midtrans dashboard. Whatever the screen shows, the order only becomes `paid` when the
notification (or a `sync`) says the payment settled; leaving the code unpaid past its expiry makes the
attempt `expired` and the next press of _Bayar sekarang_ issues a new attempt and a new code. Pending,
settlement and expiry QRIS notifications are covered by the API tests, so the states can be checked
without credentials.

### Catalogue queries

`GET /products` accepts `search`, `category`, `brand`, `color`, `size`, `minPrice`, `maxPrice`,
`sort`, `page` and `limit`. Defaults are `sort=newest`, `page=1`, `limit=9`; `limit` is capped at 100. Filters combine with AND, and unknown category/brand slugs return an empty page rather than an
error. `sort` is one of `newest` (new arrivals first), `price-asc`, `price-desc`, `rating`.

Only active products are public. Invalid or repeated parameters return `422 VALIDATION_ERROR` with
`details: { field, message }`; a repeated parameter is rejected instead of silently using the last
value.

```sh
curl 'http://localhost:4000/api/v1/products?category=sofa&sort=price-asc&page=1&limit=9'
curl 'http://localhost:4000/api/v1/products/sofa-ulin-l-shape'
```

The session is a JWT in an httpOnly `ba_dekor_session` cookie (SameSite=Lax, `Secure` in
production). Only the user id is stored in the token; the role is re-read from the database on
every request, so a role change takes effect immediately. `register` and `login` are rate-limited
(10 requests per 15 minutes per IP by default).

### Admin catalogue endpoints

Everything under `/admin` requires a signed-in account whose database role is `admin`. A guest gets
`401 UNAUTHENTICATED`, a customer `403 FORBIDDEN`. The role is re-read on every request, so demoting
an account ends its admin access on the next call without waiting for the cookie to expire. Writes
also refuse a request a browser reports as coming from another site (`403 CROSS_SITE_REQUEST`,
checked from `Origin` and `Sec-Fetch-Site`); clients that send neither header — curl, the tests — are
allowed, because they cannot be confused-deputy attacks.

Unlike the public catalogue, the admin list shows hidden products: an operator who hid something must
be able to find it again. `GET /admin/products` accepts `page`, `limit` (max 100), `search`,
`category`, `brand`, `visibility` (`all|active|hidden`, default `all`) and `sort`
(`newest|name-asc|price-asc|price-desc`).

**`expectedVersion` is required on every product update and delete.** Each product carries a numeric
`version` that PostgreSQL advances on _every_ row update, including the stock decrement a checkout
performs. Send the version from the read that produced the form:

```sh
# 409 PRODUCT_CONFLICT means someone changed it (a sale, another admin): reload and retry
curl -X PATCH localhost:4000/api/v1/admin/products/3 -b admin.txt \
  -H 'Content-Type: application/json' \
  -d '{"expectedVersion":4,"name":"Kursi Rotan Besar"}'

# A DELETE body carries the version too, and answers { "data": null }
curl -X DELETE localhost:4000/api/v1/admin/products/3 -b admin.txt \
  -H 'Content-Type: application/json' -d '{"expectedVersion":5}'
```

Slugs are allocated by the server. If you omit `slug`, it is derived from the name and suffixed
(`-2`, `-3`) until it is free, so the response can carry a different slug than the name suggests —
always use the returned value. A slug you type yourself is never silently changed: if it is taken the
request fails with `422 VALIDATION_ERROR` naming `slug`.

Deletes refuse rather than cascade silently:

- a product with a line in any cart (guest or account) is `409 PRODUCT_IN_USE`; hide it instead
  (`PATCH { "isActive": false, "expectedVersion": n }`) and the cart keeps working. Historical order
  items are snapshots: after a successful delete they keep their name, price, image and variant, and
  their `product_id` becomes `null`;
- a category or brand with **any** product still pointing at it, hidden ones included, is
  `409 TAXONOMY_IN_USE` with `details: { taxonomy, id }`. Move the products first. This deliberately
  overrides the brand foreign key's `ON DELETE SET NULL`, which would otherwise silently unbrand
  every product that used it.

Request bodies are strict: unknown fields are rejected, including read-only ones such as `rating`,
`id` and `version`. Product images must be either a seeded storefront path under `/images/` that
exists on disk, or a path returned by `/admin/uploads`; external URLs, `..` segments, backslashes and
query strings are refused. Category images may be empty.

### Admin order endpoints

These routes have the same auth and cross-site gates as the admin catalogue. They are not
owner-scoped: an operator sees every customer's orders, and each order carries its owner as
`customer: { id, name, email, phone }`.

`GET /admin/orders` accepts `page` (default 1), `limit` (default 20, max 100), `status` (`all` by
default, else one of the four) and `search`, which matches the order number, the customer's name or
the customer's email as a literal substring — `%` and `_` are text, not wildcards. `meta.total` is
the filtered count. `meta.statusCounts` follows `search` but ignores the selected status, so the
chips stay honest while the list is filtered.

```sh
curl 'localhost:4000/api/v1/admin/orders?status=processing&page=1&limit=20' -b admin.txt
curl 'localhost:4000/api/v1/admin/orders?search=sari' -b admin.txt
curl localhost:4000/api/v1/admin/orders/BD-2026-0417 -b admin.txt
```

`PATCH /admin/orders/:orderNumber/status` takes `{ "status": "shipped" }` and, optionally,
`"trackingNumber"` (1–64 characters; `""` or `null` clears it). The body is strict: a price, an
owner, a cancellation reason or any other field is a `422`.

Status changes are forward-only:

| From         | Allowed next states      |
| ------------ | ------------------------ |
| `processing` | `shipped`, `cancelled`   |
| `shipped`    | `completed`, `cancelled` |
| `completed`  | — (terminal)             |
| `cancelled`  | — (terminal)             |

- The same status again is a `200` no-op, so retrying after a lost response does not append a second
  timeline entry.
- An illegal move is `409 ORDER_STATUS_CONFLICT` with `details: { from, to, allowed }`.
- Cancelling is the one transition with a side effect: every line goes back to stock and
  `cancellationReason` becomes "Pesanan dibatalkan oleh admin toko." if the order had no reason.
  Because `cancelled` is terminal, the restore runs at most once, even if two operators cancel
  together.
- The response is the refreshed order — the same shape as the detail read — so the panel can render
  the new badge and timeline without a second request.
- Every change appends to `tbl_riwayat_status_pesanan`, which is the timeline the customer sees at
  `/akun/pesanan/:orderNumber`.

```sh
curl -X PATCH localhost:4000/api/v1/admin/orders/BD-2026-0417/status -b admin.txt \
  -H 'Content-Type: application/json' -d '{"status":"shipped","trackingNumber":"JNE-8821-4410"}'
```

### Image storage

Uploads are stored on local disk, not in PostgreSQL.

- `UPLOAD_DIR` (default `server/uploads/catalog`) is where uploads are written. In a container this
  must be a mounted volume, or every image disappears with the previous container.
- `PUBLIC_IMAGE_DIR` (default `client/public/images`, or `client/dist/images` when `NODE_ENV` is
  `production`) is where the seeded `/images/...` assets live. It is only read to confirm that a
  product's image path really exists.
- The image is decoded, auto-oriented, stripped of EXIF/GPS, resized to at most 2000 px on the longer
  side and re-encoded as WebP under a generated UUID name; the media route serves only those names.
  Input is limited to 5 MiB, JPEG/PNG/WebP, at most 8192 px per side and 16 million pixels. Uploads
  are rate-limited per admin account (20 per 15 minutes by default) and the encoder queue is bounded,
  so a burst gets `503 UPLOAD_BUSY` instead of exhausting memory.
- **Back up `UPLOAD_DIR` alongside the database.** Database backups do not contain images, and uploads
  are not part of any transaction.
- Nothing deletes an image automatically: removing a product or replacing its photo leaves the old
  file in place. Files accumulate, which is the safe default — deleting a file that an old order page
  still renders would break that page. Orphan cleanup is deliberately not implemented here.

```sh
curl -X POST localhost:4000/api/v1/admin/uploads -b admin.txt \
  -F 'image=@kursi.jpg'
# { "data": { "path": "/api/v1/media/catalog/<uuid>.webp", "width": 1200, "height": 900, "size": 84213 } }

# The returned path goes straight into a product, and is served without a session
curl -X POST localhost:4000/api/v1/admin/products -b admin.txt \
  -H 'Content-Type: application/json' \
  -d '{"name":"Kursi Anyam","categorySlug":"kursi","price":1500000,"material":"Rotan",
       "dimensions":"50 x 55 x 80 cm","description":"Kursi anyam.","colors":["Rotan natural"],
       "images":["/api/v1/media/catalog/<uuid>.webp"]}'
curl localhost:4000/api/v1/media/catalog/<uuid>.webp --output kursi.webp
```

#### Panel integration

The admin screens and the `client/src/services/admin.js` adapter were replaced in step 05. They now:

- send `expectedVersion` on product **PATCH** and **DELETE**, taken from the most recent read, and
  handle `409 PRODUCT_CONFLICT` by reloading the record and asking the operator to save again;
- adopt the `slug` the server returns rather than the slug the form derived;
- upload images through `/admin/uploads` and send the returned `path`; there is no separate
  "attach" step and no image-removal endpoint;
- explain `409 PRODUCT_IN_USE` (suggest hiding instead) and `409 TAXONOMY_IN_USE` (link to the
  filtered product list);
- page, search and filter `GET /admin/products` on the server, hidden rows included unless
  `visibility=active` is passed;
- page, search and filter `GET /admin/orders` on the server and render the chips from
  `meta.statusCounts`;
- render the `customer` carried by admin order rows and details;
- send `{ status, trackingNumber? }` on a status change and use the refreshed order in the response.
  An illegal move is `409 ORDER_STATUS_CONFLICT` with `details.allowed`, so the panel offers only the
  legal targets — `completed` and `cancelled` are terminal;
- rely on the server for cancellation restock and the safe same-status no-op.

## Tests

```sh
npm test                   # unit tests, no database needed
npm run test:integration   # PostgreSQL-backed tests
```

The integration suite uses `TEST_DATABASE_URL`, or `DATABASE_URL` with a `_test` suffix, and
refuses to run against a database whose name does not end in `_test`, because it truncates tables
between tests. Create the database once:

```sh
docker compose exec db createdb -U ba_dekor ba_dekor_test
```

`npm test` deliberately stays database-free so it passes on a machine without PostgreSQL; the
database-backed suites run only through `npm run test:integration` and `npm run test:all`.

## Development process

Work happens in reviewed steps listed in [`AGENTS.md`](./AGENTS.md#roadmap). Each finished step
writes a review note to [`.reviews/`](./.reviews), following `.reviews/_TEMPLATE.md`.

## Credit

The visual starting point comes from
[ecommerce-template-tailwind-1](https://github.com/fajar7xx/ecommerce-template-tailwind-1) by Fajar
Siagian (ISC). BaDekor, its brand, copy and data are fictional.
