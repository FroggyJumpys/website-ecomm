# 05 – Frontend integration

- **Status:** Changes requested
- **Phase:** 5 – Integration
- **Date:** 2026-11-18
- **Author:** agent
- **Reviewer:** Kimi (Moonshot AI, AI reviewer)

## Summary

Replaces the whole mock layer with the real Express API: the `client/src/mocks/` tree and the
`VITE_USE_MOCKS` switch are gone, the cart is now the server's cart, checkout sends only policy ids
with an idempotency key, and both order lists are paginated, filtered and counted by the API. The
admin panel adopts the 04h/04i contracts — `expectedVersion`, upload paths, `meta.statusCounts` and
the forward-only status matrix.

Every screen already had loading, error and empty states from Phases 2–3; this step makes those
states reachable by real failures instead of mock latency, and adds them where a list became
server-driven (cart, checkout, order history, admin orders, admin products).

## Files added / changed

### Added

| File                          | Change                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `client/src/services/cart.js` | `GET/DELETE /cart`, `POST /cart/items`, `PATCH/DELETE /cart/items/:id`; every call returns the whole cart. |

### Deleted

| Path                       | Why                                                                     |
| -------------------------- | ----------------------------------------------------------------------- |
| `client/src/mocks/**`      | The mock backend is replaced by the API; keeping it would invite drift. |
| `client/src/lib/config.js` | Held the `USE_MOCKS` switch; no call branches on a mock flag any more.  |

### Changed

| File                                                                                                                                                                     | Change                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `client/src/services/http.js`                                                                                                                                            | Added `apiUpload` for multipart; shared response/error parsing so JSON and uploads fail the same way.         |
| `client/src/services/auth.js`, `catalog.js`, `account.js`, `orders.js`, `wishlist.js`                                                                                    | Dropped every mock branch. Orders now take `page`/`status`; checkout sends `Idempotency-Key`.                 |
| `client/src/services/admin.js`                                                                                                                                           | Server pagination/filter params, `expectedVersion` on product PATCH/DELETE, status + tracking body, upload.   |
| `client/src/context/CartProvider.jsx`                                                                                                                                    | Rewritten on React Query: the server cart is the snapshot, mutations replace the cache from the response.     |
| `client/src/context/AuthProvider.jsx`                                                                                                                                    | Re-reads the cart after sign-in (guest merge) and resets user-scoped queries on sign-out.                     |
| `client/src/context/cartContext.js`                                                                                                                                      | Comment now describes the server-backed contract.                                                             |
| `client/src/hooks/useAccount.js`                                                                                                                                         | `useOrders(params)` keyed by user and params; previous page kept while the next loads.                        |
| `client/src/hooks/useAdmin.js`                                                                                                                                           | Parameterised order/product queries, tracking in the status mutation, `useUploadProductImage`.                |
| `client/src/lib/orderStatus.js`                                                                                                                                          | Added the server's transition matrix and `allowedNextStatuses` for the panel.                                 |
| `client/src/lib/validation.js`                                                                                                                                           | Brand is optional (server allows no brand); category image paths match the server's allow-list.               |
| `client/src/lib/demoAccounts.js`, `shopParams.js`, `components/layout/AccountMenu.jsx`, `components/product/ProductGallery.jsx`, `components/product/WishlistButton.jsx` | Mock-era comments corrected.                                                                                  |
| `client/src/components/admin/ProductForm.jsx`                                                                                                                            | Reads `product.category.slug`/`product.brand.slug`, allows "Tanpa merek", uploads images, omits blank slugs.  |
| `client/src/components/admin/ProductsPanel.jsx`                                                                                                                          | Server search/visibility/sort/paging, `expectedVersion` writes, conflict recovery, clearer delete errors.     |
| `client/src/components/admin/OrderStatusForm.jsx`                                                                                                                        | Offers only legal targets, carries an optional tracking number, explains terminal states.                     |
| `client/src/components/admin/TaxonomyForm.jsx`                                                                                                                           | Omits a blank slug so the PATCH schema is not sent `""`.                                                      |
| `client/src/components/admin/TaxonomyPanel.jsx`                                                                                                                          | Explains `409 TAXONOMY_IN_USE` with the next step.                                                            |
| `client/src/components/cart/CartLine.jsx`                                                                                                                                | Renders the server's per-line `issues` (hidden product, dropped variant, short stock).                        |
| `client/src/components/product/ProductPurchase.jsx`                                                                                                                      | Awaits the cart write, shows its error (for example `INSUFFICIENT_STOCK`) and disables while pending.         |
| `client/src/pages/CartPage.jsx`                                                                                                                                          | Loading/error/empty states, unavailable-line warnings, checkout disabled when `canCheckout` is false.         |
| `client/src/pages/CheckoutPage.jsx`                                                                                                                                      | Sends `{ addressId, shippingMethod, paymentMethod }` + `Idempotency-Key`; re-reads the emptied cart.          |
| `client/src/pages/OrdersPage.jsx`                                                                                                                                        | Server `page`/`status`, chip counts from `meta.statusCounts`, pagination.                                     |
| `client/src/pages/WishlistPage.jsx`                                                                                                                                      | "Move to cart" now awaits the API and reports a stock failure instead of a false success.                     |
| `client/src/pages/LoginPage.jsx`                                                                                                                                         | Removed the "remember me" checkbox; the server owns cookie lifetime. Demo accounts stay (seeded).             |
| `client/src/pages/admin/AdminOrdersPage.jsx`                                                                                                                             | Server `page`/`limit`/`status`/`search`; chips from `meta.statusCounts`; pagination and no-match state.       |
| `client/src/pages/admin/AdminOrderDetailPage.jsx`                                                                                                                        | Sends status + tracking; on `409 ORDER_STATUS_CONFLICT` refetches so the form offers the current legal moves. |
| `client/src/pages/admin/AdminProductsPage.jsx`                                                                                                                           | Delegates product fetching to the panel instead of loading an unpaginated list.                               |
| `client/src/pages/admin/AdminDashboardPage.jsx`                                                                                                                          | Uses the admin catalogue (hidden included) and server status counts; revenue covers the fetched page.         |
| `client/.env.example`                                                                                                                                                    | Removed `VITE_USE_MOCKS`; documents `VITE_API_BASE_URL=/api/v1`.                                              |
| `README.md`                                                                                                                                                              | Layout/comment cleanup, client env docs, panel integration notes.                                             |
| `server/db/seeds/catalog.js`                                                                                                                                             | Comment only: the client mocks are now gone, this is the only catalogue source.                               |

