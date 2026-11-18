# 00 – Development plan

- **Status:** Changes requested
- **Phase:** 0 – Planning
- **Date:** 2026-11-12
- **Author:** agent
- **Reviewer:** Zed coding agent (AI reviewer)

## Summary

This is the roadmap for turning the static Tailwind template into a fullstack app with React (JavaScript), Express, PostgreSQL and Tailwind. The full step list and the working rules are in `AGENTS.md`. This note records what the template contains today, what needs fixing, and the assumptions I made.

## Files added / changed

| File | Change |
| ---- | ------ |
| `AGENTS.md` | New. Stack, conventions, roadmap and working rules; updated in Revision 1 (admin scope, IDR/Bahasa Indonesia, dependency-audit step) and Revision 2 (Tailwind v4 wording) |
| `.reviews/_TEMPLATE.md` | New. Structure every review note follows |
| `.reviews/00-development-plan.md` | New. This note |

No application, configuration or `legacy-template/` file was changed by step 00. Later steps have since written to the repository; this table lists step 00's own deliverables only.

## How to run and verify

This is a documentation-only step, so there is no application URL, server, build, lint or test run that applies. The commands below are read-only and can be run from the repository root.

```sh
# 1. Page inventory: expect exactly nine HTML pages
find legacy-template -name "*.html" | sort

# 2. Asset inventory: 12 product images, 6 category images
find legacy-template/public/assets/images/products -type f | wc -l
find legacy-template/public/assets/images/category -type f | wc -l
wc -l legacy-template/public/assets/css/main.css      # prebuilt CSS, 1766 lines

# 3. Legacy v3 configuration defects (reference only, see Template audit)
grep -n 'content:' legacy-template/tailwind.config.js   # spaced glob
grep -n 'screen:' legacy-template/tailwind.config.js    # singular key, should be screens

# 4. Stray legacy script is retained as reference material
cat legacy-template/public/pages/ondex.js

# 5. Current stack decision is Tailwind v4, not the legacy v3 config
grep -n '"tailwindcss"' client/package.json
head -20 client/src/styles/theme.css
ls client/tailwind.config.js 2>/dev/null || echo "no client tailwind.config.js (expected)"

# 6. The client does not reference the stray legacy script
grep -rn "ondex" client/ || echo "no reference (expected)"
```

Checklist the reviewer can tick:

- [ ] The page inventory lists nine pages (`index`, `shop`, `product`, `login`, `register`, `account`, `profile`, `wishlist`, `checkout`).
- [ ] The asset inventory shows 12 product images and 6 category images, and `main.css` exists as a prebuilt 1766-line file.
- [ ] `tailwind.config.js` shows both defects: the spaced `content` glob and the singular `theme.screen` key.
- [ ] `legacy-template/public/pages/ondex.js` still exists and still imports `flowbite-tailwind`; nothing was deleted from the reference copy.
- [ ] The client is on Tailwind v4: `tailwindcss` is major 4, `theme.css` holds an `@theme` block, and there is no `client/tailwind.config.js`.
- [ ] The client never references `ondex`, so the stray script cannot enter the build.
- [ ] No application URL applies to this step, and no install, build, lint or test run was claimed.
- [ ] Every roadmap row in `AGENTS.md` (00 → 10) appears once, in order, and matches the phase tables above.

## Template audit

**What exists**

- 9 static pages: `index`, `shop`, `product`, `login`, `register`, `account`, `profile`, `wishlist`, `checkout`.
- Each page repeats the header, footer and nav markup (about 800 lines at most per page).
- Assets: 12 product images, 6 category images, icons, a logo, a banner, an offer image, `complete.png` and payment methods.
- Tailwind v3 plus `@tailwindcss/forms`, Flowbite 1.x and Font Awesome 6. Brand colour is `#fd3d57`, fonts are Poppins and Roboto.
- `public/assets/css/main.css` is a prebuilt 1766-line file, and `src/main.css` is the source.

**Scope of this audit.** Everything below describes `legacy-template/` **as it was found**, which is Tailwind **v3** with `theme.extend`, a `content` glob, Flowbite and Font Awesome. The project has since decided on Tailwind **v4** (CSS-first `@theme` in `client/src/styles/theme.css`, `@tailwindcss/vite`, no `tailwind.config.js`), so this section is an audit of the reference copy, **not** a configuration to port. The legacy files stay byte-for-byte as they are; only behaviour is reimplemented in React (step 01b and onwards). The versions the client and server are actually built on are decided in `01a-dependency-upgrade.md`.

**Problems found in the reference template and how they are handled**

