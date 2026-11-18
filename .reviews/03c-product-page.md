# 03c – Product page

- **Status:** Approved
- **Phase:** 3 – Frontend pages
- **Date:** 2026-11-12
- **Author:** agent
- **Reviewer:** Kimi (Moonshot AI, AI reviewer)

## Summary

The product detail page (`pages/product.html` in the legacy template) is built against the mock
catalogue from step 02. It has a breadcrumb, a photograph gallery with a focus-managed lightbox,
variant selection (colour and size), a quantity stepper bounded by stock, an add-to-cart action
with inline confirmation, tabbed product information, and a related-products rail. Loading,
error and not-found states are real.

The page needed a destination for its quantity control, so a **minimal in-memory cart store** was
pulled forward from step 03g (see *Decisions*). Step 03g still owns the cart page, line editing,
checkout and persistence.

## Files added / changed

| File | Change |
| ---- | ------ |
| `client/src/pages/ProductPage.jsx` | Replaced the `PagePlaceholder` with the full page: breadcrumb, gallery, purchase panel, tabs, related products, loading skeleton, in-page 404 |
| `client/src/components/product/ProductGallery.jsx` | New. 7:5 photo frame with hover zoom, optional thumbnail strip for multi-image products, and an Escape-aware lightbox that returns focus |
| `client/src/components/product/ProductPurchase.jsx` | New. Title, rating, price, description, colour/size radio groups, quantity stepper, add-to-cart, WhatsApp consultation, stock and delivery notes |
| `client/src/components/product/ProductTabs.jsx` | New. WAI-ARIA tabs (Deskripsi / Spesifikasi / Pengiriman & perawatan) with roving tabindex and arrow/Home/End keys |
| `client/src/context/cartContext.js` | New. `CartContext` + `useCart` |
| `client/src/context/CartProvider.jsx` | New. In-memory cart: add, remove, update quantity, clear, derived count and subtotal |
| `client/src/main.jsx` | Wrapped the app in `CartProvider` |
| `client/src/components/layout/SiteHeader.jsx` | Cart icon shows a live item-count badge |
| `client/src/components/ui/Price.jsx` | Added an `xl` size (`text-2xl`) for the product hero |
| `client/src/mocks/index.js` | `listRelatedProducts` now fills up to `limit`: same category → same brand → best-rated remainder |
| `.tmp-capture.mjs` | Repointed at `.reviews/assets/03c`; added `clickText` and `repeat` so the harness can exercise tabs, add-to-cart and the lightbox |

No existing component was changed in a breaking way. `Price` only gained a size; the header only
gained a badge.

## How to run and verify

```sh
npm run dev            # client on :5173
# open http://localhost:5173/produk/sofa-ulin-l-shape
```

```sh
npx eslint client/src server/src
npm run build --workspace=client
npm test
```

Checklist the reviewer can tick:

- [x] `/produk/sofa-ulin-l-shape` shows breadcrumb, gallery, title, rating, price, description,
      colour and size chips, quantity and the two actions
- [x] Colour and size are native radios; the selected value is visible on the chip and moves with
      arrow keys
- [x] Quantity is clamped to stock (`sofa-ulin-l-shape` stock is 6; `0` is impossible)
- [x] "Tambah ke keranjang" adds the selected variant, shows a `role="status"` confirmation with a
      link to the cart, and increments the header badge
- [x] Adding the same variant twice gives a badge of 2, not two lines (captured)
- [x] Tabs switch by click and by Left/Right/Home/End; the spec table shows real product data
- [x] "Perbesar" opens the lightbox; Escape and the close button dismiss it and focus returns
- [x] `/produk/tidak-ada` shows the product-not-found state, not the generic 404 page
- [x] Related products show four cards for the sofa (same category, same brand, then best-rated)
- [x] Mobile (390 px) stacks gallery → purchase → tabs → related without horizontal scroll
- [x] Loading skeleton mirrors the final layout, so the page does not jump on load

Screenshot evidence in `.reviews/assets/03c/`: `desktop-product`, `desktop-product-tab-spesifikasi`,
`desktop-product-added`, `desktop-product-added-twice`, `desktop-product-notfound`, `mobile-product`,
`mobile-product-preview`.