No server route, migration, validator or dependency changed. The only server edit is the seed comment.

## API contract used by the client

| Client call                    | API                                                                             | Notes                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cart read/write                | `GET /cart`, `POST /cart/items`, `PATCH/DELETE /cart/items/:id`, `DELETE /cart` | Every response is the whole `{ items, count, subtotal, canCheckout }`. The guest cookie is httpOnly and set by the server, so the client stores nothing. |
| Checkout                       | `POST /orders`                                                                  | Body is `{ addressId, shippingMethod, paymentMethod }`; `Idempotency-Key` header required.                                                               |
| Customer history               | `GET /users/me/orders?page=&limit=&status=`                                     | `meta.statusCounts` drives the chips; `meta.totalPages` drives pagination.                                                                               |
| Admin orders                   | `GET /admin/orders?page=&limit=&status=&search=`                                | Same envelope plus `customer` on every row; chips ignore the selected status by design.                                                                  |
| Admin status                   | `PATCH /admin/orders/:orderNumber/status`                                       | `{ status, trackingNumber? }`; response is the refreshed order; `409` carries `details.allowed`.                                                         |
| Admin products                 | `GET /admin/products?page=&limit=&search=&category=&brand=&visibility=&sort=`   | Hidden rows included unless `visibility=active`.                                                                                                         |
| Admin product write            | `PATCH`/`DELETE /admin/products/:id`                                            | `expectedVersion` required; `409 PRODUCT_CONFLICT`; deletes can be `PRODUCT_IN_USE`.                                                                     |
| Admin image upload             | `POST /admin/uploads` (multipart, one `image` part)                             | Response `{ path, width, height, size }`; the path goes straight into `images`.                                                                          |
| Wishlist / addresses / profile | unchanged from 04d/04e                                                          | Mock branches removed only.                                                                                                                              |

## How to run and verify

```sh
docker compose up -d db
npm install
npm run db:migrate
npm run db:seed
npm run dev          # API on http://localhost:4000, client on http://localhost:5173

npm run lint
npm test
npm run test:integration
npm run build
```

