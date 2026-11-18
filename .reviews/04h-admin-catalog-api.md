# 04h – Admin catalog API

- **Status:** Awaiting review <!-- Awaiting review | Changes requested | Approved -->
- **Phase:** 4 – Backend API
- **Date:** 2026-11-17
- **Author:** agent
- **Reviewer:** _unassigned_

## Summary

Adds the admin-only catalogue API that the step-05 panel will consume: product list/detail/create/
update/delete, category and brand CRUD, and multipart image upload with local-disk storage. It is
backend-only — no admin screen, frontend service or mock was changed.

Three properties drove the design. Hidden products stay visible to administrators without ever
becoming public. Every product write is guarded by a database-advanced `version`, so a form saved
after a customer's checkout is refused rather than restoring sold stock. And every deletion that
would silently destroy or detach data (a cart line, a product still using a category) is refused with
an actionable error instead.

## Files added / changed

### Added

| File                                                             | Change                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `server/db/migrations/008_product_version.sql`                   | Adds `tbl_produk.version`, a positive check, and a `BEFORE UPDATE` trigger that sets `NEW.version := OLD.version + 1` on every update. |
| `server/src/lib/catalogSlug.js`                                  | `slugify`, `isSlug`, `suffixedSlug` — the slug grammar and collision suffixing.                                                        |
| `server/src/lib/catalogImages.js`                                | `catalogImagePath` (format allowlist) and `createCatalogImagePolicy` (existence check against injected roots).                         |
| `server/src/lib/catalogMoney.js`                                 | `toSafeCatalogMoney`: exact BIGINT-as-text to number, refusing anything unsafe.                                                        |
| `server/src/validators/admin.js`                                 | All admin request schemas: ids, product create/patch/delete, list query, category, brand.                                              |
| `server/src/db/admin-catalog.js`                                 | `createAdminCatalogStore`: product list/get, category and brand reads. Exports `toAdminProduct`.                                       |
| `server/src/db/admin-products.js`                                | `createAdminProductStore`: `create`, `update`, `hide`, `remove` with advisory lock, version check and cart guard.                      |
| `server/src/db/admin-taxonomy.js`                                | `createAdminTaxonomyStore`: category and brand CRUD with in-use guards.                                                                |
| `server/src/services/admin-storage.js`                           | `createImageStore`: decode, auto-orient, strip metadata, resize, re-encode WebP, atomic write.                                         |
| `server/src/controllers/admin-uploads.js`                        | Multipart parsing, upload rate limiter, encode-work limiter, upload and media handlers, `mediaFileExists`.                             |
| `server/src/middleware/admin-origin.js`                          | `createVerifyAdminOrigin`: refuses cross-site admin writes.                                                                            |
| `server/src/services/admin-catalog.js`                           | `createAdminCatalogService`: binds the three stores and runs the image existence check.                                                |
| `server/src/controllers/admin-catalog.js`                        | `createAdminControllers`: HTTP layer for every admin route.                                                                            |
| `server/src/routes/admin.js`                                     | `/admin` router: auth gates, CRUD routes, upload route.                                                                                |
| `server/src/routes/media.js`                                     | `/media` router: public image delivery with a `MEDIA_NOT_FOUND` catch-all.                                                             |
| `server/nodemon.json`                                            | Ignores `uploads/**` so a dev-server upload cannot restart nodemon mid-request.                                                        |
| `server/src/__tests__/admin-schema.integration.test.js`          | 7 tests: the version column and trigger.                                                                                               |
| `server/src/__tests__/admin-policy.test.js`                      | Slug, image-path and money policy units.                                                                                               |
| `server/src/__tests__/admin-validators.test.js`                  | Schema contract units.                                                                                                                 |
| `server/src/__tests__/admin-catalog-queries.integration.test.js` | 15 tests: list, search, paging, taxonomy reads, unsafe money.                                                                          |
| `server/src/__tests__/admin-products.integration.test.js`        | 19 tests: create/update/hide/delete, slug allocation, cart guard.                                                                      |
| `server/src/__tests__/admin-concurrency.integration.test.js`     | 5 tests: stale stock save, delete vs cart add, delete vs in-flight checkout.                                                           |
| `server/src/__tests__/admin-taxonomy.integration.test.js`        | 19 tests: category/brand CRUD, in-use guards, assignment race.                                                                         |
| `server/src/__tests__/admin-storage.test.js`                     | 13 tests: encode, resize, metadata strip, refusals.                                                                                    |
| `server/src/__tests__/admin-uploads.integration.test.js`         | 19 tests: upload auth, limits, media route.                                                                                            |
| `server/src/__tests__/admin-api.integration.test.js`             | 35 tests: auth matrix, full CRUD contract, upload integration, cross-site, one end-to-end lifecycle.                                   |

