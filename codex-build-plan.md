# Nomi Codex Build Plan

## 1. Product definition

Nomi is a personal operating system for life data. The product should help users understand where their time and money are going, track life activities, manage goals, and improve decision-making through connected data and AI-powered insights.

Core promise:
- Understand personal finances and life activities in one place
- Connect time, money, habits, tasks, and goals
- Turn life data into useful insights
- Minimize manual tracking through automation

## 2. Non-goals for MVP

The first release should not try to include every integration or every advanced feature. The MVP should be intentionally narrow and clearly understandable.

Do not build in v1:
- full bank-sync ecosystem
- calendar and fitness integrations beyond a few examples
- OCR/receipt scanning at scale
- family/shared finance flows
- broad multi-language/localization rollout
- advanced cross-data intelligence beyond basic insights
- large AI agent features beyond personal data questions and summaries

## 3. MVP target user and value proposition

Target user:
- busy adult who wants clarity about money, time, and progress
- uses multiple tools already but wants a single source of understanding

Primary value:
- see today’s financial and activity picture quickly
- track tasks and goals in context
- get simple insights without manual reporting
- build consistency over time with habits and progress tracking

## 4. MVP scope

### 4.1 Dashboard
Must include:
- current financial overview
- today’s activities
- tasks due today or soon
- goal progress
- important insights
- alerts and quick actions

### 4.2 Finance
Must include:
- accounts
- transactions
- categories
- budgets
- basic income and expense tracking
- simple net worth view

### 4.3 Activities
Must include:
- manual activity logging
- activity timeline
- recurring categories like work, exercise, reading, shopping, travel
- simple duration and cost association

### 4.4 Tasks
Must include:
- tasks
- projects
- deadlines
- priorities
- reminders

### 4.5 Habits
Must include:
- create custom habits
- track completion
- streaks
- consistency view

### 4.6 Goals
Must include:
- create measurable goals
- link to financial and activity progress
- track progress status

### 4.7 Analytics
Must include:
- spending analysis
- activity analysis
- productivity analysis
- goal progress analysis

### 4.8 AI
Must include:
- natural-language questions over user data
- weekly summary generation
- basic personalized insights

## 5. Product architecture

### 5.1 Frontend
Recommended stack:
- React Native or Flutter for cross-platform mobile app
- Shared design system for dashboard, timeline, forms, cards
- Mobile-first UI optimized for fast daily usage
- Vercel will be used to host the frontend application for preview, staging, and production deployments
- frontend deployment should support environment variables for API URLs and public config

### 5.2 Backend
Recommended stack:
- Node.js / TypeScript or Python / FastAPI
- REST API with secure auth
- event-driven or service-oriented data processing layer
- Railway will be used to host the backend service for staging and production deployments
- backend deployment should include environment-based config for secrets, DB URLs, and service bindings

### 5.3 Database
Use:
- PostgreSQL for transactional core data
- Redis for caching, simple queues, and session/session-like features
- object storage for attachments, receipts, and exports
- Railway-managed Postgres or external managed Postgres instance can be used depending on deployment model

### 5.4 Data model
Core entities:
- User
- Account
- Transaction
- Category
- Budget
- Bill / Subscription
- Activity
- Task
- Project
- Habit
- Goal
- Insight / Report
- Integration
- AI query / response log

Important design concept:
- every record should be timestamped and attributable
- support multi-currency and timezone-aware data
- keep raw source data and derived insights distinct

### 5.5 Integrations
Initial integrations should be limited to a few examples:
- bank account sync via provider APIs
- calendar import
- fitness data import
- export/import from CSV or common formats

Important rule:
- integrations are optional and user-controlled
- users must be able to revoke access and delete imported data

### 5.6 AI layer
AI should not be a standalone chatbot. It should be a data analysis layer.

Capabilities for v1:
- answer questions using structured user data
- produce weekly summary
- detect simple patterns from transactions, activities, and habits
- explain insights with supporting numbers

Guardrails:
- user consent required for data access
- show source data and figures behind answers
- do not fabricate unsupported conclusions

## 6. Functional requirements by module

### Dashboard
- show current financial status
- show tasks and upcoming schedule
- show recent activity and spending
- surface important alerts
- highlight personalized insights
- keep UI simple and prioritized

### Timeline
- render chronological life events
- combine activities, spending, and time blocks
- support visual grouping by day
- allow manual logging from quick-entry actions

### Finance
- track income and expenses
- support account balances and transfers
- allow budgets by category
- support subscriptions and recurring obligations
- support savings and debt basics

### Activities
- allow quick logging for common activities
- support duration, amount, location, notes, and tags
- keep activity categories flexible
- support auto-import where available

### Tasks and productivity
- create tasks with priority and due date
- group into projects
- add reminders and recurring tasks
- allow task-to-goal relationships

### Habits
- create habits with cadence rules
- track completion and streaks
- show completion rate over time
- support trend analysis

### Goals
- define measurable goals
- connect financial or behavioral progress
- show progress ratio and status
- allow linked tasks and habit milestones

### Analytics
- show spending trends over time
- show activity time allocation
- show habit consistency and productivity metrics
- show goal progress summaries

### AI insights
- answer personal life questions using structured data
- provide summary of recent trends
- show supporting data and methodology

## 7. Non-functional requirements

### Privacy and security
- clear consent flow for data import
- granular permissions by source
- delete data and disconnect integrations
- secure storage and encryption-at-rest for sensitive data
- explain data usage in plain language