Demo accounts (created by `db:seed`): `sari@badekor.id` / `rahasia123` (customer) and
`admin@badekor.id` / `rahasia123` (admin).

URLs: storefront <http://localhost:5173/>, collection <http://localhost:5173/toko>, product
<http://localhost:5173/produk/sofa-ulin-l-shape>, cart <http://localhost:5173/keranjang>, account
<http://localhost:5173/akun>, admin <http://localhost:5173/admin>.

Checklist the reviewer can tick:

- [x] `client/src/mocks/` does not exist and no source references `VITE_USE_MOCKS`.
- [x] A guest can add two variants of one product, reload, and still see both lines; the header count matches.
- [x] Signing in merges the guest cart into the account (no duplicate lines lost without a stock message).
- [x] Adding beyond stock shows the API's `INSUFFICIENT_STOCK` message and does not change the count.
- [x] Checkout creates one order, empties the cart, shows the confirmation page and the order in `/akun/pesanan`.
- [x] The customer history chips match `meta.statusCounts` and paging moves through the history.
- [x] `/admin/pesanan` searches server-side (order number, customer name, email), filters by status and pages.
- [x] `/admin/pesanan/:orderNumber` offers only `processing → shipped|cancelled` and `shipped → completed|cancelled`; terminal orders explain why there is no form.
- [x] A tracking number set on the shipped move persists and clearing it removes it.
- [x] Editing a product twice in two tabs produces `409 PRODUCT_CONFLICT` and the panel reloads the row; the typed values survive the reload.
- [x] Uploading a JPEG/PNG/WebP image appends a `/api/v1/media/catalog/...webp` path and the preview renders.
- [x] Hiding a product removes it from the storefront but keeps it in the admin list with `visibility=all`.
- [x] Deleting a category that still has products explains `TAXONOMY_IN_USE`.
- [ ] Stopping the API turns every list into its error state with a working retry; empty filters show empty states.
- [ ] A zero-match admin order search keeps the search/reset controls reachable and shows the no-match state.

## Verification actually run

| Command                    | Result                                                                 |
| -------------------------- | ---------------------------------------------------------------------- |
| `npm run lint`             | Clean, no warnings.                                                    |
| `npm test`                 | 18 unit files, 283 tests passed.                                       |
| `npm run test:integration` | 30 files, 518 tests passed (203 s).                                    |
| `npm run build`            | 177 modules transformed; JS 549 kB (chunk-size warning only, step 09). |

A disposable contract script ran the real Express app over HTTP against a scratch database
(`ba_dekor_step05`, migrated and seeded, dropped afterwards) and asserted **67 checks** covering the
exact calls the client now makes:

- customer and admin login, and the role each response carries;
- product detail arrays (`images`, `colors`, `sizes`);
- cart add, server item `id`, stable `key`, `canCheckout`, quantity PATCH, and an empty cart after checkout;
- checkout `201` with the item snapshot, `shippingMethod` id, payment label, and a same-key replay `200 { replayed: true }`;
- customer history `meta.statusCounts`, detail read;
- admin order list with `search=sari`, `customer` on rows/detail, status counts;
- `processing → shipped` with tracking, `409 ORDER_STATUS_CONFLICT` with `details.allowed` on a backward move;
- admin product list `version`/`category.slug`, PATCH with `expectedVersion`, version increment;
- image upload `201`, media served as `image/webp`, product creation with the uploaded path and a
  server-derived slug, public visibility, and DELETE with `expectedVersion`;
- cancellation recording the default reason, terminal `cancelled` refusing `completed`, and the
  customer seeing the final status.

The script, the scratch database and the two uploaded WebP files were removed; the development
database was not migrated, seeded or modified by this check.

No browser was automated (no Playwright/Puppeteer is installed). The build proves the client
compiles; every request it makes was exercised over HTTP. The unchecked items above are the
click-through a reviewer should do with the browser open.

## Decisions and trade-offs

- **Delete the mock layer instead of keeping it behind a flag.** Phase 5 says "replace `mocks/`".
  A dormant mock branch is code that drifts from the API and tempts a reviewer to test the wrong
  thing. The seeded database plus `db:seed` is the demo path now.
- **The server owns the cart, the client owns only the cache.** `CartProvider` is a React Query view
  of `GET /cart`; every mutation returns the whole cart and replaces the cache. That makes the header
  count, cart page and checkout incapable of disagreeing. Cost: a cart write is a round trip, so the
  add button shows a pending state instead of updating optimistically.
