# Architecture and invariants

- `apps/web/src/App.tsx`: authenticated application, finance views, timeline, reusable record editor, profile settings.
- `apps/web/src/lib.ts`: API client, currency minor-unit conversion, balance calculation and timezone grouping.
- `apps/api/src/server.ts`: validation, authentication, scoped CRUD routes and error mapping.
- `apps/api/src/db.ts`: PostgreSQL/PGlite adapter and migration runner.
- `apps/api/migrations/001_initial.sql`: timestamped users, sessions, accounts, categories, transactions, budgets and activities.

## Money and time

Money is a signed integer in the ISO currency's minor unit. Transaction/budget amounts must be positive; the transaction type determines the balance direction. Opening balances may be negative. Account balances are derived from opening balances plus income minus expenses, so edits/deletions do not leave stale cached totals. Currency precision comes from Intl (including JPY and KWD). No exchange rates are invented, and currencies are never summed together. An account's currency cannot change after it has transactions.

Events use PostgreSQL `timestamptz`; incoming dates must carry an offset. The editor explicitly labels the browser timezone for datetime input. Display and month/day grouping use the user's profile timezone. Changing that preference can move an event across a calendar day/month boundary. A monthly budget sums matching category/currency expenses in that local month.

An activity's transaction link is contextual: linking one does not create or duplicate spending. Duration is recorded in minutes. Category kind is immutable. Categories with dependent records and accounts/transactions with dependent records cannot be deleted until those relationships are removed.

## Security boundaries

Every resource query is scoped to the session user's id. Composite foreign keys bind account/category/transaction references to that same user. Passwords use salted scrypt; sessions use random 256-bit tokens with only SHA-256 token hashes persisted. Sessions expire after seven days and logout revokes the current session. Auth endpoints are rate-limited. Origins are explicitly allowlisted for credentialed cross-origin calls; mutation origins are checked separately. No credentials or private records are stored in browser localStorage. SQL values are parameterized; dynamic identifiers only come from fixed resource/schema definitions.

## API

`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`.
`GET /api/me`, `PUT /api/me`.
`GET/POST /api/{accounts,categories,transactions,budgets,activities}`.
`PUT/DELETE /api/{resource}/:id` (PUT replaces all editable fields).
`GET /health` checks DB readiness.

Bodies use snake_case matching database fields. Amounts are integer minor units. Validation errors return 400; authentication 401; origin rejection 403; missing scoped records 404; duplicate/dependent data 409. Health contains no user data.

## Operational limits

Lists currently return all records for one user. Pagination and server-side aggregation should be introduced before large histories. PGlite is a single-process local development database, not the production deployment path. Production uses managed PostgreSQL. Redis/object storage are deferred until queues, caching, uploads or integrations need them. Schema version 1 is idempotent; subsequent schema changes should be separate forward migrations. No public deployment, DNS configuration, mail service or cloud credentials are created by this implementation.
