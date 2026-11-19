# AGENTS.md

Guidance for AI agents (and humans) working on **ecomm-web**, a group project that is being turned from a static Tailwind template into a fullstack ecommerce app for **BaDekor**, a fictional furniture brand from Banjarmasin.

## Product context

- **Brand:** BaDekor (Banjarmasin). Fictional, used for seed data, copy and branding only, no real company.
- **Currency:** IDR (Indonesian Rupiah). Stored as a whole-number amount (no cents, Rupiah has no practical subunit), displayed as `Rp` with thousands separators (e.g. `Rp 1.250.000`).
- **Language:** all **user-facing text** (UI copy, labels, seed/product data, emails) is in **Bahasa Indonesia**. Code, comments, commit messages, docs (including this file and review notes) stay in **English** per rule 10.
- **Roles:** two roles, `customer` and `admin`. Admins get a separate dashboard to manage products, categories/brands and orders (see Phase 3b and Phase 4b below).

## Stack

| Layer    | Choice                                                          |
| -------- | --------------------------------------------------------------- |
| Frontend | ReactJS (**JavaScript, no TypeScript**), Vite, React Router     |
| Styling  | Tailwind CSS **latest** (keep latest) |
| Backend  | Node.js + Express (JavaScript, ES modules)                      |
| Database | PostgreSQL on **Supabase** (session pooler) via `pg` + SQL migrations; a local PostgreSQL/Docker instance stays supported as an offline fallback |
| Auth     | JWT in httpOnly cookie, passwords hashed with `bcrypt`          |
| Validate | `zod` on the backend, controlled forms on the frontend          |
| Payments | **Midtrans Snap** (sandbox in development) via the official `midtrans-client` SDK; transactions are created server-side and payment state is confirmed by signed webhooks |

Stack choices not stated by the team (Vite, `pg`, zod, JWT cookie, TanStack Query) are proposals. They get confirmed or changed in review 01.

All dependencies are kept on their **latest stable major/minor version** at the time each step is done (see step 01a for the audited version table). Version bumps after that point are deliberate, separate steps, not silent drive-by upgrades.

Tailwind is on **v4**, which means CSS-first configuration: design tokens live in `client/src/styles/theme.css` inside `@theme { }`, there is no `tailwind.config.js`, and the Vite plugin `@tailwindcss/vite` replaces the PostCSS setup. v3 class names that were renamed in v4 (`shadow` → `shadow-sm`, `rounded` → `rounded-sm`, `outline-none` → `outline-hidden`, `flex-shrink-0` → `shrink-0`, and so on) must not be used.

Payment integration rules (step 05b):

- **The server prices every transaction.** The Midtrans payload is built from the persisted order and its authoritative IDR total. A client-supplied amount, item list or paid flag is never trusted, and the final charge is re-checked against the stored total before it is sent.
- **Credentials stay in `server/.env`.** `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID` and `MIDTRANS_IS_PRODUCTION=false` for sandbox; `.env.example` documents them with placeholders only. The existing `MT_*` aliases are accepted so a local file that already uses them keeps working. The server key never leaves the server; the client key is public by design and is handed to the browser by the API.
- **No card data ever reaches the app.** Card details, VA numbers and QR codes are collected by the Midtrans Snap popup or its hosted page, never by a form in `client/`.
- **Webhooks are the only source of truth for paid status.** Every notification is signature-verified (`sha512(order_id + status_code + gross_amount + server_key)`), recorded once, and applied idempotently; the browser redirect only triggers a re-read, it never marks an order paid.
- **Status moves forward only.** A late or replayed `pending` notification must not undo a `settlement`. Payment status is stored separately from the fulfilment status (`processing` → `shipped` → `completed`), which stays an operator decision.

## Target repository layout