| Issue | Where | Handling |
| ----- | ----- | -------- |
| `content: ["./public/**/*.{html, js}"]` has a space inside the braces, so the glob may not match | `legacy-template/tailwind.config.js` | **Reference only.** Tailwind v4 has no `content` glob; the client uses v4's automatic source detection. Do **not** port this key. |
| `theme.screen` is a typo, it should be `screens`, so the custom breakpoints are ignored | `legacy-template/tailwind.config.js` | **Reference only.** v4 declares breakpoints as `--breakpoint-*` inside `@theme` if custom values are needed. Do **not** port `theme.screen`. |
| No build or watch script, but the README says `npm run watch` | `legacy-template/package.json` | The legacy package stays as-is. The client and server are built and run by the root scripts from `01b` (`dev`, `build`, `lint`). |
| `pages/ondex.js` is a stray file that imports `flowbite-tailwind`, which is not a dependency | `legacy-template/public/pages/ondex.js` | **Keep the file** in the reference copy and **exclude it from the client**: nothing copies it, no page is served from `legacy-template/`, and the Offcanvas interaction is reimplemented as a React component. Deleting it would change the preserved reference material for no gain. |
| Pages reference `../../node_modules/...` for Font Awesome | all legacy pages | The client uses `react-icons` instead; the legacy `<link>` tags stay in the reference pages. |
| The README is still the upstream template README | root `README.md` | Rewritten for the new monorepo in `01b`. The upstream readme is not kept as a separate file; only the `legacy-template/` sources and assets are preserved. |
| No cart page, no orders page, no product-reviews data | whole template | New pages: cart in `03g`, order history in `03e`, reviews deferred (see *Not done*). |

## Assumptions to confirm

1. **Vite** for the React app. It is lighter than CRA, which is deprecated.
2. **Monorepo with two folders**, `client/` and `server/`, and a root `package.json` that runs both. npm workspaces are optional.
3. **Raw SQL with `pg`** and plain `.sql` migrations. Prisma or Knex are the alternatives if the team prefers an ORM.
4. **Auth** with a JWT in an httpOnly cookie. Same-site, so the Vite dev proxy is needed.
5. **No real payment gateway.** Checkout supports cash-on-delivery or a simulated payment. A real gateway (Midtrans, Stripe) would be an extra step.
6. **Flowbite's JS is dropped.** Interactive pieces (dropdowns, offcanvas, tabs) become React components. Plain Tailwind classes stay.
7. ~~**Tailwind stays on v3.**~~ **Superseded by Revision 2:** the stack moved to Tailwind **v4** (CSS-first `@theme`, `@tailwindcss/vite`, no `tailwind.config.js`); see the *Stack* section of `AGENTS.md` and `01a-dependency-upgrade.md`. The v3 audit above is kept as a record of the reference template, not as an implementation instruction.
8. **Frontend first against mock data** (as requested), then the backend, then integration in Phase 5. The `services/` layer keeps the mock-to-API swap small.

## Open questions for the reviewer

1. Is there an **admin side** (manage products, orders)? It is not in the template and I left it out. If yes, I suggest a new Phase 4.5 with `04h-admin-api.md` and `04i-admin-ui.md`.
2. Which **currency** and which **language** should the UI use? The template is English.
3. How should the team **split the work**? If members take separate steps, each step's review note should name its owner in the *Author* field.
4. Are **tests** required by the course, and at what level (API only, or frontend too)?
5. Where will it be **deployed**, if anywhere? Options are a free tier such as Render or Railway, or local only. It affects step 10.
6. Is there an existing **Postgres** install, or should I use docker-compose?

## Not done

Nothing has been changed in the codebase yet. This step only adds `AGENTS.md`, `.reviews/_TEMPLATE.md` and this note.

## Reviewer feedback

### Review — 2026-11-16

**Verdict: Changes requested.** This review covers step 00 only. Later implementation steps are not reviewed or approved here. Only this review file was edited; no application, configuration, or legacy-template files were changed.

#### Findings

1. **P2 — The plan still prescribes Tailwind v3 after the project adopted v4.** The audit's remediation table (original lines 27–28) tells the implementer to configure `content` and `screens`; assumption 7 (line 43) explicitly retains v3; Revision 1 item 3 (line 72) still pins the audit to v3.x. These are inconsistent with the supplied `AGENTS.md`, which requires Tailwind v4, CSS-first `@theme` tokens in `client/src/styles/theme.css`, and `@tailwindcss/vite`, without a new `tailwind.config.js`. Following this note would scaffold the wrong configuration. **Requested correction:** distinguish the legacy v3 audit from the current v4 implementation decision, mark the old assumption as superseded, and update the remediation and dependency-audit instructions. Preserve the original template config as reference rather than porting its configuration API.