## Decisions and trade-offs

- **Minimal cart store pulled forward from 03g.** The roadmap requires a quantity control on this
  page, and a quantity control with no action is a dead end. Step 03b deliberately left add-to-cart
  out because a button that did nothing would be worse than none; the product page is where the
  action belongs, so a small `CartProvider` (in-memory, no persistence) was added. It gives 03g a
  single source of truth for the cart page, line editing and checkout. Cost: state resets on reload
  until the cart API lands in 04f; this is noted below and flagged as an open question.
- **Gallery supports multiple images, the mock has one.** The catalogue contract carries `images[]`.
  The gallery shows a thumbnail strip only when there is more than one photo, and the mock currently
  has one per product. Rather than fake extra angles with unrelated photos, the single image gets a
  lightbox; the multi-image path is ready for the seed data in 04a.
- **Tabs use the WAI-ARIA tabs pattern, not a show/hide pair.** Roving tabindex, arrow/Home/End keys,
  `aria-selected`/`aria-controls`, and one hidden panel per tab. It costs a little more code than a
  naive toggle but behaves correctly with a keyboard and a screen reader.
- **Related products mock now fills to the limit.** The previous implementation returned only
  same-category items, which is 0–2 products for most of this catalogue, so the rail would usually be
  empty or lopsided. The mock now falls back to same brand, then best-rated. Step 04c should mirror
  this or use a dedicated recommendation query; noted as an open question.
- **Secondary action is WhatsApp consultation, not wishlist.** The template pairs add-to-cart with a
  wishlist button, but the wishlist is step 03f. A WhatsApp link uses the number already published in
  the footer and is a plausible furniture-store action in the meantime; it is replaced by the real
  wishlist control in 03f.
- **Colour swatches never stand alone.** Each chip keeps its text label and the swatch is an
  approximation (`COLOR_SWATCH` from step 03b), so the control still works without colour perception.
- **Not-found is handled in-page.** A missing slug renders a specific "Produk ini tidak ada" state
  with links back to the collection and home; other failures use the shared `ErrorState` with retry.
  The router's catch-all 404 remains for unknown paths.
- **`Price` gained `xl`.** The product hero needs a larger price than the cards without duplicating
  the currency markup. It is a one-line addition to the shared component.
- **The cart count lives in the header, not the page.** Once a store exists, the badge is the honest
  feedback that something was added; it also makes the action reachable from every page.

## Not done / deferred

- **Wishlist on this page** — step 03f. The template's heart button and its add/remove state arrive
  with the wishlist.
- **Cart page, line editing, checkout, success page and persistence** — step 03g (client) and 04f
  (API). The store here is intentionally in-memory.
- **Multi-image seed data** — step 04a. The gallery already renders thumbnails when `images.length > 1`.
- **Real API wiring** — step 05 flips `VITE_USE_MOCKS=false`.
- **Reviews list** — the template only shows a review count, not a list. The rating summary is shown;
  a reviews module is not in the roadmap.
- **SEO/document title per product** — step 08.
- **Full accessibility pass** (focus trap inside the lightbox, contrast on `text-spec`, reduced-motion
  on the hover zoom) — step 08, as with 03a/03b.

## Out of scope / noticed

- **Mock product names do not match their photos.** This is pre-existing from step 02's seed data,
  e.g. `kursi-rotan-sungai` renders `product3.jpg` (a mattress), `tempat-tidur-ulin-king` renders
  `product5.jpg` (a dining set). The product detail page makes the mismatch far more obvious than the
  shop grid did. Fixing it means either remapping the twelve template photos or renaming the mock
  products, which changes slugs, categories and descriptions — that belongs to the seed-data step,
  **04a**, not here. The screenshots use `sofa-ulin-l-shape`, whose photo does match.
- **Rendering the real API is still off.** `services/catalog.js` only calls the API when
  `VITE_USE_MOCKS=false`; this page runs on mocks until step 05.
