# 03e – Account pages

- **Status:** Approved
- **Phase:** 3 – Frontend pages
- **Date:** 2026-11-12
- **Author:** agent
- **Reviewer:** Kimi (Moonshot AI, AI reviewer)

## Summary

The account area from `pages/account.html` and `pages/profile.html` is rebuilt as a nested
`/akun` branch: an overview with the latest order, profile data and default address; profile and
password editing; address management (create, edit, delete, set default) and an order history with a
detail page. The template has no orders or addresses screen beyond static mock-up boxes, so both are
new screens with mock data, services and hooks that already speak the intended 04d/04g contracts.

The account area keeps the template's job (know what is tied to your account and change it) but not
its dashboard-card layout: the page reads like a workshop ledger — a monogram and a quiet rail, then
content separated by hairlines, with raised surfaces only where there is a real repeated object (an
address card or an order block).

## Files added / changed

| File | Change |
| ---- | ------ |
| `client/src/App.jsx` | Replaced the flat `/akun` and `/akun/profil` routes with a nested `/akun` branch behind `RequireAuth`; added `/akun/alamat`, `/akun/pesanan` and `/akun/pesanan/:orderNumber` |
| `client/src/lib/nav.js` | Added `addresses`, `orders` and `accountOrder`; expanded `accountNav` to the six account links |
| `client/src/lib/orderStatus.js` | New. Status labels, badge tones, the happy-path flow and filter options shared by list/detail |
| `client/src/lib/initials.js` | New. Shared two-letter monogram; `AccountMenu` now uses it instead of a private copy |
| `client/src/lib/validation.js` | Added `validateProfile`, `validatePasswordChange`, `validateAddress`; recipient-specific address message |
| `client/src/context/AuthProvider.jsx` | Added `updateUser` so a saved profile replaces the cached user without a reload |
| `client/src/components/account/AccountLayout.jsx` | New. Breadcrumbs, monogram + account rail, sticky desktop rail, wrapped mobile rail, `<Outlet />` |
| `client/src/components/account/AccountPageHeader.jsx` | New. Shared page heading with one optional action |
| `client/src/components/account/OrderStatusBadge.jsx` | New. Status badge backed by `orderStatus.js` |
| `client/src/components/account/OrderRow.jsx` | New. Ledger-style order row used by the overview and the order list |
| `client/src/components/account/OrderTimeline.jsx` | New. Ordered processing → shipped → completed timeline with dates |
| `client/src/components/account/AddressCard.jsx` | New. Read view of one address with edit/delete/set-default actions |
| `client/src/components/account/AddressForm.jsx` | New. Create/edit form used inside the modal, with validation and server error handling |
| `client/src/components/account/ProfileForm.jsx` | New. Name/email/WhatsApp form; disabled while unchanged; duplicate email maps to the email field |
| `client/src/components/account/PasswordForm.jsx` | New. Current/new/confirmation fields; wrong current password maps to its field |
| `client/src/components/ui/Modal.jsx` | New. Centered dialog: Escape/backdrop close, scroll lock, focus return, width overridable |
| `client/src/components/ui/FormAlert.jsx` | Moved from `components/auth/FormAlert.jsx`; auth pages and the new forms share it |
| `client/src/pages/AccountPage.jsx` | Replaced the placeholder with the account overview |
| `client/src/pages/ProfilePage.jsx` | Replaced the placeholder with the profile + password sections |
| `client/src/pages/AddressesPage.jsx` | New. Address list, create/edit modal, delete confirmation and default action |
| `client/src/pages/OrdersPage.jsx` | New. Order history with status filter tabs, counts, empty and error states |
| `client/src/pages/OrderDetailPage.jsx` | New. Status timeline, items, shipping address, payment summary, cancellation reason, 404 state |
| `client/src/mocks/account.js` | New. Seeded addresses and orders per user, address CRUD, order list/detail |
| `client/src/mocks/auth.js` | Added `getSessionUserId`, `updateProfile` and `changePassword`; phone numbers are normalised at the mock boundary |
| `client/src/services/account.js` | New. Mock-backed account services with the intended real endpoints for 04d/04g |
| `client/src/hooks/useAccount.js` | New. Queries/mutations keyed by user id, with address invalidation after every write |
| `client/src/components/layout/AccountMenu.jsx` | Uses the shared `initials` helper |
| `client/src/pages/LoginPage.jsx`, `RegisterPage.jsx` | Import `FormAlert` from its new UI location |
| `.tmp-capture.mjs` | Repointed at `.reviews/assets/03e`; added a login pre-step and step-level input filling |
| `.reviews/assets/03e/*` | 30 screenshots (listed below) |

