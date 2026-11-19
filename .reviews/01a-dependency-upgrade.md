# 01a – Dependency audit and version decisions

- **Status:** Changes requested
- **Phase:** 1 – Codebase setup
- **Date:** 2026-11-12
- **Author:** agent
- **Reviewer:** Kimi (Moonshot AI, AI reviewer)

## Summary

I checked the latest published version of every package the stack needs (against the npm registry on this machine) and fixed the versions step 01b scaffolds with. Nothing was installed or written to the codebase in this step; the only files touched are this note and `AGENTS.md` (to remove the leftover "Tailwind v3" wording after the switch to latest Tailwind).

## Files added / changed

This is an audit step: no package was installed and no application file was created or edited. Only documentation was written.

| File | Change |
| ---- | ------ |
| `.reviews/01a-dependency-upgrade.md` | This note: the audited version tables, the decisions behind them, and the verification procedure |
| `AGENTS.md` | Removed the leftover "Tailwind v3" wording after the switch to latest Tailwind, so the stack notes agree with the v4 decision (see *Out of scope / noticed*) |

Read but **not** modified, to confirm that the versions 01b scaffolded are the ones audited here:

| File | Why it was read |
| ---- | --------------- |
| `package.json` (root) | Declared ESLint/`@eslint/js`/tooling ranges |
| `client/package.json` | Declared frontend ranges |
| `server/package.json` | Declared backend ranges |
| `package-lock.json` | Resolved versions actually installed |

## Environment checked

| Item | Value |
| ---- | ----- |
| Node.js on this machine | `v22.14.0` (LTS) |
| npm | `11.17.0` |
| PostgreSQL client | not on `PATH` |
| Docker | installed, daemon **not** running at audit time |

Node 22 LTS satisfies every package below (Vite 8 needs `^20.19 || >=22.12`). If the team prefers the newest LTS, Node 24 also works; the code will not depend on 22-only APIs. I will not pin Node to 22 in `package.json` beyond `>=22.12`.

## Audited versions

Latest stable at the time of the audit. These are the versions step 01b writes into the manifests as `^` ranges, and the versions the lockfile resolved. All 34 rows are machine-checked against `package-lock.json` (see *How to run and verify*); the two rows that drifted from the first draft of this table are corrected in *Revision 1*.

**Frontend (`client/`)**

| Package | Version | Notes |
| ------- | ------- | ----- |
| `react`, `react-dom` | 19.3.1 | Function components + hooks only |
| `react-router-dom` | 7.18.5 | Data router API (`createBrowserRouter`) |
| `vite` | 8.3.8 | Dev server + build |
| `@vitejs/plugin-react` | 6.3.0 | Requires Vite `^8` |
| `tailwindcss` | 4.3.5 | **v4**, CSS-first config, no `tailwind.config.js` |
| `@tailwindcss/vite` | 4.3.5 | Replaces `postcss` + `autoprefixer` entirely |
| `@tailwindcss/forms` | 0.5.11 | Loaded in CSS with `@plugin "@tailwindcss/forms"` |
| `@tanstack/react-query` | 5.107.1 | Server-state layer, so mocks and real API share one shape |
| `react-icons` | 5.7.0 | Tree-shaken icon imports, replaces Font Awesome |
| `clsx` | 2.1.1 | Conditional class names |
| `tailwind-merge` | 3.7.0 | Used by the `cn()` helper so component props can override classes |

**Backend (`server/`)**

| Package | Version | Notes |
| ------- | ------- | ----- |
| `express` | 5.3.0 | v5: async handlers forward rejections to the error middleware automatically. Path syntax changed (path-to-regexp v8), so no bare `"*"` routes and no optional `?` params |
| `pg` | 8.23.1 | Connection pool + parameterised queries |
| `zod` | 4.6.7 | v4: `z.email()` and `z.uuid()` instead of `z.string().email()` |
| `bcrypt` | 6.0.0 | Native module, prebuilt binaries. Fallback to `bcryptjs` if install fails on a teammate's machine |
| `jsonwebtoken` | 9.0.3 | JWT signing for the httpOnly cookie |
| `cookie-parser` | 1.4.7 | |
| `cors` | 2.8.6 | |
| `helmet` | 8.3.0 | |
| `express-rate-limit` | 8.7.4 | Login/register throttling |
| `dotenv` | 18.0.10 | |
| `morgan` | 1.12.1 | Request logging in dev |

**Tooling (root, shared)**

