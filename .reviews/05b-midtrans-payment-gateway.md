# 05b — Midtrans payment gateway

- **Status:** Changes requested
- **Phase:** 5b – Payment gateway integration (Midtrans)
- **Date:** 2026-11-19
- **Author:** agent (Claude, executor session)
- **Reviewer:** Kimi (Moonshot AI, AI reviewer)

## Summary

Adds an online payment path to the existing checkout. `POST /orders` still commits the order and takes
the stock, but it no longer pretends the payment choice is cosmetic: the order carries a
`payment_status` and a `payment_method_id`, and the confirmation page can now ask the server for a
**Midtrans Snap** transaction priced from the stored order. Payment state comes back through two
paths that share one implementation — a signed webhook, and a `sync` endpoint that asks the provider
directly (which is what makes the flow testable on a developer machine with no public URL).

Money never crosses the trust boundary. The browser names an order; it never names an amount, an item
list, or a paid flag. The Snap payload is built from the persisted order, an item/amount mismatch
throws before the provider is called, and the webhook's `gross_amount` must equal the attempt's stored
amount before any row is touched.

Tests cover the policy as pure functions (37 unit tests), and the HTTP surface against a fake provider
(23 integration tests) including a forged signature, a replayed notification, an amount mismatch, an
unknown order and a late `pending` after a settlement.

**QRIS is part of this step** — see _Revision 1_ below for the channel, the stored transaction-specific
code, its expiry, and the `GET /orders/:orderNumber/payments` read the order pages use.

## Files added / changed

### Server

| File                                                    | Change                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/db/migrations/009_pembayaran.sql`               | New. `tbl_pesanan.payment_status` (+ CHECK, + index) and `payment_method_id` (+ CHECK) with a one-time backfill from the three known Indonesian labels; `tbl_pembayaran` (one row per attempt, unique `(order_id, attempt_no)` and unique `(provider, provider_order_id)`); `tbl_notifikasi_pembayaran` (webhook log, unique `(provider, notification_key)`); `set_updated_at` triggers |
| `server/src/lib/payments.js`                            | New. All payment policy as pure functions: status vocabulary, `mapTransactionStatus`, `nextPaymentStatus`, `snapScriptUrl`, `notificationSignature`, `safeEqualHex`, `verifyNotificationSignature`, `notificationFingerprint`, `parseProviderAmount`, `grossAmountMatches`, `providerOrderIdFor`, `enabledPaymentsFor`, `buildSnapPayload`, `attemptUsable`                             |
| `server/src/db/payments.js`                             | New. `createPaymentStore`: `prepareAttempt` (reuse-or-create, locks the order row), `saveSnap`, `failAttempt`, `findLatest`, `applyProviderStatus` (record-once then reconcile)                                                                                                                                                                                                         |
| `server/src/services/midtrans-provider.js`              | New. Thin wrapper over the official SDK (`createTransaction`, `fetchStatus`), maps provider failures to `502 PAYMENT_PROVIDER_ERROR`; `unconfiguredProvider` used when keys are absent                                                                                                                                                                                                  |
| `server/src/services/payments.js`                       | New. Orchestration: `config`, `start`, `sync`, `handleNotification`                                                                                                                                                                                                                                                                                                                     |
| `server/src/validators/payments.js`                     | New. Non-strict `notificationSchema` (`gross_amount` must be text, `signature_key` 128 hex chars)                                                                                                                                                                                                                                                                                       |
| `server/src/controllers/payments.js`                    | New. `config`, `start` (201), `sync` (200), `notification` (200)                                                                                                                                                                                                                                                                                                                        |
| `server/src/routes/payments.js`                         | New. `GET /payments/config`, `POST /payments/midtrans/notification`                                                                                                                                                                                                                                                                                                                     |
| `server/src/__tests__/payment-policy.test.js`           | New. 27 unit tests, including a fixed sha512 signature vector and the forward-only precedence table                                                                                                                                                                                                                                                                                     |
| `server/src/__tests__/payment-validators.test.js`       | New. 7 unit tests                                                                                                                                                                                                                                                                                                                                                                       |
| `server/src/__tests__/payments-api.integration.test.js` | New. 17 integration tests against a fake provider                                                                                                                                                                                                                                                                                                                                       |

### Server (changed)

| File                                                      | Change                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `server/src/config/env.js`                                | `MIDTRANS_*` vars, `withMidtransAliases()` mapping the legacy `MT_*` names, optional so the API boots without credentials |
| `server/src/app.js`                                       | Builds the payment service from env, or takes an injected one; passes it to the router                                    |
| `server/src/routes/index.js`                              | Accepts `paymentService`, mounts `/payments`                                                                              |
| `server/src/routes/orders.js`                             | Adds `POST /orders/:orderNumber/payments` and `.../payments/sync`, both behind `requireAuth`                              |
| `server/src/db/orders.js`                                 | Order reads now carry `paymentMethodId` and `paymentStatus`                                                               |
| `server/src/db/checkout.js`                               | Order insert stores `payment_method_id` (from the already-validated payment choice)                                       |
| `server/src/test/db.js`                                   | `resetDatabase` truncates the two new tables before the rest                                                              |
| `server/src/__tests__/orders-queries.integration.test.js` | Expects the richer order shape                                                                                            |
| `server/package.json`, `package-lock.json`                | `midtrans-client@1.4.3` (root lockfile updated through the workspace)                                                     |
| `server/.env.example`                                     | Midtrans block with placeholders only                                                                                     |

### Client

| File                                                   | Change                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `client/src/services/payments.js`                      | New. `fetchPaymentConfig`, `startPayment`, `syncPayment`                                      |
| `client/src/hooks/usePayments.js`                      | New. Query for the config, mutations for start/sync that invalidate `['orders']`              |
| `client/src/lib/snap.js`                               | New. Runtime `snap.js` injection (`data-client-key`), single-flight loader, `openSnapPayment` |
| `client/src/lib/paymentStatus.js`                      | New. Status labels/tones/descriptions in Bahasa Indonesia, `canPayOrder`                      |
| `client/src/components/payment/PaymentStatusBadge.jsx` | New. One badge used by both pages                                                             |
| `client/src/components/payment/PaymentPanel.jsx`       | New. The payment block: Snap popup, "Perbarui status", written-instruction fallback           |
| `client/src/pages/OrderCompletePage.jsx`               | Static instructions replaced by `PaymentPanel`                                                |
| `client/src/pages/OrderDetailPage.jsx`                 | `PaymentPanel` added, badge shown in the payment summary                                      |
| `client/src/pages/CheckoutPage.jsx`                    | Copy only: payment happens on the Midtrans page after the order exists                        |
| `client/src/lib/shipping.js`                           | `PAYMENT_OPTIONS` instructions rewritten for Midtrans; **ids and labels unchanged**           |

### Docs

| File        | Change                                                                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` | `Payments` stack row, "Payment integration rules (step 05b)", `Payments` convention bullet, Phase 5b roadmap row (the row and the renumber of the backlog to 05c were already in place) |
| `README.md` | Payment rows in the endpoint table, corrected checkout payment bullet, new _Payment endpoints_ section with the error table and local webhook instructions, Midtrans env-var paragraph  |