## How to run and verify

```sh
npm run dev
# client on http://localhost:5173
```

Demo accounts (also on `/masuk`):

| Role | Email | Password |
| ---- | ----- | -------- |
| Pelanggan | `sari@badekor.id` | `rahasia123` |
| Admin | `admin@badekor.id` | `rahasia123` |

Pages to open after signing in as Sari:

- `/akun` — overview
- `/akun/pesanan` — order history; filter by `Diproses`, `Dikirim`, `Selesai`, `Dibatalkan`
- `/akun/pesanan/BD-2026-0392` — shipped order with timeline and tracking number
- `/akun/pesanan/BD-2026-0307` — cancelled order with reason
- `/akun/pesanan/BD-2099-0001` — not-found state
- `/akun/profil` — profile and password forms
- `/akun/alamat` — addresses, add/edit/delete/default

Signed out, `/akun/alamat` redirects to `/masuk?redirect=%2Fakun%2Falamat` (verified by the harness's
final-path log).

```sh
npx eslint client/src server/src
npm run build --workspace=client
npm test
```

Checklist the reviewer can tick:

- [x] `/akun` greets the customer by first name, shows the latest order, profile data and default address
- [x] The account rail highlights the current page and wraps on mobile so the active item stays visible
- [x] `/akun/alamat` while signed out redirects to `/masuk?redirect=%2Fakun%2Falamat` with an explanation
- [x] `/akun/pesanan` lists the four seeded orders with number, date, status, thumbnails, item count, total and detail link
- [x] Status tabs filter correctly and show counts; `Selesai 1` shows only the completed order
- [x] Order detail shows the processing → shipped → completed timeline with dates, items, address and payment summary
- [x] A shipped order shows its tracking number; a cancelled order shows the reason instead of the timeline
- [x] A missing order number shows a specific not-found state with links to the history and the shop
- [x] Saving a profile updates the sidebar name immediately and reports "Perubahan tersimpan."
- [x] Clearing the name reports a field error on submit and moves focus to it
- [x] Using `admin@badekor.id` on the profile is reported on the email field, not as a generic banner
- [x] Password validation reports all three empty fields; a wrong current password is reported on that field
- [x] A successful password change clears the fields and reports "Kata sandi diperbarui."
- [x] Address validation reports label, recipient, phone, street, district, city, province and postal code
- [x] Adding an address closes the modal and the new card appears with the add tile moved after it
- [x] Editing an address opens the modal prefilled and saves the new label
- [x] Deleting asks for confirmation; deleting the default promotes the next address to default
- [x] "Jadikan utama" moves the chosen address to the front and removes the action from it
- [x] Admin (no seeded orders) gets the empty order state; a new registration gets the same empty states
- [x] Mobile (390 px) has no horizontal scroll and all account pages are single-column

Screenshot evidence in `.reviews/assets/03e/`:

`desktop-account-overview`, `desktop-account-orders`, `desktop-account-orders-completed`,
`desktop-account-order-shipped`, `desktop-account-order-cancelled`, `desktop-account-order-missing`,
`desktop-account-guard`, `desktop-account-empty-orders`, `desktop-account-profile`,
`desktop-account-profile-validation`, `desktop-account-profile-saved`,
`desktop-account-profile-email-taken`, `desktop-account-password-validation`,
`desktop-account-password-validated`, `desktop-account-password-saved`, `desktop-account-addresses`,
`desktop-account-address-form`, `desktop-account-address-validation`,
`desktop-account-address-created`, `desktop-account-address-edit`,
`desktop-account-address-edited`, `desktop-account-address-delete-confirm`,
`desktop-account-address-deleted`, `desktop-account-address-set-default`,
`mobile-account-overview`, `mobile-account-orders`, `mobile-account-order-detail`,
`mobile-account-profile`, `mobile-account-addresses`, `mobile-account-address-form`.

## Decisions and trade-offs

- **A ledger, not a dashboard.** The account area needed more than the template's three identical
  cards. The monogram and rail carry identity, page sections are separated by hairlines, and raised
  surfaces are reserved for repeated objects (addresses, order blocks). This keeps the page calm
  without turning it into a SaaS card grid, and follows the same palette/type system as 03a–03d.
