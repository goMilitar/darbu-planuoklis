# Sandėlio Planas - Warehouse Work Planning & Performance App

## Overview
A warehouse work planning and employee performance tracking application. Warehouse managers can create daily plans for employees, track task completion in real-time, and analyze team performance with detailed analytics.

## Architecture
- **Frontend**: React SPA with Vite, Tailwind CSS, Shadcn UI, Recharts
- **Backend**: Express.js with PostgreSQL (Drizzle ORM)
- **Auth**: Dual auth - Replit Auth (OpenID Connect) + Email/Password (bcryptjs)
- **Routing**: wouter (frontend), Express (backend)

## Key Features
- 3-tier role system: owner (savininkas), admin (vadovas), employee (darbuotojas)
- Manual employee creation (not just Replit Auth registration)
- Daily plan creation and management with weekly calendar view
- Multi-tier task selection (Surplus Inbound has 3 tiers with categories)
- Task line tracking with direct quantity input + /- buttons
- Color-coded completion status (green 100%, yellow 80%+, orange 70-80%, red <70%)
- Mandatory close reason when tasks not 100% complete
- Automatic carryover of unfinished tasks to next day (Close Day)
- Performance benchmarks system (daily norms per task category)
- Comprehensive analytics with date range filters, employee filters, charts
- Audit log (Events) for all operations
- Mandatory plan creation: admin must create plans for all active employees before using other pages
- Employee active/inactive toggle in employee management
- Absence tracking with predefined reasons (Nėra darbe, Atostogauja, Pavaduoja kolegą, Nedarbingumo lapas)
- **Flexible-schedule employees** (`workSchedule = 'flex'`): no 8h day-load gating; clock-in/out + self-close; per-day planned vs actual work-time tracking surfaced on plan detail (toast on close), my-plan (week/month/total + recent days), and analytics (per-employee `flexStats` with worked / planned / overrun / days within or over time).