## Contract

All under `/api/v1`.

| Method | Path                                 | Auth               | Response                                                        |
| ------ | ------------------------------------ | ------------------ | --------------------------------------------------------------- |
| GET    | `/payments/config`                   | none               | `200 { data: { enabled, clientKey, scriptUrl, isProduction } }` |
| POST   | `/orders/:orderNumber/payments`      | session            | `201 { data: { orderNumber, payment, snap } }`                  |
| POST   | `/orders/:orderNumber/payments/sync` | session            | `200 { data: { orderNumber, status, outcome } }`                |
| POST   | `/payments/midtrans/notification`    | provider signature | `200 { data: { received, outcome, applied } }`                  |

`snap` is `{ token, redirectUrl, clientKey, scriptUrl }`. `payment` is
`{ status, canPay, method, attempt: { providerOrderId, attemptNumber, status, expiresAt, paidAt, paymentType } | null }`.

Webhook outcomes: `applied`, `duplicate`, `stale`, `amount_mismatch`, `unknown_order`, `unmapped_status`.
All of them answer `200` on purpose — a non-2xx makes Midtrans retry an event there is nothing left
to do with.

## How to run and verify

```sh
# From the repository root. Docker Desktop must be running for the database.
docker compose up -d db

# 1. Environment. The sandbox keys already present in server/.env are read
#    whichever name they use (MIDTRANS_* or the legacy MT_*).
cp server/.env.example server/.env      # only on a clean checkout; keep real keys

# 2. Schema: applies 009_pembayaran.sql
npm run db:migrate

# 3. Lint, unit tests, integration tests
npm run lint
npm test                                 # 20 files / 317 tests
npm run test:integration                 # 31 files / 535 tests

# 4. Build the client
npm run build

# 5. Run it
npm run dev                              # API on :4000, Vite on :5173
```

