# 04c – Catalog API

- **Status:** Awaiting review
- **Phase:** 4 – Backend
- **Date:** 2026-05-20
- **Author:** agent
- **Reviewer:** _unassigned_

## Summary

The storefront catalogue read endpoints, served from `tbl_produk` / `tbl_kategori` / `tbl_merek`:
six public routes with filtering, sorting, pagination, product detail, related products and the
filter facets the shop page needs. Response bodies match the shapes `client/src/services/catalog.js`
and `client/src/mocks/index.js` already produce, so step 05 remains a switch of `USE_MOCKS`.

No schema change was needed; 04a's indexes and constraints were enough.

## Files added / changed

| File | Change |
| ---- | ------ |
| `server/src/validators/catalog.js` | `productQuerySchema`, `relatedQuerySchema`, sort allowlist, page/limit/price rules and Indonesian messages |
| `server/src/db/catalog.js` | All catalogue SQL: `listProducts`, `findProductBySlug`, `listRelatedProducts`, `listCategories`, `listBrands`, `listFilterOptions`, plus row mappers |
| `server/src/services/catalog.js` | Thin service layer; turns a missing product into `404 PRODUCT_NOT_FOUND` |
| `server/src/controllers/catalog.js` | Six handlers; query validation and the `{ data, meta? }` envelope |
| `server/src/routes/catalog.js` | Public router, with `/products/filters` registered before `/products/:slug` |
| `server/src/routes/index.js` | Mounts the catalogue router next to `/auth` and the health checks |
| `server/src/lib/validation.js` | Added `parseQuery`; both parsers now share one error shape and report `(root)` when an issue has no field |
| `server/src/__tests__/catalog-validators.test.js` | 18 unit tests for the query schemas |
| `server/src/__tests__/validation-query.test.js` | 4 unit tests for `parseQuery` |
| `server/src/__tests__/catalog-queries.integration.test.js` | 17 tests for filtering, search escaping, sorting, pagination and detail |
| `server/src/__tests__/catalog-taxonomy.integration.test.js` | 12 tests for counts, facets and related ranking |
| `server/src/__tests__/catalog-api.integration.test.js` | 21 HTTP tests for the six routes |
| `README.md` | Catalogue endpoints, query parameters and example `curl` calls |

## How to run and verify

