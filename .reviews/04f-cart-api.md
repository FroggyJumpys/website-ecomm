# 04f — Cart API

**Status:** Awaiting review
**Depends on:** 04b (Auth API), 04c (Catalog API), 04a (`tbl_keranjang` schema)
**Approved plan:** GET/DELETE `/cart`, POST `/cart/items`, PATCH/DELETE `/cart/items/:id`; guest
cart identified by a cookie; merge on sign-in with **"keep what stock allows and report the
adjustment"**.

## Goal

Persist the cart for guests and signed-in customers, validate quantities against live stock, and
merge a visitor's guest cart into their account cart when they sign in — the backend behind
`client/src/context/CartProvider.jsx`, so step 05 can drop the local-storage version.

The frontend keeps running on local storage. This step is backend only.

## Contract

All under `/api/v1`. Owner is always the session or the guest cookie, never a submitted id.

| Method | Endpoint | Response |
| --- | --- | --- |
| GET | `/cart` | `200 { data: cart }` |
| POST | `/cart/items` | `200 { data: cart }` |
| PATCH | `/cart/items/:id` | `200 { data: cart }` |
| DELETE | `/cart/items/:id` | `200 { data: cart }` |
| DELETE | `/cart` | `200 { data: cart }` |

```json
{
  "data": {
    "items": [
      {
        "id": 12, "key": "3::Rotan natural::Standar", "productId": 3,
        "slug": "kursi-rotan-sungai", "name": "Kursi Rotan Sungai",
        "image": "/images/products/product3.jpg", "price": 1850000, "stock": 18,
        "color": "Rotan natural", "size": "", "quantity": 2, "lineTotal": 3700000,
        "isAvailable": true, "issues": [],
        "rating": 4.7, "reviewCount": 21, "material": "Rotan", "dimensions": "50 × 55 × 80 cm",
        "isNew": false, "isTrending": true,
        "category": { "slug": "kursi", "name": "Kursi" }, "brand": null
      }
    ],
    "count": 2, "subtotal": 3700000, "canCheckout": true
  }
}
```

`cartMerge` is added to the sign-in response only when a guest cart was actually consumed:

```json
{
  "data": { "id": 7, "name": "Sari Wulandari" },
  "meta": { "cartMerge": { "merged": true, "adjustments": [
    { "productId": 5, "color": "Ulin natural", "size": "180 cm",
      "requestedQuantity": 3, "quantity": 2, "code": "INSUFFICIENT_STOCK",
      "message": "Stok tersisa 4 unit. Jumlah disesuaikan menjadi 2." }
  ] } }
}
```

## Migration

`006_cart_merge_marker.sql` adds `tbl_keranjang.merged_at` (nullable) plus a partial index on it.

This was **not** in the plan I laid out — it became necessary while implementing. Consuming a guest
cart by deleting the row is not enough: a write that was already in flight would recreate the same
guest token and write into a cart nobody can ever reach again, silently losing the item. Keeping the
row with `merged_at` set makes "this token is spent" a fact the next write can see, and it gets
`409 CART_MERGED` instead. Forward-only, additive, no backfill needed.

## Decisions

- **A guest is an httpOnly cookie holding a random 32-byte token; only its SHA-256 digest is stored.**
  A database dump cannot be replayed as a cookie. The token is not a JWT because it grants nothing
  beyond "this anonymous cart is mine" — the row is the only authority, which is what lets login
  consume it for good.
- **A read never mints a cart.** Every page load reads `/cart`; creating a row (and a cookie) for every
  visitor would fill the table with carts nobody used. The token is issued on the first successful
  write, and only after the store accepts it, so a rejected add leaves no cart behind.
- **A present-but-invalid session cookie is a `401`, not a guest.** Falling back would silently split a
  signed-in customer's cart the moment their session expired. Only a request with *no* session cookie
  is treated as a guest.
- **Stock belongs to the product, so the check sums the variants.** A product may be in the cart in two
  colours; `tbl_produk.stock` is one number. Adding is rejected if the total for that product would
  pass it, with `details: { available, requested }`.
- **The cart row is the lock.** Every mutation locks the owner's cart first, and product rows are locked
  in id order. Two tabs adding the same product queue instead of interleaving, so the loser gets a
  `409` rather than a cart holding more than the workshop has; a fixed product order prevents a
  deadlock between two carts that check each other's stock.
- **Unavailable lines stay visible and block checkout.** A product the admin hides, a variant the
  catalogue dropped, or a quantity the stock no longer covers is reported through `issues` and
  `isAvailable: false`, and `canCheckout` becomes false. Deleting the customer's line would hide the
  problem; the cart page can show it and offer a fix.