### Changed

| File                                       | Change                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `server/src/app.js`                        | Accepts `uploadDir`, `publicImageDir`, `adminUploadLimit`, `adminUploadWindowMs`; resolves path defaults once per app.        |
| `server/src/routes/index.js`               | Mounts `/admin` and `/media`; threads the new options.                                                                        |
| `server/src/config/env.js`                 | Adds optional `UPLOAD_DIR` and `PUBLIC_IMAGE_DIR`.                                                                            |
| `server/package.json`, `package-lock.json` | Adds `multer@2.5.0` and `sharp@0.35.5`; nothing else upgraded.                                                                |
| `server/.env.example`                      | Documents both new variables.                                                                                                 |
| `.gitignore`                               | Ignores `server/uploads/`.                                                                                                    |
| `README.md`                                | API table rows, `### Admin catalogue endpoints`, `### Image storage`, step-05 compatibility note, uploads in the layout tree. |

## API contract

All routes under `/api/v1`. Errors are `{ error: { code, message, details? } }`.

| Method | Route                                        | Success                                       | Notable failures                                                                                                          |
| ------ | -------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/products`                            | `200 { data, meta }`                          | `422` for bad `limit`/`page`/`sort`                                                                                       |
| GET    | `/admin/products/:id`                        | `200 { data }`                                | `404 PRODUCT_NOT_FOUND`, `422` bad id                                                                                     |
| POST   | `/admin/products`                            | `201 { data }`                                | `422 VALIDATION_ERROR` (field-named)                                                                                      |
| PATCH  | `/admin/products/:id`                        | `200 { data }`                                | `409 PRODUCT_CONFLICT`, `422` missing `expectedVersion`                                                                   |
| DELETE | `/admin/products/:id`                        | `200 { data: null }`                          | `409 PRODUCT_CONFLICT`, `409 PRODUCT_IN_USE`, `404`                                                                       |
| GET    | `/admin/categories`, `/admin/brands`         | `200 { data }`                                | —                                                                                                                         |
| POST   | `/admin/categories`, `/admin/brands`         | `201 { data }`                                | `422`                                                                                                                     |
| PATCH  | `/admin/categories/:id`, `/admin/brands/:id` | `200 { data }`                                | `404 CATEGORY_NOT_FOUND` / `BRAND_NOT_FOUND`, `422`                                                                       |
| DELETE | `/admin/categories/:id`, `/admin/brands/:id` | `200 { data: null }`                          | `409 TAXONOMY_IN_USE`, `404`                                                                                              |
| POST   | `/admin/uploads`                             | `201 { data: { path, width, height, size } }` | `413 UPLOAD_TOO_LARGE`, `422 UPLOAD_INVALID_IMAGE`, `422 UPLOAD_FILE_REQUIRED`, `429 TOO_MANY_UPLOADS`, `503 UPLOAD_BUSY` |
| GET    | `/media/catalog/:file`                       | `200 image/webp`                              | `404 MEDIA_NOT_FOUND`                                                                                                     |

Product list query: `page` (default 1), `limit` (default 20, max 100 — above that is a `422`, not a
clamp), `search`, `category`, `brand`, `visibility=all|active|hidden`, `sort=newest|name-asc|price-asc|price-desc`.

## Auth matrix

Verified by `admin-api.integration.test.js` for **every** route above (including upload):

| Caller                                      | Result                   | Rows/files changed |
| ------------------------------------------- | ------------------------ | ------------------ |
| No cookie                                   | `401 UNAUTHENTICATED`    | none               |
| Signed-in customer                          | `403 FORBIDDEN`          | none               |
| Admin, role demoted after sign-in           | `403 FORBIDDEN`          | none               |
| Admin                                       | route-specific success   | as requested       |
| Admin, cross-site `Origin`/`Sec-Fetch-Site` | `403 CROSS_SITE_REQUEST` | none               |
| Any caller, `GET /media/catalog/*`          | public `200`/`404`       | n/a                |

The role is read from `tbl_pengguna` on every request, so a demotion ends access immediately; the
tests demote the row and reuse the original cookie to prove it.

## Verification

Run from the repository root, in this order.

```sh
npm run lint
# > eslint .
# (clean, no output beyond the banner)

npm test
# Test Files  17 passed (17)
#      Tests  266 passed (266)

npm run test:integration
# Test Files  29 passed (29)
#      Tests  498 passed (498)

npm run build
# dist/index.html 1.12 kB, dist/assets/index-*.css 65.33 kB, dist/assets/index-*.js 566.39 kB
# ✓ built in ~800ms
# only the pre-existing ">500 kB chunk" warning

git diff --check
# exit 0; LF→CRLF warnings only

npx prettier --check <changed files>
# All matched files use Prettier code style!
```

Targeted suites:

```sh
npm run test:integration -- admin-api              # 35 passed
npm run test:integration -- admin-schema           # 7 passed
npm run test:integration -- admin-catalog-queries  # 15 passed
npm run test:integration -- admin-products         # 19 passed
npm run test:integration -- admin-concurrency      # 5 passed
npm run test:integration -- admin-taxonomy         # 19 passed
npm run test:integration -- admin-uploads          # 19 passed
npm test --workspace server -- admin-policy admin-validators admin-storage
npm audit --workspace server                       # found 0 vulnerabilities
```

Checklist for the reviewer:

- [ ] The auth matrix covers every route, including upload, and asserts no writes on refusal.
- [ ] `expectedVersion` is required on PATCH and DELETE; a stale value is `409 PRODUCT_CONFLICT`.
- [ ] The version trigger fires on **every** product update, including checkout's stock decrement.
- [ ] Hiding via `PATCH { isActive: false }` keeps cart lines, wishlist rows and public 404.
- [ ] Product delete refuses while a cart holds the product; historical order items survive with `product_id` null.
- [ ] Category and brand delete refuse while **any** product, hidden included, references them.
- [ ] A derived slug is suffixed and the response carries the final value; an explicit duplicate slug is `422`.
- [ ] Image paths are allowlisted, existence-checked for `/images/...`, and served only as `image/webp` under generated UUID names.
- [ ] Upload limits (5 MiB, 8192 px, 16 M pixels, per-admin rate) and refusals behave as documented.
- [ ] `server/uploads/` is git-ignored and `UPLOAD_DIR`/`PUBLIC_IMAGE_DIR` are documented in `.env.example`.
- [ ] README documents the step-05 compatibility changes.

## Live verification

Development database migrated (`[db] applied 008_product_version.sql`) and the API run with
`npm run dev:server`. Seed baseline before: products 12, categories 6, brands 4, users 2, orders 4,
carts 0, wishlist 0, order items 6.

```text
POST /api/v1/auth/login (admin@badekor.id)                 → 200
POST /api/v1/admin/uploads (900×600 PNG)                   → 201
  data.path = /api/v1/media/catalog/c80d57fe-…-bf8cca984f37.webp, width 900, height 600, size 1064
POST /api/v1/admin/products (with that path)               → 201
  id 94, slug kursi-uji-admin, version 1, stock 3
GET  /api/v1/admin/products?limit=3                        → 200, meta.total 13
GET  /api/v1/admin/products?visibility=hidden              → 200, total 0
GET  /api/v1/media/catalog/c80d57fe-….webp                 → 200, image/webp
POST /api/v1/cart/items (customer)                         → 200, subtotal 1750000
POST /api/v1/orders                                        → 201, BD-2026-1033, productId 94
PATCH /api/v1/admin/products/94  expectedVersion 1         → 409 PRODUCT_CONFLICT
  "Produk sudah diubah di tempat lain. Muat ulang lalu simpan kembali."
GET  /api/v1/admin/products/94                             → version 2, stock 2 (checkout bumped it)
DELETE /api/v1/admin/categories/3                          → 409 TAXONOMY_IN_USE {taxonomy: category, id: 3}
DELETE /api/v1/admin/brands/1                              → 409 TAXONOMY_IN_USE {taxonomy: brand, id: 1}
DELETE /api/v1/admin/products/94  expectedVersion 2        → 200 { data: null }
GET  /api/v1/media/catalog/c80d57fe-….webp                 → 200 (image kept after product delete)
GET  /api/v1/users/me/orders/BD-2026-1033                  → 200
  item: name "Kursi Uji Admin", price 1750000, image unchanged, productId null
GET  /api/v1/products/kursi-uji-admin                      → 404
GET  /api/v1/admin/products (guest)                        → 401 UNAUTHENTICATED
GET  /api/v1/admin/products (customer)                     → 403 FORBIDDEN
POST /api/v1/admin/uploads  Origin: http://evil.test       → 403 CROSS_SITE_REQUEST
```

Cleanup and baseline after: products 12, categories 6, brands 4, users 2, orders 4, carts 0,
wishlist 0, order items 6, status-history rows 8. The fixture order, its status history and its
cart row were deleted, the uploaded file was removed, and no `kursi-uji*` product remains.

One live finding was fixed rather than recorded: the first upload returned `500` because nodemon
watched the upload directory and restarted the server mid-request. `server/nodemon.json` now ignores
`uploads/**`; the upload was re-run and returned `201`.

## Decisions and trade-offs

- **Optimistic concurrency on products only.** `version` is a `BIGINT` advanced by a trigger rather
  than by application code, so a checkout's `UPDATE … SET stock = stock - n` invalidates an admin form
  automatically. Alternative considered: compare-and-set on stock and timestamps — rejected because
  it misses changes to any other column and is easy to forget in a new query. Cost: step 05 must send
  `expectedVersion`, and every admin write must reload after a conflict.
- **Product delete refuses rather than cascades.** The schema's `ON DELETE CASCADE` on cart lines
  would silently empty a shopper's basket mid-session. Alternative considered: delete the lines too —
  rejected because the customer gets no explanation. Cost: an operator must hide the product instead.
- **Taxonomy delete refuses for hidden products too.** The brand FK is `ON DELETE SET NULL`, which
  would quietly unbrand every product that used it. Any referencing product, visible or not, is a
  `409 TAXONOMY_IN_USE`. Cost: a category full of hidden drafts cannot be deleted until they move.
- **Slug collisions differ by origin.** A slug **derived** from a name is suffixed (`-2`, `-3`) and the
  response carries the final value; an **explicit** slug an operator typed is refused with a `422`
  naming `slug`. Rationale: nobody chose the derived one, so suffixing is helpful; silently renaming a
  chosen one hands back a URL the operator did not ask for. This ruling was made in Task 6 and applied
  to products for consistency.
- **Separate upload endpoint.** `POST /admin/uploads` returns a path that JSON CRUD stores, instead of
  a multipart product create. Alternative considered: multipart on create/update — rejected because it
  complicates the PATCH contract, retries and the step-05 adapter. Cost: two calls to publish a photo.
- **Images are re-encoded, never stored as uploaded.** Decoding with `sharp` and re-encoding as WebP
  strips EXIF/GPS, defeats SVG script payloads and polyglot files, and bounds the pixels decoded.
  Cost: quality is lossy (WebP q82) and the original bytes are unrecoverable.
- **Upload paths are trusted by filename pattern, not re-probed.** A deleted upload then leaves a
  broken link rather than making every product unsavable. Seeded `/images/...` paths _are_ probed,
  because there the directory is part of the deployment.
- **No automatic image deletion.** Deleting a product or replacing its photo leaves the file. Removing
  it could break an order page that still renders that image. Cost: orphan files accumulate.
- **Cross-site check allows a missing header.** Requests with neither `Origin` nor `Sec-Fetch-Site`
  (curl, tests) are allowed; a browser attacker cannot omit them, so nothing is lost and the documented
  curl workflow keeps working.
- **List `limit` above 100 is rejected, not clamped.** Matches the public catalogue's explicit-rejection
  style for nonsense input. The plan said both "clamps" and "rejects"; the rejection won.

## Not done / deferred

- **Frontend admin screens and `client/src/services/admin.js`** — step 05. The README's
  step-05 compatibility section lists exactly what the adapter must change.
- **Cloud/object storage** — explicitly out of scope; local disk was chosen for now.
- **Orphan image cleanup and an image-removal endpoint** — deferred; documented in the README as a
  known growth path.
- **Admin order mutations** (status, cancellation, tracking) — step 04i.
- **Review status of 04b–04g** — unchanged. No earlier review note was edited or marked approved.

## Out of scope / noticed

- `npm run format:check` fails repo-wide (155 files) and did so before this step. Prettier was run only
  on files this step touched, and they pass.
- Malformed JSON still returns `500` instead of `400` (a global `error-handler` behaviour from an
  earlier step). Left untouched and deliberately not pinned by a test.
- Docker dropped twice during this work (once mid-test-suite, once mid-live-check). Neither was a code
  fault; runs were repeated after restarting the database.
- The seeded `admin@badekor.id` account is user id 2 and role `admin`, which is what the live check used.
- `sharp` and `multer` are the only new dependencies; `npm audit --workspace server` reports 0
  vulnerabilities.

## Open questions for the reviewer

1. Should the version token stay product-only, or should categories and brands carry one too? Today a
   taxonomy rename cannot be lost because it is a small, whole-value write — but two operators editing
   the same category name will silently last-write-wins.
2. Are 20 uploads per admin per 15 minutes and 2 concurrent decodes the right budgets? They are
   constants in `controllers/admin-uploads.js` and `routes/admin.js`, easy to lift into env config if
   the real panel is busier.
3. Is refusing a product delete that has past orders but no cart line acceptable? Today it succeeds,
   which keeps history by snapshot. The alternative — never delete, only hide — would prevent operators
   from clearing mistakes but keeps referential history tidier.
4. Should `GET /admin/products` default to `visibility=all` (current) or to `active`, matching what an
   operator usually wants? The mock showed everything, so `all` was chosen.
5. Is the local-disk choice acceptable for the deployment target, or should step 05 or later add an
   object-storage adapter behind the same `createImageStore` interface?

## Reviewer feedback

_To be filled in by the reviewer._
