# Nomi — V1

Nomi is a responsive personal dashboard for money, time, tasks, habits, and goals. Users enter or import records, see a combined timeline and analytics, and ask basic questions answered from their own data.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:5173. The API starts at http://localhost:4000. Local development uses persistent embedded PostgreSQL (PGlite) at `apps/api/.data`; run only one API process against that directory. Set `DATABASE_URL` in `apps/api/.env` to use managed PostgreSQL. See `apps/api/.env.example` and `apps/web/.env.example`.

## V1 features

- Private accounts; accounts, categories, transactions and monthly budgets; currency-aware balances.
- Activity logging with duration, tags, location and linked spending; a combined timeline.
- Projects, prioritized tasks, in-app reminders and daily/weekly/monthly recurring tasks.
- Daily or weekly habits, check-ins, streaks and a consistency view.
- Measurable goals with manual progress or progress linked to an account, activity, habit or completed tasks.
- Overview alerts, spending and time analysis, productivity and goal summaries.
- Consent-controlled data questions and a weekly summary. Answers are calculated on this server from recorded figures and list supporting record IDs. No external AI provider receives user data.
- Optional CSV imports for bank transactions, calendar activities and fitness activities. Each import is previewed, requires a final save action and can be removed with its imported records. See the [CSV examples](docs/import-examples).
- Data export, per-record deletion, import removal, question-history deletion and full account deletion.
- Activity entry during a connection loss while the app is open. Pending entries and minimal profile/category metadata are stored in this browser's IndexedDB and sync after reconnection. Production app assets are cached for offline reopening. Sign-out and account deletion clear this device's offline data.

Bank provider API connections, background provider sync, email or push reminders, and native mobile binaries are not part of this V1 implementation. The import status is shown in Settings; a failed preview/import reports the row error. Tasks with reminders appear in the planner/dashboard once due. The basic question parser supports spending, income, activity time, tasks, habits, goals and weekly reviews; it does not claim open-ended AI reasoning.

## Verification

```sh
npm run lint
npm run build
npm test
npm audit --omit=dev
```

API tests use temporary on-disk databases and cover authentication, isolation, finance, task recurrence, habits, goal calculations, imports, analytics, consent, export and deletion. Browser tests cover desktop/mobile flows, questions, privacy controls and offline activity sync. GitHub Actions runs these checks on push and pull requests.

## Deployment

- Production: [nomi-v1-lovat.vercel.app](https://nomi-v1-lovat.vercel.app), backed by the Railway `nomi-v1` production environment.
- Staging: [nomi-v1-staging.vercel.app](https://nomi-v1-staging.vercel.app), backed by the separate Railway staging environment and database.

Both Vercel projects deploy from the monorepo root with `vercel.json`. The `/api` function forwards requests to the project's `API_ORIGIN` environment variable, keeping browser sessions on the frontend origin. Each Railway API service uses its environment's PostgreSQL `DATABASE_URL`, `NODE_ENV=production`, and an exact `WEB_ORIGIN` matching its frontend. Never point staging at the production database.

To release an update, deploy the Railway staging API and Vercel staging project, verify it, then deploy the Railway production API and Vercel production project. The API provides `/health`; hosted registration, session, dashboard and account deletion were checked on both origins. Database migrations run in a transaction under a PostgreSQL advisory lock. Production Postgres has point-in-time recovery enabled. Check its archive health and perform a restore drill before depending on it as the sole recovery plan. The browser sends authenticated writes through the same-origin `/api` proxy; production requires `WEB_ORIGIN` and rejects writes without its matching `Origin` header. See [architecture](docs/architecture.md) and [phase acceptance](docs/phase-acceptance.md).

Official references: [Vercel monorepos](https://vercel.com/docs/monorepos), [Railway health checks](https://docs.railway.com/deployments/healthchecks).