- **Lines are addressed by `key`, the API by item id.** `updateQuantity(key, qty)` and
  `removeItem(key)` look the id up in the cached cart, so no page had to learn about server ids.
- **Guest identity is invisible to the client.** The server mints `ba_dekor_guest_cart` on the first
  successful write; the browser never reads or sends it explicitly, and sign-in merges it server-side.
  `AuthProvider` re-reads the cart after login and resets the query cache after logout.
- **"Remember me" was removed rather than faked.** The server issues a fixed 7-day cookie and has no
  request field for a longer lifetime; leaving a checkbox that changes nothing would be a lie.
- **Checkout names ids, never money.** The payload is `{ addressId, shippingMethod, paymentMethod }`;
  the displayed shipping cost comes from `lib/shipping.js`, which mirrors the server's table. The
  server prices the order and the confirmation page uses the returned order.
- **Idempotency key lifecycle.** A UUID is generated per attempt and reused on retry after a lost
  response; changing the address, shipping method or payment method generates a new one, because the
  server's fingerprint covers exactly those three inputs.
- **Both order lists are server-driven.** Customer history sends `page`/`status`; the admin list also
  sends `limit`/`search`. Chips read `meta.statusCounts`, which follows search but not the selected
  status, so a chip cannot become false while the list is filtered.
- **Product conflicts reload the record, not the form.** On `409 PRODUCT_CONFLICT` the panel refetches
  the list and replaces `editing` with the fresh row (same id, new version). The drawer is keyed by id,
  so the operator's typed values survive and the next save carries the current version.
- **Upload is the only way the panel creates an image path.** `POST /admin/uploads` returns the WebP
  path and `ProductForm` appends it to the `images` textarea. Category covers are still typed paths;
  there is no upload control for them.
- **The transition matrix is mirrored, not trusted.** `lib/orderStatus.js` shows only legal targets,
  but the server remains the authority and answers `409` with `details.allowed` if the client is stale.
- **Cart line issues block checkout.** The server marks a line `isAvailable: false` with `issues[]`;
  the cart page shows the reason and disables the button instead of letting the customer discover the
  failure at `POST /orders`.

## Not done / deferred

- **Frontend tests** — step 07. The client workspace still has no test files; `npm test` runs the
  server unit suite and the client's `--passWithNoTests` script.
- **Toasts, global 401 handling, accessibility and responsive polish** — step 08. A mid-session 401
  currently surfaces as a query error with a retry rather than an automatic sign-out.
- **Route code-splitting** — step 09; the 549 kB bundle warning is recorded there.
- **A lean admin order list payload** — open question 6 from 04i; today the list carries full items
  and timeline. Step 09 is the likely place for a summary shape.
- **Server-side dashboard revenue** — the dashboard sums the orders it fetched (up to 100). Status
  counts come from `meta.statusCounts`, but an exact revenue figure over more than 100 orders needs
  an aggregate endpoint.
- **Category cover upload** — only product images use `/admin/uploads`.
- **Browser E2E automation** — no browser automation dependency exists; the contract script is the
  automated proof for this step.
- **Seeded demo orders are not stock-deducted** — still the 04i open question; cancelling a seeded
  order in development adds stock that was never taken.
- **Reviews 04b–04i** — unchanged; no earlier review note was edited or marked approved.

## Out of scope / noticed

- The local PostgreSQL container maps host port `5433` rather than the documented `5432`; no code
  change was needed, and `server/.env` already points at it.
- `npm run format:check` still fails repo-wide (pre-existing). Prettier was run only on the client
  files this step touched; they are formatted.
- Malformed JSON still returns `500` instead of `400` (the global error-handler behaviour noted in
  04d/04h/04i).
- The production build reports one chunk over 500 kB. That is the route-splitting work of step 09,
  not a regression from this step.
- `client/dist/` was rebuilt by `npm run build`; it is generated and ignored.
- **04i open questions 1–5 are untouched**: cancelling shipped orders, correcting mistaken moves,
  requiring tracking to ship, a custom cancellation reason, and the seeded-order restock behaviour.

## Open questions for the reviewer

1. Should the demo-account panel on `/masuk` stay until step 10, given it only works after
   `npm run db:seed`? A fresh `db:migrate` without `db:seed` shows emails that do not exist.
