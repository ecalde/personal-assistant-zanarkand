---
name: phase-10-upcoming-events-widget
overview: Add an Upcoming Events widget to the Dashboard that lists the next 14 days of life events (up to 10 items), using existing event sorting rules and keeping all selection/label logic in pure `src/core` helpers while dashboard components remain presentational.
todos:
  - id: core-helper
    content: Add pure `buildUpcomingEventItems` helper (filter/sort/cap + urgency labels) in `src/core/events.ts`.
    status: completed
  - id: core-tests
    content: Add `src/core/events.test.ts` unit tests for windowing, sorting, labeling, and truncation.
    status: completed
  - id: ui-section
    content: Create presentational `src/components/dashboard/UpcomingEventsSection.tsx` (rows + empty state, consistent pills/styles).
    status: completed
  - id: dashboard-wire
    content: Compute upcoming items in `src/pages/DashboardPage.tsx` and render the new widget in the dashboard layout.
    status: completed
  - id: validate
    content: Run typecheck/lint/tests/build and sanity check mobile layout + empty state.
    status: completed
isProject: false
---

# Phase 10: Upcoming Events dashboard widget

## Goals and constraints
- **Goal**: Show a compact list of upcoming life events (birthdays, trips, hangouts, deadlines, holidays, other) on the Dashboard.
- **Hard constraints**:
  - No changes to auth/sync/storage/Supabase schema.
  - No new dependencies.
  - Keep logic **pure + testable**; Dashboard components **presentational only**.
  - Avoid editing `src/App.tsx` (only touch it if Dashboard truly needs props it doesn’t already have).

## Proposed data flow (matches existing architecture)
- `src/App.tsx` already passes `events` into `DashboardPage` (confirmed in `DashboardPageProps`).
- `src/pages/DashboardPage.tsx` will compute “upcoming window” data via a pure helper in `src/core/events.ts` and pass the result into a new presentational section component under `src/components/dashboard/`.

## Core helper decision (yes: add a pure helper in `src/core/events.ts`)
Add a new helper that:
- **Filters** events to a rolling window: **today through today+14 days**, inclusive.
- **Sorts** using existing rules: `sortUpcomingEvents` (date asc, then `compareLifeEventsWithinDay`).
- **Annotates** each item with a small derived label used by the UI:
  - `Today`
  - `Tomorrow`
  - `In X days`

### Suggested core API
Create a small DTO for the dashboard (keeps component dumb):
- `UpcomingEventItem = { event: LifeEvent; urgencyLabel: "Today" | "Tomorrow" | `In ${number} days`; daysUntil: number }`
- `buildUpcomingEventItems(events, todayKey, windowDays, maxItems): UpcomingEventItem[]`

Implementation details (still pure):
- Use **string date keys** (`YYYY-MM-DD`) and local-midnight Date math to compute `daysUntil` safely.
- Use existing date helper pattern from `src/core/timeline.ts` (`formatLocalDateKey`) as the “todayKey” generator on the page side.

## Component structure (presentational)
### New components
- `[src/components/dashboard/UpcomingEventsSection.tsx](src/components/dashboard/UpcomingEventsSection.tsx)`
  - Props:
    - `items: UpcomingEventItem[]`
    - `windowDays: number` (for copy like “Next 14 days”)
  - Responsibilities:
    - Header + short description.
    - Empty state.
    - Map `items` to rows.

- (Optional) `[src/components/dashboard/UpcomingEventRow.tsx](src/components/dashboard/UpcomingEventRow.tsx)`
  - If the section file starts getting long; otherwise keep as a local component.

### UI fields shown per row
Meets requirement fields:
- **Event type**: pill using `styles.statusPill` (like `EventsPage`), label text e.g. “Birthday”.
- **Urgency**: pill or muted text: “Today / Tomorrow / In X days”.
- **Date**: short local label (weekday + month + day). Reuse the same formatting approach as `EventsPage.formatEventDate` (but as a small local formatting function in the dashboard component).
- **Optional time**:
  - If `startTime`+`endTime`: show `HH:MM–HH:MM`
  - If `startTime` only: show `HH:MM`
  - If no time: omit time or show “All-day” (keep compact; likely omit).