Checklist for the reviewer:

- [ ] `npm run db:migrate` applies only `009_pembayaran.sql` on an existing database and reports "1
      migration(s) applied, 8 already up to date". Run it twice and confirm the second run is a no-op.
- [ ] `curl localhost:4000/api/v1/payments/config` returns `enabled: true`, a `clientKey` starting with
      `SB-Mid-client-`, and `isProduction: false`. **The server key must not appear anywhere in the
      response.**
- [ ] Sign in as a seeded customer, place an order, open
      `http://localhost:5173/pesanan/<orderNumber>/selesai`, press **Bayar sekarang**: the Snap sandbox
      popup opens with the order total and only the channel that matches the checkout choice.
- [ ] Close the popup without paying: the page must not claim the order is paid. Press
      **Sudah bayar? Perbarui status** and confirm nothing changes.
- [ ] Pay with a sandbox VA/card: the confirmation page flips to **Lunas** after the popup closes (the
      `sync` call does this without any inbound webhook).
- [ ] `curl -X POST localhost:4000/api/v1/orders/<orderNumber>/payments -b jar.txt` twice in a row
      returns the **same** `snap.token` while the attempt is still payable.
- [ ] `POST /orders/<orderNumber>/payments` for another customer's order answers `404 ORDER_NOT_FOUND`;
      without a session, `401`.
- [ ] A webhook with a bad `signature_key` answers `401 INVALID_PAYMENT_SIGNATURE` and changes nothing
      (`select * from tbl_notifikasi_pembayaran` stays empty for that attempt).
- [ ] Replay a valid webhook body: it answers `200` with `outcome: "duplicate"` and the order does not
      move twice.
- [ ] Temporarily unset `MIDTRANS_SERVER_KEY` and `MT_SERVER_KEY`, restart the API: the server still
      starts, `/payments/config` reports `enabled: false`, and the payment panel falls back to the
      written transfer instructions instead of showing a dead button.
- [ ] `git --no-optional-locks diff server/.env.example` shows placeholders only — no key material.

### Webhook testing without a local secret leak

```sh
# Midtrans must reach the API from the internet.
ngrok http 4000
# Midtrans dashboard > Settings > Configuration > Payment Notification URL:
#   https://<tunnel-host>/api/v1/payments/midtrans/notification
# Then pay in the sandbox popup and watch the API log.
```

Where a tunnel is impossible, the `sync` endpoint exercises the same reconciliation code over an
outbound call, so only the signature check itself stays untested by hand. Do not paste real keys into
a review note or a reviewer prompt.

## Decisions and trade-offs

- **The order comes first, the Snap token second.** Checkout commits without contacting Midtrans;
  `POST /orders/:orderNumber/payments` creates the transaction afterwards, outside the checkout
  transaction. Alternative: create the transaction inside checkout and roll the order back if the
  provider fails. Rejected because a provider outage would then lose the purchase and the stock
  deduction would have to be undone; this way the customer keeps a payable order and a retry button.
  Cost: an order can exist in `pending` payment with no provider transaction yet, which is why
  `prepareAttempt` records the attempt row **before** the call and `failAttempt` marks it `failed` if
  the call throws.
- **One row per attempt.** Midtrans refuses a second transaction with a reused `order_id`, so a retry
  gets `BD-2026-1000-2` while the order number stays stable. Keeping the earlier attempt is also what
  makes support and reconciliation possible. Cost: `tbl_pembayaran` grows with retries rather than
  holding exactly one row per order.
- **`payment_status` is denormalised onto the order.** A history page or an admin list reads one column
  instead of joining the newest attempt. Cost: two rows must be kept in step, so both updates live in
  the same transaction and both use the same `nextPaymentStatus` rule.
- **Forward-only precedence, with one deliberate exception.** `failed`/`expired` → `paid` is allowed
  because money can settle a moment after the expiry we displayed; `paid` → anything but `refunded` is
  refused so a late `pending` cannot rewrite a paid order. Out-of-order notifications are recorded with
  `outcome = 'stale'` rather than dropped, so the evidence survives.
- **The webhook is the only source of truth for "paid".** Snap's `onSuccess`/`onPending` callbacks only
  trigger a `sync`; they never write a status. That also covers the case where the webhook has not
  arrived yet.