```
ecomm-web/
├── AGENTS.md
├── .reviews/            # one review note per finished step (see below)
├── legacy-template/     # original static HTML, kept as design reference only
├── client/              # React + Vite + Tailwind v4
│   └── src/{components,pages,layouts,hooks,services,context,mocks,lib,styles,assets}
│   └── public/images/   # template imagery, copied from legacy-template
├── server/              # Express API
│   └── src/{config,routes,controllers,services,middleware,db,validators,lib}
│   └── db/{migrations,seeds}
├── scripts/             # repository tooling (`npm run setup`)
├── docker-compose.yml   # optional local PostgreSQL, not needed for Supabase
└── screenshots/
```

## Working rules

1. Work **one step at a time**, in the order of the roadmap below. Do not start the next step before the current one is reviewed.
2. When a step is done, write a review note to `.reviews/NN-slug.md`, using `.reviews/_TEMPLATE.md`. Then **stop and wait** for the reviewer session.
3. The review note's **Status** moves through `Awaiting review` → `Changes requested` → `Approved`. Only the reviewer sets `Approved` (see *Review process* below).
4. If changes are requested, fix them and append a `Revision N` section to the **same** file. Do not create a new file.
5. Steps that were not planned (extra work, scope changes) get their own review note with the next free number.
6. Keep changes scoped to the current step. Mention unrelated problems in the note under *Out of scope / noticed*, and do not fix them.
7. Do not commit, create branches or push unless explicitly asked.
8. Never commit secrets. Use `.env` (ignored) and keep `.env.example` up to date.
9. Reuse the template's look: primary colour `#fd3d57`, fonts Poppins and Roboto, the layouts in the `screenshots/` folder.
10. Use English for code, comments and docs. User-facing copy and seed data are in Bahasa Indonesia (see *Product context* above).

### Review process (executor / reviewer)

Work happens in two separate sessions with separate context. The executor may be one model and the
reviewer another; where possible the reviewer is a **different model family** from the executor.
Using the same model in two fresh sessions is acceptable when no other model is available, but it is
weaker evidence of independent review.

- **Executor session.** Implements the step or the requested changes, runs the step's checks, writes
  or updates the review note, and stops. It never sets `Approved` and never starts the next step.
- **Reviewer session.** Starts fresh with only this file, the review note, the diff and the
  repository. It does **not** rely on the executor's summary. It runs every command in *How to run
  and verify* itself, checks the checklist, answers or escalates the open questions, and then sets
  the status to `Changes requested` or `Approved` and writes the reviewer feedback in the same note.
- **Handoff.** A reviewer prompt must be self-contained: repository path, review-note path, the
  step's scope, and the exact commands and URLs to check. The reviewer does not change application
  code; a required code change sends the note back to the executor as a revision.
- **Evidence.** `Approved` requires the documented checks to have been run in the reviewer session.
  If a check cannot be run, the note stays `Awaiting review` and the reviewer records what is
  unverified. A written verdict is not a substitute for a run.
- **Model identity.** Fill the note's `Reviewer` field with the reviewing session/model and mark it
  as an AI reviewer (for example `GPT-6.1 Sol (AI reviewer)`). The `Author` field names the
  executing model or person.
- **Scope decisions.** Product, scope and policy questions (for example cancellation rules or data
  retention) are escalated to the team. The reviewer verifies consistency but does not decide them
  unilaterally.
- **One note at a time.** Phase 5b works notes oldest first. Do not run executors or reviewers for
  different notes in parallel when their changes could touch the same files.
- **Secrets.** Never paste `.env` contents, credentials or tokens into a reviewer prompt or review
  note.

### Review note naming

`.reviews/NN-slug.md`: a two-digit number, then a kebab-case slug. Sub-steps use a letter (`03a-home-page.md`).

### What every review note must contain

Summary, files added/changed, how to run and verify (exact commands and URLs), decisions and trade-offs, what was **not** done, open questions for the reviewer, and a reviewer feedback section. `.reviews/_TEMPLATE.md` has the structure. The template's `Reviewer` field names the reviewing session/model; an AI reviewer is marked as such (for example `GPT-6.1 Sol (AI reviewer)`).

## Roadmap

Each row is one step and produces one review note.

### Phase 0: Planning
| #  | Review file                | Goal                                                   |
| -- | -------------------------- | ------------------------------------------------------ |
| 00 | `00-development-plan.md`   | This plan, template audit, open questions              |