- **Title**: bold.
- **Optional personName**: “With Alex” line (same copy as Events page).
- **Reminder indicator**: show a `styles.streakPill` with text “Reminder” when `event.reminder` is true (consistent with `EventsPage` and `UnifiedTimelineRow`).

### Layout guidance (mobile cleanliness)
- Follow existing dashboard patterns:
  - Use `styles.dashboardSection` wrapper.
  - Use rows similar to `UnifiedTimelineRow` layout: flex-wrap + minWidth:0; avoid dense multi-column tables.
- Prefer 2-line max for row header on narrow screens:
  - Line 1: type pill + title
  - Line 2: date/time + urgency label (and reminder pill when present)

## Files to modify/create
### Modify
- `[src/core/events.ts](src/core/events.ts)`
  - Add `buildUpcomingEventItems` (and exported types if needed).
- `[src/pages/DashboardPage.tsx](src/pages/DashboardPage.tsx)`
  - `useMemo` to compute `todayKey` and upcoming items.
  - Render the new section in the dashboard layout (likely near timeline/hero sections; recommendation below).

### Create
- `[src/components/dashboard/UpcomingEventsSection.tsx](src/components/dashboard/UpcomingEventsSection.tsx)`
- `[src/core/events.test.ts](src/core/events.test.ts)` (new unit tests for the helper; no deps needed—match existing core test style)

## Widget placement recommendation
Place after `TodayHero` and before timeline sections:
- It’s a “today context + upcoming” pair.
- Keeps it high on the dashboard without interrupting skill progress sections.

## Filtering + sorting rules (explicit)
- **Window**: include events where `event.date` is in `[todayKey, todayKey + 14 days]`.
- **Include timed and untimed events**.
- **Sorting**: use `sortUpcomingEvents` (date asc; within day: timed first, then by startTime, then title, then id).
- **Cap**: return **up to 10** events.

## UI copy (proposed)
- **Section title**: “Upcoming events”
- **Section subtitle**: “Next 14 days.”
- **Empty state**: “No upcoming events.”
- **Urgency labels**:
  - 0 → “Today”
  - 1 → “Tomorrow”
  - N>1 → `In ${N} days`
- **Reminder** pill text: “Reminder” (already used elsewhere)

## Edge cases to handle
- **No time**: still show date and urgency; don’t render placeholder times.
- **Start time only**: show as marker-style time (consistent with timeline semantics).
- **End time without start time**: should not occur because Events page validates it, but helper should behave safely (treat as no time).
- **Invalid date string**: helper should avoid throwing; if date parsing fails, fall back to string compare filtering (or skip). Recommendation: skip unparseable items for safety and keep the function total.
- **Many events on same day**: stable ordering via existing sorter.
- **Events exactly on day 14**: included (inclusive end).

## Validation checklist
- **Unit tests** (`src/core/events.test.ts`):
  - Filters to window boundaries (today, today+14 included; today-1 excluded; today+15 excluded)
  - Urgency labels (Today/Tomorrow/In X days)
  - Sorting respects `sortUpcomingEvents` (timed before untimed within a day)
  - Cap at 10 items
- **UI behavior**:
  - Empty state shows when no items in window
  - Reminder indicator appears only when `reminder === true`
  - Mobile: rows wrap cleanly; no overflow (ensure `minWidth: 0` where needed)
- **Repo checks**: `npm test`, `npm run lint`, `npm run build`

## Step-by-step implementation order
1. Add `buildUpcomingEventItems` (+ types) in `src/core/events.ts`.
2. Add `src/core/events.test.ts` covering the helper.
3. Create `UpcomingEventsSection` presentational component under `src/components/dashboard/`.
4. Wire it into `DashboardPage.tsx` using `useMemo`:
   - `todayKey = formatLocalDateKey(new Date())`
   - `items = buildUpcomingEventItems(events, todayKey, 14, 10)`
5. Run lint/tests/build and adjust styling for mobile wrap if needed.