- **One nested branch, one guard.** `/akun`, `/akun/profil`, `/akun/alamat`, `/akun/pesanan` and
  `/akun/pesanan/:orderNumber` are children of `AccountLayout`, wrapped once by `RequireAuth`. That
  prevents a future route from accidentally shipping without the guard and keeps the rail mounted
  while moving between account pages.
- **Account data per user in the mock store.** Addresses and orders live in `localStorage` under
  `badekor.mock.*`, keyed by user id. The demo customer gets two addresses and four orders covering
  every status; the admin and newly registered users start empty. This makes the empty states real
  rather than only theoretical. `reset` in the capture harness clears storage between shots.
- **Profile changes flow back through `AuthProvider`.** `updateUser` replaces the cached user after a
  successful save, so the header, the rail and the overview agree immediately. Refetching the session
  would have worked too, but one extra network hop for a value we already have is unnecessary.
- **Password change requires the current password.** The mock verifies it against the stored digest
  and returns `INVALID_PASSWORD`; the form maps that to the current-password field instead of a
  banner. A new password equal to the old one is rejected before the request.
- **Status vocabulary lives in one module.** Labels, tones and the flow are shared by the list,
  detail and filter. Processing/shipped/completed are a real sequence, so the timeline markers are
  meaningful; cancelled is shown as a reason panel rather than a broken timeline.
- **Order filtering is client-side for now.** There are four mock orders, so the page fetches the
  customer's orders once and filters locally while keeping counts from the same list. 04g can move
  this to `?status=` plus pagination without changing the rendering; that trade-off is listed below.
- **Addresses use a modal, not another page.** Creating or editing one address is a short task and
  the list should stay in view; a modal keeps that context. Delete gets its own confirmation modal
  because it is destructive and cannot be undone.
- **Default-address invariants live in the mock.** The first address becomes default, deleting the
  default promotes the next address, and setting a default unsets the others. The real API should own
  the same rules in 04d; the UI does not try to second-guess them.
- **`FormAlert` moved from `auth/` to `ui/`.** It is a form primitive now used by auth, profile and
  address forms. The 03d note still names its old path; that note is historical and was not edited.
- **Mobile navigation wraps instead of scrolling.** The first implementation scrolled horizontally,
  which hid the active item on `/akun/alamat`; wrapping the pills keeps every account destination
  visible at 390 px. The order row similarly moves total and the detail link to their own row so the
  item summary is not squeezed.
- **Phone numbers are normalised at the mock boundary.** `0812 3456 7890`, `62812…` and `+62812…` all
  become the same `08…` value before storage, so the profile, address and future checkout forms see
  one shape.
- **Order items use only catalogue items whose photos match their names.** The catalogue still has the
  pre-existing name/photo mismatches from 02; the seeded orders use the sofa, outdoor sofa and bar
  chair rows to avoid showing a mismatched image in account screenshots. 04a fixes the catalogue.
- **No toast layer yet.** Save, delete and password results are inline `role="status"` messages or
  list updates. Toasts belong to 08 and would otherwise be a second feedback vocabulary this early.

## Not done / deferred

- **Real account endpoints** — 04d (profile, password, addresses) and 04g (orders). `services/account.js`
  already speaks the intended paths: `PATCH /users/me`, `POST /users/me/password`,
  `/users/me/addresses` CRUD, `POST /users/me/addresses/:id/default`, `/users/me/orders`.
- **Tests** — step 07. `lib/validation.js` and `lib/orderStatus.js` are pure and ready for unit tests;
  the account mutations are ready for integration tests against 04d/04g.
- **Toasts, skeleton polish and reduced-motion review** — step 08. Current feedback is inline.
- **Order pagination and server-side status filtering** — 04g can add `?status=&page=&limit=`; the UI
  currently fetches the customer's full order list and filters it.
- **Invoice/print view, reorder, cancel/return/review actions** — not in the roadmap; would need their
  own steps and API rules.
- **Address region picker** — province/city/district are free text. A region dataset or a third-party
  lookup is a product/API decision, not made here.
- **Email change verification** — the mock accepts a new email immediately; 04d must decide whether a
  confirmation link is required.
- **Avatar upload** — the account uses a monogram; the template's avatar image is not carried over.
- **Password reset** — still no reset flow (also flagged in 03d).
- **Wishlist and cart pages** — 03f and 03g. The account rail links to both, which currently show
  their placeholders.
