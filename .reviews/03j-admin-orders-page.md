# 03j – Admin orders

- **Status:** Approved
- **Phase:** 3b – Admin frontend
- **Date:** 2026-11-16
- **Author:** agent
- **Reviewer:** Kimi (Moonshot AI, AI reviewer)

## Summary

The panel toko's order screens on `/admin/pesanan`: every customer's orders in
one list with a status filter and search, a detail screen with the customer,
shipping address, items, payment summary and timeline, and a status control that
writes through the same order history the customer reads.

The rail and the dashboard already linked to `/admin/pesanan`, but no route or
page existed before this step, so those links fell through to the 404 page.

## Files added / changed

| File | Change |
| ---- | ------ |
| `client/src/pages/admin/AdminOrdersPage.jsx` | Order list: search, status tabs with counts, table, loading/error/empty states |
| `client/src/pages/admin/AdminOrderDetailPage.jsx` | Order detail: status editor, timeline, items, customer, address, payment summary, cancelled and not-found states |
| `client/src/components/admin/OrderStatusForm.jsx` | Status select + save; only enabled when the status changes; server errors shown inline |
| `client/src/hooks/useAdmin.js` | `useAdminOrder` and `useUpdateOrderStatus`; a status change refreshes the admin list, the order and the customer's history |
| `client/src/services/admin.js` | `fetchAdminOrder`, `updateAdminOrderStatus` with the intended 04i endpoints |
| `client/src/mocks/admin.js` | `getAdminOrder`, `updateOrderStatus`, shared order lookup across customers; cancelling records a reason |
| `client/src/mocks/account.js` | `writeOrdersByUser` so the admin mock persists a status change in the shared order store |
| `client/src/App.jsx` | `pesanan` and `pesanan/:orderNumber` routes under the admin branch |
| `.tmp-capture.mjs` | Added the 03j capture scenarios |
| `.reviews/assets/03j/*` | Desktop and mobile evidence (see below) |

## How to run and verify

```sh
npm run dev
# client on http://localhost:5173
```

Sign in as `admin@badekor.id` / `rahasia123`.

Checklist the reviewer can tick:

- [ ] `/admin/pesanan` lists the four seeded orders newest first with number, date, customer, status and total
- [ ] The status tabs show counts and filter correctly; `Dikirim 1` shows only the shipped order
- [ ] Search matches order number, customer name and customer email, and the count shows "n dari m"
- [ ] Clearing the filter and search offers "Tampilkan semua pesanan"
- [ ] Opening an order shows the customer, shipping address, items, payment summary and timeline
- [ ] `/admin/pesanan/BD-2026-0307` shows the cancellation reason and hides the timeline
- [ ] The status control starts on the current status and "Simpan status" is disabled until it changes
- [ ] Changing `Diproses` to `Dikirim` updates the header badge, appends the timeline event and reports success
- [ ] The same change is visible in the customer's `/akun/pesanan/BD-2026-0417` after signing in as Sari
- [ ] Cancelling records the default reason "Pesanan dibatalkan oleh admin toko." and reopening clears it
- [ ] A missing order number shows the not-found state with a link back to the list
- [ ] Mobile (390 px) keeps the list readable (customer column hidden) and stacks the detail sections
- [ ] The customer column is hidden only on small screens; desktop keeps it

Screenshot evidence in `.reviews/assets/03j/`: `desktop-admin-orders`,
`desktop-admin-orders-filter`, `desktop-admin-orders-search`,
`desktop-admin-order-detail`, `desktop-admin-order-shipped`,
`desktop-admin-order-cancelled`, `desktop-admin-order-status-updated`,
`mobile-admin-orders`, `mobile-admin-order-detail`.

## Decisions and trade-offs

- **One order store.** The admin mock reads the same storage the customer mocks
  write, so an order placed at checkout appears in the panel immediately and a
  status change appears in the customer's history — no second copy to drift.
- **Status changes append a timeline event.** The customer and the admin see the
  same `timeline` array, which is what 04i will write as order status history.
- **Cancelling records a reason.** A status move to `cancelled` gets a default
  reason if none exists, so the customer screen never shows an empty cancellation
  block; reopening clears the reason.
- **The list filters client-side.** Mock scale is small; the real listing in 04i
  will take `?status=` and pagination on the server.
- **Reuse the customer order vocabulary.** Filters, labels, badges and the
  timeline come from `lib/orderStatus.js` and the account order components, so the
  two sides cannot disagree about status names or colours.
- **The card is a workspace, not a storefront.** The panel keeps the admin frame
  from 03h; the detail page reads as a workshop ticket.

## Not done / deferred

- The server-side admin order endpoints, status-transition rules and refunds
  arrive in step 04i.
- Email/WhatsApp notifications on status change are out of scope.
- Admin order tests arrive in step 07.

## Out of scope / noticed

- The 03i, 03f, 03g and 03h review notes were missing and were written in the
  same pass; see their files in `.reviews/`.
- `npm run lint` previously reported the local screenshot artifacts
  (`.tmp-chrome-profile`, `.tmp-capture.mjs`). They are now excluded from ESLint
  so lint reflects application code.

## Open questions for the reviewer

1. Should the admin only be able to move an order forward along
   processing → shipped → completed (plus cancel), or may any status be chosen?
   The mock currently allows any status.
2. Should cancelling ask for a reason in the UI instead of using a default one?
3. Should status changes require a tracking number when moving to `shipped`?

## Reviewer feedback

**Verdict: Approved.** No blocking issue was found in the original Phase 03j admin-order scope.

Independent verification performed with `npm run dev` and Chrome:

- The current integrated list showed five orders (the original mock had four), including `BD-2026-1066` created during the 03g review. Desktop customer columns, dates, statuses and totals rendered.
- `Dikirim` filtered to the one originally shipped order. Searches by Sari's name and email each returned the matching row; result counts were present.
- Order detail showed customer, address, both purchased variants, payment summary, timeline and an initially disabled save button.
- Changed `BD-2026-1066` from processing to shipped with tracking `REVIEW-03J`; success feedback and tracking appeared. After switching to Sari, the customer order detail showed the same tracking/update.
- The cancelled order hid its timeline, the missing-order route showed its recovery link, and 390 px list/detail views had no page overflow. The list's customer column was hidden only at mobile width.
- Reviewed the supplied original screenshots for the four-order fixture, count text, cancellation reason, reopening behaviour and status/timeline update. The original client-side implementation keeps the unfiltered list separately, so its no-result reset remains available.

**Later integration observation (not a 03j blocker):** in the current Phase 05 server-filtered list, a search with zero matches produced the generic `Belum ada pesanan` state rather than the original no-result/reset state. This belongs to the integration review/backlog; it is not a defect in the historical mock implementation being approved here.

Open questions: transition rules, cancellation reasons and tracking requirements are policy decisions. The later API has already constrained transitions and made terminal states explicit; any further rule change should be decided by the product team rather than this reviewer.