### Global readiness
- support multiple currencies
- support multiple time zones
- support regional date and number formatting
- allow local units and locale-aware display
- design architecture to support country-specific integrations later

### Performance
- dashboard loads quickly
- analytics responses stay within an acceptable response time
- offline support for manual logging

### Reliability
- graceful handling of integration failures
- clear sync statuses
- retry logic and data conflict handling

## 8. Codex execution plan

### Phase 0: Foundation
1. Define product requirements and acceptance criteria
2. Set up repo structure and engineering standards
3. Create app skeleton and authentication baseline
4. Set up database schema and migrations
5. Create environment config for local dev, Vercel frontend deployment, and Railway backend deployment
6. Prepare frontend for Vercel preview/production builds and backend for Railway with health checks and production environment variables

Deliverables:
- project bootstrapping
- basic auth
- database schema
- app shell
- Vercel-ready frontend configuration
- Railway-ready backend configuration

### Phase 1: Core data model and user accounts
1. Build user profile and settings
2. Create account, transaction, category, and budget models
3. Build CRUD APIs for finance entities
4. Build UI for accounts and transactions
5. Add currency and timezone handling
6. Validate the Vercel frontend and Railway backend connection for API traffic and environment configuration

Deliverables:
- users can create accounts
- users can log transactions
- users can classify spending
- users can define budgets

### Phase 2: Activity and timeline
1. Build activity model and lifecycle
2. Add manual activity logging flow
3. Build timeline view
4. Add basic tagging and annotation
5. Connect activities with money and time entries

Deliverables:
- users can log work, exercise, reading, shopping, etc.
- timeline shows activity history
- users can see daily life context

### Phase 3: Tasks, habits, and goals
1. Build task and project models
2. Add reminder and recurring logic
3. Build habit tracking system
4. Add goal creation and progress calculation
5. Link goals to tasks, habits, and activities

Deliverables:
- task management works end to end
- habit tracking shows streaks and trends
- goals progress is visible and measurable

### Phase 4: Dashboard and analytics
1. Build dashboard with key cards and summary metrics
2. Add spending analytics and trends
3. Add productivity and activity analytics
4. Add goal progress summary views
5. Add basic weekly review logic

Deliverables:
- users get a clear summary of current state
- analytics reflect personal data over time

### Phase 5: AI personal intelligence
1. Connect user data to AI query layer
2. Create question parser for financial and life questions
3. Add weekly summary generation
4. Add insight explanation with supporting numbers
5. Add consent and access control around AI usage

Deliverables:
- users can ask natural-language questions
- AI answers are grounded in actual user data
- responses include relevant supporting figures

### Phase 6: Integrations and automation
1. Add selected integrations: bank, calendar, fitness
2. Build import and sync flows
3. Add sync status and error handling
4. Add simple automation rules for recurring imports
5. Ensure integration and API services remain compatible with the Vercel frontend and Railway-hosted backend environment

Deliverables:
- users can connect supported providers
- imported data appears in relevant modules
- sync failures are surfaced clearly
- frontend and backend remain stable across deployment environments

### Phase 7: Privacy, polish, and retention optimization
1. Add data management controls
2. Add deletion controls and audit visibility
3. Polish onboarding and dashboard clarity
4. Add onboarding flows for setting goals and habits
5. Improve retention loops and weekly summary nudges

Deliverables:
- users understand how data is used
- product is easier to onboard and retain

## 9. Suggested milestone sequence for a small Codex team

### Milestone 1: foundation + finance
- auth
- db schema
- account and transaction CRUD
- budgets
- dashboard basics

### Milestone 2: life tracking
- activities
- timeline
- tasks
- projects
- reminders

### Milestone 3: habits and goals
- custom habits
- streak logic
- goal tracking
- progress calculations

### Milestone 4: AI insights
- data grounding
- question answering
- summary generation
- trend detection

### Milestone 5: integrations and privacy
- selected integrations
- consent UX
- deletion controls
- sync management

## 10. Acceptance criteria for MVP

The MVP is successful when a user can:
- create an account and set basic profile settings
- log expenses and incomes
- view a dashboard summarizing money and tasks
- add activities and see them on a timeline
- manage tasks and projects
- create and track habits
- define a measurable goal
- ask basic questions about their data and receive grounded answers
- understand how their data is handled and exactly what is being imported

## 11. Release strategy

### V1: Clean MVP
Focused on the core experience with essential features only.
- frontend deployed on Vercel
- backend deployed on Railway
- preview/staging environments for early testing and validation

### V1.1: Better automation and AI
Add more integrations, better summaries, and stronger recurring insight generation.
- production deployment hardening on Vercel and Railway
- environment tuning and observability improvements

### V2: Full personal intelligence platform
Add broader cross-data intelligence, more integrations, advanced automation, and stronger proactive recommendations.
- scaled frontend and backend services across Vercel and Railway
- broader production pipelines and integration coverage

## 12. Key risks to monitor

- building too much too early
- poor clarity of value proposition
- weak retention if the app feels like manual data entry
- privacy and trust failures
- AI answers lacking transparency
- lack of meaningful insight beyond static dashboards

## 13. Product principle to guide implementation

Every feature should answer one question:

“Does this reduce friction and increase the user’s understanding of their own life?”

If the answer is no, it should be deferred.

## 14. Codex implementation instruction summary

Codex should prioritize in this order:
1. core data model
2. finance basics
3. activity + timeline
4. tasks + projects
5. habits
6. goals
7. dashboard + analytics
8. AI grounded insights
9. integrations
10. privacy + retention polish

This sequencing keeps the product usable early while preserving the longer-term vision.
