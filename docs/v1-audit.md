# V1 production audit (2026-09-23)

Reviewed the API, migrations, browser app, offline queue, CSV imports, dependencies, CI, and the live Vercel/Railway deployments.

## Fixed

- Protected authenticated writes with an exact production Origin check, Fetch Metadata rejection for cross-site writes, and `SameSite=Lax` session cookies. The Vercel same-origin API proxy remains the supported browser route.
- Made schema migrations transactional and serialized with a PostgreSQL advisory lock. Failed startup closes the database connection.
- Made account and import deletion atomic. Recurring task completion now locks the task row, so concurrent requests cannot create duplicate successors. Monthly recurrence clamps short months and retains the reminder offset.
- Corrected weekly habit streaks to count qualifying weeks and display the right unit.
- Fixed IndexedDB writes to resolve after transaction commit and return to sign-in when an offline sync discovers an expired session.
- Rejected oversized CSV files and duplicate/empty headers; aligned the API JSON limit with the documented import size.
- Added a restrictive frontend Content Security Policy and clearer API error handling. The runtime image runs as the unprivileged `node` user without build-only packages.
- Added a high-severity dependency audit to CI. The dependency audit reported zero known advisories when run.
- Configured both Railway API environments to gate deployments on `/health`, use the root Dockerfile, and restart failed instances. Removed the deprecated Railway config file.
- Enabled production PostgreSQL point-in-time recovery. Railway logs show a completed first full backup and successful WAL archiving.

## Verification

- Local: lint, API/web builds, three API tests, four browser tests, and `npm audit --audit-level=high` passed.
- GitHub Actions: the audit commit passed its verification workflow.
- Hosted staging and production: registration, session, dashboard, account deletion, rejection of a write without Origin, and browser shell load passed. Synthetic accounts used for the final smoke tests were deleted.

## Operations still to validate

- Perform an isolated restore drill from the production backup before relying on point-in-time recovery as the only recovery plan. The first backup and archive writes were observed, but a restore was not performed.
- Configure production alerting for API availability, failed deployments, database backup failures, and unusual auth errors. The API exposes `/health`; alert destinations are not configured in this repository.
- If public self-service sign-up is expanded, add verified email delivery and a password recovery flow. These are outside the agreed V1 feature scope and require a mail provider.