- **Idempotency is a stored fingerprint, not a "have we seen this string" check.** A `sha256` over
  `(order_id, transaction_id, transaction_status, status_code, fraud_status, gross_amount, signature)`
  is unique per `(provider, key)`, so a replay is a `no-op` at the database level and two genuinely
  different events keep distinct keys. The signature is part of the input so a forged body cannot
  pre-empt a real event's key.
- **Duplicates, unknown orders, amount mismatches and stale moves answer `200`.** A `4xx`/`5xx` makes
  Midtrans retry an event that will never succeed, which turns a misconfiguration into an endless
  retry loop. Every outcome is recorded in `tbl_notifikasi_pembayaran` with the payment and order ids
  when they could be resolved.
- **`payment_method_id` was added rather than parsed out of the label.** `payment_method` holds the
  Indonesian display label; deriving the provider channel from it would silently remap the checkout
  after a copy change. The migration backfills the three known labels once and leaves anything else
  `NULL` instead of guessing.
- **The client key is served; the server key is not.** Snap needs the client key in the browser and it
  is public by design. The server key only signs outgoing calls and verifies incoming ones, and
  `config()` cannot return it.
- **`sync` exists as a first-class endpoint.** Without it, no developer could verify a payment locally
  (no public URL for the webhook) and a closed popup would leave the screen stuck. It is session-scoped
  and owner-checked, and it reuses `applyProviderStatus`, so there is exactly one reconciliation
  implementation.
- **`gross_amount` is snapshotted on the attempt** and compared with the provider's amount, not with
  the order's current total. If the order were ever repriced, a notification for the older charge would
  still match the charge it was created against.
- **The SDK is wrapped, not used directly.** `midtrans-provider.js` is the only file that imports
  `midtrans-client`, so tests inject a fake, and a provider failure becomes one `502` instead of a raw
  SDK error leaking a stack trace. The deep import
  (`midtrans-client/lib/snap.js`) is used because the package root pulls in the whole SDK.
- **Credentials are optional.** Every `MIDTRANS_*` var is optional and the whole feature degrades to
  `503 PAYMENT_NOT_CONFIGURED` with a written-instruction fallback in the UI. A developer can run the
  shop before the keys exist, and `npm test` never needs them.
- **Legacy `MT_*` aliases are accepted.** The keys already in `server/.env` use those names and
  `MIDTRANS_*` stays the documented name; `withMidtransAliases` prefers the documented value when both
  are present.

## Not done / deferred

- **No admin UI for payment state.** The admin order payload now carries `paymentStatus`, but the
  admin order list/detail screens still show only the fulfilment status. Belongs to the Phase 5c
  backlog or a later step; the step's goal was the customer-facing payment flow.
- **No refund action.** `mapTransactionStatus` recognises `refund`/`partial_refund` and the store
  accepts `refunded`, so an operator-triggered refund can be added without a migration, but there is no
  endpoint that calls Midtrans' refund API.
- **No sandbox end-to-end run inside an automated test.** The integration suite uses a fake provider;
  the real sandbox popup needs a browser and real credentials (see _Open questions_).
- **No request timeout on the provider call.** `midtrans-client` uses `axios` with no timeout set, so a
  hung provider request hangs the HTTP request. Deferred to step 06 (security/hardening sweep).
- **The payment block is not shown on the order-history list.** Only the confirmation page and the
  order detail page render `PaymentPanel`; the list shows the fulfilment status as before.

## Out of scope / noticed

- **Stock is decremented at checkout and never restored** when a payment fails or expires. This is the
  behaviour from 04g (whose review already records it), and changing it is a product decision about
  cancellation and restocking, not a payment-integration detail. Raised as an open question below.
- **Seeded demo orders were never stock-deducted** (carried over from 04i q5). Unrelated to payments,
  still open.
- **`AGENTS.md` assumption 5 in `00-development-plan.md`** ("no real payment gateway") is superseded by
  Phase 5b. The plan note is left as written; this note is the record.
- **`npm run format:check` fails repo-wide** (pre-existing). `README.md` was formatted with Prettier
  because this step touched it; nothing else was reformatted.
- **The Vite bundle still has the pre-existing >500 kB chunk warning.** Code splitting is step 09.
- **`applyProviderStatus` calls `mapTransactionStatus` with a third `statusCode` argument it ignores.**
  Harmless, but a reviewer may prefer it removed.

## Open questions for the reviewer

1. **Should a failed or expired payment cancel the order and restore stock?** Today the order stays
   `processing` with `payment_status = expired`, and the stock stays deducted. The alternative is an
   automatic cancellation with a stock restore, which changes what "cancelled" means for the admin API
   and for orders that are never paid at all. This is a product decision — escalate to the team rather
   than deciding it here.