- **`PATCH` still works on an unavailable line.** The variant is not re-validated there, so a customer
  can reduce a shrunken line (or remove it) instead of being trapped in a cart they cannot fix.
- **Totals that leave the safe integer range are refused,** not rounded (`409 CART_TOTAL_TOO_LARGE`).
  Showing a price the server cannot charge is worse than showing an error.
- **Merge keeps the account's stock first, then layers guest lines oldest-first.** This is the policy
  the reviewer chose. Every reduction is an adjustment with the requested and kept quantity; a guest
  line that cannot be kept at all is reported with `quantity: 0` rather than silently dropped. A stale
  account line that exceeds stock is trimmed first and reported too, so it cannot starve the guest.
- **Credentials are checked before the merge transaction opens.** A wrong password must not lock,
  modify or consume the guest cart.
- **Registration runs the account insert and the merge in one transaction.** A merge failure rolls the
  account back, instead of leaving a customer who was told registration failed able to log in.
- **Sign-out leaves the account cart on the server.** It is never converted into a guest cart, so
  signing out on a shared computer does not expose the previous customer's cart.
- **`POST /cart/items` is deliberately not idempotent**, unlike the wishlist: it means "add two more",
  and `PATCH` is the absolute-quantity operation. `DELETE` is safe to repeat.

## What changed

| File | Purpose |
| --- | --- |
| `server/db/migrations/006_cart_merge_marker.sql` | `merged_at` on `tbl_keranjang`, partial index |
| `server/src/lib/guestCart.js` | Token creation, digest, shape check, cookie options |
| `server/src/validators/cart.js` | Add/patch/route-id schemas, Indonesian messages |
| `server/src/db/cart.js` | `read` / `add` / `updateQuantity` / `remove` / `clear`, locking, stock checks |
| `server/src/db/cart-merge.js` | `mergeGuestCart(client, { userId, guestTokenHash })` |
| `server/src/services/cart.js` | Binds the store to the pool |
| `server/src/services/auth.js` | `registerUserWithCart`, `loginUser`; `registerUser` keeps its old shape |
| `server/src/db/users.js` | `createUser` accepts a client so registration can be transactional |
| `server/src/controllers/cart.js` | The five handlers, owner resolution, cookie issuance |
| `server/src/controllers/auth.js` | Passes the guest digest, reports the merge, clears the cookie |
| `server/src/middleware/cart-owner.js` | Session-or-guest owner resolution |
| `server/src/routes/cart.js`, `routes/index.js` | Mounts `/cart` |
| `README.md` | Endpoint table, cart behaviour, curl examples |

No new dependency. No frontend change.

## Tests

Test-first throughout; each group was written and confirmed failing before the code existed.

- `cart-validators.test.js` — 20 unit tests: defaults, trimming, stripped price/owner, string and
  fractional ids and quantities, the PostgreSQL integer bound, zero quantity, route-id parsing.
- `guest-cart-token.test.js` — 17 unit tests: token shape and uniqueness, digest stability, digest is
  not the token, shape rejection, cookie flags and lifetime.
- `cart-queries.integration.test.js` — 40 tests: empty reads without creating a row, line shape, stable
  order, live price/stock, totals, hidden products and dropped variants and shrunken stock as issues,
  unrepresentable totals, cross-owner isolation, variant merging, stock summed across variants,
  concurrent over-stock adds, absolute quantity updates, the reduce-a-shrunken-line escape hatch, and
  every remove/clear case.
- `cart-merge.integration.test.js` — 18 tests: no cart, empty cart, moving lines, one-time consumption,
  combining variants, the reviewer's `2 + 2 → 3` example, oldest-first allocation across variants,
  lines that fit nowhere, hidden products, dropped variants, a stale account line trimmed first, other
  guests' carts, the spent-token write, and rollback.
- `cart-api.integration.test.js` — 31 tests: cookie issuance and flags, reload persistence, two browsers,
  a forged cookie, all validation and error contracts, cross-browser isolation, account carts, logout
  privacy, merge on register and login, the adjustment report, and a wrong password leaving the guest
  cart alone.

Three things the tests caught while writing this:

1. `store.add` passed `quantity: undefined` straight to SQL when the caller omitted it — the defaults
   live in the validator, not the store, so a direct service call produced a `23502` instead of the
   documented default of `1`.
2. Several merge fixtures were impossible to build through `store.add`, which correctly refuses
   over-stock adds. They are now seeded directly, which is also the realistic case: a cart built when
   more was in stock.
3. My first "account line trimmed" test asserted the guest got stock the account had already taken.
   That contradicted the agreed account-first policy; the test was wrong, not the merge, and it is now
   split into "account keeps it all" and "whatever is left is shared".

## Verification

