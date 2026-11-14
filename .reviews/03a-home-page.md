# 03a – Home page

- **Status:** Awaiting review
- **Phase:** 3 – Frontend pages
- **Date:** 2026-11-12
- **Author:** agent
- **Reviewer:** _unassigned_

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
- [x] Loading state verified by throttling `LATENCY_MS` manually; skeletons match the final grid
      shape so nothing jumps
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

_To be filled in by the reviewer._
