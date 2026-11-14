# 01a – Dependency audit and version decisions

- **Status:** Awaiting review
- **Phase:** 1 – Codebase setup
- **Date:** 2026-11-12
- **Author:** agent
- **Reviewer:** _unassigned_

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

_To be filled in by the reviewer._