2. **P2 — Required review evidence is missing.** The note has no `Files added / changed` table or `How to run and verify` section, despite both being required by `AGENTS.md` and `.reviews/_TEMPLATE.md`. The `Not done` paragraph names three files, but does not provide a reproducible way to verify the audit or reconcile the accepted decisions with the roadmap. **Requested correction:** add the file table, exact read-only verification commands, and a checklist covering the nine pages, assets, configuration defects, and roadmap consistency. For this documentation-only step, explicitly state that no application URL applies. Keep any commands not actually executed marked unverified rather than claiming completion. Runtime tests need not be invented for a planning note.

3. **P2 — The stray-script remediation conflicts with retaining the original template.** The audit table (original line 30) instructs deleting `public/pages/ondex.js`, while the target layout in `AGENTS.md` keeps the original static template under `legacy-template/` as design reference. The file currently exists at `legacy-template/public/pages/ondex.js` and imports the undeclared `flowbite-tailwind` package. Deleting it from the preserved source is unnecessary to build the React app and changes the reference material. **Requested correction:** say to exclude the script from the new client and reimplement only the needed interaction in React, leaving the legacy reference untouched.

#### Evidence and coverage

- Read the supplied `AGENTS.md`, this note including Revision 1, and `.reviews/_TEMPLATE.md`.
- Confirmed nine HTML pages by file discovery under `legacy-template/public/`.
- Confirmed 12 product images, six category images, and the listed banner, offer, logo, completion and payment-method assets by directory inspection.
- Read `legacy-template/package.json`: Tailwind `^3.0.23`, forms `^0.5.0`, Flowbite `^1.6.5`, Font Awesome `^6.0.0`, and no build/watch scripts. These are legacy declarations, not verification of current registry versions.
- Read `legacy-template/tailwind.config.js`: confirmed the spaced content glob, singular `theme.screen`, `#fd3d57`, and Poppins/Roboto configuration. Read `legacy-template/src/main.css` and the end of the generated CSS, which ends at line 1766.
- Read the stray script and inspected HTML references to Google Fonts and `node_modules` assets. The current root README is not evidence of the historical upstream README; that historical claim was not independently verified.
- Loaded `frontend-design` and `ui-taste`, including the read-only audit and consistency guidance. Inspected `screenshots/Ecommerce-Tailwind.png` as a static reference: the furniture imagery, pink-red accent, white storefront, category grid and product sections support preserving the existing design rather than introducing a redesign.
- **Limits:** no terminal or browser tool is available in this session. No lint, tests, builds, dev server, live URLs, viewport checks, keyboard interactions, contrast measurements, or performance measurements were run. A static reference image does not establish the current client's visual or accessibility quality. Those checks belong to their respective implementation reviews.

#### Disposition of open questions

- Admin scope, currency, language and brand are already answered in Revision 1 and the current `AGENTS.md`; do not reopen them as undecided requirements.
- The roadmap already requires tests for backend steps and later frontend quality work. Course-specific expectations and team ownership may remain open without weakening those requirements.
- Deployment can remain deferred to step 10. Local PostgreSQL setup belongs to step 01b; step 00 need not choose an installation method to complete the dependency audit.

#### Next action

Append `Revision 2` in this same file addressing the three findings, leaving this reviewer verdict intact. Keep the status `Changes requested` until re-review; only the reviewer may set `Approved`. Later steps were observed to exist but were not assessed in this pass.

## Revision 1

The reviewer confirmed:

1. **Admin is in scope.** Added to the roadmap in `AGENTS.md`:
   - Phase 3b (frontend, against mocks): `03h-admin-layout.md` (shell + role guard + dashboard), `03i-admin-products-page.md` (product/category/brand CRUD UI), `03j-admin-orders-page.md` (order list, detail, status update).
   - Phase 4b (backend): `04h-admin-catalog-api.md`, `04i-admin-orders-api.md`.
   - A `role` column (`customer` / `admin`) is added to the `users` table in `04a-db-schema.md`, and an admin-only middleware is added alongside the auth middleware in `04b-auth-api.md`.