2. **Is `unpaid` → `pending` on `prepareAttempt` (before the provider has answered) acceptable?** The
   attempt row is inserted and the order marked `pending` before Snap is called, so a provider outage
   leaves the order `failed` after `failAttempt`, not `unpaid`. The alternative is to mark the order
   `pending` only after the token exists, at the cost of a second write and a window where an attempt
   exists but the order says `unpaid`. Current behaviour was chosen so the order never claims `unpaid`
   while a payable transaction may exist.
3. **Do we want a webhook retry/replay endpoint, or is `sync` enough?** `sync` reconciles a single
   order on demand. If a webhook is lost and the customer never returns, the order stays `pending`
   until an operator notices. A scheduled sweep that syncs open attempts would close that gap; it was
   not in the step's scope.
4. **Should the admin screens surface `paymentStatus` now?** It is already in the payload. Adding it is
   small, but it touches Phase 3b screens that were approved in their own steps, so it was left out of
   this one.
5. **Card 3DS cannot be verified without a real sandbox account.** The `kartu` channel sets
   `credit_card: { secure: true }`, and the policy tests cover the mapping, but the 3DS challenge
   itself needs a browser run against the sandbox with the team's own keys. The reviewer should record
   it as unverified rather than assume it works.

## Reviewer feedback

### Verdict

**Changes requested.** The server-authoritative pricing, ownership checks, signature verification, replay handling, and fake-provider QRIS tests are useful foundations, and the full automated suite passes. However, two reproduced cross-request defects can create multiple payable transactions for one order and leave the order's payment state contradictory. There are also unhandled failure/locking paths and misleading failed-QRIS UI states. Real Midtrans sandbox and card 3DS behaviour remains unverified.

### Independent verification

- `docker compose up -d db` could not recreate the already-running, healthy `ba_dekor-db` container because Docker reported a name conflict. The existing database was usable, so the remaining database checks were run against it.
- `npm run db:migrate` was run twice. Both runs reported `0 migration(s) applied, 10 already up to date`; the second run was a no-op. The historical first application of 009 with only eight earlier migrations could not be reproduced on this current database.
- `npm run db:seed` completed successfully.
- `npm run lint` passed.
- `npm test` passed: **20 files / 320 tests**.
- `npm run test:integration` passed: **31 files / 541 tests** against PostgreSQL, including the fake-provider signature, replay, amount-mismatch, unknown-order, late-pending, QRIS pending/settlement, and expiry cases.
- `npm run build` passed. The existing large-chunk warning remains; the main JavaScript chunk is now **560.17 kB**.
- `git --no-optional-locks diff -- server/.env.example` contained placeholders and URLs only; no key material was added. `git diff --check` reported no whitespace errors (only line-ending warnings).
- Live `GET /api/v1/payments/config` returned `200`, `enabled: true`, `isProduction: false`, and only `clientKey`, `enabled`, `isProduction`, and `scriptUrl`; no server-key field was exposed. The configured client key did **not** satisfy the checklist's `SB-Mid-client-` prefix check, so it could not be treated as verified sandbox credentials.
- The real Snap popup, real `generate_qr_code` status response, successful/pending/expired sandbox payments, and card 3DS were therefore **not verified**. Fake-provider integration tests do not establish those provider behaviours. No inbound ngrok/Midtrans webhook run was performed.

### Reproduced defects

A temporary reviewer probe used the isolated `_test` database and a deliberately delayed fake provider; its fixtures were truncated afterwards and the probe was removed.

1. **Concurrent starts create two payable attempts.** Two overlapping `POST /orders/:orderNumber/payments` requests both returned `201`, called the provider twice, and returned different tokens for provider order ids `<order>` and `<order>-2`. Both attempts ended as `pending` with tokens. This violates the claimed per-order idempotency and permits two active payment routes for the same order.
2. **An old attempt can overwrite the current order state.** After the two attempts above, a correctly signed `expire` notification for attempt 1 returned `outcome: "applied"`. The order detail then reported `paymentStatus: "expired"`, while attempt 2 remained `pending` and `GET /orders/:orderNumber/payments` reported `pending`. The same store path also permits an older failure to overwrite a newer pending state.

### Required changes