- **Review queue is backed up.** 00, 01a, 01b and 03a are still "Awaiting review"; step 02 has no
  review note at all. This step was built on top of them at the user's direction. Flagging again so
  the queue is not lost.
- **Stray local files.** `.tmp-capture.mjs` and `.tmp-chrome-profile/` are still not in `.gitignore`
  and make `eslint .` from the repo root noisy. `npx eslint client/src server/src` is clean.
- **Sticky header ghost.** The `bg-paper/95 backdrop-blur` header from step 02 still shows a faint
  ghost of content scrolling under it; unchanged here, worth a look in the 08 polish pass.

## Open questions for the reviewer

1. **Cart store pulled forward.** Keep the small `CartProvider` on this page, or strip it back to
   step 03g and ship the add-to-cart button disabled? I recommend keeping it: it is the only way the
   required quantity control has a real effect, and 03g still has the cart page and checkout to do.
2. **Secondary CTA.** Is the WhatsApp consultation link acceptable as a stand-in until the wishlist
   (03f), or should the space stay empty?
3. **Tabs.** Deskripsi / Spesifikasi / Pengiriman & perawatan — enough, or does the team want an
   "Ulasan" tab with reviews?
4. **Related products.** Are you happy with the mock's category → brand → best-rated fallback, and
   should 04c implement the same strategy?
5. **Name ↔ photo mismatch.** In 04a, do we remap the twelve template photos to the existing product
   names, or rename the products to match the photos? The second is cleaner visually but changes the
   catalogue narrative.

## Reviewer feedback

### Review — 2026-11-18

**Verdict: Approved.** The product detail scope is complete and its key interactions work. Pulling a minimal cart store forward was preferable to shipping a dead purchase control; Phase 05 has since replaced that store's in-memory implementation with the real cart API without changing the page's purpose. Only this review note was edited; no application code was changed.

#### Evidence

- Ran `npx eslint client/src server/src`, `npm run build --workspace=client`, and `npm test` successfully. Client has no tests; all 18 current server unit-test files passed (283 tests). The known build chunk warning is unchanged.
- Ran `npm run dev` and exercised `/produk/sofa-ulin-l-shape` in headless Chrome against the seeded development API:
  - The page rendered its title, three colour radios, size radio, quantity control, purchase actions and four related products.
  - Quantity started at 1, decrement was disabled at the minimum, and an attempted value of 999 was clamped to the stock maximum of 6.
  - ArrowRight moved the native colour selection from “Abu hangat” to “Cokelat tua.”
  - Adding the selected variant displayed the status confirmation and changed the cart label to one item; adding it again produced two items rather than a separate visible line/count reset.
  - ArrowRight selected the specifications tab and displayed real material/dimension data; End and Home selected the last and first tabs respectively.
  - “Perbesar” opened the labelled lightbox and Escape dismissed it. Initial-focus/focus-restoration code was also inspected.
  - `/produk/tidak-ada` rendered the specific product-not-found heading.
  - At 390×844, the product page had no horizontal overflow.
- Inspected the product loading/error/not-found branches, gallery and optional thumbnails, purchase state reset, stock/sold-out handling, tabs keyboard implementation, related-product filtering and supplied desktop/mobile screenshots.

#### Open questions

1. Keep the cart provider pulled forward. It gives the required purchase controls real behaviour and is a reasonable shared foundation for 03g.
2. WhatsApp consultation is acceptable as an additional secondary action; it need not be removed when the wishlist control arrives.
3. The three current tabs cover this roadmap. Do not add an “Ulasan” tab without actual review content and a separately agreed scope.
4. The category → brand → best-rated fallback is reasonable for related products and keeps the rail useful. The API should preserve a deterministic ordering and exclude the current/hidden products.
5. The name/photo mismatch requires a team content decision in 04a; the reviewer will not unilaterally choose between remapping photography and renaming products. It is documented and does not block this page's mechanics.

#### Non-blocking observations

- Focus trapping, reduced motion and the broader accessibility audit remain deferred to step 08.
- Current add-to-cart behaviour is asynchronously server-backed and can surface stock/API errors, which is the intended Phase 05 evolution of the original inline mock confirmation.
