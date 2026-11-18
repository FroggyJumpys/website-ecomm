# 04e — Wishlist API

**Status:** Approved
**Reviewer:** Kimi (Moonshot AI, AI reviewer)
**Depends on:** 04d (User API), 04c (Catalog API), 04a (`tbl_favorit` schema)
**Approved plan:** GET/POST `/users/me/wishlist`, DELETE `/users/me/wishlist/:productId`, no new
migration.

## Goal

Persist each signed-in customer's wishlist in PostgreSQL, behind the service calls the frontend
already uses (`client/src/services/wishlist.js`), so step 05 only has to flip `USE_MOCKS`.

The frontend keeps running on mocks. This step is backend only.

## Contract

| Method | Endpoint | Response |
| --- | --- | --- |
| GET | `/api/v1/users/me/wishlist` | `200 { data: items }` |
| POST | `/api/v1/users/me/wishlist` | `200 { data: item }` |
| DELETE | `/api/v1/users/me/wishlist/:productId` | `200 { data: null }` |

POST body: `{ "productId": 5 }`. Every route requires the session cookie; the owner is always
`req.user.id`.

An item is the catalogue summary (`toSummary` from `db/catalog.js`) plus `colors` and `sizes`:

```json
{
  "id": 5, "slug": "kursi-rotan-sungai", "name": "Kursi Rotan Sungai",
  "price": 1850000, "compareAtPrice": null, "rating": 4.7, "reviewCount": 21,
  "stock": 6, "material": "Rotan", "dimensions": "50 × 55 × 80 cm",
  "image": "/images/products/product3.jpg", "isNew": false, "isTrending": true,
  "category": { "slug": "kursi", "name": "Kursi" }, "brand": { "slug": "...", "name": "..." },
  "colors": ["Rotan natural", "Cokelat"], "sizes": ["Standar"]
}
```

## Why no new migration

`tbl_favorit` from 04a already has what the feature needs: `user_id`, `product_id`, `created_at`, and
the unique `(user_id, product_id)` constraint, plus a `(user_id, created_at DESC)` index. Nothing in
the contract needs a column the table does not have.

## Decisions

- **The relationship is the record, not a snapshot.** Reads join `tbl_produk`, so the customer sees
  today's price and stock. A price that moved while an item sat in the wishlist must not become a
  stale promise, and the cart total is computed from live data anyway.
- **An inactive product is hidden from the list but its row survives.** Deactivating a product is an
  admin decision that can be reversed; deleting the customer's saves would lose data for a temporary
  state. Reactivating restores it to the exact position it had, because `created_at` never changed.
- **Newest-saved first, `f.id DESC` as the tie-breaker.** Two rows saved in the same transaction share
  a `created_at`, and without the second key the list could reorder itself between reloads.
- **Saving the same product again keeps its original position**, so the save is genuinely idempotent
  rather than "moves to top". Only removing and re-saving moves it to the top, which is what a
  customer who changed their mind expects.
- **POST returns `200` for both a first and a repeat save.** The request means "this product is in my
  wishlist"; a `201` on the first call would make every retry look like an error to the client.
- **Both writes are safe to retry.** `INSERT … ON CONFLICT DO NOTHING` makes a duplicate a no-op at
  the database level, so two simultaneous tabs cannot turn the unique constraint into a `23505`.
  `DELETE` removes nothing and still answers `200`.
- **The id is validated, not coerced.** The body must carry a JSON number; `"5"` is a `422`. Route ids
  arrive as strings and are parsed. Both paths reject zero, negatives, fractions and values beyond the
  safe-integer range *before* any SQL runs, so a bad id is a Bahasa Indonesia `422`, never a database
  error.
- **A missing or inactive product is `404 PRODUCT_NOT_FOUND`**, the same code 04c uses for an unknown
  slug. The product is read in the same statement that inserts the relationship, so a product hidden
  between two separate queries cannot be saved after being reported missing.
- **Another customer's saved row is indistinguishable from a missing one.** Ownership is in every
  `WHERE` clause, and `DELETE` reports success either way. There is no id to probe.

## What changed

| File | Purpose |
| --- | --- |
| `server/src/validators/wishlist.js` | Body and route-parameter schemas, Indonesian messages |
| `server/src/db/wishlist.js` | `list` / `save` / `remove`, reusing `toSummary` |
| `server/src/services/wishlist.js` | Binds the store to the pool |
| `server/src/controllers/wishlist.js` | The three handlers |
| `server/src/routes/users.js` | Mounts the three routes under `requireAuth` |
| `README.md` | Endpoint table, behaviour notes, curl examples |

No schema change, no new dependency, no frontend change.

## Tests

Test-first throughout; each group was written and confirmed failing before the code existed.

- `wishlist-validators.test.js` — 17 unit tests: valid id, missing/null/string/`NaN`/fractional/
  zero/negative/out-of-range ids, extra fields stripped, URL ids parsed and rejected the same way.