- **Admin account navigation** — 03h. `useAuth().isAdmin` is ready, but `/admin` has no layout yet.
- **Email/password change invalidating other sessions** — no session table in the mock; decide in 04b.
- **Account deletion / data export** — not in the brief.

## Out of scope / noticed

- **Review queue is still backed up.** 00, 01a, 01b, 03a, 03b, 03c and 03d are all "Awaiting review",
  and step 02 has no review note. This step was built on top of them at the user's direction; flagging
  again so the backlog is not lost.
- **Prettier is not clean repo-wide.** The working tree uses CRLF against `endOfLine: "lf"`, and a few
  pre-existing files still fail. Every file added or touched here was formatted; no repo-wide
  `npm run format` was run.
- **`.tmp-capture.mjs` and `.tmp-chrome-profile/` are still not ignored.** They are temporary harness
  files; linting is scoped to `client/src server/src` because a repo-root `eslint .` picks up Chrome's
  extension JS.
- **Editor diagnostics report false EOF parse errors.** The IDE diagnostics panel flags
  "Declaration or statement expected" at the end of `OrdersPage.jsx`, `OrderDetailPage.jsx` and
  `AddressesPage.jsx`. `eslint`, `esbuild` and `vite build` all parse those files cleanly, and the
  screenshots render them, so this is treated as editor-language-server noise rather than rewritten
  around.
- **Mock catalogue names still do not match their photos** (pre-existing from 02) — 04a. See the
  seeded-order note above for how this affects 03e.
- **Sticky header ghost** from step 02 — 08.
- **The order list has no pagination**, which is acceptable for four mock orders but should not be
  mistaken for the 04g contract. Flagged above.
- **`window.confirm` was not used for deletion.** The delete confirmation uses the new `Modal` so
  keyboard/Escape behaviour and wording stay in Indonesian.

## Open questions for the reviewer

1. **Order route shape.** Account orders are under `/akun/pesanan/:orderNumber`. Should 04g keep
   `/users/me/orders/:orderNumber`, or should orders get a top-level `/pesanan/:orderNumber` route so
   the order-complete page and the account detail can share it?
2. **Default address endpoint.** The client calls `POST /users/me/addresses/:id/default`. Is that the
   shape 04d should implement, or should it be `PATCH /users/me/addresses/:id` with `{ isDefault: true }`?
3. **Address regions.** Province, city and district are free text with validation only. Should 04d
   ship a fixed Indonesian region table, or keep free text and validate loosely?
4. **Email change verification.** The mock applies a new email immediately. Should 04d require a
   confirmation email before the address becomes the login identity?
5. **Order list filtering.** Is `GET /users/me/orders?status=...&page=...` the right contract for 04g,
   or should the client keep fetching all orders (fine for the current scale)?
6. **Password-change session policy.** After changing the password, the mock keeps the current session.
   Should 04b invalidate other sessions, and should the client require a fresh sign-in?
7. **Order number format.** Mock orders use `BD-2026-0417`. Confirm that 04a/04g should generate this
   display number (separate from a database id), and that it is safe in a URL.
8. **Review queue.** The backlog above still needs an owner before Phase 4 starts.

## Reviewer feedback

**Verdict: Approved.** No blocking issue was found in the Phase 03e account-page scope.

Independent verification performed:

- `npx eslint client/src server/src` — passed.
- `npm run build --workspace=client` — passed (177 modules); the existing 549.45 kB chunk-size warning remains non-blocking.
- `npm test` — passed: 18 server test files / 283 unit tests; the client has no test files and exits successfully.
- Exercised the guarded address URL, login redirect, account overview, order counts/filtering, shipped and cancelled order details, missing-order state, profile/password validation, address validation and the full add → edit → set-default → delete flow. Deleting the temporary default address promoted the original default again; the temporary data was removed.
- Checked the address modal at 390 px: no horizontal overflow. The desktop/mobile screenshot set also covers the original mock-based success and empty states.

The repository now contains the later Phase 05 integration, so its API rules and persisted data differ in places from the historical mock implementation. Those later changes were not treated as Phase 03e regressions; the supplied Phase 03 screenshots and the corresponding implementation were used for the original mock-specific assertions.

Open questions: the later API implementation resolves the concrete route/default/filter/order-number contracts without blocking this frontend step. Region lookup, email-change verification and password-session invalidation remain product/security policy decisions for their owning backend steps, not decisions for this reviewer to make unilaterally. The review-queue question is being handled by the present sequential review.
