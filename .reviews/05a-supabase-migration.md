# 05a — Supabase migration

- **Status:** Awaiting review
- **Phase:** 5a – Supabase migration
- **Date:** 2026-11-19
- **Author:** agent (executor session)
- **Reviewer:** _unassigned_

## Summary

Moves the runtime database connection to Supabase PostgreSQL through an explicit
`DATABASE_PROVIDER=supabase` mode while keeping the existing local Docker database as the default.
The resolver accepts the Supabase session-pooler URL plus a password placeholder, enables SSL, and
keeps the integration suite isolated in a database whose name ends in `_test`. All ten existing
migrations, the seed, the unit suite and all 541 integration tests were run against Supabase.

This project was already PostgreSQL; the stale “MySQL to Supabase” wording in `AGENTS.md` was
corrected to “local PostgreSQL to Supabase PostgreSQL”.

## Files added / changed

| File                                           | Change                                                                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                    | Database stack row now names local Docker or Supabase; step 05a wording corrected from MySQL to local PostgreSQL.                                    |
| `README.md`                                    | Documents local vs Supabase setup, Supabase environment variables, SSL behaviour, and creating the isolated Supabase test database.                  |
| `server/.env.example`                          | Adds `DATABASE_PROVIDER`, `SUPABASE_POOLER_URL`, `SUPABASE_CONN`, `SUPABASE_DB_PASSWORD`/`SUPABASE_PASS`, SSL and `TEST_DATABASE_URL` documentation. |
| `server/src/config/databaseConfig.js`          | New. Resolves local/Supabase connections, substitutes placeholder passwords, normalises `sslmode`, and returns explicit SSL options.                 |
| `server/src/config/env.js`                     | Adds the database provider and Supabase schema fields, resolves the effective runtime URL and resolves the test URL before export.                   |
| `server/src/config/db.js`                      | Passes the resolved SSL options to the application pool and raises the remote connection timeout to 10 s.                                            |
| `server/src/test/db.js`                        | Uses `env.DATABASE_URL`/`env.TEST_DATABASE_URL` instead of re-reading `process.env`, so Supabase mode cannot be bypassed, and uses SSL.              |
| `server/src/__tests__/database-config.test.js` | New. Ten unit tests for local/Supabase resolution, placeholders, SSL, invalid schemes, and missing settings.                                         |
| `server/vitest.config.js`                      | Integration timeout raised from 20 s to 60 s because pooler round-trips make multi-transaction tests slower than a local socket.                     |

`server/.env` was also updated locally (it is git-ignored and intentionally not part of the diff) with
`DATABASE_PROVIDER=supabase`, an IPv4 session-pooler URL and the `ba_dekor_test` test URL. It reuses
the existing `SUPABASE_PASS` through a placeholder; no credentials are written to tracked files.

## How to run and verify

The reviewer needs the Supabase values from the local, git-ignored `server/.env`. Do not paste them
into this note or into terminal output.

```sh
# from the repository root
npm run db:migrate
npm run db:seed
npm run test:unit
npm run test:integration
npm run lint
npm run build
npm run dev
```

The database-backed commands must report the Supabase database, not the local Docker database. With
the API running, check:

- <http://localhost:4000/api/v1/health>
- <http://localhost:4000/api/v1/health/db>
- <http://localhost:5173> for the storefront

Checklist the reviewer can tick:

- [ ] `npm run db:migrate` reports `0 migration(s) applied, 10 already up to date` (or applies the migrations on a fresh Supabase database).
- [ ] `npm run db:seed` completes with the expected catalogue/demo-user counts.
- [ ] `npm run test:unit` passes: 330 tests.
- [ ] `npm run test:integration` passes: 31 files, 541 tests, against the Supabase `_test` database.
- [ ] `GET /api/v1/health` returns 200 and `GET /api/v1/health/db` returns `{ "status": "ok", "database": "up" }`.
- [ ] `npm run lint` exits 0, and `npm run build` completes (the pre-existing chunk-size warning is unrelated).
- [ ] No database password appears in the review note, README, `.env.example`, logs or test output.

## Verification evidence (executor run)

| Check                   | Command                    | Result                                                                                       |
| ----------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| Fresh migrations        | `npm run db:migrate`       | `[db] applied 001_…` through `010_qris.sql`; `10 migration(s) applied, 0 already up to date` |
| Re-run migrations       | `npm run db:migrate`       | `0 migration(s) applied, 10 already up to date`                                              |
| Seed                    | `npm run db:seed`          | `2 users, 3 addresses, 6 categories, 4 brands, 12 products, 4 orders`                        |
| Unit tests              | `npm run test:unit`        | `21 passed`, `330 passed`                                                                    |
| Integration tests       | `npm run test:integration` | `31 passed`, `541 passed`, against Supabase `ba_dekor_test`                                  |
| API health              | in-process `fetch`         | `/api/v1/health` 200; `/api/v1/health/db` 200 with `database: "up"`                          |
| Root lint               | `npm run lint`             | exit 0                                                                                       |
| Production client build | `npm run build`            | `186 modules transformed`, build succeeded                                                   |
| Config unit coverage    | `database-config.test.js`  | `10 passed`                                                                                  |