### Phase 1: Codebase setup
| #   | Review file                | Goal                                                                                         |
| --- | --------------------------- | -------------------------------------------------------------------------------------------- |
| 01a | `01a-dependency-upgrade.md` | Audit the latest stable versions for every piece of the stack (Node LTS, React, Vite, React Router, Express, `pg`, `zod`, `bcrypt`, ESLint/Prettier, Tailwind v4 latest). Record the chosen versions; they are what step 01b scaffolds with |
| 01b | `01b-codebase-setup.md`     | Move template to `legacy-template/`, scaffold `client/` and `server/` on the versions from 01a, Tailwind config fixed and ported, ESLint + Prettier, `.gitignore`, `.env.example`, root scripts (`dev`, `lint`), Postgres setup (local or docker-compose), health-check endpoint, README rewrite |
| 01c | `01c-dev-setup-script.md`   | Add `scripts/setup.mjs` (`npm run setup`) so a fresh clone is one command: check the Node version, install the workspaces, create the git-ignored runtime folders, and write the git-ignored `server/.env` (plus the optional root `.env`) with a generated `JWT_SECRET` and the chosen database — Supabase by default, local PostgreSQL/Docker on request — without overwriting an existing file. Unit-test the pure helpers and document the script in the README |

### Phase 2: Frontend foundation
| #  | Review file                | Goal                                                                                         |
| -- | -------------------------- | -------------------------------------------------------------------------------------------- |
| 02 | `02-frontend-foundation.md`| Design tokens in `@theme`, base styles, typography scale, currency/locale helpers,  `MainLayout` (topbar, navbar, footer), router with all routes, shared UI (Button, Input, Badge, Breadcrumb, Rating, QuantityInput, ProductCard, Modal/Drawer), `services/` layer backed by `mocks/` so pages work without the API |

### Phase 3: Frontend pages (one step per page group, against mock data)
| #   | Review file              | Template source                          | Notes                                           |
| --- | ------------------------ | ---------------------------------------- | ----------------------------------------------- |
| 03a | `03a-home-page.md`       | `index.html`                             | Banner, categories, new arrivals, ads, trending |
| 03b | `03b-shop-page.md`       | `pages/shop.html`                        | Filters (category, brand, price, size, colour), sort, grid/list, pagination |
| 03c | `03c-product-page.md`    | `pages/product.html`                     | Gallery, size/colour, quantity, tabs, related products |
| 03d | `03d-auth-pages.md`      | `pages/login.html`, `pages/register.html`| Form validation, auth context, protected routes (mock auth) |
| 03e | `03e-account-pages.md`   | `pages/account.html`, `pages/profile.html`| Dashboard, profile edit, addresses, order history (the template has no orders page, so one is added) |
| 03f | `03f-wishlist-page.md`   | `pages/wishlist.html`                    | Add/remove, move to cart                        |
| 03g | `03g-cart-checkout.md`   | `pages/checkout.html`, `complete.png`    | The template has no cart page, so cart page and cart context are new. Checkout form, order summary, success page |

### Phase 3b: Admin frontend (against mock data, admin-only routes)
| #   | Review file                  | Notes                                                                 |
| --- | ----------------------------- | ---------------------------------------------------------------------- |
| 03h | `03h-admin-layout.md`         | Admin shell (sidebar/topbar), role-based route guard (mock auth with an `admin` role), dashboard overview (summary cards) |
| 03i | `03i-admin-products-page.md`  | Product, category and brand management: list, create/edit forms, delete, image handling |
| 03j | `03j-admin-orders-page.md`    | Order list with status filter, order detail, update order status       |