| Package | Version | Notes |
| ------- | ------- | ----- |
| `eslint` | **9.39.5** | Deliberately **not** 10.14.0, see below |
| `@eslint/js` | **9.39.5** | Flat config preset, **same major as ESLint 9.39.5**. Declares no `eslint` peer dependency; engines `^18.18 || ^20.9 || >=21.1`. 10.0.1 is rejected, see below |
| `eslint-plugin-react` | 7.37.5 | peer range stops at ESLint `^9.7` |
| `eslint-plugin-react-hooks` | 7.1.1 | Supports 9 and 10 |
| `eslint-plugin-react-refresh` | 0.5.7 | Supports 9 and 10 |
| `globals` | 17.14.0 | Browser + Node global sets |
| `prettier` | 3.10.0 | Formatting only, no ESLint-Prettier plugin |
| `concurrently` | 10.0.7 | `npm run dev` runs client + server |
| `nodemon` | 3.1.11 | Server dev reload. This is what the scaffold declares (`^3.1.11`) and what the lockfile resolves; 3.1.14 is the current latest and a bump is a deliberate later step |
| `vitest` | 5.1.0 | peer `vite ^6 || ^7 || ^8`, so it matches Vite 8 |
| `supertest` | 7.3.2 | HTTP assertions against the Express app |

## How to run and verify

This is a planning-only step. **No application URL, install, build, lint or test run applies**, because this
step installs and executes nothing. Every command below is read-only: npm registry metadata, the manifests
and the lockfile. Run them from the repository root.

```sh
# 1. Toolchain the versions were audited against
node --version                     # v22.14.0 here; anything >=22.12 is valid
npm --version                      # 11.17.0 here

# 2. The package this revision is about (P1)
npm view @eslint/js@9.39.5 version peerDependencies engines --json
#   -> no peerDependencies; engines ^18.18.0 || ^20.9.0 || >=21.1.0
npm view eslint@9.39.5 version engines --json
#   -> engines ^18.18.0 || ^20.9.0 || >=21.1.0
npm view @eslint/js@10.0.1 peerDependencies engines --json
#   -> peerDependencies.eslint ^10.0.0; engines ^20.19.0 || ^22.13.0 || >=24   (rejected)

# 3. Peer ranges the other decisions rest on
npm view eslint-plugin-react@7.37.5 peerDependencies --json   # eslint ^3 ... ^9.7
npm view vite@8.3.8 engines --json                            # ^20.19.0 || >=22.12.0
npm view @vitejs/plugin-react@6.3.0 peerDependencies --json   # vite ^8.0.0
npm view vitest@5.1.0 peerDependencies engines --json         # vite ^6.4 || ^7 || ^8; node ^22.12 || ^24 || >=26

# 4. Any single row of the table: is the recorded version a published version?
npm view <package>@<version> version

# 5. Every row of the table against what step 01b actually installed
node -e "const l=require('./package-lock.json');const t={'react':'19.3.1','react-dom':'19.3.1','react-router-dom':'7.18.5','vite':'8.3.8','@vitejs/plugin-react':'6.3.0','tailwindcss':'4.3.5','@tailwindcss/vite':'4.3.5','@tailwindcss/forms':'0.5.11','@tanstack/react-query':'5.107.1','react-icons':'5.7.0','clsx':'2.1.1','tailwind-merge':'3.7.0','express':'5.3.0','pg':'8.23.1','zod':'4.6.7','bcrypt':'6.0.0','jsonwebtoken':'9.0.3','cookie-parser':'1.4.7','cors':'2.8.6','helmet':'8.3.0','express-rate-limit':'8.7.4','dotenv':'18.0.10','morgan':'1.12.1','eslint':'9.39.5','@eslint/js':'9.39.5','eslint-plugin-react':'7.37.5','eslint-plugin-react-hooks':'7.1.1','eslint-plugin-react-refresh':'0.5.7','globals':'17.14.0','prettier':'3.10.0','concurrently':'10.0.7','nodemon':'3.1.11','vitest':'5.1.0','supertest':'7.3.2'};let bad=0;for(const k of Object.keys(t)){const p=l.packages['node_modules/'+k]||l.packages['client/node_modules/'+k]||l.packages['server/node_modules/'+k];const got=p&&p.version;const ok=got===t[k];if(!ok)bad++;console.log((ok?'ok   ':'DRIFT')+'  '+k.padEnd(28)+' note='+t[k].padEnd(9)+' lock='+got);}console.log('---');console.log(bad===0?'all '+Object.keys(t).length+' rows match the lockfile':bad+' row(s) drifted');"
#   -> 34 ok lines, then: all 34 rows match the lockfile

# 6. AGENTS.md consistency: Tailwind v4 is CSS-first, so no JS/PostCSS config file may exist
node -e "const fs=require('fs');for(const p of ['tailwind.config.js','client/tailwind.config.js','postcss.config.js','client/postcss.config.js'])console.log(p,fs.existsSync(p)?'PRESENT':'absent')"
#   -> all four absent
```

