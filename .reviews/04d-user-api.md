# 04d – User API

- **Status:** Awaiting review
- **Phase:** 4 – Backend
- **Date:** 2026-05-20
- **Author:** agent
- **Reviewer:** _unassigned_

## Summary

The signed-in customer's own account: profile edits, password change and full shipping-address
CRUD, all behind `requireAuth` and all scoped to `req.user.id`. Payloads match
`client/src/services/account.js`, so step 05 stays a switch of `USE_MOCKS`.

The interesting work is in the address defaults: the database allows at most one default per
customer, so every mutation runs inside a transaction that locks the owner's account row. Without
that lock two simultaneous "first address" creates would race and one would fail with a raw
constraint error. A test proves the lock is what prevents it.

## Files added / changed

| File | Change |
| ---- | ------ |
| `server/src/validators/user.js` | `profilePatchSchema`, `passwordChangeSchema`, `addressSchema`, `addressIdSchema` |
| `server/src/validators/auth.js` | Field rules extracted into a shared `fields` export so both schemas use one definition |
| `server/src/db/users.js` | `updateUser` (allowlisted columns) and `updatePasswordHash`; unique-email violation mapped to `EMAIL_TAKEN` |
| `server/src/db/addresses.js` | Address SQL plus the locked transaction that keeps one default; `toAddress` row mapper |
| `server/src/services/user.js` | `updateProfile`, `changePassword` (bcrypt verify + re-hash) |
| `server/src/services/addresses.js` | Binds the address store to the app's pool |
| `server/src/controllers/user.js` | `patchProfile`, `postPassword` |
| `server/src/controllers/addresses.js` | List/create/update/delete/set-default handlers |
| `server/src/routes/users.js` | `/users` router: `requireAuth` for everything, per-account password limiter |
| `server/src/routes/index.js`, `server/src/app.js` | Mount the router; password-rate-limit parameters |
| `server/src/config/db.js` | `createWithTransaction(pool)`; the existing `withTransaction` now delegates to it |
| `server/src/lib/validation.js` | Added `parseParams` for route ids |
| `server/src/__tests__/user-validators.test.js` | 31 unit tests |
| `server/src/__tests__/user-service.integration.test.js` | 13 tests for profile and password persistence |
| `server/src/__tests__/addresses.integration.test.js` | 21 tests for address ownership, defaults and concurrency |
| `server/src/__tests__/user-api.integration.test.js` | 22 HTTP tests |
| `README.md` | Account endpoints, transactional default behaviour, example `curl` calls |

## How to run and verify