- `wishlist-queries.integration.test.js` — 20 tests: empty list, item shape, newest-first order,
  position kept on repeat save, live price/stock, hidden product hidden then restored, cross-customer
  isolation, idempotent save, concurrent save, two customers saving one product, unknown/inactive
  product, out-of-stock product, re-save after removal, and every `remove` case.
- `wishlist-api.integration.test.js` — 22 tests: all three routes without a session, a stale session
  after a password change, list shapes, owner id in the body ignored, `404`/`422` contracts, and
  another customer being unable to remove a saved product.

Two bugs the tests caught while writing the store:

1. The `save` lookup originally reused the wishlist `FROM`, which joins `tbl_favorit` — so an unsaved
   product could never be found and every first save would have been a `404`.
2. The validator's integer check ran after the range check, so `1.5` reported "tidak valid" instead of
   "angka bulat"; the URL schema had the mirror-image problem.

## Verification

```
npm run lint             clean
npm test                 114 passed (10 files)
npm run test:integration 200 passed (14 files)
npm run build            built in 785ms (only the pre-existing >500 kB chunk warning)
```

Real HTTP check against the dev server with two throwaway accounts (both deleted afterwards; seed
counts confirmed unchanged at 2 users / 3 addresses / 6 categories / 4 brands / 12 products /
4 orders / 0 wishlists):

| Check | Result |
| --- | --- |
| Empty wishlist | `200`, `0` items |
| Save a product | `200`, item with `colors`/`sizes` |
| Save it twice, plus a third product | `200`; list is `3,1` (repeat save did not duplicate or reorder) |
| Second account's list | `0` items |
| Save an unknown product | `404 PRODUCT_NOT_FOUND` |
| Save with a missing / string id | `422` |
| Delete with a non-numeric id | `422` |
| Second account deletes the first's item | `200`, but the owner still has it |
| Owner deletes it | `200 { data: null }`, gone |
| Re-save after removal | back at the top |
| No session | `401` |

## Not done / deferred

- **Moving a wishlist item into the cart is client-side.** The page calls the cart mutation and then
  removes the item; a server-side "move" would need the cart API, which is 04f.
- **No pagination.** The contract returns the complete list, which is what the heart buttons and the
  wishlist page expect today. Worth revisiting if a customer can save hundreds of products.
- **No wishlist count in any other payload.** The header badge reads the list the page has already
  loaded.
- **No "recently removed / undo".** Removal is immediate and unrecoverable.
- **Guest wishlists.** The table is per user; an anonymous visitor is sent to sign in, as the
  component already does.
- **Admin tooling for `tbl_favorit`.** Not in the roadmap.

## Out of scope / noticed

- **The malformed-JSON `500` is still open** from 04d: `body-parser` sets `status: 400`, but the error
  handler hides non-`AppError` errors. The wishlist routes are exposed to it like every other
  body-accepting route.
- **Docker Desktop keeps stopping on this machine**; integration runs need
  `powershell -ExecutionPolicy Bypass -File .superpowers/sdd/04c-catalog-api/ensure-db.ps1` first or
  they fail with `ECONNREFUSED 127.0.0.1:5433`.
- **Review queue still backed up.** 00–03j and 04a–04d are "Awaiting review" (04d has Revision 1
  applied and awaiting review too). This step changed no earlier status.

## Open questions for the reviewer

1. **Repeat save and order.** I keep the original position instead of moving the product to the top.
   The alternative is "a save always means most recent" — which is tidier to reason about, but makes
   a double-click reorder the list.
2. **Hidden products.** The saved row survives so reactivation restores it. The alternative is
   deleting matching rows when a product is deactivated, which loses customer intent irreversibly.
3. **`200` versus `201`** for a first save. I chose `200` for both so retries are not errors. Some API
   styles insist a creation is `201`; with an idempotent upsert, the client cannot tell them apart
   anyway.
4. **Out-of-stock products can still be saved.** Reasonable for furniture that gets restocked, but say
   if the wishlist should refuse them.
5. **No cap on wishlist size.** Should there be a maximum per customer, and what should happen past it?

## Reviewer feedback

**Approved on 2026-11-18.** Independently exercised the three live endpoints with two disposable
customers. Both began with empty, isolated wishlists. Saving returned the catalogue item with
colours and sizes; saving the same product twice did not duplicate or reorder it; adding another
product produced newest-first `[3,1]`. Unknown products returned 404 `PRODUCT_NOT_FOUND`; missing,
string and malformed route ids returned 422. A second customer's DELETE returned 200 without
removing the owner's row. The owner's delete returned `{ data: null }`, and re-saving moved the
product back to the top. GET, POST and DELETE each returned 401 without a session.

The current complete unit and integration suites passed during this review sequence, including the
59 wishlist validator/query/API tests, and lint passed. Both disposable accounts and their wishlist
rows were deleted and the review server stopped.

The design questions retain the documented behavior: repeat saves are idempotent and keep position;
hidden products retain customer intent and reappear on reactivation; 200 is appropriate for this
idempotent save contract; out-of-stock products remain saveable for restocking; no arbitrary size
cap is needed for this roadmap. No blocking wishlist defect found.
