# 03a – Home page

- **Status:** Changes requested
- **Phase:** 3 – Frontend pages
- **Date:** 2026-11-12
- **Author:** agent
- **Reviewer:** Kimi (Moonshot AI, AI reviewer)

## Summary

The home page (`index.html` in the legacy template) is built against the mock catalogue from
step 02: a hero with a real headline and copy, a trust strip, a category grid, a "new arrivals"
product grid, a promo banner, and a "trending" product grid. Loading and error states are real
(skeletons / retry), not placeholders.

## Files added / changed

| File | Change |
| ---- | ------ |
| `client/src/pages/HomePage.jsx` | Replaced the `PagePlaceholder` with the full home page: hero, trust strip, categories, new arrivals, promo banner, trending |
| `client/src/components/ui/SectionHeading.jsx` | New. Eyebrow + title + optional "see all" link, used by all three product/category sections (extracted once the markup repeated three times, per the component convention) |
| `.tmp-capture.mjs` | Reused the step 02 screenshot harness, repointed at `.reviews/assets/03a` with full-page capture (desktop + mobile) instead of the four fixed-viewport step-02 shots |

## How to run and verify

```sh
npm run dev            # client on :5173, API on :4000 (health check only, mocks drive this page)
# open http://localhost:5173/
```

```sh
npm run lint            # no output = no problems (pre-existing .tmp-capture.mjs / .tmp-chrome-profile
                         # diagnostics are unrelated stray local files, see "Out of scope" below)
npm run build --workspace=client
npm test
```

Checked on this machine:

- [x] `npm run lint` → clean for every file touched in this step
- [x] `npm run build --workspace=client` → builds without error
- [x] `npm test` → 2/2 server tests pass, client has no tests yet (unchanged from step 02)
- [x] Desktop (1440×900) and mobile (390×844) renders captured at
      `.reviews/assets/03a/desktop-home.png` and `.reviews/assets/03a/mobile-home.png`
- [x] Hero, trust strip, categories, new arrivals, promo banner and trending all render with real
      mock data, correct Rupiah formatting, and working hover/discount badges
- [x] Category tiles and "lihat semua" links route to `/toko?kategori=...` and `/toko?sort=...`,
      matching the query parameters the header search/nav already use
- [x] Loading state: each pending grid reserves one slot per product it will load — four for new
      arrivals, eight for trending — so the loaded grid does not add a row. Pinned by
      `client/src/pages/__tests__/home-page.test.jsx`; see *Revision 1* for the commands and output.
      (The original claim here was a manual `LATENCY_MS` throttle against the mock catalogue. Phase 05
      removed `client/src/mocks/`, so that procedure no longer exists and the claim was replaced.)
- [ ] Screen reader pass — deferred to step 08 (accessibility sweep) per the roadmap, but basic
      affordances (alt text, landmarks, focus-visible) are already in place from step 02's layout

## Decisions and trade-offs

- **`offer.jpg` was not used for the promo banner.** The legacy asset has "ONLINE EXCLUSIVE / 15%
  OFF ACCENT CHAIRS, BENCHES & OTTOMANS / Shop Now" baked into the image in English, which both
  conflicts with new copy placed on top of it and violates the Bahasa Indonesia UI-copy rule. Used
  `category-1.jpg` (a plain bedroom photo, no baked-in text) with the same dark gradient + copy
  treatment used elsewhere on the page.
- **"New arrivals" and "trending" are approximated via `sort`, not a dedicated filter.** The mock
  catalogue's documented API contract (see `mocks/products.js` header comment) has no `isNew` or
  `isTrending` query parameter, only `sort=newest|price-asc|price-desc|rating`. `sort=newest`
  happens to rank `isNew` products first (see `sortProducts`), and `sort=rating` is a reasonable
  stand-in for "digemari" (loved/favoured). This keeps the page honest about the real API shape
  instead of inventing a param that step 04c would then have to either support or remove.
- **No separate "workshop story" section.** The roadmap line for this step says "Banner,
  categories, new arrivals, ads, trending" — five sections. The brand/craft story (ulin kiln-dried
  wood, rattan from Sungai Martapura) is folded into the hero and promo copy instead of becoming a
  sixth section, to stay inside the step's stated scope.
- **`SectionHeading` extracted to `components/ui/`.** The eyebrow/title/"lihat semua" row appears
  three times on this page alone and will reappear on the shop page (03b) and likely the account
  pages, so it was pulled out per the one-component-per-file / extract-at-three-repeats convention
  instead of staying inline in `HomePage.jsx`.
