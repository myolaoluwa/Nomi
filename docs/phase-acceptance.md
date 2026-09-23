# Phase acceptance

## Phase 0 — foundation

- [x] Existing npm workspaces retained; TypeScript API and React app build.
- [x] Authentication, password hashing, expiring sessions, logout and protected routes.
- [x] PostgreSQL-compatible schema and initial migration; persistent local development.
- [x] Responsive application shell, loading/empty/error states and accessible native dialog forms.
- [x] Environment examples, Vercel frontend configuration, Railway Docker and readiness check.
- [ ] Hosted frontend/backend connection verified — requires configured Vercel/Railway environments.

## Phase 1 — finance

- [x] Profile and settings editing, currency, timezone and locale.
- [x] Account, category, transaction and monthly budget CRUD.
- [x] Accurate derived balances, income/expense summary, monthly category budget consumption.
- [x] Currency isolation, appropriate decimal precision, user ownership and relation validation.
- [x] Automated data lifecycle and cross-user isolation tests.

## Phase 2 — activities and timeline

- [x] Activity logging/edit/delete with category, duration, timestamp, location, tags and notes.
- [x] Contextual transaction association.
- [x] Combined timeline grouped by profile-local day, with search and event-type filters.
- [x] Desktop and mobile flows covered by browser tests.

## Outside this delivery

Phase 3 onward: tasks/projects/reminders, habits, measurable goals, broader analytics, AI, integrations and retention/privacy polish. Native mobile, offline synchronization and production account recovery are not supplied by the original scaffold or this phase delivery. Live cloud deployment remains a separate environment-dependent step.