1. **Make payment-start idempotent under concurrency, not only sequentially.** `prepareAttempt` commits a tokenless pending row before `provider.createTransaction` resolves; a concurrent request rejects that row through `attemptUsable` and creates another provider order (`server/src/services/payments.js:131-171`, `server/src/db/payments.js:124-154`, `server/src/lib/payments.js:308-312`). Add a concurrency regression test and ensure overlapping starts cannot leave multiple independently payable transactions for one order.
2. **Reconcile attempts without letting an older non-paid terminal event replace a newer payable state.** `applyProviderStatus` updates the order from whichever attempt the notification names (`server/src/db/payments.js:344-424`). Record late events on their own attempts, but derive/update the order consistently with the other attempts; a genuine settlement must still be able to make the order paid. Add cross-attempt tests for late expiry/failure and late settlement after a retry, and assert that order detail and payment state agree.
3. **Use one lock order and cover every pre-token failure.** `applyProviderStatus` locks order then payment, while `failAttempt` updates payment then order (`server/src/db/payments.js:187-204,368-379`), creating a deadlock risk. Also, `buildSnapPayload` runs outside the provider-call `try/catch` (`server/src/services/payments.js:146-162`), so an unsupported legacy method or item/total mismatch leaves a tokenless pending attempt and allows unlimited failed retries to accumulate. Align lock ordering and ensure these failures cannot strand a reusable-looking pending order/attempt; add failure and concurrency coverage.
4. **Define terminal precedence consistently.** `nextPaymentStatus` currently permits `failed ↔ expired`, despite the forward-only policy (`server/src/lib/payments.js:65-73`). A late deny/cancel can therefore rewrite an expired attempt, and vice versa. Preserve the intended terminal reason while retaining the documented late-settlement exception, and pin both combinations in unit and HTTP tests.
5. **Correct failed-payment and failed-QRIS rendering.** A failed start updates server state but mutations invalidate queries only on success (`client/src/hooks/usePayments.js:45-53`), leaving the visible order stale until reload. `QrisPanel` also renders a stored QR and its active countdown for a failed/cancelled attempt and still says the status is waiting (`client/src/components/payment/PaymentPanel.jsx:184-192`, `client/src/components/payment/QrisPanel.jsx:24-28,49-93`). Refresh the authoritative state after failures and do not present a terminal attempt's old QR as payable. The QRIS refresh button is also shown before any attempt exists, while `finish()` silently discards its `PAYMENT_NOT_FOUND` or provider/network error; expose an honest result or disable/hide the action when there is nothing to sync.
6. **Complete the required sandbox verification before approval.** With valid team sandbox credentials, verify the selected-channel Snap flow, same-token sequential reuse, close-without-payment, signed settlement/replay, QRIS code plus expiry after sync and reload, successful/pending/expired QRIS, and card 3DS. Record evidence without credentials or tokens. If valid sandbox access is unavailable, these checks must remain explicitly unverified and the note cannot be approved under `AGENTS.md`'s evidence rule.

### Open-question dispositions

1. **Cancellation/restocking after failure or expiry:** escalate to the product team; the reviewer does not decide this policy. It is not silently approved as a permanent rule.
2. **`unpaid → pending` before the provider response:** acceptable only if every failure path is reconciled honestly; required change 3 currently blocks that guarantee.
3. **Scheduled reconciliation:** on-demand owner-scoped `sync` is a reasonable step-scoped mechanism; a scheduled sweep remains an operational backlog/team decision.
4. **Admin payment display:** acceptable to defer to the separate admin/backlog work; the payload already carries the state.
5. **Card 3DS:** unverified; no passing claim is made from channel-mapping tests.
6. **Read versus sync split:** reasonable. A read-only owner-scoped `GET` plus explicit provider reconciliation avoids a provider call on every render.
7. **Real `generate_qr_code` response:** unverified; only the fixture mapping and HTTPS URL filtering were verified.
8. **Server-side expiry sweep:** leave as a team/backlog decision, together with question 3; the local countdown is not treated as authoritative.

<!-- If changes are requested, append "## Revision 1", "## Revision 2", ... below, in this same file. -->

---

# Revision 1 — QRIS as a checkout method

The Phase 5b goal in `AGENTS.md` makes **QRIS a required payment method**: a transaction-specific
QR code with instructions and an expiry, an order that stays pending until a verified notification
settles it, and sandbox coverage of the successful, pending and expired cases. The first pass shipped
Snap with three channels and no QRIS at all, and neither `AGENTS.md` nor `README.md` mentioned it. This
revision adds the channel end to end, exposes the dynamic code and its deadline to the pages that
render the payment block, and documents the flow.

## What changed

### Server