- **Screenshots via CDP, not Playwright/Puppeteer.** No new dependency was added; `.tmp-capture.mjs`
  drives headless Chrome directly over the DevTools protocol, the same approach step 02 used. It
  captures full-page screenshots by reading `Page.getLayoutMetrics` and resizing the viewport to
  the page's content height before shooting, since the fixed-viewport shots from 02 would have
  cropped this page.

## Not done / deferred

- Shop page, product page and all other routes are still `PagePlaceholder`s (03b onward).
- No real `/api/v1/products` calls yet; this page is fully on `mocks/` per the step-02 services
  layer, as planned until step 05.
- Full accessibility audit (focus order across the new sections, reduced-motion check on the
  hover/scale transitions) is step 08's job, not this one's.

## Out of scope / noticed

- `.tmp-capture.mjs` and `.tmp-chrome-profile/` are stray local files from the step 02 screenshot
  session that were already present (and already untracked/ignorable) before this step. They
  produce ~1200 unrelated ESLint errors when `eslint .` walks the whole repo (`chrome`, `window`,
  minified Chrome-extension JS, etc.). Confirmed with `grep` that `npm run lint` has zero findings
  in any file this step touched; the pre-existing noise is not addressed here per rule 6 (not this
  step's scope), but if the team wants `npm run lint` to be clean project-wide, `.tmp-chrome-profile/`
  should be deleted and `.tmp-capture.mjs` either removed after use or added to `.eslintignore`.
- Product photography in the mock catalogue mixes styles (studio cutouts on white vs. lifestyle
  photos), which is visible side-by-side in the "new arrivals" and "trending" grids. This is a
  limitation of the copied template assets, not something to fix in this step.

## Open questions for the reviewer

1. Is approximating "new arrivals" / "trending" via `sort=newest` / `sort=rating` acceptable, or
   should the mock (and eventually the real) catalogue API gain explicit `isNew` / `isTrending`
   filters in step 04c?
2. OK to leave `.tmp-capture.mjs` in the repo root as a reusable manual screenshot tool for future
   steps, or should it be deleted and redone from scratch each time (and `.tmp-chrome-profile/`
   added to `.gitignore` if not already)?
3. Steps 00, 01a and 01b are still marked "Awaiting review" with no reviewer feedback yet. This
   step was built on top of them anyway at the user's direction — flagging so the review queue
   doesn't get lost rather than silently skipping the working-rules gate.

## Reviewer feedback

### Review — 2026-11-18

**Verdict: Changes requested.** The required home-page sections, routes, mock/API query usage, error handling and responsive presentation are implemented, and the supplied desktop/mobile screenshots show the intended result. One documented loading-state guarantee is not met by the implementation. Only this review note was edited; no application code was changed.

#### Required change

1. **Make the trending skeleton occupy the same grid footprint as its loaded content.** `HomePage` requests eight trending products (`useProducts({ sort: 'rating', limit: 8 })`), but the shared local `ProductGrid` always renders exactly four `ProductCardSkeleton` items while pending. On desktop the loaded grid therefore grows from one row to two, contradicting the checked claim that “skeletons match the final grid shape so nothing jumps.” Pass the expected item count into `ProductGrid` (four for new arrivals, eight for trending), or otherwise make the pending and loaded footprints agree, and update this note's verification evidence.

#### Evidence

- Ran `npm run lint` successfully with no errors; the old stray screenshot-profile diagnostics described in this note are no longer present.
- Ran `npm run build --workspace=client` successfully. Vite emitted only the known 549.45 kB chunk-size warning.
- Ran `npm test` successfully: the client exited cleanly with no tests and all 18 current server unit-test files passed (283 tests).
- Ran the documented development server and inspected `/` in headless Chrome at desktop and 390×844. The home route rendered the real hero, the mobile page had no horizontal overflow, and the section/navigation shell remained usable.
- Inspected `HomePage.jsx`, `SectionHeading.jsx`, product cards/skeletons and catalogue hooks. Confirmed the hero, trust strip, category grid, new-arrival query, promo link and trending query, including the `/toko?kategori=...`, `?sort=newest` and `?sort=rating` destinations and explicit retry states.
- Reviewed both supplied home-page captures. They show the expected Rupiah prices, discount/new badges, category links, promotional section and responsive stacking. The final trending capture contains eight cards, which also confirms the four-skeleton footprint discrepancy above.

#### Open questions

1. `sort=newest` is a sound new-arrival mapping and `sort=rating` is acceptable as the Phase 03 trending proxy. Preserve the existing API contract for now; a dedicated trending flag/ranking can be decided with the catalogue API rather than added as an undocumented client-only parameter.
2. The reusable CDP capture script is acceptable as a local verification tool while excluded from lint and not treated as application source. The historical lint noise it caused has already been resolved; no further action is required in this step.
3. The queue warning is outdated: 01b and 02 are now approved, while earlier notes with requested changes remain tracked in their own files.

#### Non-blocking observations

- Frontend behavioural tests and the full accessibility/screen-reader pass remain correctly deferred to steps 07 and 08.
- The mixed photography and later removal of mocks are outside this page's review scope.

## Revision 1 — 2026-11-19

Addresses the required change in the review of 2026-11-18. The status stays `Changes requested`; only the
reviewer may set `Approved`.

### The defect, confirmed

`HomePage` requested **eight** trending products (`useProducts({ sort: 'rating', limit: 8 })`) while the
local `ProductGrid` always rendered **four** `ProductCardSkeleton`s. On desktop (`sm:grid-cols-4`) the
trending section therefore grew from one row while pending to two rows once loaded. Re-rendered against
the pre-fix component it reports exactly that: four trending skeletons for eight requested products.

### The fix

`client/src/pages/HomePage.jsx`:

- The two grid sizes are now named constants — `NEW_ARRIVALS_LIMIT = 4` and `TRENDING_LIMIT = 8` — and each
  one feeds **both** the query limit and the skeleton count, so the two cannot drift apart.
- `ProductGrid` takes a `count` prop instead of hardcoding four. New arrivals pass 4, trending passes 8.
- The loaded branch is untouched: it still renders one `ProductCard` per returned product. Nothing about
  the visible page changes; only the pending footprint.

### The regression test

`client/src/pages/__tests__/home-page.test.jsx` (the first client test) server-renders `HomePage` with
`react-dom/server` — no browser, no new dependency — and asserts two things:

1. the new-arrivals section renders **4** product skeletons and the trending section **8**;
2. the limits stored in the TanStack Query cache for those two queries are `[4, 8]`.

The second assertion is what makes the test meaningful: changing a limit without changing its skeleton
count (or the reverse) fails, which is precisely the drift that produced this defect.

It is kept as a permanent test rather than a throwaway script because it pins the reviewed defect and adds
no dependency. It does not pre-empt step 07, which still owns component interaction, form and accessibility
tests.

### Files changed by this revision

| File | Change |
| ---- | ------ |
| `client/src/pages/HomePage.jsx` | `NEW_ARRIVALS_LIMIT` / `TRENDING_LIMIT` constants drive both the query limit and the skeleton count; `ProductGrid` takes `count` |
| `client/src/pages/__tests__/home-page.test.jsx` | New. Regression test for the pending footprint, tied to the requested limits |
| `.reviews/03a-home-page.md` | Loading-state checklist item replaced with reproducible evidence; this revision |

### Evidence

| Check | Result |
| ----- | ------ |
| `npx vitest run src/pages/__tests__/home-page.test.jsx` (from `client/`) | **1 passed** — 4 new-arrival skeletons, 8 trending skeletons, query limits `[4, 8]` |
| Same assertions against the pre-fix component (`git show HEAD:client/src/pages/HomePage.jsx`) | **failed** — `old arrivals skeletons: 4`, `old trending skeletons: 4`, `expected 4 to be 8`. The test therefore detects the original defect. The temporary fixture and probe were deleted afterwards |
| `npm test` (repo root) | client **1 passed**; server **320 passed** (20 files) |
| `npm run lint` | clean |
| `npm run build` | ok — 560.23 kB JS, only the known >500 kB chunk warning (step 09) |

### How to verify

```sh
# from the repo root
npm test                                                          # client 1 test + server 320 unit tests
cd client
npx vitest run src/pages/__tests__/home-page.test.jsx             # the focused check
```

In the running app: open `/` and hard-reload with throttling (DevTools → Network → Slow 4G). While pending,
“Sedang digemari” must show **two rows of four** skeletons (eight), not one row; when the data lands, the
section fills those same eight slots without the page growing.

One honest caveat: if the catalogue ever holds fewer than eight rated products, the loaded trending grid is
legitimately shorter than the reservation. Reserving the *requested* limit is the closest match available
while pending, and the seeded catalogue has enough products for both grids.

### Not done in this revision

- No change to layout, copy, imagery or query semantics — the defect was purely the pending footprint.
- No screenshot re-capture: there is no browser automation in this session. The footprint is asserted on the
  rendered markup, which is stricter than a screenshot for this specific property.
- The loaded branch is not asserted in the test (rendering `ProductCard` would pull in the auth and wishlist
  providers). The query-limit assertion covers it: the limit is what bounds how many cards can load.

### Open questions for the reviewer

1. Is a permanent client test acceptable in step 03a, or should this step stay test-free and the coverage
   live only in step 07? Deleting `client/src/pages/__tests__/home-page.test.jsx` is a one-file change.
2. The two constants are intentionally local to `HomePage.jsx`. Say the word if you would rather they moved
   to `client/src/lib/config.js`.