## Data Model
- **Users** (from Replit Auth + email registration + manual creation): id, email, firstName, lastName, password (hashed, nullable), role, workSchedule (full_time|flex), expectedDailyHours (real, default 8 — flex employees' expected daily worked hours used for planned vs. actual report), isActive (boolean, default true)
- **DayPlans**: id, date, employeeId, status (planned|in_progress|done|closed), closedAt, carryoverFromPlanId, closeComment, performanceScore
- **PlanLines**: id, dayPlanId, taskType, itemCode, description, plannedQty, actualQty, unit, status (open|partial|done|skipped|blocked), isCarryover, carryoverParentLineId, carriedQty, blockReason
- **EmployeeAbsences**: id, employeeId, date, reason, createdBy, createdAt
- **Events**: id, ts, userId, entityType, entityId, action, payload

## Task Hierarchy
- Tier 1: Main task types (Surplus Inbound, Brand Inbound, AMZ Plan, etc.)
- Tier 2: Sub-types for Surplus Inbound (Re-stock, New)
- Tier 3: Categories (No prep needed Level 1/2, Cap, Parka/jacket, Coat, Pants, Coverall, Boots, Pouch/bag, Backpack, Clothing Other, Clothing Other Level 2)

## Performance Benchmarks (`shared/benchmarks.ts`)
- Each tier 3 category has a daily norm range (min-max pcs)
- Performance = sum of (actualQty / categoryMinNorm) across all categories
- Example: 150 "No prep Level 1" (norm 500) + 150 "Cap" (norm 300) = 150/500 + 150/300 = 80%
- Rating: excellent (100%+), good (80%+), below (60%+), poor (<60%)
- Diversity discount: 3-4 distinct Tier 1 categories → -5% norm, 5+ categories → -10% norm
  - Only counts main categories (Tier 1), not sub-types (Tier 2/3)
  - "Maintain warehouse" excluded from category count
  - Applied to both performance calculation and load indicator
  - **Skipped for admin/owner employees** — their daily norm is NOT reduced regardless of task diversity
- Performance score saved to dayPlans.performanceScore on close

## Role Permissions
- **owner** (savininkas): Full access - dashboard, plans, employees, analytics, load indicator, plan management
- **admin** (vadovas): Same as owner but WITHOUT analytics page; sees dashboard, plans, employees, load indicator
- **employee** (darbuotojas): Can view own daily plan and edit actualQty (+/- buttons, direct input) on their own plan lines. Cannot add/delete lines, skip/block tasks, close plans, or modify plannedQty/status. Admin confirms results at end of day.
- First user to log in becomes owner via `/api/seed-admin`
- Email auth: register at `/auth`, login with email/password, sessions stored in DB
- Replit Auth: login via `/api/login` (OIDC flow)
- `getUserId(req)` helper resolves user ID from either auth type
- Backend uses `isManagerRole()` helper to check owner OR admin for management operations
- Analytics endpoint restricted to owner only

## Business Logic
- **Undone Calculation**: `undone_qty = max(planned_qty - min(actual_qty, planned_qty), 0)`
- **Carryover**: On "Close Day", creates new PlanLines in tomorrow's plan for undone items with is_carryover=true
- **Generate Today**: Copies yesterday's plan lines + adds carryover lines for undone work
- **Auto Status**: Plan moves to in_progress when first actual_qty is recorded
- **Close Comment**: Required when closing a plan with <100% completion (predefined reasons + custom)

## Pages
- `/` - Dashboard (admin) or My Plan (employee)
- `/day-plans` - Weekly plan management (admin)
- `/plan/:id` - Plan detail with line editing, performance tracking
- `/employees` - Employee management (add/delete/role change, admin only)
- `/flex-hours` - Flex employee worked hours report with date range/employee filters, weekly/monthly totals, CSV export (owner + admin). Shows planned (per-employee `expectedDailyHours`) vs. actual hours side by side at day, week, month, and grand-total level. Days/weeks/months where actual deviates from planned by more than ±15% are highlighted (over = amber, under = red).
- `/analytics` - Performance analytics with filters and charts

## Clock-out Reminder System
- Flex employees who clock in but never clock out are reminded:
  - **In-app banner** on `/my-plan` (data-testid `banner-forgotten-clock-out`) shows all open clock-ins for the user with one-tap navigation to the plan. Today's open clock-in shows a normal action; older entries get a "Reikia admin pagalbos" badge because the same-day rule blocks self-close.
  - **Email reminder** is sent via Gmail integration (`server/gmail.ts → sendClockOutReminder`) once per plan; tracked in `events` with action `clock_out_reminder_sent`.
  - **Scheduler** (`server/scheduler.ts`) runs every 15 min, started from `server/index.ts`. Sends reminders for any past-day open clock-in immediately, and for today's open clock-ins once it's 18:00+ in `Europe/Vilnius`.
  - **Admin summary**: `/api/pending-plans` response now includes `forgottenClockOuts` (flex employees with open clock-ins from BEFORE today). The pending-plans blocker page shows them under heading "Nepažymėta darbo pabaiga" so admin can resolve.

## API Endpoints
- `GET/POST /api/day-plans` - List/create plans
- `GET /api/day-plans/:id` - Plan with lines
- `POST /api/day-plans/generate` - Generate from yesterday
- `POST /api/day-plans/:id/close` - Close day with carryover + performance calc
- `GET /api/day-plans/:id/performance` - Real-time performance calculation
- `PATCH /api/day-plans/:id/status` - Update plan status
- `POST /api/day-plans/:id/clock-in` / `/clock-out` - Flex employee marks own work start/end
- `POST /api/day-plans/:id/reset-clock-in` - Flex employee cancels own clock-in within 5 min (before clock-out, plan not closed)
- `PATCH /api/day-plans/:id/work-times` - Owner/admin edits flex employee's `workStartedAt`/`workEndedAt` (any value or null) on a non-closed plan; logged as `work_times_edited` event
- `POST/PATCH/DELETE /api/plan-lines` - CRUD for plan lines
- `GET /api/analytics` - Analytics with filters
- `GET /api/admin/flex-hours?startDate&endDate&employeeId` - Aggregated worked hours per flex employee (owner + admin); each day includes `planId` so the /flex-hours edit dialog can target it
- `GET/POST /api/users` - List/create users
- `DELETE /api/users/:id` - Delete user
- `PATCH /api/users/:id/role` - Update user role
- `PATCH /api/users/:id/active` - Toggle user active status
- `GET /api/pending-plans?date=` - Check which active employees need plans for given date (also returns `forgottenClockOuts` for flex employees with open clock-ins from before given date)
- `GET /api/my-open-clock-ins` - Returns the current flex user's plans with `workStartedAt` set but no `workEndedAt`
- `POST /api/forgotten-clock-outs/check` - Admin-only: manually trigger the clock-out reminder scheduler check
- `POST /api/absences` - Record employee absence (reason: Nėra darbe, Atostogauja, Pavaduoja kolegą, Nedarbingumo lapas)
- `DELETE /api/absences/:id` - Remove absence record

## Key Files
- `shared/schema.ts` - Database schema (Drizzle)
- `shared/benchmarks.ts` - Performance benchmarks config
- `server/routes.ts` - API routes
- `server/storage.ts` - Database operations
- `client/src/components/task-combobox.tsx` - Multi-tier task selector
- `client/src/pages/plan-detail.tsx` - Plan detail with performance
