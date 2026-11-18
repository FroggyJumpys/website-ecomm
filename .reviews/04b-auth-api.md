# 04b – Auth API

- **Status:** Approved
- **Phase:** 4 – Backend
- **Date:** 2026-05-20
- **Author:** agent
- **Reviewer:** Kimi (Moonshot AI, AI reviewer)

## Summary

Register, login, logout and session lookup against the real `tbl_pengguna` table from
04a: bcrypt hashing, a JWT in an httpOnly cookie, an auth middleware that re-reads the
user from the database, a role guard for the admin API steps, and rate limits on the two
brute-force targets. Payloads match the contract `client/src/services/auth.js` was already
written against (`{ data: publicUser }`), so step 05 is a switch of `USE_MOCKS`, not a
reshape of the client.

The step also adds the first PostgreSQL-backed test suite, which later backend steps extend,
and fixes a roadmap gap: `AGENTS.md` had no step for working through the review backlog, so
**Phase 5b** now exists between integration and finishing touches.

## Files added / changed

| File | Change |
| ---- | ------ |
| `server/src/validators/auth.js` | Zod schemas for register/login; phone normalisation; password strength and the 72-**byte** bcrypt limit |
| `server/src/db/users.js` | `createUser`, `findUserByEmail`, `findUserById`, `publicUser`; maps unique violations to `EMAIL_TAKEN` |
| `server/src/db/types.js` | Parses PostgreSQL BIGINT as a number once, so ids are numbers on the JSON boundary |
| `server/src/db/migrations.js` | `runMigrations(pool)` extracted from the CLI so tests can migrate the test database |
| `server/src/db/migrate.js` | Now a thin CLI around `runMigrations` |
| `server/src/services/auth.js` | `registerUser`, `authenticate`, `findSessionUser`; bcrypt hashing and timing-equalised credential checks |
| `server/src/lib/session.js` | Sign/verify HS256 tokens, `durationToMs`, cookie and clear-cookie options |
| `server/src/lib/errors.js` | `AppError` carrying status, code and details |
| `server/src/lib/validation.js` | `parseBody` — Zod failure to the `{ field, message }` detail the forms read |
| `server/src/middleware/auth.js` | `createRequireAuth(pool)` and `requireRole(role)` for 04h/04i |
| `server/src/middleware/error-handler.js` | **Security fix:** only `AppError` keeps its code/message; other errors become a generic 500 |
| `server/src/controllers/auth.js` | The four handlers; no SQL, no password work |
| `server/src/routes/auth.js` | `/auth` router with the shared auth rate limiter |
| `server/src/routes/index.js` | `createApiRouter({ pool, ... })`; health routes moved in unchanged |
| `server/src/app.js` | `createApp({ pool, authRateLimitMax, authRateLimitWindowMs })` |
| `server/src/config/db.js` | Uses the BIGINT parser; otherwise unchanged |
| `server/src/config/testDatabase.js` | Derives/validates the `_test` database URL |
| `server/src/test/db.js` | Test pool, migrate once, truncate between tests |
| `server/vitest.config.js` | `unit` and `integration` projects; integration runs serially |
| `server/package.json`, `package.json` | `test`, `test:all`, `test:unit`, `test:integration` scripts |
| `server/src/__tests__/*` | 9 test files, 71 tests (34 unit, 37 integration) |
| `server/.env.example` | Documents `TEST_DATABASE_URL` |
| `README.md` | Auth endpoints, session model, test commands, creating the test database |
| `AGENTS.md` | New **Phase 5b: Review backlog** (requested) |
| `.gitignore` | `.superpowers/` scratch directory |

## How to run and verify