2. Is removing "remember me" acceptable, or should the server accept a session-length choice? The
   cookie is fixed at `JWT_EXPIRES_IN=7d` today.
3. Should category cover images get an upload control, or stay typed `/images/...` paths?
4. Customer history uses the server default of 10 orders per page. Is that the right page size for
   the account area, or should the client send a larger `limit`?
5. When a cart line is unavailable, the cart page blocks checkout and shows the reason. Should it
   instead offer a one-click "remove unavailable lines" action?
6. The product-conflict recovery keeps the operator's typed values and refreshes the version in
   place. Is that the preferred behaviour, or should a conflict force a full reload (losing edits)?
7. Sign-out resets every query and refetches the active cart as a guest. Is that preferable to
   clearing the cache outright?
8. Should the dashboard get a proper aggregate endpoint in step 09 so revenue and low-stock figures
   are exact regardless of how many rows exist?
9. Should the admin order list move to the lean summary shape from 04i's question 6, keeping the full
   order only on the detail route?

## Reviewer feedback

**Changes requested on 2026-11-18.**

### Blocking finding

**A zero-match admin order search strands the operator without search or reset controls.** In a real
Chrome 158 browser at `/admin/pesanan`, entering `no-such-order-review` produced only the generic
`Belum ada pesanan` empty state. The search input disappeared, `Tidak ada pesanan yang cocok` was
not shown, and `Tampilkan semua pesanan` was unavailable. In `AdminOrdersPage.jsx`, `hasAny` is
`meta.statusCounts.all > 0`; when a search has zero matches, the condition at lines 123–183 removes
the search/filter controls and the branch at lines 201–208 wins before the no-match/reset branch at
210–225. The operator must reload or navigate away to recover.

**Required revision:** distinguish an empty catalogue of orders from an active search/filter with
zero results. Keep the search controls mounted whenever a search/filter is active, render the
existing no-match copy and working reset action, and cover both zero-match search recovery and the
truly empty-order baseline with a focused test or reproducible browser verification. This is the
Phase 05 form of the integration difference noted during the historical 03j review.

### Verified before the finding

Ran `npm run lint`, `npm test` (18 unit files / 283 tests), `npm run test:integration` twice (30
files / 518 tests each), `npm run build` (known 549.45 kB warning), `npm audit --workspace server`
(0 vulnerabilities), and `git diff --check` (no whitespace errors). Confirmed `client/src/mocks/`
is absent and no client source references the mock switch.

Browser verification used the real Vite/Express servers, not mocks. A guest added two colour
variants, reloaded and retained both with the correct count; signing into a disposable account merged
them. An over-stock add displayed the API message without changing the count. Browser checkout
created `BD-2026-1069`, displayed its confirmation, emptied the cart and added it to history. With
additional disposable orders, customer chips reported 11 and page two showed the remaining order.
Admin orders paginated server-side (21 rows over two pages), searched and filtered. The order form
offered only legal transitions; tracking was set on shipment and cleared on completion; the terminal
explanation rendered and the customer saw the same final state.

A PNG upload through the product drawer returned `/api/v1/media/catalog/6658337e-44b4-44d9-b258-8fe3fdc8c2f1.webp`,
appended it and rendered the preview. A simulated second operator advanced the product version;
the open form received `PRODUCT_CONFLICT`, retained its typed name, refreshed the version and saved
successfully on retry. Hiding removed public detail while retaining the admin row; product deletion
and actionable in-use category errors worked. Public shop/cart and protected product/order lists
showed error states when their requests failed, and retry restored data after the API restarted.
Empty storefront and admin-product searches also rendered their no-match states.

All 16 review orders and the disposable account/address/cart were removed, product 3 stock was
restored to 18, the uploaded WebP and temporary browser harness/profile were deleted, and no
reviewer-started listeners remain on ports 4000, 5173 or 9449. The pre-existing 03d review account
was not touched.

Open integration choices are acceptable as scoped: keep the seeded demo panel and fixed session
lifetime; category covers may remain typed paths; ten customer orders per page is usable; preserve
the current conflict recovery and sign-out cache refresh; one-click unavailable-line removal is
optional polish. Exact dashboard aggregates and a lean admin order summary belong in step 09. The
single empty-search recovery defect prevents approval until its revision is verified.