Checklist the reviewer can tick:

- [ ] `node --version` is `>=22.12` and `npm --version` prints a version.
- [ ] Command 2 matches its comments: `@eslint/js@9.39.5` declares no `eslint` peer dependency, and
      `@eslint/js@10.0.1` requires ESLint `^10.0.0` with engines that exclude Node 22.12.
- [ ] `eslint` and `@eslint/js` are both **9.39.5** in the tables above, in the root `package.json`
      (`"eslint": "^9.39.5"`, `"@eslint/js": "^9.39.5"`) and in `package-lock.json`.
- [ ] Command 5 prints `all 34 rows match the lockfile` — the audit table and step 01b agree.
- [ ] Command 6 reports all four config files absent, and `client/src` has no `.ts`/`.tsx` files, so the
      note still agrees with the stack section of `AGENTS.md` (Tailwind v4, JavaScript only).
- [ ] No dependency or application file belongs to this step. The repository has no commits yet, so
      `git --no-optional-locks status --short` also lists later steps' uncommitted work; compare against
      the *Files added / changed* table above instead of expecting a clean tree.

## Decisions and trade-offs

- **ESLint 9 (and `@eslint/js` 9) over 10.** `eslint-plugin-react` still declares `eslint: ^3 … ^9.7`, so ESLint 10 would only install with a peer warning and could break at runtime. `@eslint/js` moves on the **same major** as ESLint, because `@eslint/js@10.0.1` declares `peerDependencies.eslint: ^10.0.0` — the exact conflict this decision exists to avoid — and engines `^20.19 || ^22.13 || >=24`, which excludes the `>=22.12` floor; `@eslint/js@9.39.5` declares no `eslint` peer at all and does support the floor. Both stay on 9.39.5, the newest 9.x, so `npm install` stays peer-clean. Revisit both together when the plugin ships ESLint 10 support.
- **Node `>=22.12` is set by the toolchain, not guessed.** `vitest@5.1.0` declares `^22.12.0 || ^24.0.0 || >=26.0.0`, and `vite@8.3.8` / `@vitejs/plugin-react@6.3.0` declare `^20.19.0 || >=22.12.0`. Every other row accepts 22.12.0 (the next strictest are `concurrently` `>=22` and `react-router-dom` `>=20`), so 22.12 is the highest lower bound in the stack — the floor is `>=22.12` rather than `>=22` because of it.
- **Tailwind 4, CSS-first.** Following the "latest" decision, the theme lives in `@theme` inside `client/src/styles/theme.css`; `postcss.config.js` and `tailwind.config.js` are dropped. This is a real behaviour change for anyone used to v3: renamed utilities (`shadow`→`shadow-sm`, `rounded`→`rounded-sm`, `outline-none`→`outline-hidden`, `flex-shrink-0`→`shrink-0`, `bg-opacity-*`→`bg-black/50`) must be used consistently. I added a warning line to `AGENTS.md` so later steps do not copy v3 classes out of `legacy-template/`.
- **`@tailwindcss/vite` instead of PostCSS.** Fewer moving parts and no autoprefixer config; this removes `postcss` and `autoprefixer` from the dependency list entirely.
- **`react-icons` instead of Font Awesome.** The legacy pages load a CSS `<link>` from `node_modules`, which does not survive bundling well. `react-icons` ships only the icons imported, so the bundle stays small.
- **TanStack Query added now, in step 02.** The roadmap promised a `services/` layer that mocks can back. Wrapping it in React Query from the start means step 05 swaps the service implementation and the hooks, loading and error states do not change. The alternative, hand-rolled `useEffect` fetching, would be thrown away later.
- **`pg` + a tiny plain-SQL migration runner, no ORM.** Matches `AGENTS.md` ("plain SQL migrations") and keeps the SQL visible for a course project. Prisma/Knex would add a schema DSL and a generated client for little gain here.
- **No `postcss`/`autoprefixer`, no `flowbite`, no `@fortawesome/*`.** All three were only needed by the static template.

## Not done / deferred

- Nothing installed yet, so nothing verified beyond the registry metadata. Risk noted: `bcrypt` needs a native prebuild, which is the one install most likely to fail on Windows. First thing to check in 01b.
- Postgres itself is still unverified: no `psql` on `PATH` and the Docker daemon was down during the audit. 01b ships a `docker-compose.yml`, and the review note will say plainly whether it could be started here.

## Out of scope / noticed