The first Supabase integration run exposed one real environmental issue: the 12-combination
checkout test needed 21.7 s against the pooler, exceeding the old 20 s cap. Vitest aborted it
mid-transaction and the next test’s `TRUNCATE` deadlocked. Raising the integration timeout to 60 s
is the only test-config change; the same checkout file then passed all 23 tests.

## Decisions and trade-offs

- **Explicit provider instead of silently overriding `DATABASE_URL`.** `DATABASE_PROVIDER=local`
  remains the default so a fresh checkout behaves exactly as before. A team member opts into
  Supabase by setting `DATABASE_PROVIDER=supabase`; this avoids a leftover Supabase key silently
  redirecting all local work to a remote project.
- **Session pooler is preferred over the direct host.** The Supabase direct `db.*.supabase.co`
  host resolved only to IPv6 here and was unreachable (`ENETUNREACH`). The session pooler
  (`aws-<n>-<region>.pooler.supabase.com:5432`) is IPv4-reachable and keeps prepared statements and
  transactions working. `SUPABASE_CONN` remains a fallback for networks with IPv6.
- **Password placeholders.** `SUPABASE_POOLER_URL`/`SUPABASE_CONN` may keep
  `[YOUR-DATABASE-PASSWORD]` or `REPLACE_ME`; the resolver substitutes
  `SUPABASE_DB_PASSWORD` or `SUPABASE_PASS` at runtime. This keeps the secret in one place and
  makes the URL copyable from the Supabase dashboard without duplication.
- **SSL is enabled automatically for Supabase.** `sslmode` is stripped from the URL and an explicit
  `ssl` object is passed to `pg`; leaving `sslmode=require` made `pg` attempt `verify-full`, which
  failed against the pooler chain. Certificate verification is disabled by default because the
  pooler CA is not in Node’s default trust store; `DATABASE_SSL_REJECT_UNAUTHORIZED=true` is
  available for deployments that install the CA and set `NODE_EXTRA_CA_CERTS`.
- **The `_test` guard is unchanged.** The suite still refuses any database whose name does not end
  in `_test`. Supabase therefore uses a separate `ba_dekor_test` database (`TEST_DATABASE_URL`),
  not the seeded runtime database. The test database was created once with
  `CREATE DATABASE ba_dekor_test;`.
- **The test harness now reads the resolved URL.** It uses `env.DATABASE_URL` and
  `env.TEST_DATABASE_URL` instead of `process.env.DATABASE_URL` directly, so the provider
  resolution, password substitution and SSL settings cannot be bypassed.
- **Integration timeout raised to 60 s.** The limit is a remote-latency accommodation, not a
  looseness in application assertions. Local runs remain fast and the per-test assertion content is
  unchanged.

## Not done / deferred

- **No data copy from the local Docker database.** Supabase was migrated with the existing
  forward-only SQL files and seeded from `server/db/seeds/catalog.js`; local rows created by a
  developer are not transferred. A one-off `pg_dump`/restore is left to the team if they need it.
- **No Supabase-specific RLS or Auth.** The app continues to use its own JWT/bcrypt auth and the
  `postgres` role through the server-side pool. Supabase is used as PostgreSQL here, not as its
  client/auth platform.
- **No automated test-database creation.** Creating `ba_dekor_test` is documented as a one-time
  Supabase SQL-editor step; the harness intentionally never creates or drops databases.
- **No CA pinning.** Certificate verification remains configurable and off by default; pinning the
  Supabase pooler CA belongs with the security-hardening step (06).

## Out of scope / noticed

- The local `.env` is git-ignored and was not printed or committed. Only placeholders appear in
  `server/.env.example`.
- The repository already had an uncommitted Phase 5d (Redis caching) edit in `AGENTS.md`; it was
  left untouched by this step.
- `npm run format:check` still reports `AGENTS.md` as unformatted; this was already the case before
  this step and reformatting the whole file would create unrelated churn and would touch the
  uncommitted Redis section.
- Vite still reports the pre-existing 500 kB chunk-size warning; it is handled by the performance
  step (09).

## Open questions for the reviewer

1. Is disabling Supabase pooler certificate verification by default acceptable for this course
   project, with CA pinning deferred to step 06? If not, where should the CA file live?
2. Should the long-lived `ba_dekor_test` database stay on the shared Supabase project, or should
   the team use a disposable project/branch for integration tests?
3. Should local Docker remain the default `DATABASE_PROVIDER`, or should the team standardise on
   Supabase for everyone now that the connection is verified?
4. Is keeping `SUPABASE_CONN` (direct IPv6 fallback) worth the extra configuration surface, or
   should the pooler URL be the only accepted Supabase connection?

## Reviewer feedback

_To be filled in by the reviewer._