| File                                                                           | Change                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/db/migrations/010_qris.sql`                                            | New. Widens the `payment_method_id` CHECK with `qris`, and adds `tbl_pembayaran.qr_code_url TEXT` for the transaction-specific QR image. Forward-only; `009_pembayaran.sql` is untouched                               |
| `server/src/lib/checkout.js`                                                   | `PAYMENT_METHODS` gains `qris` → `QRIS` (a brand name, so it is not translated). Because the checkout validator derives its allowlist from this table, the API accepts the new id with no validator change             |
| `server/src/lib/payments.js`                                                   | `enabledPaymentsFor('qris')` → `['other_qris']`; new pure `qrCodeUrl(actions)` that picks the `generate_qr_code` action and accepts only an `https:` URL, so the value is safe as an `<img src>`                       |
| `server/src/db/payments.js`                                                    | `qr_code_url` added to the attempt columns and mapper; new `findState` (owned order plus a nullable newest attempt, read-only); new `saveAttemptFacts` (QR url and channel, only while the attempt is still `pending`) |
| `server/src/services/payments.js`                                              | New `state(userId, orderNumber)`; `sync` stores the QR image and channel from the provider answer; the attempt view carries `qrCodeUrl`                                                                                |
| `server/src/controllers/payments.js`                                           | New `state` handler (200)                                                                                                                                                                                              |
| `server/src/routes/orders.js`                                                  | New `GET /orders/:orderNumber/payments`, behind `requireAuth`, next to the two writes                                                                                                                                  |
| `server/src/__tests__/payment-policy.test.js`                                  | +3 unit tests: the QRIS channel map, the QRIS Snap payload (no `credit_card`, `other_qris` only), and `qrCodeUrl` accepting/rejecting URLs                                                                             |
| `server/src/__tests__/payments-api.integration.test.js`                        | +6 integration tests: three for the new `GET`, and three QRIS flows — Snap on the QRIS channel only, pending that stays pending until a signed settlement, and expiry that still offers a retry                        |
| `server/src/__tests__/checkout-policy.test.js`, `checkout.integration.test.js` | The pinned method list and the shipping/payment matrix include `qris` → `QRIS`                                                                                                                                         |

### Client

| File                                                    | Change                                                                                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client/src/lib/shipping.js`                            | `qris` option with its Indonesian label, detail line and three payment steps                                                                                                                                       |
| `client/src/lib/format.js`                              | `formatTime` (hour/minute) for the deadline                                                                                                                                                                        |
| `client/src/lib/paymentStatus.js`                       | `paymentExpiry` (known/expired/minutes/seconds) and `formatRemaining`; both are display-only                                                                                                                       |
| `client/src/services/payments.js`                       | `fetchPaymentState`                                                                                                                                                                                                |
| `client/src/hooks/usePayments.js`                       | `usePaymentState` query; start/sync now also invalidate `['payments', 'state']`, because a sync can reveal a QR or a deadline                                                                                      |
| `client/src/components/payment/QrisPanel.jsx`           | New. The dynamic code, the deadline with a one-second countdown, the written steps, and a refresh action                                                                                                           |
| `client/src/components/payment/PaymentInstructions.jsx` | New. The numbered instruction list, extracted so the QRIS block and the no-credentials fallback cannot drift apart                                                                                                 |
| `client/src/components/payment/PaymentPanel.jsx`        | Renders `QrisPanel` for a QRIS order; reconciles with `sync` when the Snap popup closes (that is when the code becomes known); separate `busy`/`refreshing` flags so a sync no longer looks like opening a payment |

### Docs