### Phase 4: Backend (one step per module, each with tests)
| #   | Review file                | Goal                                                                                     |
| --- | -------------------------- | ---------------------------------------------------------------------------------------- |
| 04a | `04a-db-schema.md`         | ERD, migrations, seed data (ports the template's products and categories)                |
| 04b | `04b-auth-api.md`          | Register, login, logout, me; bcrypt, JWT cookie, auth middleware, rate-limit on auth     |
| 04c | `04c-catalog-api.md`       | Categories, brands, products: list with filter/sort/pagination, detail, related          |
| 04d | `04d-user-api.md`          | Profile update, change password, addresses CRUD                                          |
| 04e | `04e-wishlist-api.md`      | Wishlist list/add/remove                                                                 |
| 04f | `04f-cart-api.md`          | Cart CRUD, stock checks, guest cart merge on login                                       |
| 04g | `04g-orders-api.md`        | Checkout in a DB transaction, stock decrement, order history and detail, order status    |

### Phase 4b: Admin API
| #   | Review file                   | Goal                                                                                  |
| --- | ------------------------------ | -------------------------------------------------------------------------------------- |
| 04h | `04h-admin-catalog-api.md`     | Admin-only CRUD for products, categories and brands; image upload handling             |
| 04i | `04i-admin-orders-api.md`      | Admin order listing across all customers, order detail, order status transitions       |

### Phase 5: Integration
| #  | Review file                 | Goal                                                                                         |
| -- | --------------------------- | -------------------------------------------------------------------------------------------- |
| 05 | `05-frontend-integration.md`| Replace `mocks/` with real API calls, loading/error/empty states, auth guard against the real session, CORS and proxy config |
| 05a | `05a-supabase-migration.md` | Move the runtime database connection from local PostgreSQL to Supabase PostgreSQL (session pooler) as the default, support a local instance as an offline fallback, update connection configuration and environment examples, and verify migrations, seed data and existing API tests against Supabase |

### Phase 5b: Payment gateway integration (Midtrans)
| #   | Review file                         | Goal                                                                                       |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| 05b | `05b-midtrans-payment-gateway.md`   | Integrate **Midtrans Snap** in sandbox mode using its official SDK. Create transactions on the server from the persisted order and authoritative IDR total; never accept amounts or paid status from the client. Store Midtrans transaction identifiers and payment status, and keep credentials in `.env` with placeholders in `.env.example`. Add Snap checkout and pending/paid/failed/expired states to the frontend. Verify every webhook signature, make notification handling idempotent, and reconcile payment/order status without trusting the browser redirect. Test transaction creation, provider errors, valid/invalid/replayed/out-of-order webhooks, and a sandbox payment flow; document local webhook testing without exposing secrets |

**QRIS is a required payment method.** Use the Midtrans Snap QRIS flow to display a transaction-specific dynamic QR code, payment instructions, and its expiry time. Keep the order pending until a verified Midtrans notification confirms settlement; scanning the QR code or reaching the browser success page is not proof of payment. Include successful, pending, and expired QRIS payments in the sandbox tests.

### Phase 5c: Review backlog

Every review note written up to this point is worked through in order before any finishing
touch starts. Do not begin Phase 6 while a review below is still unread.

| #   | Review file              | Goal                                                                                       |
| --- | ------------------------ | ------------------------------------------------------------------------------------------ |
| 05c | `05c-review-backlog.md`  | Work through every open review note (00 through 05b) oldest first: read it, reproduce each open question or change request, fix it, verify it, and record the outcome in this note's worklist. A review is finished only when its own *How to verify* checklist passes and its open questions are answered. Then move to the next one, and only after the last review is closed does Phase 6 start |

Every entry follows the *Review process* above: an executor session prepares the fix, and a separate
reviewer session verifies it and closes the note. The worklist records the model/session that
executed and reviewed each note.

### Phase 5d: Redis caching
| #   | Review file              | Goal                                                                                         |
| --- | ------------------------ | -------------------------------------------------------------------------------------------- |
| 05d | `05d-redis-caching.md`   | Add Redis caching for public catalogue reads (categories, brands, product lists and details) with bounded TTLs and explicit invalidation on admin catalogue writes. Do not cache sessions, carts, stock-sensitive checkout data, orders or payments. Document Redis environment settings with placeholders, keep the API usable with safe database fallback when Redis is unavailable, and test cache hits, misses, invalidation and failover |

### Phase 5e: Essential account and order completion
| #   | Review file                       | Goal                                                                                         |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| 05e | `05e-password-recovery.md`        | Add forgot/reset-password pages and API. Send expiring, single-use reset tokens by email, store only token hashes, rate-limit requests, return the same response for unknown and known email addresses, and invalidate existing sessions after a reset. Test expiry, reuse, invalid tokens, rate limits and session invalidation |
| 05f | `05f-customer-cancellation.md`    | Let customers cancel their own `processing` orders only when no payment is paid or pending. Add a clear confirmation flow, ownership checks and a cancellation reason; cancel and restore stock exactly once in one transaction. Paid orders and shipped/completed orders are excluded |
| 05g | `05g-admin-payment-dashboard.md`  | Show payment status in admin order lists and details, and refuse shipment/completion until payment is paid. Correct the dashboard with server-side aggregates across all orders: revenue counts paid, non-cancelled orders only; retain status counts, recent orders and low-stock indicators. Test unpaid-order safeguards and aggregate accuracy beyond one page |

### Phase 6: Finishing touches
| #  | Review file                | Goal                                                                                         |
| -- | -------------------------- | -------------------------------------------------------------------------------------------- |
| 06 | `06-security-hardening.md` | helmet, CORS allow-list, input validation sweep, SQL injection and XSS review, cookie flags, secrets audit |
| 07 | `07-quality-and-tests.md`  | API integration tests, key frontend tests, lint clean, remove dead code                      |
| 08 | `08-ux-polish.md`          | Responsive pass, accessibility (labels, focus, contrast, alt text), toasts, skeletons, 404 page, SEO titles |
| 09 | `09-performance.md`        | Route code-splitting, image optimisation and lazy loading, DB indexes, query review          |
| 10 | `10-docs-and-deploy.md`    | Final README, API docs, env docs, production build and deploy notes, demo accounts           |

### Phase 7: Future enhancements (not required for core completion)
| #  | Review file                | Goal                                                                                         |
| -- | -------------------------- | -------------------------------------------------------------------------------------------- |
| 11 | `11-admin-analytics.md`    | Optional admin analytics after steps 00–10: server-side date-range aggregates, paid-revenue and order trends, best-selling products, and accessible charts with equivalent tabular data. Do not block the core store or its deployment on this step |

## Conventions

- **Frontend:** function components and hooks only, one component per file, PascalCase components, `camelCase` everything else. Tailwind utility classes in JSX. Extract a component when the same markup appears three or more times. No data fetching inside UI components: use `services/` and hooks.
- **Backend:** layered as route → controller → service → db. Controllers hold no SQL. All SQL uses parameterised queries. Return errors as `{ error: { code, message, details? } }`. Money is stored in IDR as a whole-number Rupiah amount (`BIGINT`, no decimal subunit), and never as float.
- **Payments:** the provider call is made outside the checkout transaction, so an order survives a provider outage; a failed attempt is recorded and retryable. Every provider callback is treated as untrusted input: validated, signature-checked, deduplicated by a stored hash, and reconciled inside one transaction that locks the payment row. Provider transaction ids, statuses and amounts are stored; provider secrets and raw credentials are never logged or returned.
- **API:** REST under `/api/v1`, plural nouns, JSON only, pagination as `?page=&limit=`.
- **DB:** every table is prefixed `tbl_` and named in **Bahasa Indonesia**, singular and uninflected for number (`tbl_pengguna`, `tbl_produk`, `tbl_item_pesanan`). Columns, constraints and indexes stay `snake_case` in English. `id` as `BIGINT GENERATED ALWAYS AS IDENTITY` (decided in 04a), `created_at` and `updated_at` on every table, migrations are forward-only and never edited after merge.
- **Git** (when asked to commit): short imperative subject, capitalised, no trailing period, about 50 characters. Add a body only if it adds information.

## Definition of done (every step)

- It runs from a clean checkout using only the documented commands.
- Lint passes (`npm run lint`).
- Tests for the step pass, where the step has tests.
- The review note is written and its *How to verify* section was actually followed; the reviewer re-runs it before approving.
- No unexplained TODOs, `console.log`s or commented-out code left behind.
