# 03b – Shop page

- **Status:** Awaiting review
- **Phase:** 3 – Frontend pages
- **Date:** 2026-11-12
- **Author:** agent
- **Reviewer:** _unassigned_

## Summary

The shop page (`pages/shop.html` in the legacy template) is built against the mock catalogue from
step 02. It covers all filters the roadmap asks for — category, brand, price, size, colour — plus
sorting, a grid/list toggle and pagination. All state lives in the URL, so a filtered view is
shareable and the back button works. Filters move into a drawer on mobile. Loading, error and
empty states are real.

## Files added / changed

| File | Change |
| ---- | ------ |
| `client/src/pages/ShopPage.jsx` | Replaced the `PagePlaceholder` with the full shop page: breadcrumb, header, filter rail, toolbar, chips, results, pagination, mobile drawer |
| `client/src/lib/shopParams.js` | New. URL ↔ API param mapping (`kategori`→`category`, `merek`→`brand`, `maks`→`maxPrice`, …), page-size constant, active-filter counting, colour swatch table |
| `client/src/components/shop/FilterPanel.jsx` | New. The filter rail: radio groups for category/brand, price form, size and colour chip groups. Also exports `FilterPanelSkeleton` |
| `client/src/components/shop/ActiveFilters.jsx` | New. One removable chip per active facet, plus "Hapus semua" |
| `client/src/components/shop/ViewToggle.jsx` | New. Grid/list segmented control |
| `client/src/components/ui/Pagination.jsx` | New. Windowed page numbers with ellipsis; reusable for the admin order list in 03j |
| `client/src/components/product/ProductRow.jsx` | New. Horizontal card for the list layout, reusing `Price`, `Rating` and `Badge` |
| `.tmp-capture.mjs` | Screenshot harness repointed at `.reviews/assets/03b` with a `scrollY` option added, to check the sticky rail against the sticky header |

No existing component was modified in a breaking way. `FilterPanel` gained a `showTitle` prop
(default `true`) so the drawer does not repeat its own "Filter" heading.

## How to run and verify

```sh
npm run dev            # client on :5173
# open http://localhost:5173/toko
```

```sh
npm run lint            # clean for every file in this step
npm run build --workspace=client
npm test
```

Checklist the reviewer can tick:

- [x] `/toko` lists 12 products, 9 per page, with working pagination (page 2 shows 3)
- [x] `?kategori=kursi` filters to 3 products, retitles the page "Kursi" and shows a chip
- [x] `?kategori=kursi&warna=Rotan%20natural` narrows to 2 products, both chips removable
- [x] `?sort=price-asc` reorders results and the select shows "Harga termurah"
- [x] `?tampilan=daftar` switches to the row layout; the toggle keeps the choice in the URL
- [x] `?q=zzz` shows the empty state with a way back to the full catalogue
- [x] Price filter rejects a minimum above the maximum, with an inline `role="alert"`
- [x] Filter rail sticks below the header when scrolling (captured at 700px scroll)
- [x] Mobile: filters open in a left drawer with a "Tampilkan 12 produk" close action
- [x] Rail and drawer use different input-id prefixes, so labels stay uniquely associated when
      both exist in the DOM

Screenshot evidence in `.reviews/assets/03b/`: `desktop-shop`, `desktop-shop-filtered`,
`desktop-shop-list`, `desktop-shop-empty`, `desktop-shop-page2`, `desktop-shop-scrolled`,
`mobile-shop`, `mobile-shop-filter`.

## Decisions and trade-offs

- **Filter state lives in the URL, not in React state.** The header search already navigates to
  `?q=`, the nav to `?kategori=`, and the home page to `?sort=`, so the shop page had to read those
  anyway. Keeping every facet in the URL makes filtered views shareable, makes the back button work,
  and means the page survives a reload. Cost: a single source of truth that has to be parsed and
  serialised, which is why the mapping lives in one module (`lib/shopParams.js`).
- **Indonesian URL params mapped to English API params.** `/toko?kategori=sofa&maks=5000000` is
  readable for an Indonesian user and matches the links `lib/nav.js` already ships. The API contract
  documented in `mocks/products.js` is English (`category`, `maxPrice`), so `toApiParams` translates.
  This keeps the front end honest to both audiences without inventing a second API dialect.