2. **Currency is IDR, language is Bahasa Indonesia, brand is BaDekor (Banjarmasin).** Added a *Product context* section to `AGENTS.md` and updated the money convention: Rupiah is stored as a whole-number `BIGINT` (no decimal subunit) instead of `NUMERIC(12,2)`, and displayed as `Rp 1.250.000`. User-facing copy and seed data (product names, categories, emails) will be written in Indonesian; code, comments and docs stay in English per the existing rule 10.
3. **New step: dependency upgrade audit.** Phase 1 is now split into `01a-dependency-upgrade.md` (check the latest stable version of every piece of the stack: Node LTS, React, Vite, React Router, Express, `pg`, `zod`, `bcrypt`, ESLint/Prettier, etc., **Tailwind on the latest v4.x**) and `01b-codebase-setup.md` (scaffold using the versions decided in 01a). <sub>Corrected in Revision 2: this line originally said "Tailwind pinned to the latest v3.x", which contradicted the v4 decision.</sub> Going forward, dependencies are kept on their latest stable major/minor at the time each step is done; later upgrades are deliberate, separate steps rather than silent bumps.

**Still open** (not answered yet, carried over from the original list):

3. How will the team split the work across members?
4. Are tests required by the course, and at what level (API only, or frontend too)?
5. Where will this be deployed, if anywhere?
6. Is there an existing Postgres install, or should `01b` set up docker-compose?

These don't block starting `01a`, so I'll proceed once this revision is approved.

## Revision 2

Addresses the three findings in the review of 2026-11-16. The reviewer's verdict block above is left untouched, and the status stays `Changes requested` until re-review.

1. **Tailwind v3 wording removed from the plan (was P2 finding 1).**
   - The audit section now states up front that it describes `legacy-template/` **as found** (Tailwind v3 + Flowbite + Font Awesome) and is reference material, not a configuration to port. The current decision is Tailwind **v4**: CSS-first `@theme` in `client/src/styles/theme.css`, `@tailwindcss/vite`, no `tailwind.config.js`.
   - The remediation table was rewritten: the `content` glob and `theme.screen` rows are marked **reference only** with explicit "do not port" instructions, and breakpoints are described as `--breakpoint-*` inside `@theme`.
   - Assumption 7 ("Tailwind stays on v3") is struck through and marked **superseded**.
   - Revision 1 item 3 incorrectly said "Tailwind pinned to the latest v3.x"; it now reads **v4.x** with an inline note marking the correction. Revision 1 is otherwise unchanged.
   - Verified against the working tree: `client/package.json` has `tailwindcss ^4.3.5`, `client/src/styles/theme.css` contains an `@theme` block with `--color-primary: #fd3d57`, and there is no `client/tailwind.config.js`.

2. **Review evidence added (was P2 finding 2).**
   - Added `## Files added / changed`, listing `AGENTS.md`, `.reviews/_TEMPLATE.md` and this note, and stating that step 00 changed no application, configuration or `legacy-template/` file.
   - Added `## How to run and verify` with six read-only command groups (page inventory, asset inventory, the two config defects, the retained stray script, the current v4 setup, and proof the client does not reference the stray script) plus an eight-item checklist.
   - The section states explicitly that this documentation-only step has **no application URL** and that no install, build, lint or test run applies. All commands listed were executed in this revision session; none are claimed unverified.

3. **Stray-script handling corrected (was P2 finding 3).**
   - The table no longer says to delete `public/pages/ondex.js`. It says to **keep the file** as part of the preserved reference and to **exclude it from the client**, reimplementing only the Offcanvas interaction in React.
   - Verified: `cat legacy-template/public/pages/ondex.js` still shows the `flowbite-tailwind` import, and `grep -rn "ondex" client/` returns nothing, so the file cannot reach the client build.

**Commands run in this revision:** `find legacy-template -name "*.html" | wc -l` (9), the two `find … | wc -l` asset counts (12 and 6), `wc -l …/main.css` (1766), `grep -n 'content:'` and `grep -n 'screen:'` on the legacy config, `cat …/ondex.js`, `grep -n '"tailwindcss"' client/package.json` (`^4.3.5`), `head -20 client/src/styles/theme.css`, `ls client/tailwind.config.js` (absent), and `grep -rn "ondex" client/` (no match).

**Still open after Revision 2:** only the team questions from Revision 1 (work split, course test expectations, deployment target, Postgres install method). The reviewer's disposition already resolved admin scope, currency/language, ESLint/React/Node choices and the deployment deferral, so none of those are reopened here.

**Small conformance fixes in this revision:** the `Reviewer` field now marks the reviewer as an AI reviewer (`Zed coding agent (AI reviewer)`) as required by the *Review process* section of `AGENTS.md`. The verdict text itself is untouched. The status stays `Changes requested`; only the reviewer moves it to `Approved`.
