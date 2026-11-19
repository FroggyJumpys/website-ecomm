# 01c – One-command developer setup script

- **Status:** Awaiting review <!-- Awaiting review | Changes requested | Approved -->
- **Phase:** 1 – Codebase setup
- **Date:** 2026-11-19
- **Author:** agent (executor session)
- **Reviewer:** _unassigned_

## Summary

A fresh clone now needs one command: `npm run setup` checks the Node version, installs the npm
workspaces, creates the git-ignored runtime folders and writes the git-ignored environment files.
It defaults to **Supabase** (the database direction taken in 05a) and still supports a local
PostgreSQL/Docker instance on request, so a new collaborator no longer has to copy
`server/.env.example` by hand, invent a `JWT_SECRET`, or work out which pooler URL to paste.

The script never overwrites an existing `server/.env` unless `--force` is passed, and it warns when
the file it found still has database placeholders or the development session secret.

On Windows, `setup.cmd` in the repository root wraps the same script so it can be double-clicked
from Explorer, and `node_modules/` is installed by the script itself (root `npm install`, skipped
with `--skip-install`).

## Files added / changed

| File                    | Change                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/setup.mjs`     | New. The setup CLI: version check, `npm install`, directory creation, `.env` rendering, optional `db:migrate`/`db:seed`. Pure helpers are exported so they can be tested; importing it has no side effects.          |
| `scripts/setup.test.js` | New. 19 unit tests using Node's built-in `node:test` runner (no new dependency, no database).                                                                                                                        |
| `setup.cmd`             | New. Windows double-click wrapper: sets code page 65001, runs `node scripts\setup.mjs` with the forwarded arguments, keeps the window open only when started from Explorer, and exits with the script's code.        |
| `package.json`          | Added `setup` and `test:setup`; `test` now runs the setup tests before the workspace suites.                                                                                                                         |
| `eslint.config.js`      | Node globals and lint rules now cover `scripts/**/*.{js,mjs}` (previously only `server/**` and `*.config.js`).                                                                                                       |
| `server/.env.example`   | Documents `JWT_SECRET`; the example previously omitted it even though `server/src/config/env.js` requires 24+ characters.                                                                                            |
| `README.md`             | “Getting started” is now the script flow with a flags table, Supabase as the primary path and local PostgreSQL/Docker as optional. Scripts table, layout and tests sections updated.                                 |
| `AGENTS.md`             | Database stack row says Supabase is the default with local as fallback; layout lists `scripts/` and `setup.cmd`; 05a row wording corrected (“local Docker as the default” is no longer true); new roadmap row `01c`. |

## How to run and verify

```sh
# 1. The CLI and its unit tests
npm run setup -- --help
npm run test:setup

# 2. Re-running against this checkout must not touch the existing server/.env
md5sum server/.env
node scripts/setup.mjs --skip-install
md5sum server/.env        # identical hash

# 3. Fresh-clone simulation (local provider) in a throwaway directory
rm -rf /tmp/badekor-check && mkdir -p /tmp/badekor-check/scripts /tmp/badekor-check/server
cp package.json /tmp/badekor-check/package.json
cp scripts/setup.mjs /tmp/badekor-check/scripts/setup.mjs
cp server/.env.example /tmp/badekor-check/server/.env.example
node /tmp/badekor-check/scripts/setup.mjs --skip-install \
  --provider=local --database-url=postgres://ba_dekor:ba_dekor@localhost:5433/ba_dekor --db-port=5433
ls -d /tmp/badekor-check/server/uploads/catalog
grep -nE '^(DATABASE_PROVIDER|DATABASE_URL)=' /tmp/badekor-check/server/.env
cat /tmp/badekor-check/.env

# 4. Supabase path (fake credentials; password is percent-encoded)
node /tmp/badekor-check/scripts/setup.mjs --skip-install \
  --supabase-url='postgresql://postgres.ref:Fake%23Pass1@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require' \
  --test-database=ba_dekor_check --force
grep -nE '^(DATABASE_PROVIDER|SUPABASE_POOLER_URL|SUPABASE_DB_PASSWORD|TEST_DATABASE_URL)=' /tmp/badekor-check/server/.env

# 5. The generated file must satisfy the real config schema
DOTENV_CONFIG_PATH='C:/Users/<you>/AppData/Local/Temp/badekor-check/server/.env' \
  node --input-type=module -e 'const { env } = await import("./server/src/config/env.js"); console.log(env.DATABASE_PROVIDER, env.DATABASE_SSL, env.JWT_SECRET.length);'

# 6. Windows wrapper (Git Bash: `cmd //c`, or double-click setup.cmd in Explorer)
cmd //c setup.cmd --help < /dev/null
cmd //c setup.cmd --bogus < /dev/null   # must print the failure and exit 1

# 7. Repo-wide checks
npm run lint
npm test

rm -rf /tmp/badekor-check
```

Checklist for the reviewer:

- [ ] `npm run setup -- --help` lists every option and `--provider` defaults to `supabase`.
- [ ] Re-running `node scripts/setup.mjs --skip-install` leaves `server/.env` byte-identical and says
      it is leaving the file untouched.
- [ ] Steps 3–4 create `server/uploads/catalog/`, `server/.env` and (with `--db-port`) a root `.env`.
- [ ] In the Supabase file the password appears **once** (`SUPABASE_DB_PASSWORD`), the URL keeps
      `REPLACE_ME`, `TEST_DATABASE_URL` points at `/<test-database>`, and `sslmode` is gone.
- [ ] `JWT_SECRET` is 64 random characters in both providers.
- [ ] Step 5 loads the generated file through `server/src/config/env.js` without a zod error.
- [ ] `setup.cmd --help` prints the same help as `npm run setup -- --help`; an unknown option exits 1.
- [ ] `npm run lint` and `npm test` pass; `npm test` prints the setup tests before the API suites.

## Decisions and trade-offs

- **`setup.cmd` only for Windows, no logic duplication.** It switches the console to UTF-8 (the
  output contains an em dash), forwards `%*` to `scripts/setup.mjs`, and keeps the window open only
  when it was started from Explorer (`%cmdcmdline%` contains the file name) so a double-click does
  not flash and close. Everything else stays in the Node script.
- **Node script instead of `.sh`/`.bat`.** Node is already a requirement, so one file works on
  Windows, macOS and Linux. `npm run setup` wraps it; a shell script would need two variants.
- **Supabase by default, Docker optional.** The team moved the database to Supabase (05a), so a
  collaborator without Docker can start working. `--provider local` keeps the old path alive for
  offline work; `docker-compose.yml` is untouched and still documented.
- **Prompts only when a value is missing.** Flags and environment variables (`SUPABASE_POOLER_URL`,
  `SUPABASE_DB_PASSWORD`/`SUPABASE_PASS`) win, so the script is usable in a non-interactive shell.
  A missing value without a TTY fails with the exact flag to pass instead of hanging.
- **One password, not one per URL.** The script stores the password in `SUPABASE_DB_PASSWORD` and
  leaves `REPLACE_ME` in the URL; the API already substitutes it at runtime (05a). A password typed
  into the connection string is extracted and removed from the stored URL.
- **`sslmode` is stripped.** `pg` reads `sslmode=require` as `verify-full`, which rejects Supabase's
  pooler chain (documented in 05a). The script drops it instead of propagating the known failure.
- **Never overwrite silently.** `--force` is required to regenerate, so re-running after a `git pull`
  cannot destroy local credentials. Instead it reports what is still wrong in the file it kept.
- **`node:test` instead of Vitest.** The script must run before `npm install`, so its tests cannot
  depend on workspace tooling; `node --test` ships with Node 22. This keeps `npm test` database-free.
- **Placeholder detection understands the substitution pattern.** `REPLACE_ME` inside
  `SUPABASE_POOLER_URL`/`TEST_DATABASE_URL` is _correct_ when `SUPABASE_PASS` is set, so it is only
  reported when no real password exists anywhere in the file.

## Not done / deferred

- **No database is touched by the script.** It does not create `ba_dekor_test`, does not verify that
  the credentials work, and only migrates when `--migrate` is passed. Creating a database needs a
  privileged connection; the script prints the exact `CREATE DATABASE …;` statement instead.
- **Midtrans keys are not prompted for.** They are optional (the API answers `503
PAYMENT_NOT_CONFIGURED`), so they stay a manual edit in `server/.env`. A follow-up could prompt
  for them when they are present in the environment.
- **No password masking at the prompt.** The Supabase password is echoed while typed. Adding raw-mode
  masking is follow-up work if the reviewer wants it.
- **No PowerShell variant and no `.gitattributes`.** `setup.cmd` covers double-clicking on Windows;
  a `.ps1` would only duplicate it. Git's `core.autocrlf` already checks the file out with CRLF on
  Windows, so a `*.cmd eol=crlf` attribute was not added.
- **Not added to CI.** There is no CI pipeline in the repo yet; `npm test` and `npm run lint` cover it.

## Out of scope / noticed

- The **real `server/.env` in this checkout still uses
  `JWT_SECRET=development-only-secret-change-me`**. The script now warns about it instead of editing
  the file. Development works; `NODE_ENV=production` refuses to boot. Rotating it invalidates
  existing session cookies, so it was left to the owner.
- `npm run db:psql` in the root `package.json` still shells into the Docker container, so it does not
  work with Supabase. Untouched here.
- `docker-compose.yml` and the `db:psql` script are kept although Supabase is now the default. If the
  team wants to drop the Docker path entirely, that is a separate step.
- `AGENTS.md` contains unrelated uncommitted edits (Phase 5d Redis caching and renumbering). Only the
  stack row, layout block, 05a row and the new 01c row were touched.

## Open questions for the reviewer

1. Should `npm run setup` also **prompt for the Midtrans sandbox keys** when `--provider` is answered,
   or is a manual edit of `server/.env` acceptable while payments are optional?
2. Is a **root `.env` with `DB_PORT`** still wanted now that Docker is optional, or should the local
   provider always assume 5432 and drop `--db-port`?
3. Should the script offer to **create the test database** (via `pg`) when `--migrate` is passed, at
   the cost of a database dependency before `npm install` finishes?
4. Is echoing the Supabase password at the prompt acceptable for a course project, or should masking
   be added before this is shared?

## Reviewer feedback

_To be filled in by the reviewer._

<!-- If changes are requested, append "## Revision 1", "## Revision 2", ... below, in this same file. -->