```sh
# API + client
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Create the test database once, then run the suites:

```sh
docker compose exec db createdb -U ba_dekor ba_dekor_test
npm test                  # 34 unit tests, no database required
npm run test:integration  # 37 tests against ba_dekor_test
npm run lint
```

Checklist the reviewer can tick:

- [x] `npm test` passes with the database container stopped (unit tests never connect)
- [x] `npm run test:integration` reports 37 passed; running it twice gives the same result
- [x] `TEST_DATABASE_URL=postgres://ba_dekor:ba_dekor@localhost:5433/ba_dekor npm run test:integration` refuses to start with "must end in \"_test\""
- [x] `npm run db:seed` still reports 2 users, 3 addresses, 6 categories, 4 brands, 12 products, 4 orders — the tests never touched the development database
- [x] `curl -i -X POST localhost:4000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"sari@badekor.id","password":"rahasia123"}'` returns `200` with a `ba_dekor_session` cookie that is `HttpOnly`, `SameSite=Lax`, `Path=/`
- [x] The same call with `admin@badekor.id` returns `role: "admin"`
- [x] With that cookie, `GET /api/v1/auth/me` returns the same user; after `POST /api/v1/auth/logout` it returns `401`
- [x] `POST /api/v1/auth/login` with a wrong password returns `401 INVALID_CREDENTIALS`, and an unknown email returns the identical message
- [x] `POST /api/v1/auth/register` with `{"name":"A","email":"bad","phone":"1","password":"short"}` returns `422 VALIDATION_ERROR` with `details.field`
- [x] Registering an existing email returns `409 EMAIL_TAKEN` with `details.field = "email"`
- [x] Registering with `"role": "admin"` in the body still creates a `customer`
- [x] No response body contains `password`, `passwordHash` or a token
- [x] 11 rapid failed logins from one IP return `429 TOO_MANY_ATTEMPTS`

## Decisions and trade-offs

- **The role is not in the token.** Only `sub` (the user id) is signed; `requireAuth` re-reads the
  row. A demoted admin loses access on the next request instead of when the token expires, and a
  deleted account cannot keep a session. Tested in `auth-middleware.integration.test.js`.
- **`requireRole` ships here, unused.** It is the role gate 04h/04i need, and shipping it with its
  own tests keeps those steps from inventing a second guard.
- **Registration forces `role = 'customer'` in SQL**, not just in the validator, so a validator
  change cannot open self-service admin creation.
- **72 *bytes*, not 72 characters.** bcrypt silently truncates at 72 bytes; a 38-character password
  of multi-byte letters is 74 bytes. The validator and the test both use byte length. The client's
  `validation.js` still counts characters — noted below.
- **Login does not apply registration strength rules.** Only presence and email shape are checked,
  so accounts made under older rules can still sign in.
- **Unknown email and wrong password do the same work.** A dummy bcrypt comparison runs when the
  account is missing, and both paths return the same message, so neither timing nor copy reveals
  which emails exist.
- **Cookies are `SameSite=Lax` and `Secure` only in production.** The Vite dev proxy makes the
  request first-party, so Lax is enough in development; production is HTTPS-only.
- **Logout clears the cookie; it does not revoke the token.** Stateless JWTs stay valid until
  expiry if a copy was captured. Revocation needs a token version column or a blacklist — see
  *Not done*.
- **Rate limit is a constructor parameter.** Functional tests would otherwise exhaust the real
  limit; the dedicated test builds an app with `authRateLimitMax: 2`.
- **Integration tests can only run against a `_test` database.** They truncate tables, so
  `resolveTestDatabaseUrl` refuses any other name, and the harness has no fallback path that could
  reach development data.
- **`npm test` stays database-free.** `AGENTS.md` asks for tests per backend step, but a DB-dependent
  `npm test` fails on any machine without PostgreSQL. Unit tests run in `npm test`; the database
  suites run explicitly via `npm run test:integration` / `test:all`, and both are documented.
- **BIGINT is parsed as a number globally.** Ids fit comfortably in `Number.MAX_SAFE_INTEGER` and
  the client compares them numerically; parsing per query would have been repeated boilerplate.
- **The error handler now hides non-`AppError` codes.** Before this step a raw `pg` error would have
  put its SQLSTATE (`23505`) in `error.code` and its SQL text in the message. Found while writing
  the auth tests, fixed here because registration hits it first.

## Not done / deferred

- **Token revocation** on logout or password change — needs a token version or a denylist; 06 can
  decide.
