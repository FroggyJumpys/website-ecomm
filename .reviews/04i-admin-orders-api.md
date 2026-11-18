# 04i – Admin orders API

- **Status:** Awaiting review <!-- Awaiting review | Changes requested | Approved -->
- **Phase:** 4b – Admin API
- **Date:** 2026-11-18
- **Author:** agent
- **Reviewer:** _unassigned_

## Summary

Adds the staff-only order API that the panel toko will consume in step 05: every customer's orders
in one paginated, searchable list, one order plus its owner across customers, and the status change
that writes the timeline the customer already reads. Backend only — no admin screen, frontend
service, mock or client test was changed.

Two properties drove the design. Status changes are **forward-only**, with `completed` and
`cancelled` terminal, which is what makes the cancellation **stock restore** run at most once even
when two operators click at the same time. And the response reuses the customer order shape plus
`customer`, so the operator and the buyer cannot disagree about what an order contains.

## Files added / changed

### Added

| File                                                        | Change                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `server/src/lib/orderTransitions.js`                        | Transition table, `canTransition`, `allowedTransitions`, `ORDER_STATUSES`, the default cancellation reason.    |
| `server/src/validators/admin-orders.js`                     | List query and status-body schemas; strict body, literal search, optional tracking number.                     |
| `server/src/db/admin-orders.js`                             | `createAdminOrderStore`: list/detail across customers, status transition under the order-row lock, restock.    |
| `server/src/services/admin-orders.js`                       | `createAdminOrderService`: binds the store to the pool.                                                        |
| `server/src/controllers/admin-orders.js`                    | HTTP layer: envelopes, query/body/param validation, `200` responses.                                           |
| `server/src/__tests__/admin-orders-policy.test.js`          | 17 units: transition matrix, list query contract, status body contract.                                        |
| `server/src/__tests__/admin-orders-api.integration.test.js` | 20 HTTP tests: gate, list/search/paging/counts, detail, transitions, restock, concurrency, cross-site refusal. |

### Changed

| File                             | Change                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `server/src/routes/admin.js`     | Mounts `/admin/orders`, `/admin/orders/:orderNumber`, `/admin/orders/:orderNumber/status`.             |
| `server/src/db/orders.js`        | Exports `ORDER_COLUMNS`, `toOrder` and `loadChildren` so the admin store renders the same order shape. |
| `server/src/validators/admin.js` | Exports the three single-value query helpers reused by the order list schema.                          |
| `README.md`                      | API table rows, `### Admin order endpoints`, extra step-05 compatibility notes.                        |

No migration and no dependency change: tracking, cancellation reason and the status timeline already
exist from 04a/04g.

## API contract

All routes under `/api/v1`. Errors are `{ error: { code, message, details? } }`.

| Method | Route                               | Success              | Notable failures                                                                  |
| ------ | ----------------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| GET    | `/admin/orders`                     | `200 { data, meta }` | `401`, `403`, `422 VALIDATION_ERROR`                                              |
| GET    | `/admin/orders/:orderNumber`        | `200 { data }`       | `401`, `403`, `404 ORDER_NOT_FOUND`, `422`                                        |
| PATCH  | `/admin/orders/:orderNumber/status` | `200 { data }`       | `401`, `403`, `404`, `409 ORDER_STATUS_CONFLICT`, `422`, `403 CROSS_SITE_REQUEST` |