- `AGENTS.md` still described Tailwind as v3 in two places after the switch to "latest". I corrected those lines (stack notes and the 01a roadmap row) because they now contradict the stack table. No other roadmap content changed.

## Open questions for the reviewer

1. Is **ESLint 9.39.5** acceptable (instead of 10) for the plugin-compatibility reason above, or do you want ESLint 10 and the peer warning?
2. Keep **React 19** as the target, or should the client try to match whatever React version the course materials use?
3. Confirm **TanStack Query** is in scope for the frontend architecture (see the trade-off above).
4. Confirm **Node 22 LTS** as the floor (`>=22.12` in `engines`), or do you want Node 24?

## Reviewer feedback

### Review — 2026-11-18

**Verdict: Changes requested.** This review covers the dependency audit and version decisions in step 01a only. Only this review note was edited; no application code or manifests were changed.

#### Findings

1. **P1 — The selected `@eslint/js` version is incompatible with the selected ESLint version.** The table chooses `@eslint/js` 10.0.1 alongside ESLint 9.39.5 and describes it as compatible. Registry metadata for `@eslint/js@10.0.1` declares `peerDependencies.eslint: ^10.0.0`, so that combination would produce the peer conflict that the ESLint 9 decision is intended to avoid. Its Node engine range (`^20.19.0 || ^22.13.0 || >=24`) also excludes Node 22.12.x even though the proposed floor is `>=22.12`. The current root manifest already uses `@eslint/js` `^9.39.5`, which also disagrees with the audit table. **Requested correction:** record `@eslint/js` 9.39.5 with ESLint 9.39.5 (and explain that both stay on major 9), or provide a different internally consistent, peer-compatible decision. Keep the audit and the versions actually scaffolded in 01b aligned.

2. **P2 — The note lacks the required verification handoff.** There is no `Files added / changed` section and no `How to run and verify` section, although both are mandatory under `AGENTS.md` and `.reviews/_TEMPLATE.md`. Consequently there are no documented commands or checklist for a reviewer to reproduce, and the registry claims cannot be approved using the required review process. **Requested correction:** add the file table and exact read-only commands for checking Node/npm, package versions, relevant peer dependencies and engines, and consistency with `AGENTS.md`. Include a checklist and state explicitly that no application URL, install, build, lint or test run applies to this planning-only step.

#### Evidence and coverage

- Read `AGENTS.md`, this note, `.reviews/_TEMPLATE.md`, the current root/client/server manifests, and the available diff.
- Ran `node --version` and `npm --version`; confirmed `v22.14.0` and `11.17.0`.
- Ran `npm view <package> version` for every package listed in the audit. The recorded versions were confirmed as published versions. Newer current releases observed for a few packages (for example TanStack Query 5.108.0 and Vitest 5.1.1) do not by themselves invalidate a historical point-in-time audit.
- Ran targeted `npm view` checks for the declared peer dependencies and engines. Confirmed `eslint-plugin-react@7.37.5` stops at ESLint `^9.7`, Vite 8.3.8 supports Node `>=22.12.0`, `@vitejs/plugin-react@6.3.0` peers on Vite `^8.0.0`, and Vitest 5.1.0 peers on Vite `^6.4.0 || ^7.0.0 || ^8.0.0`.
- No dependency installation, application URL, build, lint or test execution was required or performed for this audit-only step. The missing documented verification procedure remains unverified until supplied and rerun.

#### Disposition of open questions

- ESLint 9.39.5 is acceptable because of the confirmed plugin peer range; use the matching `@eslint/js` 9.x rather than accepting a peer warning.
- React 19 and TanStack Query are consistent with the current stack and frontend architecture. Any course-specific React constraint remains a team question, but none is documented here.
- Node `>=22.12` is an acceptable floor for the selected Vite 8 toolchain, provided all other selected packages support it; the incompatible `@eslint/js` 10 selection must be corrected as above.

#### Next action

Append `Revision 1` to this same file addressing both findings. Leave the status `Changes requested` until re-review; only the reviewer may set `Approved`.

## Revision 1 — 2026-11-19

Response to the review of 2026-11-18. Both findings are addressed; one further drift was found and
corrected while re-checking every row. The status stays `Changes requested` — only the reviewer may set
`Approved`.

### P1 — `@eslint/js` is now 9.39.5, matched to ESLint 9.39.5