```sh
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

```sh
npm test                  # 87 unit tests
npm run test:integration  # 143 integration tests
npm run lint
```

Sign in as `sari@badekor.id` / `rahasia123`, then tick:

- [ ] `PATCH /api/v1/users/me` with `{"name":"Sari W."}` returns `200` and `/auth/me` shows the new name
- [ ] Patching with another account's email returns `409 EMAIL_TAKEN` with `details.field = "email"`
- [ ] Patching with `{}` returns `422`, and `role: "admin"` in the body does not change the role
- [ ] `POST /api/v1/users/me/password` with the right current password returns `200`, the session still works, the new password signs in and the old one returns `401`
- [ ] A wrong current password returns `400 INVALID_PASSWORD`; reusing the current one returns `400 SAME_PASSWORD`
- [ ] Six rapid password attempts return `429 TOO_MANY_ATTEMPTS`
- [ ] `GET /api/v1/users/me/addresses` returns Sari's two seeded addresses, default first
- [ ] Creating the first address on a fresh account makes it the default even with `isDefault: false`
- [ ] Creating a second address with `isDefault: true` leaves exactly one default
- [ ] Deleting the default promotes the oldest remaining address
- [ ] Another customer's address id returns `404 ADDRESS_NOT_FOUND` for PATCH, DELETE and `/default`, and their row is unchanged
- [ ] `/users/me/addresses/abc` returns `422` with `details.field = "id"`, without a database error
- [ ] Every `/users/*` route returns `401` without the cookie
- [ ] `GET /api/v1/products` and `/api/v1/health` still work unauthenticated

## Decisions and trade-offs

- **Ownership always comes from the session.** No route accepts a user id, and every address
  statement carries `user_id = $n` in its `WHERE`. Another customer's id is indistinguishable from a
  missing one — 404, not 403 — so address ids cannot be enumerated.
- **Address mutations lock the owner's account row.** The schema has a partial unique index on
  `(user_id) WHERE is_default`, so two concurrent "make this default" requests would otherwise make
  one fail with a raw `23505`. `SELECT … FOR UPDATE` on `tbl_pengguna` serialises them. I proved the
  test catches the regression by removing the lock and watching
  `keeps exactly one default when two simultaneous creates both ask for it` fail.
- **The first address is always the default.** Matches the mock and the checkout page, which picks
  the default address. A second address only becomes default if it asks to.
- **Deleting the default promotes the oldest remaining address**, so checkout never finds an account
  with addresses but no default. The mock did the same.
- **Clearing `isDefault` on an update no longer leaves no default** — see Revision 1: the default moves
  to the oldest other address, and a lone address stays default.
- **Profile patches are partial and allowlisted.** `role`, `id` and `password` are stripped by the
  schema and the SQL column list is fixed, so echoing a whole user object back cannot escalate.
- **Normalisation happens in the service, not only the validator.** The database requires lowercase
  emails; relying on the schema alone broke when the service was called directly (a test caught it).
- **Password change revokes other devices.** The token carries a `token_version`; the change
  increments the column and the acting device gets a fresh cookie. See Revision 1.
- **The confirmation field is optional.** The web form sends `confirmPassword` and it must match when
  present; other API clients are not forced to send it.
- **Password attempts are limited per account, not per IP.** A signed-in attacker guessing the
  current password is not slowed by the sign-in limiter, which is keyed on the IP. The limiter runs
  after `requireAuth`, so the key is the real account id.
- **`parseParams` reports the field as `id`.** The address form highlights one field, and a route
  parameter's Zod path is empty, so naming it explicitly beats a `(root)` detail.
- **`createWithTransaction(pool)`** was extracted so the account tests run transactions against the
  test database; the seed script keeps using the default-pool `withTransaction`.

## Not done / deferred

> Revised in **Revision 1** (below): session revocation and the email-password requirement are now
> implemented. The lines kept here record the original state of this step.

- ~~**Session revocation on password change**~~ — done in Revision 1 via `token_version`.
- ~~**Email verification / re-authentication for an email change.**~~ — Revision 1 requires the
  current password. A verification email is still not sent.
- **Address limit per customer, and "delete all addresses".** Neither is in the roadmap.
- **Order endpoints under `/users/me/orders`** — step 04g.
- **Frontend still runs on mocks.** `USE_MOCKS` flips in step 05.
- **Admin editing another customer's profile** — not in the roadmap.

## Out of scope / noticed

- **A malformed JSON body returns `500`, not `400`.** Found while hand-testing: `body-parser` throws
  a `SyntaxError` with `status: 400`, but the 04b error handler hides anything that is not an
  `AppError` behind a generic 500. The status is lost, so a client sending bad JSON gets a server
  error. This is a real bug in the error handler, out of this step's scope — flagged for the review
  backlog rather than fixed here.
- **Pre-existing repo-wide formatting drift** (CRLF files) still makes `npx prettier --check .` fail
  on untouched files; only files touched here were formatted.
- **Docker Desktop keeps stopping on this machine**; integration runs need
  `docker start ba_dekor-db` first or they fail with `ECONNREFUSED 127.0.0.1:5433`.
- **Review queue still backed up.** 00–03j and 04a–04c are "Awaiting review"; Phase 5b exists to work
  through them. This step changed no earlier status.

## Open questions for the reviewer

1. **Password change and other sessions.** Keep them valid (today), or add a `token_version` so a
   password change signs other devices out?
2. **Un-defaulting the last address.** Should an update that clears `isDefault` be refused when it
   would leave the customer with no default, or allowed as it is now?
3. **Email changes.** Should they require the current password (or a verification email), given a
   stolen session can change the login address today?
4. **Address ids and 404.** Is "not found" the right answer for somebody else's address, or would you
   prefer an explicit 403 now that ownership is checked in SQL anyway?
5. **Password rate limit** is 5 attempts per 15 minutes per account, in memory. Right shape, or
   should failures only count (successful changes should not consume the budget)?
6. **The malformed-JSON 500.** Fix it inside this step, or track it as its own backlog item?

## Reviewer feedback

_To be filled in by the reviewer._

---

# Revision 1 — three review decisions

Answers received: **(1) yes**, **(2) your call**, **(3) yes**.

## Decisions taken

1. **A password change signs out every other device.** A JWT cannot be un-issued, so revoking a
   session needs server-side state. `tbl_pengguna` gained `token_version` (migration
   `005_token_version.sql`, `INTEGER NOT NULL DEFAULT 0` with a non-negative CHECK). The token
   carries the version it was issued with; `requireAuth` compares it with the column and rejects a
   mismatch. `updatePasswordHash` increments the column, so every token issued before the change is
   stale on its next request. The device that made the change is **not** logged out: the controller
   re-issues a cookie carrying the new version in the same response.
   - Tokens with **no** version claim are treated as stale (`claims.tokenVersion ?? -1`). The safe
     direction: anything issued before this migration has to sign in again.
   - `tokenVersion` is internal. `requireAuth` deletes it before setting `req.user`, so it cannot leak
     through `/auth/me` or a profile response. A test asserts this.
2. **A customer with any address always keeps exactly one default** (my call). If an edit clears
   `isDefault`, the default moves to the **oldest other** address; if it is the only address it stays
   the default. This replaces the old "may leave no default" behavior, which the mock allowed.
   - The promotion runs **after** the `UPDATE` that demotes the edited row. The partial unique index
     `tbl_alamat_one_default_per_user` allows only one default per user, so promoting first failed with
     a duplicate-key error — an existing test caught it.
3. **An email change requires the current password.** `profilePatchSchema` now takes an optional
   `currentPassword` and refuses a patch that carries an email without it (422, field
   `currentPassword`). `updateProfile` verifies it against the stored hash *before* writing anything
   and answers `400 INVALID_PASSWORD` when it does not match, so a stolen session cannot move the
   login address to another inbox. The password is used for the check only and never persisted or
   echoed.

## What changed

| File | Change |
| --- | --- |
| `server/db/migrations/005_token_version.sql` | New column + non-negative CHECK |
| `server/src/db/users.js` | Read `token_version`; `updatePasswordHash` increments it; new `findTokenVersion` |
| `server/src/lib/session.js` | `signSessionToken({ id, tokenVersion = 0 })` embeds the claim |
| `server/src/middleware/auth.js` | Compares the claim with the column; strips `tokenVersion` from `req.user` |
| `server/src/services/auth.js` | `findSessionUser` carries `tokenVersion` for the middleware |
| `server/src/controllers/auth.js` | Exported `startSession(res, user, tokenVersion)`; register/login supply it |
| `server/src/controllers/user.js` | `postPassword` re-issues the cookie for the acting device |
| `server/src/services/user.js` | `updateProfile` verifies `currentPassword` before an email change |
| `server/src/validators/user.js` | `emailChangeSchema`; `currentPassword` rule on the profile patch |
| `server/src/db/addresses.js` | `update()` always leaves exactly one default |

One correction along the way: I first added a schema refinement rejecting a new password identical to
the current one. That turned the documented `400 SAME_PASSWORD` into a `422` and broke both the
frontend's error handling and the mock's contract. The schema cannot know whether `currentPassword` is
*correct*, so the check stays in the service, after verification. Reverted.

## Tests added or updated

- `user-revision-validators.test.js` — email requires the current password; partial patches still
  work; a reused password is accepted by the schema so the service can answer `SAME_PASSWORD`.
- `user-revision.integration.test.js` — email change refused with no/wrong password, email untouched
  on failure, accepted with the right one; `token_version` increments on change and is embedded in
  newly signed tokens.
- `addresses.integration.test.js` — clearing the flag promotes the oldest other address; the only
  address stays default; a run of edits always leaves exactly one default. (The old "may leave no
  default" test was replaced.)
- `user-api.integration.test.js` — email change over HTTP (422 without a password, 400 with a wrong
  one, 200 with the right one, password never echoed); a second device's cookie returns 401 after a
  password change while the acting device still works; `/auth/me` never exposes `tokenVersion`.

## Verification

```
npm run lint            clean
npm test                97 passed (9 files)
npm run test:integration 158 passed (12 files)
npm run build           built in 887ms (only the pre-existing >500 kB chunk warning)
npm run db:migrate      applied 005_token_version.sql; 4 already up to date
```

Real HTTP check against the dev server with a throwaway account (deleted afterwards; seed counts
confirmed unchanged at 2 users / 3 addresses / 6 categories / 4 brands / 12 products / 4 orders):

- Email patch with no password → `422`; with a wrong password → `400`; with the right one → `200`,
  and `currentPassword` is not echoed.
- Two devices signed in; device A changes the password → device A still works, device B gets `401`,
  the old password is rejected, the new one signs in.
- Two addresses; clearing the flag on the default promoted the other one (exactly one default). With
  a single address, clearing the flag left it default.

## Deferrals, updated

- **Session revocation is now done**, so it is no longer deferred.
- **Email changes now need the current password.** A verification email is still not sent; the
  address is trusted as soon as the password checks out.
- **Address limits, "delete all addresses", order endpoints, admin profile editing** — unchanged.
- **The malformed-JSON 500** is still open and still out of scope here.

## Open questions still open

Questions 4–6 from the original list are untouched: (4) 404 vs 403 for somebody else's address,
(5) whether the password limiter should count only failures, and (6) whether to fix the malformed-JSON
500 inside this step. Questions 1–3 are answered above.