- **"Remember me"** — the client mock keeps a `remember` flag; the real cookie always lasts
  `JWT_EXPIRES_IN` (7 days). The client strips the flag before calling the API.
- **Profile update and password change** — step 04d.
- **Admin catalog/order endpoints** — 04h/04i, using `requireRole`.
- **Email verification, password reset, lockout after N failures beyond the IP limit** — not in the
  roadmap.
- **Frontend still runs on mocks.** `USE_MOCKS` flips in step 05; doing it here would mix steps.
- **CSRF protection.** `SameSite=Lax` blocks cross-site form posts, but JSON endpoints plus a
  cookie are worth a signed double-submit token in 06.
- **The client's password maximum counts characters, not bytes** (`validation.js`, line 10). A
  38-character multi-byte password passes the form and is refused by the API with a clear message;
  fixing it changes 03d, so it belongs to the review backlog.

## Out of scope / noticed

- **Pre-existing repo-wide formatting drift.** `npx prettier --check .` fails on many untouched
  files (CRLF line endings, already noted in 04a). Only the files this step created were formatted.
- **Docker Desktop on this machine kept stopping.** The engine shut down between commands several
  times, so a failed integration run here often means the container was down, not a test failure.
  `docker start ba_dekor-db` before `npm run test:integration` if the connection is refused.
- **The review queue is still backed up.** 00 through 03j and 04a are all "Awaiting review"; this
  step was built at the user's explicit request ahead of that queue. Phase 5b now exists to work
  through it.
- **`client/src/services/auth.js` has never been exercised against the real API.** The payload shape
  matches, but step 05 is where that is proven.

## Open questions for the reviewer

1. **Session lifetime.** 7 days (`JWT_EXPIRES_IN`) for everyone, or should "remember me" be
   honoured with a short session cookie otherwise?
2. **Logout revocation.** Is a stateless cookie clear enough for this project, or do you want a
   `token_version` column so a password change invalidates every existing session?
3. **Test database provisioning.** The README asks for one manual `createdb`. Should `npm run
   test:integration` create the `_test` database itself when it is missing?
4. **Rate limit shape.** 10 attempts per 15 minutes per IP covers both register and login, and the
   counter is in memory (so it resets on restart and is per process). Fine for a course project, or
   should it be a shared store?
5. **`npm test` split.** Unit-only by default, integration behind an explicit command — or should
   `npm test` run everything and simply require PostgreSQL?
6. **Phase 5b wording.** Does the new Phase 5b row describe the review-backlog process the way you
   meant, or should it name each review file to process?

## Reviewer feedback

**Approved on 2026-11-18.** Ran `npm test` with `ba_dekor-db` stopped: all 18 current unit files
and 283 tests passed without a database connection, then restarted the container. Ran the current
integration suite twice; both runs passed all 30 files / 518 tests (the original 37 tests have been
extended by later modules). The unsafe `TEST_DATABASE_URL` probe was rejected before any test could
run; Vitest reported zero executed tests and failures loading the integration files, as intended.
The development fixtures and later review rows remained intact.

Exercised the live API at `http://localhost:4000`: customer and admin login returned the correct
public user and role; the session cookie had `HttpOnly`, `SameSite=Lax` and `Path=/`; `/auth/me`
returned the same user; logout cleared the cookie and a subsequent `/auth/me` returned 401. Wrong
and unknown credentials returned byte-identical error bodies. Invalid registration returned 422
with field details, duplicate registration returned 409 `EMAIL_TAKEN`, and a registration body
requesting an admin role created a customer. No response body exposed password material or the
session token. After restarting to clear the limiter, the first ten failed logins returned 401 and
the eleventh returned 429 `TOO_MANY_ATTEMPTS`.

The temporary registered user and cookie files were removed, and the reviewer-started server was
stopped. Open questions are resolved for this project: the seven-day cookie lifetime and split unit
/ integration commands are acceptable; manual test-database provisioning is documented and its
safety guard works; the in-memory IP limiter is sufficient at this stage; Phase 5b correctly describes
the oldest-first review backlog. Password-change token revocation has since been implemented by the
later user module, while logout remains a stateless cookie clear as documented. No blocking auth
defect found.
