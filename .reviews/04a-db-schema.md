# 04a – Database schema

- **Status:** Awaiting review
- **Phase:** 4 – Backend
- **Date:** 2026-11-13
- **Author:** agent
- **Reviewer:** _unassigned_

## Summary

Adds the PostgreSQL schema the whole backend will sit on: eleven domain tables covering
authentication, the catalogue, wishlist, cart and checkout, applied as four forward-only
migrations. It also adds an idempotent seed script that ports the 12 products and 6
categories from the frontend mocks, so the API steps have real rows to return instead of
an empty database. No API code is written in this step — only the database and the seed.

Every table is prefixed `tbl_` and named in Bahasa Indonesia; columns, constraints and
indexes stay `snake_case` in English.

## Files added / changed

| File | Change |
| ---- | ------ |
| `server/db/migrations/001_pengguna_dan_alamat.sql` | `set_updated_at()` trigger function, `tbl_pengguna`, `tbl_alamat` |
| `server/db/migrations/002_katalog.sql` | `tbl_kategori`, `tbl_merek`, `tbl_produk`, trigram search index |
| `server/db/migrations/003_favorit_dan_keranjang.sql` | `tbl_favorit`, `tbl_keranjang`, `tbl_item_keranjang` |
| `server/db/migrations/004_pesanan.sql` | `tbl_pesanan`, `tbl_item_pesanan`, `tbl_riwayat_status_pesanan` |
| `server/db/seeds/catalog.js` | Catalogue seed data ported from `client/src/mocks` |
| `server/src/db/seed.js` | Idempotent seeder: catalogue, demo accounts, addresses, mock orders |
| `server/src/db/migrate.js` | Ledger table renamed to `tbl_skema_migrasi` |
| `server/package.json` | Added `db:seed` script |
| `package.json` | Added root `db:seed` script |
| `docker-compose.yml` | **Bug fix:** user/db were `bad_ekor`, while the app expects `ba_dekor`. Host port is now `${DB_PORT:-5432}` |
| `README.md` | Getting-started now covers seeding and the port override; script table and layout updated |
| `AGENTS.md` | DB convention updated: `tbl_` prefix + Bahasa table names |

## Schema

```
tbl_pengguna ──< tbl_alamat
     │
     ├──< tbl_favorit >──────── tbl_produk >──── tbl_kategori
     ├──1 tbl_keranjang ──< tbl_item_keranjang >──┘   └──── tbl_merek
     └──< tbl_pesanan ──< tbl_item_pesanan >──────┘
                    └──< tbl_riwayat_status_pesanan
```

| Table | Purpose |
| ----- | ------- |
| `tbl_pengguna` | accounts; `role` is `customer` or `admin` |
| `tbl_alamat` | shipping addresses, at most one default per user |
| `tbl_kategori` | catalogue categories |
| `tbl_merek` | brands |
| `tbl_produk` | products, prices, stock, variant arrays |
| `tbl_favorit` | wishlist |
| `tbl_keranjang` | cart, owned by a user **or** a guest token |
| `tbl_item_keranjang` | cart lines |
| `tbl_pesanan` | orders, with a snapshot of the shipping address |
| `tbl_item_pesanan` | order lines, with a snapshot of the product |
| `tbl_riwayat_status_pesanan` | order status timeline |
| `tbl_skema_migrasi` | applied migrations (owned by `migrate.js`) |

**`tbl_pengguna`** — `role` is `customer` or `admin` (`CHECK`), so step 04b needs no extra column
for the admin middleware. `email` carries `CHECK (email = lower(email))` plus `UNIQUE`, which makes
the uniqueness test case-insensitive without relying on the service layer.

**`tbl_alamat`** — a partial unique index (`WHERE is_default`) enforces at most one default
address per user in the database, rather than trusting 04d to clear the old flag.

**`tbl_produk`** — money as `BIGINT`; `colors`, `sizes`, `images` as `TEXT[]`, matching the mock
payload exactly and letting array order be display order. Constraints encode the shop rules:
`compare_at_price > price` (a struck-through price below the live price would render as a fake
discount), `rating BETWEEN 0 AND 5`, `stock >= 0`. Partial indexes on `is_new` / `is_trending` /
`category_id` / `price` are filtered to `is_active` so the storefront queries hit small indexes.

**`tbl_keranjang`** — the owner is either `user_id` **or** `guest_token`, enforced by
`CHECK ((user_id IS NOT NULL) <> (guest_token IS NOT NULL))` with a unique index on each. The
roadmap's "guest cart merge on login" (04f) needs both owners representable; a `user_id`-only cart
could not hold a visitor's cart before they sign in.