```sh
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

```sh
npm test                  # 56 unit tests
npm run test:integration  # 87 tests against ba_dekor_test
npm run lint
```

Checklist the reviewer can tick:

- [ ] `GET /api/v1/products` returns 12 products with `meta: { page: 1, limit: 9, total: 12, totalPages: 4 }`
- [ ] `GET /api/v1/products?limit=3&page=2` returns the next three, same `total`
- [ ] `GET /api/v1/products?search=rotan` returns 5 products; searching `%` matches only names containing a literal `%`
- [ ] `GET /api/v1/products?category=sofa&brand=badekor-workshop&sort=price-asc` narrows and orders correctly
- [ ] `GET /api/v1/products?minPrice=1250000&maxPrice=3900000` treats both bounds as inclusive
- [ ] `GET /api/v1/products?category=tidak-ada` returns `200` with `{ data: [], meta.total: 0 }`
- [ ] `GET /api/v1/products?page=0` returns `422` with `details.field = "page"`
- [ ] `GET /api/v1/products?minPrice=9000000&maxPrice=1000000` returns `422` on `minPrice`
- [ ] `GET /api/v1/products?category=sofa&category=kursi` returns `422` (repeated parameter)
- [ ] `GET /api/v1/products/sofa-ulin-l-shape` returns colours, sizes, images, description, category and brand
- [ ] `GET /api/v1/products/tidak-ada` returns `404 PRODUCT_NOT_FOUND`
- [ ] `GET /api/v1/products/sofa-ulin-l-shape/related?limit=3` never includes the product itself
- [ ] `GET /api/v1/products/filters` is not swallowed by `/:slug` and returns a price range plus colour/size facets
- [ ] `GET /api/v1/categories` shows real active-product counts (sofa 2, kursi 3, …), not the mock's placeholders
- [ ] None of the catalogue routes need a session cookie
- [ ] `npm run db:seed` still reports 2 users / 3 addresses / 6 categories / 4 brands / 12 products / 4 orders

## Decisions and trade-offs

- **Sorting keeps the mock's order.** `newest` means "new-tagged first, then newest id", exactly what
  `mocks/index.js` did, so the home page and shop page do not reshuffle when step 05 flips to the API.
  Price and rating sorts add `id` as a tie-breaker so equal values cannot swap between pages.
- **Search escapes `%`, `_` and `\`.** The mock used `String.includes`, so a typed `%` was literal.
  Escaping preserves that: an unescaped `LIKE` would have made it match everything.
- **`newest` uses `is_new DESC` before `id DESC`.** True "newest first" by `created_at` would reorder
  the seeded catalogue, because the seed inserts rows in a single statement batch.
- **Repeated query parameters are rejected, not collapsed.** `?category=sofa&category=kursi` is
  ambiguous; returning 422 is honest, and keeps a future multi-select filter from silently breaking.
- **Invalid numbers are errors.** `?page=dua` returns 422 rather than falling back to page 1, which
  would hide a client bug. Unknown `sort` values still fall back to `newest`, matching the mock.
- **`limit` is clamped, not rejected.** `?limit=500` becomes 100 so a stray client value cannot ask
  for the whole table; `?limit=0` is an error.
- **Category counts use `count(...) FILTER (WHERE is_active)` with a `LEFT JOIN`**, so empty
  categories stay in the grid with `0` and hidden products do not inflate the number.
- **Facets are computed in SQL.** Un-nesting the `TEXT[]` colour and size columns and taking
  `min`/`max` price in one pass keeps the filter panel consistent with what can actually be filtered,
  and an empty catalogue yields `{ min: 0, max: 0 }` rather than nulls the slider cannot render.
- **Related ranking is `same category → same brand → best rated`.** One `UNION ALL` with a rank
  column and a `GROUP BY id` de-duplicates a product that matches both signals; the third branch
  fills the rail on a small catalogue.
- **A missing related source returns `{ data: [] }`, not 404.** 03c only asks after it has a product,
  so an empty rail is the graceful answer; the detail route itself is still a strict 404.
- **`parseQuery` was added beside `parseBody`** rather than one generic parser, so a body cannot be
  validated against a query schema by mistake. Both now share one error builder, which also fixed
  `details.field` being omitted for issues with no path.
- **Visibility lives in SQL.** Every storefront query filters on `p.is_active`, so an inactive
  product cannot leak through a forgotten code path; 04h's admin list reads the table directly.

## Not done / deferred

- **Admin CRUD for products, categories and brands** — step 04h, which also owns image upload and
  the `is_active` toggle.
- **Full-text or typo-tolerant search.** The trigram index exists, but matching is still a literal
  substring with `LIKE`. Fuzzy ranking would need `similarity()` rules and a relevance opinion.
- **Facet counts per option** (e.g. "Sofa (24)") — the panel does not render them today.
- **Multi-select filters** (`?color=Hitam,Ulin gelap`) — the client sends one value per facet.
- **Caching / ETags.** The catalogue is small and the client caches for 5 minutes in TanStack Query.
- **Frontend still runs on mocks.** `USE_MOCKS` flips in step 05.
- **No admin visibility flag in the storefront payload.** `isActive` is intentionally absent; only
  active rows are returned at all.

## Out of scope / noticed

- **Search is a substring `LIKE`, not a trigram-similarity query.** `tbl_produk_search_idx` is a
  trigram GIN index, which still helps `LIKE '%…%'` on the same `lower(name || ' ' || material ||
  ' ' || description)` expression, but the planner prefers a sequential scan at 12 rows. Verified by
  hand earlier in 04a; worth re-checking in step 09 with more data.
- **Home page "trending" and "new arrivals" currently reuse `useProducts({ sort })`.** That works,
  but dedicated `?isNew=`/`?isTrending=` filters were not in this step's contract. If the review
  wants them, they belong to a follow-up step rather than a silent addition here.
- **The pre-existing repo-wide formatting drift** (CRLF files, noted in 04a and 04b) still makes
  `npx prettier --check .` fail on untouched files; only files touched here were formatted.
- **Docker Desktop on this machine keeps stopping between commands**, which surfaces as
  `ECONNREFUSED 127.0.0.1:5433` rather than a test failure. `docker start ba_dekor-db` first.
- **Review queue still backed up.** 00–03j, 04a and 04b are all "Awaiting review". Phase 5b exists to
  work through them; this step did not change any earlier status.

## Open questions for the reviewer

1. **`newest` semantics.** Keep "new-tagged first, then newest id" (matches the current UI), or
   switch to true `created_at DESC` and accept that the seeded catalogue reorders?
2. **Repeated parameters.** Is 422 right, or would you rather the API take the first value (and, if
   so, should it support multi-select facets later)?
3. **Related fallback.** Should the rail fall back to "best rated across the catalogue" as it does
   now, or stay empty when there is no same-category or same-brand match?
4. **Facet scope.** Should `GET /products/filters` compute facets from *all* active products (today)
   or from the current filter result set (so counts narrow as filters apply)?
5. **Trending/new flags.** Do you want `?isNew=true` / `?isTrending=true` added to `/products` now,
   or keep the home page on `sort=newest` until a later step?
6. **404 body for related.** `GET /products/tidak-ada/related` returns `200 { data: [] }`. Should it
   instead 404 to match the detail route?

## Reviewer feedback

_To be filled in by the reviewer._