`GET /admin/orders` takes `page` (default 1), `limit` (default 20, max 100), `status`
(`all` by default, else one of the four) and `search`. Search matches the order number, the
customer's name or the customer's email as a literal substring: `%`, `_` and `\` are escaped, so a
search box cannot become a wildcard query. Repeated parameters are rejected rather than collapsed.

`meta` is `{ page, limit, total, totalPages, statusCounts }`. `total` is the filtered count;
`statusCounts` covers **everything the search matches** but ignores the selected status, the same
rule the customer history chips follow.

The order shape is the customer order shape — `orderNumber`, `createdAt`, `status`,
`items[...]`, money, shipping address, payment, `trackingNumber`, `cancellationReason`,
`timeline[...]` — plus `customer: { id, name, email, phone }`. The owner always exists because
`tbl_pesanan.user_id` is `ON DELETE RESTRICT`.

`PATCH .../status` takes a strict body: `{ "status": "shipped", "trackingNumber": "JNE-…" }`. The
tracking number is optional, 1–64 characters, and `""` or `null` clears it. Any other field is a
`422`.

## Status transitions

| From         | Allowed next states      |
| ------------ | ------------------------ |
| `processing` | `shipped`, `cancelled`   |
| `shipped`    | `completed`, `cancelled` |
| `completed`  | — (terminal)             |
| `cancelled`  | — (terminal)             |

- Same status again is a `200` no-op with no second timeline entry, so a retry after a lost
  response is safe.
- An illegal move is `409 ORDER_STATUS_CONFLICT` with
  `details: { from, to, allowed }`.
- Cancelling restores every line to stock once and sets `cancellationReason` to
  "Pesanan dibatalkan oleh admin toko." when the order had no reason. The order row is locked with
  `SELECT … FOR UPDATE` before its status is read, so a concurrent duplicate waits, then sees
  `cancelled` and returns the order without a second restock.
- Restock groups lines per product and updates products in id order, matching the order checkout
  locks them in. A line whose product was deleted has `product_id = NULL` and is skipped.
- Every real status change appends a `tbl_riwayat_status_pesanan` row, the timeline the customer
  sees at `/akun/pesanan/:orderNumber`.

## How to run and verify

```sh
docker compose up -d db
npm install
npm run db:migrate
npm run db:seed
npm run dev              # API on http://localhost:4000, client on http://localhost:5173
npm run lint
npm test
npm run test:integration
```

The review is backend-only; the admin screens still read the mocks until step 05.

```sh
curl -c admin.txt -X POST localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@badekor.id","password":"rahasia123"}'

curl 'localhost:4000/api/v1/admin/orders?status=processing&page=1&limit=20' -b admin.txt
curl 'localhost:4000/api/v1/admin/orders?search=sari' -b admin.txt
curl localhost:4000/api/v1/admin/orders/BD-2026-0417 -b admin.txt

# 200: status + timeline event; the customer sees the same status
curl -X PATCH localhost:4000/api/v1/admin/orders/BD-2026-0417/status -b admin.txt \
  -H 'Content-Type: application/json' \
  -d '{"status":"shipped","trackingNumber":"JNE-8821-4410"}'

# 409 ORDER_STATUS_CONFLICT with details { from, to, allowed }
curl -X PATCH localhost:4000/api/v1/admin/orders/BD-2026-0417/status -b admin.txt \
  -H 'Content-Type: application/json' -d '{"status":"processing"}'

curl localhost:4000/api/v1/users/me/orders/BD-2026-0417 -b sari.txt   # after signing in as Sari
```

Checklist the reviewer can tick:

- [x] `npm run lint` passes.
- [x] `npm test` passes — 18 unit files, 283 tests.
- [x] `npm run test:integration` passes — 30 integration files, 518 tests.
- [x] `GET /admin/orders` returns every customer's orders newest first with `customer`, items and timeline, and the documented `meta`.
- [x] `status`, `search`, `page` and `limit` filter/paginate; chips count the search but not the selected status.
- [x] `%` and `_` in `search` are literal; repeated or invalid parameters are `422` with `details.field`.
- [x] A customer's own order is readable by an admin; unknown and malformed numbers are `404`/`422`.
- [x] `processing → shipped` appends one timeline event and the owner sees the new status.
- [x] A same-status retry adds no event; an illegal move is `409` with `from`, `to` and `allowed`.
- [x] Cancelling restocks each product once, records the reason, and a concurrent duplicate does not restock again.
- [x] A line whose product was deleted is skipped instead of failing the cancellation.
- [x] Set and clear a tracking number; clearing does not append a timeline event.
- [x] Guest `401`, customer `403`, cross-site write `403` on all three routes.
- [x] The response of a status change is the refreshed order, so the panel needs no second read.

## Live verification

Run against the disposable `_test` database (seeded with the demo data, then exercised over a real
listening HTTP server with the session cookie):

```text
health: HTTP 200
admin login: HTTP 200 — admin@badekor.id (admin)
GET /admin/orders?limit=2: HTTP 200 — total 4; first BD-2026-0417 for Sari Wulandari;
  counts {"all":4,"processing":1,"shipped":1,"completed":1,"cancelled":1}
GET /admin/orders/BD-2026-0417: HTTP 200 — status processing; customer sari@badekor.id;
  items 2; timeline 1
PATCH status shipped: HTTP 200 — status shipped; tracking JNE-LIVE-0001;
  timeline processing -> shipped