**`tbl_pesanan`** — the shipping address is snapshotted into flat `shipping_*` columns, and
`CHECK (total = subtotal + shipping_cost - discount)` makes a miscomputed total impossible to
store. `tbl_item_pesanan` snapshots name/slug/image/unit price so a later price change cannot
rewrite history; `product_id` is `ON DELETE SET NULL` purely for a future "buy again" link.
`tbl_riwayat_status_pesanan` is the timeline the account pages already render.

Every table has `created_at` / `updated_at`, with a shared `set_updated_at()` trigger keeping the
latter honest. Ids are `BIGINT GENERATED ALWAYS AS IDENTITY` (the choice AGENTS.md defers to this
step; UUIDs were not needed since no id is ever exposed in a URL except `order_number`).

## How to run and verify

```sh
# Fresh database (destroys the local volume)
docker compose down -v
docker compose up -d db
npm run db:migrate
npm run db:seed

# Re-running does nothing and duplicates nothing
npm run db:migrate
npm run db:seed
```

- [ ] `npm run db:migrate` applies four migrations on an empty volume; a second run reports
      `0 migration(s) applied`
- [ ] `npm run db:seed` reports 2 users, 3 addresses, 6 categories, 4 brands, 12 products, 4 orders
- [ ] Running `db:seed` twice leaves those counts unchanged
- [ ] `\dt` lists twelve tables, all prefixed `tbl_`, plus `tbl_skema_migrasi`
- [ ] `\d tbl_pesanan` shows `tbl_pesanan_total_matches` and the `tbl_pesanan_status_valid` check
- [ ] `tbl_pesanan.total = subtotal + shipping_cost - discount` on all four seeded orders
- [ ] Every seeded order's `subtotal` equals the sum of its `tbl_item_pesanan.line_total`
- [ ] Two demo logins exist: `sari@badekor.id` (customer) and `admin@badekor.id` (admin),
      password `rahasia123`, stored as bcrypt hashes
- [ ] The constraint checks below all raise an error instead of writing

Verified locally on PostgreSQL 17 (Docker). Constraint behaviour was tested by hand and each was
rejected: `tbl_pesanan_total_matches`, `tbl_produk_compare_at_price_above_price`,
`tbl_keranjang_single_owner`, `tbl_alamat_one_default_per_user`,
`tbl_favorit_user_product_key`. `tbl_produk_search_idx` is picked up by the planner for the
`?search=` predicate under `SET enable_seqscan = off` (with 12 rows the planner correctly prefers a
sequential scan either way).

## Decisions and trade-offs

- **`tbl_` prefix + Bahasa names, at the user's request.** This deviates from the original
  AGENTS.md rule ("plural English table names"); that convention line has been updated so 04b–04g
  do not drift back to English table names. Columns, constraints and indexes stay English
  `snake_case` because they describe code concepts (`user_id`, `tbl_item_pesanan_quantity_positive`)
  rather than domain names the reader needs translated.
- **Renamed in place rather than by a follow-up `ALTER TABLE` migration.** These migrations are
  unmerged and were rebuilt on a fresh volume, so a rename migration would have added noise for a
  schema nothing depends on yet. Once a migration is merged, the forward-only rule applies.
- **`BIGINT` identity ids, not UUIDs.** Nothing enumerable is exposed except `order_number`, which
  is a separate human-readable key. UUIDs would cost index size for no benefit here.
- **`TEXT[]` for colors/sizes/images instead of variant tables.** The mock has no per-variant price
  or stock, and 03b/03c render plain string lists. A variant table would be the right call once
  stock is tracked per variant; noted below as deferred.
- **Flat shipping snapshot instead of a JSONB blob.** Keeps the columns queryable for shipping
  labels and per-city reporting, and keeps the 04g insert type-checked.
- **Address snapshot is copied, not joined.** A user editing or deleting an address must not
  change where a past order was sent.
- **`rating` / `review_count` stay aggregate columns on `tbl_produk`.** 03c deferred a reviews
  module, so there is no reviews table to derive them from; they are seeded from the mock.
- **`pg_trgm` trigram index for search.** The mock searches a substring across name, material and
  description. Reaching for `tsvector` full-text search would have changed matching semantics
  (whole words, stemming) and needed an Indonesian dictionary.
- **Seed is upsert-based and safe to re-run.** It updates catalogue rows and resets the two demo
  passwords in place, but never touches rows a reviewer created. A truncate-and-reload seed would
  be simpler and deterministic, but would wipe accounts registered while testing 04b.

