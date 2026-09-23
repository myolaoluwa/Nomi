# Architecture and invariants

The API is Express/TypeScript; local storage uses PGlite, production uses PostgreSQL. `apps/api/migrations` contains idempotent forward migrations. `apps/web` is React/Vite. The Vercel build and Railway Dockerfile live at the repository root.

## Data and calculations

All records belong to a user. Composite foreign keys bind finance, task and goal links to the same user where the schema supports them; remaining associations are checked in API routes. Money is stored in integer ISO currency minor units. Balances are derived from opening balances and transactions; currencies are kept separate. Time values use UTC instants, and activity/finance grouping uses the profile timezone. Habit check-ins use local calendar days. A task's recurrence creates the next occurrence when the current task is completed. Goal progress derives from an account balance, linked activities, one habit's check-ins, linked completed tasks, or a manual number.

Analytics and questions use only records in Nomi. The `/api/insights/ask` route checks consent before calculating a response, records the question and answer, and returns supporting record IDs and the method. No outside AI service is used. Weekly summaries cover the past seven local dates. This is deterministic reporting, and unsupported questions receive a scope explanation.

## Privacy and imports

Passwords use salted scrypt. Sessions use random tokens stored as hashes, expire after seven days and are revoked on logout. Routes scope reads/writes to the session user. Mutations reject disallowed browser origins. Auth routes are rate-limited. Imports are opt-in, previewed, capped at 500 records per batch, validated against existing categories/accounts, and inserted atomically with an import record. Removing an import deletes its records and detaches manually linked activities from imported transactions.

Export includes profile metadata and records but never a password hash or session token. Account deletion removes all personal records and the user account. Offline activity drafts and minimal profile/category metadata live in browser IndexedDB; they clear on logout/account deletion. The service worker caches only same-origin app assets, never API responses. A queued activity carries a unique client ID for idempotent reconnection.

## API

Existing finance/activity CRUD remains under `/api`. New routes include `/api/{projects,tasks,habits,goals}`, task completion, habit check-ins, dashboard and analytics, consent-controlled questions, import preview/commit/revoke, privacy status/export/account deletion. `/health` checks the database. Errors return scoped 400/401/403/404/409 responses.

## Operations

Production requires `DATABASE_URL`; use one API replica initially because the rate limiter and PGlite local mode are process-local. User list/analytics routes currently read one user's full history and need pagination/aggregation before large accounts. CSV imports are file-based; no provider token is held or refreshed. Staging should have an independent database. Use managed database backups and review host retention settings before live use.
