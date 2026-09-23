# Nomi — foundation, finance and activities

A working React/TypeScript web app and Express API implementing Phases 0–2 of `codex-build-plan.md`.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:5173 and create an account. The API starts at http://localhost:4000. No demo credentials or sample financial records are installed. Development uses persistent embedded PostgreSQL (PGlite) at `apps/api/.data`; restarting the API preserves records and sessions. Only one local API process should open that directory.

Optional: copy `apps/api/.env.example` to `apps/api/.env`. Set `DATABASE_URL` to use a PostgreSQL server. When starting the API from its workspace, `.env` and relative data paths resolve from `apps/api`.

## Implemented

- **Phase 0:** app shell, responsive navigation, registration/sign-in/sign-out, scrypt password hashing, hashed database sessions in HttpOnly cookies, user-scoped API access, schema migration, validation, error handling, health endpoint, deployment configuration.
- **Phase 1:** editable user profile, timezone/locale/default currency; account/category/transaction/budget CRUD; derived account balances; monthly budget consumption; independent currency totals; starting balances including negative credit debt.
- **Phase 2:** activity create/edit/delete; categories, duration, location, notes and tags; optional link to an existing transaction; searchable timeline grouped by local calendar day, showing both activities and money events.

The overview is an early summary of recorded finance and activity data. Tasks, habits, goals, advanced analytics, AI, and integrations belong to later phases. This is a responsive web app, continuing the existing React scaffold; it is not a native mobile build. Offline sync, password recovery/email verification, and account-wide export/deletion are not implemented in these phases.

## Verification

```sh
npm run lint
npm run build
npm run test:api
npm run test:e2e
```

Browser tests use installed Google Chrome; switch `channel` in `playwright.config.ts` or install the corresponding Playwright browser if needed. E2E data is isolated in `apps/api/.data-e2e` and tests create unique users. The API suite uses a temporary on-disk database and verifies restart persistence, authentication/session expiry, user isolation, relational integrity and CRUD. Browser coverage includes sign-up, accounts, spending, budgets, linked activities, search, edit, settings and mobile layout. Currency/timezone calculations have targeted tests.

## Deployment

### Railway API

Deploy the repository using the included `Dockerfile` and `railway.json`. Add PostgreSQL and configure:

- `DATABASE_URL`: Railway PostgreSQL connection string.
- `WEB_ORIGIN`: exact frontend origin, without trailing slash. Multiple explicit preview/staging origins can be comma-separated. No wildcard origins.
- `NODE_ENV=production`: already set in the Docker image; mandatory for secure cookies.
- `PORT`: supplied by Railway.

The API refuses production startup without `DATABASE_URL`. Migration 001 runs idempotently before listening. `/health` checks database access. Use a single API replica initially because the authentication rate limiter is process-local. Configure database backups and encrypted storage in the hosting environment.

### Vercel frontend

Import the repository with the repository root as the project root. `vercel.json` defines the web build and `apps/web/dist` output. Configure `VITE_API_URL=https://YOUR-RAILWAY-API-HOST` before building; do not include `/api`. The frontend uses credentialed requests and the backend permits only configured origins.

For reliable cookie authentication across browsers, use sibling custom domains (for example `app.example.com` and `api.example.com`). Unrelated `vercel.app`/`railway.app` domains depend on third-party cookie policies. Production cookies use Secure, HttpOnly and SameSite=None; mutation requests validate their Origin. Development uses Vite's same-origin `/api` proxy.

Separate staging and production databases and origin settings. After deploying, check `/health`, then registration, reload persistence and logout from the hosted frontend. Live hosted connectivity has not been verified from this workspace.

Official references: [Vercel monorepos](https://vercel.com/docs/monorepos), [Railway health checks](https://docs.railway.com/deployments/healthchecks).

## Engineering notes

See [architecture](docs/architecture.md) and [phase acceptance](docs/phase-acceptance.md). The existing product and marketing plans remain unchanged.
