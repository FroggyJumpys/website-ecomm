# BaDekor

Mebel kayu ulin dan anyaman rotan buatan pengrajin Banjarmasin, Kalimantan Selatan. This
repository is a fullstack ecommerce application built as a group project: a React storefront, an
Express API and a PostgreSQL database.

The original static Tailwind template is kept in [`legacy-template/`](./legacy-template) as a
design reference only. Nothing in it is built or deployed.

## Stack

| Layer     | Technology                                                  |
| --------- | ----------------------------------------------------------- |
| Frontend  | React 19 (JavaScript), Vite 8, React Router 7, Tailwind CSS 4 |
| Backend   | Node.js 22+, Express 5, Zod, JWT in an httpOnly cookie       |
| Database  | PostgreSQL, accessed with `pg` and plain SQL migrations      |
| Tooling   | ESLint 9 (flat config), Prettier, Vitest, Supertest          |

Tailwind uses v4's CSS-first configuration: design tokens live in `@theme` inside
`client/src/index.css`. There is no `tailwind.config.js`.

## Requirements

- Node.js `>=22.12` and npm
- PostgreSQL 15+ (local install or Docker)

## Getting started

```sh
# 1. Install all workspace dependencies
npm install

# 2. Start PostgreSQL (skip if you already run Postgres locally)
#    If port 5432 is already taken (e.g. a native PostgreSQL service), publish the
#    container on another port instead: put `DB_PORT=5433` in a root `.env` (docker
#    compose reads it) and set DATABASE_URL in server/.env to the same port.
docker compose up -d db

# 3. Configure the API
cp server/.env.example server/.env

# 4. Apply migrations and load the seed data (catalogue, demo accounts)
npm run db:migrate
npm run db:seed

# 5. Run the API and the Vite dev server together
npm run dev
```

Then open <http://localhost:5173>. The API listens on <http://localhost:4000> and the client
reaches it through the `/api` proxy configured in `client/vite.config.js`, which keeps the auth
cookie first-party.

## Scripts

Run from the repository root.

| Script                | What it does                                    |
| --------------------- | ----------------------------------------------- |
| `npm run dev`         | API (nodemon) + Vite dev server together        |
| `npm run dev:client`  | Vite dev server only                            |
| `npm run dev:server`  | Express API only                                |
| `npm run build`       | Production build of the client                  |
| `npm start`           | Start the API without nodemon                   |
| `npm run lint`        | ESLint over `client/` and `server/`             |
| `npm run format`      | Prettier over the whole repo                    |
| `npm test`            | Vitest in every workspace                       |
| `npm run db:migrate`  | Apply pending SQL migrations                    |
| `npm run db:seed`     | Load seed data (idempotent, safe to re-run)      |

## Layout

```
client/                 React application
  src/{components,pages,layouts,hooks,services,context,mocks,lib,assets}
  public/images/        Imagery carried over from the template
server/                 Express API
  src/{config,routes,controllers,services,middleware,db,validators,lib}
  db/migrations/        Forward-only .sql migrations
  db/seeds/             Seed data ported from the frontend mocks
legacy-template/        Original static HTML, reference only
.reviews/               One review note per development step
AGENTS.md               Conventions, working rules and the development roadmap
```

## Environment variables

See [`server/.env.example`](./server/.env.example). Copy it to `server/.env`; that file is
git-ignored. `JWT_SECRET` must be at least 24 characters, and a real value is required when
`NODE_ENV=production`.

`docker-compose.yml` publishes the database on `${DB_PORT:-5432}`. If something else already owns
5432 (a native PostgreSQL service, for example), create a root `.env` containing `DB_PORT=5433`
and set `DATABASE_URL` in `server/.env` to `...@localhost:5433/ba_dekor`. Both `.env` files are
git-ignored, so the defaults stay correct for everyone else.

## API

Base path `/api/v1`. Errors always use the shape `{ "error": { "code", "message", "details?" } }`.

| Method | Path              | Description                             |
| ------ | ----------------- | --------------------------------------- |
| GET    | `/health`         | Liveness probe, does not touch the DB   |
| GET    | `/health/db`      | Readiness probe, pings PostgreSQL       |

## Development process

Work happens in reviewed steps listed in [`AGENTS.md`](./AGENTS.md#roadmap). Each finished step
writes a review note to [`.reviews/`](./.reviews), following `.reviews/_TEMPLATE.md`.

## Credit

The visual starting point comes from
[ecommerce-template-tailwind-1](https://github.com/fajar7xx/ecommerce-template-tailwind-1) by Fajar
Siagian (ISC). BaDekor, its brand, copy and data are fictional.