- **Every facet is a single-select radio group with an explicit "Semua …" option.** The mock API
  accepts one `category`, one `brand`, one `color`, one `size` — multi-select would have meant
  either comma-separated params the backend does not have, or client-side filtering that breaks the
  moment pagination arrives. Native radios also give free arrow-key navigation, which a hand-rolled
  chip group would have to reimplement.
- **No product counts next to filter options.** `taxonomy.js` carries a `productCount` per category
  (24, 18, 31 …) that does not match the actual mock catalogue (2 sofa, 2 meja makan …). Showing
  those numbers would promise 24 results and deliver 2. Computing real counts would need a
  per-facet aggregate endpoint that does not exist until Phase 4, so the numbers are omitted rather
  than faked.
- **Colour swatches are an enhancement, never the only signal.** Each colour chip keeps its text
  label beside the swatch, so the facet still works without colour perception and the chosen hexes
  are documented as approximations of the real finishes.
- **Grid uses `ProductCard`; list uses a new `ProductRow`.** Rather than overload `ProductCard` with
  a layout flag, the list variant is its own component. It is not a copy: the row shows the category
  name and a low-stock line ("Tersisa 5 unit") that the grid card deliberately leaves out.
- **Sticky filter rail with its own scroll.** The rail is taller than most viewports (6 categories,
  4 brands, price, 8 sizes, 7 colours), so it sticks at `top-36` — clearing the 128px sticky header
  on `lg` — with `max-h` and `overflow-y-auto`. Verified by capturing a scrolled viewport.
- **Page resets to 1 on every facet change, but not on page change.** Otherwise changing a filter on
  page 3 could land on an empty page 2. `changePage` scrolls to top explicitly because the app's
  `useScrollToTop` hook only fires on `pathname` changes, and paging only changes the query string.

## Not done / deferred

- **No "add to cart" buttons on the cards.** The legacy template has them, but the cart context is
  new in step 03g. Adding a button that does nothing would be a dead control; it is added with the
  cart.
- **No wishlist heart on cards or rows.** Same reason — the wishlist is step 03f.
- **Multi-select for size and colour** is not supported because the API is single-value per facet
  (see trade-offs). If the team wants multi-select, it needs a backend change in 04c and a
  comma-separated param.
- **Product counts per facet** — needs an aggregate endpoint, see above.
- **Full accessibility audit** (focus order through the rail, contrast on the muted `text-spec`
  labels, `prefers-reduced-motion` on the hover scale) is step 08's sweep, as with 03a.
- **SEO/title updates** when filters change are step 08.

## Out of scope / noticed

- **Rendering the real API is still off.** `services/catalog.js` only calls the API when
  `VITE_USE_MOCKS=false`; this page runs on mocks until step 05, as planned.
- **Behind the sticky header** the `bg-paper/95 backdrop-blur` treatment from step 02 shows a faint
  ghost of the product grid as it scrolls under the nav. It is subtle and a header decision from
  step 02, not something introduced here, so it was left alone — worth a look during the 08 polish
  pass if the team finds it distracting.
- **Product photography mixes studio cut-outs and lifestyle shots**, which is more obvious in the
  list layout than in the grid. Same template-asset limitation noted in 03a; not fixed here.
- **`.tmp-capture.mjs` / `.tmp-chrome-profile/`** are still stray local files from the step 02
  screenshot session (already flagged in 03a). `eslint .` over the repo root still reports the
  pre-existing noise from them; `eslint client/src server/src` is clean.

## Open questions for the reviewer

1. Single-select facets (one category, one colour, one size at a time) — acceptable, or does the
   team want multi-select? If multi-select, the API needs to accept repeated or comma-separated
   values in step 04c and I would revisit this page.
2. Is 9 products per page the right page size for a 3-column grid? It gives 3×3 on desktop and
   leaves an odd 3 on page 2 with the current 12-product mock.
3. The price filter needs an explicit "Terapkan harga" button (it is a form submit). Should it
   instead apply on blur/debounce like the other facets, which apply instantly?
4. Steps 00, 01a, 01b and 03a are still "Awaiting review" and step 02 has no review note at all.
   Flagging again so the queue does not get lost — this step was built on top of them at the user's
   direction.

## Reviewer feedback

_To be filled in by the reviewer._