```
npm run lint             clean
npm test                 151 passed (12 files)
npm run test:integration 289 passed (17 files)
npm run build            built in 1.32s (only the pre-existing >500 kB chunk warning)
npm run db:migrate       applied 006_cart_merge_marker.sql to the dev database
```

Real HTTP against the dev server, using separate cookie jars like separate browsers:

| Check | Result |
| --- | --- |
| Guest empty cart | `200`, no cookie set |
| Guest adds 2 × product 3 | `200`, `ba_dekor_guest_cart` set `HttpOnly` |
| Guest reloads | same line, quantity 2 |
| Same variant again, then a second colour | one line at 3, then two lines, total 4 |
| Wrong password at sign-in | `401`; guest cart still 2 lines |
| Sign in | `cartMerge: { merged: true, adjustments: [] }`; guest cookie gone |
| Merged cart | same variant combined `2 + 1 = 3`, second product kept as its own line |
| Sign out, read again | guest sees `0` items; account cart stayed private |
| Sign in again | no `meta`; quantities unchanged (no second merge) |
| Add 9 of a 5-stock product | `409 INSUFFICIENT_STOCK` |
| Unknown product / bad colour / missing size | `404` / `422` / `422` |
| String id, zero quantity, non-numeric route id | `422` with the field named |
| Another browser patches / deletes my line | `404` / `200`, my line and quantity intact |
| Stock after all of it | unchanged (`18`) — nothing is reserved |
| Stock 5 → 4 between add and sign-in | account keeps 2, guest's 3 becomes 2, adjustment reported, cart 4 |

Throwaway accounts and guest carts deleted; seed counts confirmed unchanged at 2 users / 3 addresses /
6 categories / 4 brands / 12 products / 4 orders / 0 wishlists / 0 carts.

## Not done / deferred

- **Frontend still uses local storage.** `CartProvider` keeps its `badekor.mock.cart` implementation
  until step 05; nothing in `client/` changed.
- **Checkout, order creation and stock decrement** are 04g. The cart never reserves stock, and
  `canCheckout` is a hint — 04g must re-validate everything inside the checkout transaction.
- **Shipping cost, discounts and payment** stay out of the cart, matching the current frontend (the
  cart shows "Dihitung saat pembayaran").
- **No cart expiry or cleanup job.** The cookie expires after 30 days, but abandoned guest rows stay;
  `merged_at` is indexed so a sweep is cheap to add when it is wanted.
- **No change-quantity-by-delta endpoint.** `POST` adds, `PATCH` sets; a `+1`/`-1` button in the UI maps
  onto `PATCH` with the computed number.
- **No per-variant stock.** The schema has one `stock` per product; if colour-level stock is ever
  needed that is a schema change, not an API change.

## Out of scope / noticed

- **The malformed-JSON `500` is still open from 04d.** Every cart route accepts a body and is exposed to
  it; the fix belongs in the error handler and is still unfixed by agreement.
- **Docker Desktop keeps stopping on this machine.** It stopped mid-verification here and produced a
  `500 ECONNREFUSED` on `/cart` — worth knowing that this looks like a code bug but is not. Integration
  runs need
  `powershell -ExecutionPolicy Bypass -File .superpowers/sdd/04c-catalog-api/ensure-db.ps1`.
- **The wishlist "move to cart" button is still client-side.** It can now call these endpoints in 05;
  the wishlist note's deferral stands.
- **Review queue still backed up.** 00–03j and 04a–04e are "Awaiting review". This step changed no
  earlier status.

## Open questions for the reviewer

1. **Guest carts are server-side, keyed by a cookie, rather than living in local storage until login.**
   That is what the schema's `guest_token` column was designed for, and it means the cart survives a
   cleared browser cache only as long as the cookie does. The alternative — local storage plus an
   upload at sign-in — would need frontend work now and would lose the cart if the user switched
   devices before signing in.
2. **`POST /cart/items` is not idempotent** (it adds). A double-clicked "add to cart" therefore buys
   two. The alternative is requiring an absolute quantity on every add, which makes the button's
   behaviour the UI's responsibility rather than the API's.
3. **Unavailable lines are kept and block checkout** rather than being pruned. I would rather show the
   customer why the cart cannot proceed than quietly delete something they chose.
4. **Guest carts never expire server-side.** Thirty days is enforced only by the cookie. Should there
   be a sweep that deletes guest carts older than N days?
5. **The merge reports adjustments but does not tell the customer per line in the UI** — that is a
   step 05 job (a toast or a note on the cart page). Is the current `meta.cartMerge` shape enough to
   drive it?
6. **`PATCH` does not re-validate the variant** so that a customer can still fix a broken line. The
   alternative is to force a remove-and-re-add, which loses their place in the cart.

## Reviewer feedback

_To be filled in by the reviewer._