- The audit table was wrong and now records **`@eslint/js` 9.39.5**, in the same row that explains why.
- The finding is confirmed against the registry:
  - `npm view @eslint/js@10.0.1 peerDependencies engines --json` → `eslint: ^10.0.0` and engines
    `^20.19.0 || ^22.13.0 || >=24`. That reintroduces the peer conflict the ESLint-9 decision exists to
    avoid **and** excludes Node 22.12.x while the declared floor is `>=22.12`.
  - `npm view @eslint/js@9.39.5 peerDependencies engines --json` → **no** `eslint` peer dependency at all
    (it is a plain shared-config package, not a plugin), engines `^18.18.0 || ^20.9.0 || >=21.1.0`.
- The ESLint bullet under *Decisions and trade-offs* now covers both packages and says why they move together.
- **No manifest change was needed, so none was made.** Step 01b already scaffolded the corrected pair: root
  `package.json` declares `"eslint": "^9.39.5"` and `"@eslint/js": "^9.39.5"`, and `package-lock.json`
  resolves both to 9.39.5. The stale table was the only disagreement, so the audit and 01b now agree
  without touching code or the lockfile.

### P1b — one more audit/scaffold drift, fixed the same way

- `nodemon` was recorded as 3.1.14 while the scaffold declares `^3.1.11` and the lockfile resolves 3.1.11
  (`npm view nodemon version` → 3.1.14 is the current latest, published 2026-03-06).
- The row now records **3.1.11**, the version step 01b actually installed, and says so.
- Why not bump the manifest instead: `AGENTS.md` says a version change after a step is a deliberate,
  separate step, not a silent drive-by upgrade, and 01b is already approved. `^3.1.11` is a caret range,
  so a later deliberate bump — or a fresh install without the lockfile — resolves 3.1.14.
- All 34 rows are now machine-checked against `package-lock.json` by the drift command in *How to run and
  verify*, which prints `all 34 rows match the lockfile`.

### P2 — `Files added / changed` and `How to run and verify` are now in the note

- Both mandatory sections were added in `.reviews/_TEMPLATE.md` order: *Files added / changed* right after
  the summary (listing what was written, plus the manifests read but not modified), and *How to run and
  verify* just before *Decisions and trade-offs*.
- The verification section is entirely read-only — registry metadata (`npm view` for versions, peers and
  engines), the three manifests and `package-lock.json` — and it states plainly that **no application URL,
  install, build, lint or test run applies** to this planning-only step. It ends with a six-item checklist.
- One checklist item explains why the working tree is not clean: the repository has no commits yet, so
  `git status` also shows later steps' uncommitted work; the *Files added / changed* table is the authority
  for this step's scope.
- I ran every documented command before writing it down; the results are recorded below.

### Files changed by this revision

| File | Change |
| ---- | ------ |
| `.reviews/01a-dependency-upgrade.md` | `@eslint/js` → 9.39.5, `nodemon` → 3.1.11, new *Files added / changed* and *How to run and verify* sections, ESLint decision bullet expanded and a Node-floor bullet added, this revision |

Not modified: `AGENTS.md`, `package.json`, `client/package.json`, `server/package.json`,
`package-lock.json`. No application code exists in this step, so nothing else could change.

### Re-run of the documented checks (this machine)

| Check | Result |
| ----- | ------ |
| `node --version`, `npm --version` | `v22.14.0`, `11.17.0` |
| `@eslint/js@9.39.5` peers/engines | no peer deps; `^18.18.0 \|\| ^20.9.0 \|\| >=21.1.0` |
| `@eslint/js@10.0.1` peers/engines | `eslint ^10.0.0`; `^20.19.0 \|\| ^22.13.0 \|\| >=24` |
| `eslint-plugin-react@7.37.5` peer | `eslint ^3 ... ^9.7` |
| `vite@8.3.8`, `@vitejs/plugin-react@6.3.0` engines | `^20.19.0 \|\| >=22.12.0` |
| `vitest@5.1.0` peers/engines | vite `^6.4 \|\| ^7 \|\| ^8`; node `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` |
| Engines of all 34 selected versions | every one accepts Node 22.12.0; `vitest` sets the floor |
| Lockfile drift check | `all 34 rows match the lockfile` (34 `ok`, 0 `DRIFT`) |
| `AGENTS.md` consistency | no `tailwind.config.js`, no `postcss.config.js`, 0 `.ts`/`.tsx` files under `client/src`, `@theme` present in `client/src/styles/theme.css` |

### Still open

- The four original open questions were dispositioned in the review (ESLint 9 accepted, React 19 and
  TanStack Query confirmed, Node `>=22.12` accepted *provided every selected package supports it* —
  checked above, all do). Nothing new blocks approval.
- If the reviewer would rather have `nodemon` bumped to 3.1.14 than recorded at 3.1.11, that is a
  deliberate dependency-bump step with its own note; say the word and I will file it rather than change
  an approved step.
