# 02 – Frontend foundation

- **Status:** Awaiting review
- **Phase:** 2 – Frontend foundation
- **Date:** 2026-11-16
- **Author:** agent
- **Reviewer:** _unassigned_

## Summary

The shared foundation every storefront page sits on: Tailwind v4 design tokens in
`@theme`, base typography/focus styles, IDR and locale helpers, the `MainLayout`
shell (skip link, header, footer), the route table, a shared UI kit, and a
`services/` layer backed by `mocks/` so the client runs without the API.

This note was written retroactively during the 03i/03j review pass. The code and
screenshots were already in place and are described as they currently exist; the
per-commit split from step 02 cannot be recovered because everything after the
initial commit is uncommitted.

## Files added / changed

| File | Change |
| ---- | ------ |
| `client/src/index.css` | Tailwind entry: `@import 'tailwindcss'`, theme/base imports, `@plugin '@tailwindcss/forms'` |
| `client/src/styles/theme.css` | Design tokens in `@theme`: warm-neutral palette + `#fd3d57` accent, Poppins/Roboto, display/title/heading/spec type scale, card/field radius, two shadows, motion keyframes |
| `client/src/styles/base.css` | Base body/heading typography, one `:focus-visible` treatment, reduced-motion scroll, `.tabular` for money |
| `client/src/main.jsx` | Providers: TanStack `QueryClient`, `AuthProvider`, `CartProvider`, `BrowserRouter` |
| `client/src/App.jsx` | Route table for every storefront page (pages filled in by 03a–03g) |
| `client/src/layouts/MainLayout.jsx` | Skip link, `SiteHeader`, `<Outlet />`, `SiteFooter`, scroll-to-top on navigation |
| `client/src/components/layout/SiteHeader.jsx` | Topbar, primary nav, cart badge, account menu, mobile drawer |
| `client/src/components/layout/SiteFooter.jsx` | Brand/contact/link footer |
| `client/src/components/layout/AccountMenu.jsx` | Guest sign-in link; signed-in initials disclosure with account links and sign-out |
| `client/src/components/ui/*` | Shared kit: Button/`buttonStyles`, Form (`Field`, `Input`, `Textarea`, `PasswordInput`, `Select`, `Checkbox`), Badge, Breadcrumbs, Modal, Drawer, Rating, QuantityStepper, Price/`PriceRow`, Pagination, SectionHeading, EmptyState/`ErrorState`, Spinner/`Skeleton` |
| `client/src/components/product/ProductCard.jsx` | Catalogue repeating unit + matching skeleton |
| `client/src/lib/format.js` | `formatIDR` (whole Rupiah), `formatDate` (`id-ID`), `discountPercent`, `slugify` |
| `client/src/lib/cn.js` | `clsx` + `tailwind-merge` helper |
| `client/src/lib/config.js` | `USE_MOCKS` flag |
| `client/src/lib/nav.js` | Route constants and `safeRedirect` |
| `client/src/lib/validation.js` | Pure form validators returning Bahasa Indonesia messages |
| `client/src/lib/focus.js`, `client/src/hooks/useScrollToTop.js` | Focus-first-error helper, scroll reset |
| `client/src/services/http.js` | `fetch` wrapper: credentials, JSON errors normalised to `{ error: { code, message, details } }`, `toQuery` |
| `client/src/services/catalog.js` | Catalogue calls, mock-backed |
| `client/src/mocks/index.js`, `mocks/products.js`, `mocks/taxonomy.js` | In-memory catalogue API returning the Phase 4 payloads |

## How to run and verify

```sh
npm run dev
# client on http://localhost:5173, API health check on http://localhost:4000
```

```sh
npm run lint
npm run build --workspace=client
```

Checklist the reviewer can tick:

- [ ] The accent is spent only on price, primary actions and active state; every other surface is warm neutral
- [ ] Display type is Poppins, reading text is Roboto; the `display`/`title`/`heading`/`spec` scale is used consistently
- [ ] Prices render as `Rp 1.250.000` with no decimals and tabular numerals
- [ ] Header keeps navigation, cart count and the account control usable down to 390 px
- [ ] The skip link appears on first Tab and jumps to `#konten`
- [ ] Focus is visible on the accent colour across links, buttons and fields
- [ ] Unknown URLs render the shared 404 page
- [ ] Product grids use a skeleton with the same footprint while the mock catalogue loads
- [ ] With `VITE_USE_MOCKS` left at its default, every storefront page works without the API

Screenshot evidence in `.reviews/assets/02/`: `desktop-home`, `mobile-home`,
`mobile-menu`, `desktop-404`.

## Decisions and trade-offs

- **Tailwind v4, CSS-first.** Tokens live in `theme.css`; there is no
  `tailwind.config.js`. This keeps one source of truth and matches the current
  Tailwind major.
- **One accent, locked.** The template's `#fd3d57` is reserved for price, primary
  action and active state so the furniture photography carries the page.
- **Route strings in `lib/nav.js`.** Headers, footers and the router import the
  same constants, so a path cannot drift between a link and its route.
- **Services behind mocks.** Components never fetch directly; `USE_MOCKS` swaps
  the implementation in step 05 without touching a screen.
- **Validators are pure.** They return message strings, so the same rules can be
  unit-tested in step 07.

## Not done / deferred

- The real API replaces the mocks in step 05.
- Frontend tests for the kit and helpers arrive in step 07.
- Route code-splitting and image optimisation are step 09.

## Out of scope / noticed

- This note is retrospective; review notes for 03f–03j were likewise missing and
  were written in the same pass.
- `npm run lint` previously picked up the local screenshot artifacts
  (`.tmp-chrome-profile`, `.tmp-capture.mjs`); those are now excluded from ESLint
  so lint reflects application code.

## Open questions for the reviewer

1. Is the single-accent rule the direction we want, or should a second accent be
   introduced for sold-out/clearance states?
2. Should the shared UI kit live under `components/ui` as a flat folder, or be
   split into `forms/`, `feedback/` and `display/` once it grows?

## Reviewer feedback

_To be filled in by the reviewer._
