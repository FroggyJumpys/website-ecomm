# 03h – Admin layout and dashboard

- **Status:** Approved
- **Phase:** 3b – Admin frontend
- **Date:** 2026-11-16
- **Author:** agent
- **Reviewer:** Kimi (Moonshot AI, AI reviewer)

## Summary

The panel toko shell and its overview screen. Admins get a separate frame — an
ulin rail on the left, a quiet workspace on the right, and a wrapped navigation on
mobile — behind a role-based route guard. The dashboard summarises the workshop's
day: orders to process, orders in delivery, revenue, low stock, the latest orders
and the products that need restocking.

This note was written retroactively during the 03i/03j review pass; the code and
screenshots were already in place. The catalogue and order panels are separate
steps (03i, 03j) and are linked from the rail.

## Files added / changed

| File | Change |
| ---- | ------ |
| `client/src/layouts/AdminLayout.jsx` | Admin shell: skip link, desktop rail, topbar, mobile nav, "Lihat toko", sign-out |
| `client/src/pages/admin/AdminDashboardPage.jsx` | Summary figures, recent orders table, low-stock list |
| `client/src/components/auth/RequireAdmin.jsx` | Role guard: restore skeleton, guest redirect with return path, forbidden screen for customers |
| `client/src/lib/nav.js` | `admin`, `adminProducts`, `adminOrders` routes and `adminNav` |
| `client/src/lib/stock.js` | `LOW_STOCK_THRESHOLD` and `stockStatus` shared by dashboard and product table |
| `client/src/hooks/useAdmin.js` | Admin queries (orders first; products/taxonomy added in 03i) |
| `client/src/services/admin.js` | Admin service layer (orders first; catalogue added in 03i) |
| `client/src/mocks/admin.js` | `listAllOrders` joining every customer's orders to their account |
| `client/src/mocks/auth.js` | `listUsers` (no password hashes) for the admin join |
| `client/src/context/AuthProvider.jsx` | `isAdmin` derived from `user.role` |
| `client/src/components/layout/AccountMenu.jsx` | Admin badge and "Panel toko" link |
| `client/src/App.jsx` | `/admin` branch wrapped in `RequireAdmin` |
| `client/src/lib/demoAccounts.js` | Seeded admin demo account (`admin@badekor.id`) |
| `.reviews/assets/03h/*` | Dashboard, guard, forbidden and menu evidence |

## How to run and verify

```sh
npm run dev
# client on http://localhost:5173
```

Demo accounts: `admin@badekor.id` / `rahasia123` (admin),
`sari@badekor.id` / `rahasia123` (customer).

Checklist the reviewer can tick:

- [ ] Signed in as admin, `/admin` shows the overview with four figures and no storefront header
- [ ] The rail marks the current section and includes Ringkasan, Produk, Pesanan, "Lihat toko" and sign-out
- [ ] On mobile the rail becomes a horizontal, scrollable nav with the active item visible
- [ ] "Pesanan diproses" counts `processing` orders, "Dalam pengiriman" counts `shipped`, revenue excludes cancelled orders
- [ ] "Stok menipis" matches the products at or below the shared threshold
- [ ] Recent orders show number, date, customer, status and total, and link to the order
- [ ] The low-stock list shows the five lowest-stocked products with a danger/warning badge
- [ ] Signed out, `/admin` redirects to `/masuk?redirect=%2Fadmin`
- [ ] Signed in as a customer, `/admin` shows the forbidden screen with "Masuk sebagai admin" and "Kembali ke toko"
- [ ] The account menu shows the Admin badge and a "Panel toko" link for the admin only
- [ ] Mobile (390 px) has no horizontal page scroll

Screenshot evidence in `.reviews/assets/03h/`: `desktop-admin-dashboard`,
`desktop-admin-guard`, `desktop-admin-forbidden`, `desktop-admin-menu`,
`mobile-admin-dashboard`.

## Decisions and trade-offs

- **A separate frame, not the storefront header.** Product navigation would
  compete with the operator's tasks, so the panel has its own rail and topbar.
- **The guard is usability, not security.** `RequireAdmin` keeps screens out of a
  customer's way; the API re-checks the role in 04h/04i, and that is the real
  boundary.
- **Forbidden instead of silent redirect.** A signed-in customer is told plainly
  that the area is not theirs and can switch accounts in one click.
- **Dashboard reuses existing queries.** Orders come from the admin mock and stock
  from the catalogue, so there is no second source of truth.
- **One stock threshold.** `LOW_STOCK_THRESHOLD` lives in `lib/stock.js` so the
  dashboard count and the catalogue badges cannot disagree.

## Not done / deferred

- Catalogue management is step 03i; order management is step 03j.
- The real admin endpoints arrive in steps 04h and 04i.
- Admin tests arrive with the other frontend tests in step 07.

## Out of scope / noticed

- This note is retrospective; 03h previously had no review note.
- The rail already links to `/admin/produk` and `/admin/pesanan`; those screens
  are delivered in 03i and 03j, so before those steps the links had no destination.

## Open questions for the reviewer

1. Should the dashboard's revenue include shipped-but-not-completed orders, or
   count only completed ones? It currently counts everything except cancelled.
2. Should "Stok menipis" be configurable per product instead of one global
   threshold?

## Reviewer feedback

**Verdict: Approved.** No blocking issue was found in the Phase 03h admin shell/dashboard scope.

Independent verification performed with `npm run dev` and Chrome:

- Guest `/admin` redirected to `/masuk?redirect=%2Fadmin`; customer login produced the explicit forbidden screen with both recovery actions; `Masuk sebagai admin` returned to the guarded login destination.
- Admin login rendered the separate panel frame without the storefront search/navigation. The four figures, five recent orders and five lowest-stock entries rendered, with working order links and the shared status/stock presentation.
- The admin account menu showed the Admin badge and `Panel toko`; the rail/topbar provided `Lihat toko` and sign-out, and sign-out landed on `/`.
- At 390 px the mobile navigation and active Ringkasan item were present and the document had no horizontal page overflow. The supplied desktop/mobile screenshots were also checked.
- Code inspection confirms revenue excludes cancelled orders, processing/shipped figures use the status counts, and both stock displays use the shared threshold and five-item low-stock ordering.

Open questions: whether revenue should mean only completed orders and whether low-stock thresholds should vary by product are product/reporting policies. The current definitions are consistent and clearly implemented; changing them is not required for this frontend step.
