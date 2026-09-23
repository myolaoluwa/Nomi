# V1 acceptance review

## Product

- [x] Create an account, sign in/out, edit profile settings.
- [x] Log income and expenses; see account balances and a finance overview.
- [x] See dashboard money, tasks, habit/goal progress and alerts.
- [x] Add activities and view a combined timeline.
- [x] Manage projects, priorities, due dates, in-app reminders and recurring tasks.
- [x] Create and track habits with completion and streaks.
- [x] Define measurable goals and link their progress to records.
- [x] Ask basic questions and get answers grounded in recorded figures with supporting IDs.
- [x] Review source and data usage before importing bank/calendar/fitness CSV files.
- [x] Remove imported data, export data, delete records and delete an account.
- [x] Log an activity during a connection loss while the app is open; sync later.

## Deployment

- [x] Vercel and Railway build and health check configuration.
- [ ] Production Vercel/Railway deployment and hosted end-to-end check.
- [ ] Preview/staging deployment and hosted end-to-end check.

## Scope and limits

V1 uses explicit CSV imports rather than bank/calendar/fitness provider OAuth connections. No background provider synchronization, notification delivery, password recovery/email verification, or native mobile build. The question parser handles listed personal-data topics deterministically; it does not send data to an AI service or generate unrestricted answers. These limits should be evaluated against any broader release promise before launch.