| File        | Change                                                                                                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md` | `qris` added to the order-endpoint method list; new API-table row for `GET /orders/:orderNumber/payments`; five QRIS bullets under _Payment endpoints_ (channel, stored code, “scanning is not paying”, https-only URL); a `curl` example; a sandbox QRIS paragraph under _Testing the webhook locally_ |

## Decisions taken

1. **QRIS is its own checkout choice mapped to one Snap channel.** `qris` → `other_qris`, mirroring how
   `bca` maps to `bca_va`. The alternative — enabling QRIS inside a general Snap screen — was rejected:
   the order would stop recording what the customer chose, and `payment_method_id` exists precisely so
   the provider channel is never guessed from display text.
2. **The code is stored, not regenerated.** `tbl_pembayaran.qr_code_url` is filled from the provider's
   `generate_qr_code` action, so a reload redraws the same code instead of opening a second provider
   transaction. Only `https:` URLs are accepted, because the value is used as an image source.
3. **The QR facts are written outside `applyProviderStatus`.** A QRIS answer that keeps an attempt
   pending is `stale` by design (nothing moved), yet that is exactly the answer carrying the code. So
   `saveAttemptFacts` writes the code and the channel in its own statement, guarded by
   `status = 'pending'` and using `COALESCE` so a later answer never blanks a known fact. Folding this
   into the status update would have turned a display detail into a state transition.
4. **A new read endpoint instead of a payment block on the order payload.** `GET
/orders/:orderNumber/payments` is owner-checked like the writes, keeps the order response shape (and
   its 04g invariants) untouched, and never contacts the provider — so the page may call it on every
   visit. `sync` stays an explicit action.
5. **The countdown is decoration; the status is evidence.** Scanning the code, the Snap success page
   and the on-screen timer prove nothing. The order only moves on a signature-checked notification or a
   `sync`, and the panel says so in plain Indonesian.
6. **`PaymentInstructions` was extracted.** The same numbered list now renders in two places (QRIS block
   and the no-credentials fallback), so it follows the three-or-more/duplication rule rather than
   keeping a copy in each.

## How to run and verify (QRIS)

```sh
# Same prerequisites as the step above
docker compose up -d db
npm run db:migrate        # applies 010_qris.sql on a database that already has 009
npm run db:seed
npm run dev               # API :4000, client :5173

npm test                  # 20 files / 320 tests
npm run test:integration  # 31 files / 541 tests
npm run lint              # clean
npm run build             # ok; only the pre-existing >500 kB chunk warning
```

- [x] `npm run db:migrate` applied `010_qris.sql` to the development database; the test database
      applied it on the first integration run and reports `0 migration(s) applied` afterwards
- [x] `npm test` — 320 unit tests pass, including the three new payment-policy tests
- [x] `npm run test:integration` — 541 tests pass across 31 files, including the six new payment tests
- [x] `npm run lint` and `npm run build` are clean
- [ ] Reviewer: check out with `paymentMethod: "qris"`, then open the order page. Press _Bayar
      sekarang_; after the Snap window closes the panel should show the QR image, the expiry clock and
      the steps. Reload: the same code is redrawn from `GET /orders/:orderNumber/payments`
- [ ] Reviewer: `curl localhost:4000/api/v1/orders/<number>/payments -b jar.txt` returns
      `payment.attempt.qrCodeUrl` and `payment.attempt.expiresAt` once a `sync` has seen a pending
      QRIS answer, and `attempt: null` for an order with no attempt
- [ ] Reviewer: a QRIS order stays `pending` after a simulated scan; only a signed settlement moves it
      to `paid`, and an expiry moves it to `expired` while the page still offers a retry

## Verification notes

- The stored-code path is covered without a browser: the integration test mocks a `pending` provider
  answer with a `generate_qr_code` action, syncs, and then asserts both the `GET` payload and the
  `qr_code_url` column.
- The test that first failed did so for a real reason — a `pending` answer stores no `payment_type`
  because the status did not move — which is what led to `saveAttemptFacts` instead of widening
  `applyProviderStatus`.

## Not done / deferred (this revision)

- **No polling while a QRIS attempt is open.** The page reconciles when the popup closes, when the
  customer presses _Perbarui status_, and on a fresh load. A timer-based refresh would be nicer; it is
  a small change but it belongs with the UX pass (step 08) rather than here.
- **No in-app QR rendering fallback.** If the provider never sends a `generate_qr_code` action, the
  panel says the code is in the Midtrans window instead of drawing one. Generating a QR from a raw
  string locally would add a dependency and could disagree with the provider.
- **The QR image is not proxied.** It is loaded from Midtrans' host directly, so the customer's browser
  talks to the provider — the same trust relationship the Snap popup already needs.

## Open questions for the reviewer (this revision)

6. **Is the split between `GET /orders/:orderNumber/payments` and `sync` right?** The read endpoint
   never calls the provider, so it can be cheap; a reviewer might prefer the page to reconcile
   automatically on load, at the cost of one outbound call per visit.
7. **`generate_qr_code` inside the status response needs a real sandbox confirmation.** The mapping is
   tested against a fixture and the code degrades honestly when the action is absent, but the field is
   only certain after one run with the team's keys. Please record it as unverified if that run cannot
   happen.
8. **Should the expiry be enforced server-side by a sweep?** An attempt whose provider never notifies
   stays `pending` until someone syncs. This is the same gap as open question 3 and is still a product
   decision.