PATCH backward (shipped -> processing): HTTP 409 —
  ORDER_STATUS_CONFLICT {"from":"shipped","to":"processing","allowed":["completed","cancelled"]}
customer history for BD-2026-0417: HTTP 200 — customer sees shipped
```

The live run mutated `BD-2026-0417` in the `_test` database only; the development database was not
seeded or changed by it.

## Decisions and trade-offs

- **Reuse the customer order shape.** `ORDER_COLUMNS`, `toOrder` and `loadChildren` were exported
  from `db/orders.js` rather than copied. The admin list therefore carries items and timeline like
  the mock's `listAllOrders` did, which lets step 05 swap the module without changing the screens.
  Cost: two extra statements per page; a leaner summary endpoint is a step-09 performance decision.
- **Forward-only transitions, terminal `completed`/`cancelled`.** This is the invariant that makes
  the cancellation restock exactly-once. A backend that allowed any target would need a re-deduct
  path for reopening, which can fail on low stock and would undo the guarantee.
- **The order row is the lock.** Status changes use `SELECT … FOR UPDATE`; the second writer reads
  the first writer's committed status and either no-ops (same status) or gets `409`. No status
  version column is needed.
- **Cancellation records the reason, not the operator.** The body cannot set `cancellationReason`;
  the fixed default is user-facing Bahasa Indonesia and is documented. A custom reason/audit trail
  needs a column and is listed as an open question.
- **Tracking travels with the status request.** It is the same operator action ("this order left the
  workshop") and avoids a second endpoint; omitting the field leaves the number alone.
- **`statusCounts` follows search, not status.** A chip must stay true while the list is filtered,
  matching the customer history contract from 04g. `total` is the filtered count.
- **The list is owner-joined, not owner-scoped.** `required` role gates replace the customer
  `user_id` filter. The owner join is inner because orders cannot outlive their account.
- **No migration.** Everything needed (`tracking_number`, `cancellation_reason`, the status history
  table and its indexes) was already in the 04a/04g schema.

## Not done / deferred

- **Admin screens and `client/src/services/admin.js`** — step 05. The mock currently filters a
  fully-loaded list and offers all four statuses; the panel must move to server `page`/`limit`/
  `status`/`search`, use `meta.statusCounts`, and stop offering illegal transitions.
- **Refund or payment reversal on cancellation** — cancellation only restores stock. Real money
  movement is out of scope for this project.
- **Email/WhatsApp notification on status change** — out of scope.
- **An audit trail of which admin changed a status** — no column exists; listed as an open question.
- **Admin order tests in the frontend** — step 07.
- **Review status of 04b–04h** — unchanged. No earlier review note was edited or marked approved.

## Out of scope / noticed

- **Seeded orders were never deducted from stock.** The demo orders in `db/seeds` are historical
  inserts, not checkouts, so cancelling one through this API adds stock that was never taken. Tests
  create their own rows and assert the arithmetic; this only affects the dev seed. Fixing it means
  changing seed data (an earlier step's artefact) or marking seeded orders as "not restockable", so
  it was left untouched and is an open question.
- `npm run format:check` still fails repo-wide (pre-existing). Prettier was run only on the files
  this step touched; they pass.
- Malformed JSON still returns `500` instead of `400` (the global error-handler behaviour noted in
  04d/04h). Untouched.
- The local database container was already on host port `5433` rather than the documented `5432`;
  this did not require any code change.
- `npm audit --workspace server` was not re-run because no dependency changed.

## Open questions for the reviewer

1. Is cancelling a **shipped** order right? The table allows `shipped → cancelled`; some shops only
   cancel before dispatch. Restricting it is a one-line change in `lib/orderTransitions.js`.
2. Should a mistaken status be correctable (for example `shipped → processing`)? Today it is a
   `409`; correction would need a transition plus either a stock re-deduct or an explicit
   "correction" flag.
3. Should moving to `shipped` **require** a tracking number? Today it is optional, so a shipped
   order can have none. The seeded shipped orders do carry one.
4. Should cancelling ask the operator for a reason instead of using the fixed default? The body is
   strict today, so `cancellationReason` is a `422` until this is decided.
5. Is the demonstration-data restock behaviour acceptable (cancelling a seeded order inflates
   stock), or should 04a's seed be revised so demo orders are marked as never deducted?
6. Should the list carry full items and timeline, or should step 05/09 introduce a lean summary
   shape for the list and keep the full shape for detail?

## Reviewer feedback

_To be filled in by the reviewer._
