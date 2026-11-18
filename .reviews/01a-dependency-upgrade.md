# 01a – Dependency audit and version decisions

- **Status:** Changes requested
- **Phase:** 1 – Codebase setup
- **Date:** 2026-11-12
- **Author:** agent
- **Reviewer:** Kimi (Moonshot AI, AI reviewer)

## Summary

I checked the latest published version of every package the stack needs (against the npm registry on this machine) and fixed the versions step 01b scaffolds with. Nothing was installed or written to the codebase in this step; the only files touched are this note and `AGENTS.md` (to remove the leftover "Tailwind v3" wording after the switch to latest Tailwind).

## Environment checked

| Item | Value |
| ---- | ----- |
| Node.js on this machine | `v22.14.0` (LTS) |
| npm | `11.17.0` |
| PostgreSQL client | not on `PATH` |
| Docker | installed, daemon **not** running at audit time |

Node 22 LTS satisfies every package below (Vite 8 needs `^20.19 || >=22.12`). If the team prefers the newest LTS, Node 24 also works; the code will not depend on 22-only APIs. I will not pin Node to 22 in `package.json` beyond `>=22.12`.

## Audited versions

Latest stable at the time of the audit. These are the versions step 01b writes into the manifests.

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
| `@eslint/js` | 10.0.1 | Flat config preset, compatible with ESLint 9 |
| `eslint-plugin-react` | 7.37.5 | peer range stops at ESLint `^9.7` |
| `eslint-plugin-react-hooks` | 7.1.1 | Supports 9 and 10 |
| `eslint-plugin-react-refresh` | 0.5.7 | Supports 9 and 10 |
| `globals` | 17.14.0 | Browser + Node global sets |
| `prettier` | 3.10.0 | Formatting only, no ESLint-Prettier plugin |
| `concurrently` | 10.0.7 | `npm run dev` runs client + server |
| `nodemon` | 3.1.14 | Server dev reload |
| `vitest` | 5.1.0 | peer `vite ^6 || ^7 || ^8`, so it matches Vite 8 |
| `supertest` | 7.3.2 | HTTP assertions against the Express app |

## Decisions and trade-offs

- **ESLint 9 over 10.** `eslint-plugin-react` still declares `eslint: ^3 … ^9.7`, so ESLint 10 would only install with a peer warning and could break at runtime. Sticking to the newest 9.x keeps `npm install` clean. Revisit when the plugin ships ESLint 10 support.
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