## Not done / deferred

- Per-variant stock/price (`tbl_produk_variant`) — only if stock ever needs tracking per colour or
  size. Not in the roadmap.
- Reviews table — no reviews module in the roadmap (see 03c).
- Coupons / discount codes — `tbl_pesanan.discount` is a plain amount; nothing produces it yet.
- Idempotency keys for checkout — belongs with 04g if double-submit turns out to be a problem.
- The seed does not create wishlist or cart rows; those pages (03f, 03g) do not exist yet, so
  their APIs (04e, 04f) can seed their own fixtures.
- **No automated test for this step.** AGENTS.md asks each Phase 4 step to ship with tests, but
  this step is SQL plus a seed script, and the existing suite (`health.test.js`) deliberately runs
  without a database. A DB-dependent test would make `npm test` fail on any machine without
  Postgres up. The constraint checks above are reproducible by hand; a proper integration setup
  (disposable database, per-test transactions) is better introduced in 04b, where the API gets its
  first DB-backed routes.
- No backup/restore or migration rollback. Migrations are forward-only by design.

## Out of scope / noticed

- **Repo-wide CRLF line endings.** `.prettierrc` sets `endOfLine: "lf"`, but pre-existing files
  (`server/src/app.js`, `server/src/db/migrate.js`, `client/package.json`, `eslint.config.js`) are
  CRLF, so `npx prettier --check` fails on files nobody touched in this step. Reformatting the
  repository is a separate cleanup; this step matched the surrounding files instead.
- **Hand-wrapped `.sql` files are not prettier-checked.** Prettier has no SQL parser configured
  here, so the migrations are formatted by hand.
- **`docker-compose.yml` credentials were broken** (`bad_ekor` vs the `ba_dekor` name used by
  `.env.example`, `config/env.js` and the cookie name). Fixed in this step, since migrations cannot
  run without it. Anyone with an existing volume from before this fix must recreate it:
  `docker compose down -v`.
- **Port 5432 conflict on this machine.** A native `postgresql-x64-18` Windows service already
  listens on 5432 and answers connections before the container does, so `npm run db:migrate` failed
  with `28P01 password authentication failed`. The native service was left running. Resolution:
  the compose host port is `${DB_PORT:-5432}`, and two git-ignored files pin this machine to 5433 —
  a root `.env` (`DB_PORT=5433`, read by docker compose) and `server/.env` (`DATABASE_URL` on the
  same port, read by `config/env.js`). The committed defaults are still 5432, so a machine without
  a native PostgreSQL needs no override.
- **The container volume was reset twice** during this work (once to prove a clean-slate bootstrap,
  once for the table rename). Any rows created earlier are gone; `npm run db:seed` restores the
  demo data.
- **Review queue is backed up.** 00, 01a, 01b and 03a–03e are still "Awaiting review", and steps
  03f–03j do not exist yet. This step was built ahead of them at the user's request.

## Open questions for the reviewer

1. **Column names.** Tables are now Bahasa (`tbl_pesanan`) but columns are still English
   (`order_number`, `shipping_city`, `created_at`). Do you want the columns translated too
   (`nomor_pesanan`, `kota_pengiriman`), or is mixing the two the intent? Translating them is easy
   now and painful later, so it is worth deciding before 04b starts writing SQL.
2. **Variant stock.** Products currently carry a single `stock` number. If the shop ever needs
   "3 left in Ulin natural, sold out in Ulin gelap", that is a variant table — worth doing before
   04c hardcodes single-stock maths, or is one stock number per product fine?
3. **Guest carts.** I assumed anonymous carts are needed (the roadmap mentions merging a guest
   cart on login), so `tbl_keranjang` allows a `guest_token` owner. Confirm the cart should survive
   a page reload for a signed-out visitor.
4. **`order_number` format.** Seeded orders use `BD-2026-0417`. Should 04g continue that
   `BD-<year>-<sequence>` scheme, or use a random suffix to make order numbers hard to guess?
5. **Order statuses.** I kept the four the UI already renders (`processing`, `shipped`,
   `completed`, `cancelled`). A real payment flow usually needs `pending` / `paid` — add them now
   or when payments become real? Note these are status *values*, so they stayed English to match
   what the React pages already render.
6. **Reviewers' Postgres version.** README says PostgreSQL 15+, compose ships 17, this was
   verified on 17. Is 15 (or the course machine's 18) the target that must also be supported?

## Reviewer feedback

_To be filled in by the reviewer._
