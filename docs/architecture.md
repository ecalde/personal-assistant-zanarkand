# Architecture

## Overview

Personal Assistant is a client-side React app with optional cloud sync:

- **Vite + React + TypeScript** — SPA build and dev server
- **Vercel** — production hosting (static build output)
- **Supabase Auth** — email/password sign-in; session gate before the app shell
- **Supabase Postgres** — per-user rows for skills, sessions, overrides, events, people, job applications, career targets, workout plans, workout sessions, and focus feedback (RLS-scoped)
- **localStorage** — user-scoped cache (`pa.appData.v1.<userId>`) plus legacy key migration
- **Cloud sync** — `initialSync` on load; debounced `replaceRemotePayload` on mutations when remote sync is enabled

There is no Next.js app router, no CMS, and no custom backend API in this repo. The browser talks to Supabase directly with the public anon key (RLS enforces access).

## Entry and auth flow

```
main.tsx → AuthGate → (signed out) AuthScreen
                    → (signed in)  App(userId)
```

- [`src/auth/AuthGate.tsx`](../src/auth/AuthGate.tsx) — subscribes to Supabase session; renders sign-in or `App`
- [`src/auth/AuthScreen.tsx`](../src/auth/AuthScreen.tsx) — sign up / sign in UI
- [`src/App.tsx`](../src/App.tsx) — data shell (sync, mutations, page routing)

## Folder structure

```
src/
  main.tsx              # React root → AuthGate
  App.tsx               # Sync lifecycle, commit, CRUD, page state
  auth/                 # Auth gate and sign-in screen
  core/                 # Domain model, storage, sync, mappers, pure helpers
    dashboardStats.ts   # Pure dashboard derivations (today/week/timeline)
    events.ts           # Event sorting, upcoming window helpers
    people.ts           # People birthdays, follow-ups, event label resolution
    career.ts           # Job applications pipeline, skill-gap helpers, search/sort
    fitness.ts          # Workout plans/sessions helpers, search/sort, summaries
    focus.ts            # Daily Focus Engine — ranked cross-domain recommendations
    focusFeedback.ts    # Focus dismiss/snooze suppression helpers
    briefing.ts         # Daily Briefing Engine — deterministic NL summaries
    review.ts           # Weekly Review Engine — cross-domain weekly summaries
    progression.ts      # Derived XP, levels, streaks (from sessions; not persisted)
    timeline.ts         # Unified schedule + events timeline
    calendar.ts         # Unified calendar foundation — domain data → CalendarItem range
    calendarColors.ts   # Pure calendar color/category preference resolution (palette + precedence)
    calendarView.ts     # Pure calendar view math — month/week grids, ranges, filtering, layout, labels
    recurrence.ts       # Pure recurrence engine — rule expansion into date keys (standalone, unwired)
    skillSeries.ts      # Pure skill schedule-series bounds — active-date filtering (unwired)
  lib/                  # Supabase client (VITE_* env only)
  pages/                # Route-like screens (Dashboard, Calendar, Skills, Events, People, Career, Fitness, Review)
    DashboardPage.tsx   # Composes dashboard sections from props
    CalendarPage.tsx    # Read-only Outlook-style month/week calendar
    ReviewPage.tsx      # Full weekly review breakdown (read-only)
    EventsPage.tsx      # Life events CRUD
    PeoplePage.tsx      # Friends/contacts CRUD
    CareerPage.tsx      # Job applications + dream job target CRUD
    FitnessPage.tsx     # Workout plans + completed session CRUD
  components/
    layout/             # AppShell, NavButton
    calendar/           # Calendar views (month/week), toolbar, sidebar, pills/blocks, detail modal
    dashboard/          # Dashboard sections and shared widgets
    people/             # People page cards, toolbar, form
    career/             # Career page forms, cards, skill picker
    fitness/            # Fitness page forms, cards, exercise editor
    skills/             # SkillEditor, GoalInput
  ui/                   # Shared styles and display helpers
```

| Path | Responsibility |
|------|----------------|
| `src/auth` | Authentication UI and session gate |
| `src/core` | Business logic, validation, `localStorage`, remote sync, DB mappers |
| `src/lib` | `createClient` for Supabase (public env vars only) |
| `src/pages` | Presentational pages; props in, callbacks out |
| `src/components/layout` | App chrome (header, nav, banners) |
| `src/components/dashboard` | Presentational dashboard sections (`TodayHero`, timeline, progress, weekly preview, career pipeline) |
| `src/components/people` | People-specific UI building blocks |
| `src/components/career` | Career-specific UI building blocks |
| `src/components/fitness` | Fitness-specific UI building blocks |
| `src/components/skills` | Skills-specific UI building blocks |
| `src/ui` | `appStyles`, `format` helpers (no domain rules) |

## Architecture boundaries

### AuthGate

- Owns whether the user sees `AuthScreen` or `App`
- Passes `userId` and `onSignOut` into `App`
- Does not read or write app payload data

### App (`src/App.tsx`)

- Owns `AppData` state, loading/error/sync UI flags, and internal `page` state (`dashboard` \| `calendar` \| `skills` \| `events` \| `people` \| `career` \| `fitness` \| `review`)
- Runs `initialSync` on mount; guards mutations with `syncReadyRef`
- All writes go through `commit` → `saveAppData(userId)` → debounced remote persist
- Defines CRUD handlers passed to pages as callbacks
- Does not embed large page UIs (those live under `src/pages` and `src/components`)

### Pages (`src/pages`)

- Presentational: receive slices of `app.payload` and callbacks
- Must not call `saveAppData`, `initialSync`, or `replaceRemotePayload` directly
- Examples: [`DashboardPage.tsx`](../src/pages/DashboardPage.tsx), [`ReviewPage.tsx`](../src/pages/ReviewPage.tsx), [`SkillsPage`](../src/pages/SkillsPage.tsx), [`EventsPage`](../src/pages/EventsPage.tsx), [`PeoplePage`](../src/pages/PeoplePage.tsx), [`CareerPage`](../src/pages/CareerPage.tsx), [`FitnessPage`](../src/pages/FitnessPage.tsx)
- [`DashboardPage`](../src/pages/DashboardPage.tsx) builds derived data via `core/dashboardStats`, `core/progression`, `core/focus`, `core/review`, and related helpers, then composes visual sections; it does not persist or call sync APIs.
- [`ReviewPage`](../src/pages/ReviewPage.tsx) runs `buildWeeklyReview` in a `useMemo` and renders read-only domain sections; no mutations.

### Components (`src/components`)

- Reusable UI composed by pages or `AppShell`
- Layout: `AppShell`, `NavButton`
- Dashboard ([`src/components/dashboard/`](../src/components/dashboard/)): presentational only — props in, events out; no `saveAppData` or Supabase
- Skills: `SkillEditor`, `GoalInput`

### Core (`src/core`)

- Domain types ([`model.ts`](../src/core/model.ts)), defaults ([`state.ts`](../src/core/state.ts))
- Persistence and backup ([`storage.ts`](../src/core/storage.ts))
- Remote sync policy ([`remoteStorage.ts`](../src/core/remoteStorage.ts), [`syncErrors.ts`](../src/core/syncErrors.ts))
- Row ↔ payload mappers ([`dbMappers.ts`](../src/core/dbMappers.ts))
- Pure helpers: schedule math ([`schedule.ts`](../src/core/schedule.ts)), events ([`events.ts`](../src/core/events.ts)), people ([`people.ts`](../src/core/people.ts)), career ([`career.ts`](../src/core/career.ts)), fitness ([`fitness.ts`](../src/core/fitness.ts)), unified timeline ([`timeline.ts`](../src/core/timeline.ts)), unified calendar ([`calendar.ts`](../src/core/calendar.ts)), daily focus ([`focus.ts`](../src/core/focus.ts)), daily briefing ([`briefing.ts`](../src/core/briefing.ts)), weekly review ([`review.ts`](../src/core/review.ts))
- Dashboard stats ([`dashboardStats.ts`](../src/core/dashboardStats.ts)): `buildSkillDayRows`, `buildTimelineItems`, `totalMinutesToday`, week helpers, progress targets — tested in [`dashboardStats.test.ts`](../src/core/dashboardStats.test.ts)
- Daily focus ([`focus.ts`](../src/core/focus.ts)): `buildDailyFocusSummary` aggregates skills, events, people, career, fitness, and timeline signals into ranked read-only `FocusItem` recommendations — tested in [`focus.test.ts`](../src/core/focus.test.ts). **Not persisted**; recomputed on each dashboard render. Recommendations only (no mutations, notifications, or auto-rescheduling).
  - **`FocusActionType`** — derived action hints (`log_skill_minutes`, `apply_to_job`, `resolve_conflict`, etc.) mapped in [`DailyFocusSection`](../src/components/dashboard/DailyFocusSection.tsx) to existing page navigation handlers.
  - **Derived metadata** on each `FocusItem`: `suggestedActionType`, `actionTargetId`, and `expiresAtIso` — never stored in `AppPayload` or synced to Supabase.
  - **Expiration semantics**: collectors assign per-signal expiry (event end, block end, end of day, +7 days for career, next day for follow-ups). `filterExpiredFocusItems` removes stale items before the dashboard cap is applied.
  - **Cleanup lifecycle**: collect → merge → score → rank → filter expired → slice top N.
- Focus feedback ([`focusFeedback.ts`](../src/core/focusFeedback.ts)): persisted `FocusFeedback` rows in `AppPayload.focusFeedback` and the `focus_feedback` Supabase table — tested in [`focusFeedback.test.ts`](../src/core/focusFeedback.test.ts). A lightweight visibility layer keyed by stable `FocusItem.id`; **never mutates** underlying domain entities (skills, events, people, career, fitness). Feedback history is **UI suppression state only**, not domain data.
  - **Suppression semantics**: `dismissed` hides an item for the rest of the local calendar day (based on `createdAtIso`); `snoozed` hides until `untilIso`. Newest entry per `focusItemId` wins. Expired entries are removed on app load via `cleanupExpiredFeedback`.
  - **Source snapshots**: optional `sourceSnapshot` on `FocusFeedback` stores human-readable focus card text (title + description) at dismiss/snooze time for the **hidden focus review drawer** and future personalization. **Not used** for suppression, matching, or ranking — keyed only by `focusItemId`.
  - **Hidden review drawer**: [`buildHiddenFocusFeedbackItems`](../src/core/focusFeedback.ts) returns derived `HiddenFocusFeedbackItem` DTOs with precomputed `displayLabel`, `actionLabel`, and `expiryLabel`. [`DailyFocusSection`](../src/components/dashboard/DailyFocusSection.tsx) consumes these DTOs only — raw `focusItemId` values are not shown in the UI; missing snapshots fall back to **"Hidden recommendation"**.
  - **Dashboard integration**: [`DashboardPage`](../src/pages/DashboardPage.tsx) filters suppressed items from the globally ranked pool **before** the top-5 slice and passes the visible summary to [`DailyFocusSection`](../src/components/dashboard/DailyFocusSection.tsx). Dismiss, snooze (3h / tomorrow), restore-one, restore-all, and **Review hidden** (inline drawer) commit feedback through `App.tsx`. `buildHiddenFocusFeedbackItems` scopes the drawer to today's ranked focus pool so hidden count and drawer entries stay aligned.
  - **Briefing intentionally ignores suppression**: [`buildDailyBriefing`](../src/core/briefing.ts) reads the unsuppressed `DailyFocusSummary` so narrative and risk flags still reflect underlying signals.
  - **No auto-rescheduling**: feedback only affects Today's Focus visibility; it does not reschedule blocks, events, or reminders.
  - **Future**: persisted dismiss/snooze history could feed AI personalization weights (deferred).
- Daily briefing ([`briefing.ts`](../src/core/briefing.ts)): `buildDailyBriefing` turns derived dashboard state (focus summary, unified timeline day, workload totals, domain slices) into deterministic natural-language summaries — tested in [`briefing.test.ts`](../src/core/briefing.test.ts). **Not persisted**; recomputed on each dashboard render. No AI APIs.
  - **Relationship to focus**: briefing **reads** `DailyFocusSummary` plus timeline/workload inputs. Focus remains the actionable ranked list with CTAs; briefing adds narrative paragraphs, secondary suggestion strings (overflow focus items not shown in Today's Focus), and risk flags.
  - **`DailyBriefing` output**: `greeting`, `summary`, `workloadSummary`, `focusSummary`, `recommendations[]` (max 5), `riskFlags[]`, `tone`, `generatedAtIso`.
  - **`tone`**: derived read-only mood for UI styling — `warning` when risk flags exist or workload is heavy; `encouraging` when caught up (no visible focus items and no risk flags); otherwise `neutral`.
  - **Deterministic template variation**: `selectDeterministicTemplate(templates, seed)` picks phrasing from fixed template arrays using a hash of `todayKey`, workload level, and context counts — no randomness, no AI. Used for workload summaries, clear-day copy, on-track focus copy, and recommendation fallbacks.
- Weekly review ([`review.ts`](../src/core/review.ts)): `buildWeeklyReview` aggregates skills, fitness, career, people, events, and focus feedback for the **local calendar week containing today** (Monday–Sunday) — tested in [`review.test.ts`](../src/core/review.test.ts). **Not persisted**; recomputed on dashboard and review page renders. No AI APIs, no mutations, no notifications.
  - **Week boundaries**: reuse `startOfWeekLocal` / `isInLocalWeek` from [`dashboardStats.ts`](../src/core/dashboardStats.ts); date-key fields filtered with the same Monday 00:00 → next Monday exclusive window.
  - **`WeeklyReview` output**: `week` (includes stable `weekKey`, e.g. `2026-W21`), `greeting`, `headline`, `summary`, `wins[]`, `risks[]`, domain sections (`skills` rows include `completionRate`), `tone`, `generatedAtIso`. Section visibility helpers (`isSkillsSectionVisible`, etc.) live in `review.ts` for UI reuse.
  - **Focus feedback analytics**: weekly dismiss/snooze counts grouped by `focusItemId` from persisted `FocusFeedback` rows (`createdAtIso` in week); labels from `sourceSnapshot`. Daily ranked focus history is **not** stored — only feedback history.
  - **UI surfaces**: compact [`WeeklyReviewSection`](../src/components/dashboard/WeeklyReviewSection.tsx) on the dashboard (after daily briefing); full breakdown on [`ReviewPage`](../src/pages/ReviewPage.tsx) via nav tab **Review**.
  - **Future**: `WeeklyReviewContext` for AI “explain my week”, prior-week deltas, persisted reflection notes (deferred).
- Progression ([`progression.ts`](../src/core/progression.ts)): lifetime XP (1 XP = 1 logged minute), linear level bands (`XP_PER_LEVEL_BAND`), per-skill and global streaks — tested in [`progression.test.ts`](../src/core/progression.test.ts). **Not stored** in Postgres or `AppPayload`; recomputed from `sessions` on each render. Streak rule: meet `dailyGoalMinutes` when set, else any minutes > 0; global streak counts a day if **any** skill qualifies.

### Unified calendar foundation

- Calendar foundation ([`calendar.ts`](../src/core/calendar.ts)): `buildCalendarItemsForRange` converts skills, life events, people birthdays, and optional fitness history into common `CalendarItem` rows for an inclusive `YYYY-MM-DD` date range — tested in [`calendar.test.ts`](../src/core/calendar.test.ts). **Not persisted**; pure derivation with no side effects, recomputed on demand. Built for future Outlook-like week/month dashboard views; no UI in this layer.
  - **`CalendarItem`**: stable `id`, `sourceType` (`skill` \| `event` \| `people` \| `fitness` \| `career`), `sourceId`, `title`, `date`, optional `startTime`/`endTime`, derived `isTimed`/`allDay`/`isMultiDay`, theming hooks (`categoryKey`, optional `subcategoryKey`/`colorKey`/`iconKey`), optional `description`, and a discriminated `sourceMeta` carrying original domain fields.
  - **Source mapping**: skill weekly blocks expand per date in range; life events convert directly (timed range, start-only marker, or all-day); people birthdays expand `birthdayMonthDay` per intersecting year (Feb 29 → Feb 28 in non-leap years, matching [`people.ts`](../src/core/people.ts)); workout sessions with `completedAtIso` become opt-in historical timed items.
  - **Birthday dedupe**: a person birthday is skipped when a matching `birthday` life event exists on the same date (linked by `personId` or name), so the explicit event wins.
  - **Sorting**: mirrors [`compareUnifiedTimelineItems`](../src/core/timeline.ts) — date, then time tier (timed range → start-only → all-day), then start/end time, then source order (`skill` → `event` → `people` → `fitness`), then title, then `id`. `groupCalendarItemsByDate` buckets sorted items per day for UI.
  - **Relationship to timeline**: [`timeline.ts`](../src/core/timeline.ts) remains the today-focused merge with conflict/workload detection; `calendar.ts` is the broader multi-day DTO. `career` is reserved in the union but emits nothing yet — career interviews/deadlines flow through `sourceType` `event`.
  - **Recurring events**: life events with `event.recurrence` expand via the recurrence engine into one item per occurrence before sorting (see the Recurrence engine subsection); skill weekly blocks remain a separate implicit recurrence.
  - **Future**: scheduled fitness workouts and drag/edit interactions — see the Calendar UI subsection and Phase 18 plan deferred items.

### Calendar UI (`CalendarPage` + `components/calendar`)

- [`CalendarPage`](../src/pages/CalendarPage.tsx) is a **read-only** Outlook-style calendar. It owns local-only UI state (no persistence): `viewMode` (`month` default \| `week`), the current anchor date, a `hiddenCategories` set, and the selected item for the detail modal. It builds items via `buildCalendarItemsForRange` (with `includeFitnessHistory: true`) for the active range, filters by hidden categories, then groups with `groupCalendarItemsByDate`.
- View math is isolated in the pure, tested [`calendarView.ts`](../src/core/calendarView.ts): `computeMonthVisibleRange` / `computeWeekRange`, `buildMonthGrid` (6×7, Sunday→Saturday, `inCurrentMonth`/`isToday` flags), `buildWeekGrid` (7 columns), `shiftMonth` / `shiftWeek` / `monthAnchorFromKey`, `filterItemsByHiddenCategories`, `splitDayItems`, `limitDayItems` (month "+N more"), `computeTimedItemLayout` (week block placement, minimum height for start-only items), and label helpers (`formatMonthTitle`, `formatWeekRangeTitle`, `formatHourLabel`, `formatItemTimeLabel`, `formatSourceTypeLabel`). Tested in [`calendarView.test.ts`](../src/core/calendarView.test.ts).
- Components ([`components/calendar/`](../src/components/calendar/)): `CalendarToolbar` (prev/next/today + month↔week toggle), `CalendarCategorySidebar` (per-`CalendarCategoryKey` show/hide toggles with swatches; hidden categories dimmed; render-only), `MonthView` (compact `CalendarItemPill`s + "+N more" → jump to week), `WeekView` (all-day row + 24h timeline with absolutely-positioned `CalendarEventBlock`s and a current-time line), and `CalendarItemDetailModal` (read-only title/type/date/time/description; Escape + overlay-close, `role="dialog"`). All colors come from `resolveCalendarItemColor` using the optional persisted `calendarPreferences` (read-only here).
- **Dashboard preview**: [`CalendarPreviewSection`](../src/components/dashboard/CalendarPreviewSection.tsx) shows the next 7 days grouped with an "Open Calendar" button (navigates via `onOpenCalendar`). It is **additive** — existing dashboard sections are unchanged.
- **Constraints**: no recurrence engine, no drag-and-drop, no editing, no settings page, no schema/persistence changes, no new dependencies.
- **Future extension points**: recurrence would add a pure expansion step inside `calendar.ts` before sorting (views consume `CalendarItem[]` unchanged); editing/DnD would add mutation callbacks on the views routed through `App.tsx` `commit`; a `CalendarPreferencesPage` would write `calendarPreferences`; view mode could later be persisted.

### Calendar color preferences

- Calendar colors ([`calendarColors.ts`](../src/core/calendarColors.ts)): pure, dependency-free resolution of a display color (and category display label) for a calendar item — tested in [`calendarColors.test.ts`](../src/core/calendarColors.test.ts). No React, storage, or Supabase; total functions that never throw and never mutate inputs. **Not persisted** in this phase; consumed on demand by future calendar/settings UI.
  - **Palette**: a fixed `CALENDAR_PALETTE` of swatches built from ~13 base hues × `soft` / `base` / `strong` variants (the "hue variants", not a free color picker). Each `CalendarColorSwatch` carries `token` (`"<hue>.<variant>"`, e.g. `"red.base"`), `background`, an accessibility-aware `foreground` (chosen by WCAG contrast), `border`, and `label`. `CALENDAR_PALETTE_BY_TOKEN` indexes them; `FALLBACK_COLOR_TOKEN` (`slate.base`) covers unknown keys.
  - **Resolution precedence** (`resolveCalendarItemColorToken` / `resolveCalendarItemColor`): **item override** (`CalendarItem.colorKey` when a valid token) → **subcategory** (pref or default for `"category:subcategory"`, e.g. `event:birthday → amber.base`) → **category** (pref or built-in default: `skill` indigo, `event` red, `people` pink, `fitness` green, `career` violet) → **fallback**. Invalid/unknown tokens at any step are ignored and fall through. Input is a structural subset (`categoryKey` / `subcategoryKey?` / `colorKey?`), so the module stays decoupled from `calendar.ts`; `CalendarItem` is assignable to it. `CalendarItem` is **unchanged** — `colorKey` is the per-item override hook.
  - **Display aliases**: `resolveCategoryLabel` returns a sanitized per-category alias (e.g. `skill → "Growth"`) or the built-in default label. `sanitizeCategoryAlias` trims, collapses whitespace, strips control characters, and caps length (untrusted free-text validated per `SECURITY_RULES`; React escapes on render). Aliases affect calendar display only — they never change `categoryKey` or the navigation tab names in [`pages/types.ts`](../src/pages/types.ts).
  - **"Color already used by"**: `buildColorUsageIndex` maps each token to the categories/subcategories assigned to it (defaults merged with overrides); `describeColorUsage` renders a readable summary (e.g. `"Skills, Events"`). Reuse is allowed and never blocked — shared colors are simply labeled.
  - **Persisted singleton**: a per-user `CalendarColorPreferences` (`categories`, `subcategories`, `aliases`) lives on `AppPayload.calendarPreferences` (re-exported from [`calendarColors.ts`](../src/core/calendarColors.ts) so `model.ts` references it without depending on the pure module's logic). It is optional and `undefined` by default — `defaultPayload()` leaves it unset and [`normalizePayload`](../src/core/storage.ts) preserves a valid object or drops to `undefined`, so older localStorage payloads and backups missing the field load unchanged. It is backed by the dedicated `calendar_preferences` Supabase table (one row per user keyed by `user_id` PK, `preferences jsonb NOT NULL` with an object CHECK, `updated_at` trigger, RLS owner policies, revoke public/anon, grant authenticated — mirroring `career_targets` / the focus-feedback migration). [`dbMappers.ts`](../src/core/dbMappers.ts) adds `CalendarPreferencesRow`, `calendarPreferencesToRow` / `calendarPreferencesFromRow`, and `parseCalendarColorPreferences` (untrusted-input validation: category/subcategory keys allowlisted, color tokens must exist in `CALENDAR_PALETTE_BY_TOKEN`, aliases sanitized via `sanitizeCategoryAlias` with empties dropped, unknown top-level fields rejected — which rejects the reserved icon fields until that phase); it is wired into `payloadFromRows` and `validatePayloadForUpload`. [`remoteStorage.ts`](../src/core/remoteStorage.ts) fetches the row, and applies singleton semantics on write: upsert (`onConflict: "user_id"`) when defined, delete the user's row when `undefined`; `payloadHasData` counts it. `calendarColors.ts` itself is **unchanged and still pure** — color/label resolution is unaffected by persistence.
  - **Deferred settings UI (next phase)**: a `CalendarPreferencesPage` (new `Page` value + `AppShell` nav button) with swatch pickers per category/subcategory, alias inputs, and live "used by" labels; `App.tsx` would add a `setCalendarPreferences` handler committing through the standard `commit` path. No calendar/settings UI exists yet.
  - **Future icons**: `CalendarItem.iconKey` is the per-item icon override hook; `CalendarColorPreferences` reserves `categoryIcons` / `subcategoryIcons` for a symmetric `resolveCalendarIconKey` (same precedence) to be added in the icon phase.

### Recurrence engine

- Recurrence ([`recurrence.ts`](../src/core/recurrence.ts)): a pure, dependency-free engine that expands a `RecurrenceRule` into concrete occurrences for a query range — tested in [`recurrence.test.ts`](../src/core/recurrence.test.ts). No React, storage, schema, or Supabase; total functions that never throw and never mutate inputs (invalid input yields empty results). Dates are local `YYYY-MM-DD` keys compared lexicographically; **no timezone/DST handling** (date-only). **Consumed by life events** ([`calendar.ts`](../src/core/calendar.ts) expansion + [`dbMappers.ts`](../src/core/dbMappers.ts) persistence, see below); still standalone for skills/fitness, which can adopt it later.
  - **Types**: `RecurrenceFrequency` (`daily` \| `weekly` \| `monthly` \| `yearly`); `RecurrenceRule` (`anchorDate`, optional `frequency`, `interval`, `byWeekdays`, `dayOfMonth`, `startDate`, `end`, `exceptions`); `RecurrenceEnd` (`never` \| `onDate` \| `afterCount`); `RecurrenceException` (`skip` \| `override` with `overrideDate`); `RecurrenceInstance` (`date`, optional `originalDate`, `occurrenceIndex`, `isException`). A rule with `frequency` omitted is the **one-time** equivalent (a single occurrence on `anchorDate`).
  - **Helpers**: `expandRecurrenceInstances(rule, rangeStart, rangeEnd)` (main expansion), `getRecurrenceDateKeys` (date keys only), `isDateInRecurrenceRange`, `applyRecurrenceExceptions` (exported for tests/UI preview), `splitRecurrenceSeriesAtDate` (pure before/after fork for edit flows), `formatRecurrenceSummary` (human-readable label), and `isValidRecurrenceRule`.
  - **Expansion pipeline**: normalize/validate → generate candidates from the effective series start (`max(anchorDate, startDate)`) → cap by `onDate` / `afterCount` → apply exceptions → clip to the inclusive query range → sort by date, then original date, then occurrence index. Generation may walk before `rangeStart` so `maxOccurrences` counting and overrides that move dates into range stay correct; a fixed candidate cap guards against runaway input.
  - **Counting / boundaries**: `maxOccurrences` counts **scheduled candidates** (a skipped date still consumes a slot; overrides move rather than add). Monthly clamps to the last day of shorter months (Jan 31 → Feb 28/29); yearly maps Feb 29 → Feb 28 in non-leap years (same rule as `calendar.ts` birthdays); weekly `interval` buckets weeks from the anchor.
  - **Series split**: `splitRecurrenceSeriesAtDate` returns a `beforeRule` (original pattern ending the day before `splitDate`) and a caller-supplied `afterRule` (started on `splitDate`), with the original exceptions partitioned by the split date. This supports changing, e.g., a recurring Wednesday event to Friday from a future date **without altering past occurrences**.
  - **Event recurrence persistence** (Phase 22B): `LifeEvent` carries optional `recurrence?: RecurrenceRule` and `seriesId?: string` (re-exported from [`recurrence.ts`](../src/core/recurrence.ts) through [`model.ts`](../src/core/model.ts)). Backed by nullable `recurrence jsonb` (object-shape CHECK) and `series_id uuid` columns on `events` (migration `20260528000000_event_recurrence.sql`; RLS/policies/grants unchanged, existing rows preserved as one-time). [`dbMappers.ts`](../src/core/dbMappers.ts) adds a strict `parseRecurrenceRule` (allowlisted top-level keys, ISO date strings, allowlisted frequency/weekday/end/exception shapes) that cross-checks the engine's `isValidRecurrenceRule`, wired through `assertValidEvent` / `eventToRow` / `eventFromRow` / `validatePayloadForUpload`. Remote sync needs no change (`select("*")` + existing `eventToRow` routing). [`storage.ts`](../src/core/storage.ts) `normalizePayload` preserves the nested fields as-is, so old localStorage payloads and backups without recurrence load unchanged.
  - **Calendar expansion** (Phase 22B): [`collectEventItems`](../src/core/calendar.ts) calls `expandRecurrenceInstances(event.recurrence, startDate, endDate)` for recurring events and emits one `CalendarItem` per instance (`date = instance.date`, preserving `title`/`type`/`startTime`/`endTime`/`personName`/`notes`), with recurrence metadata on `sourceMeta` (`recurrenceDate`, `originalDate`, `occurrenceIndex`, `isRecurrenceException`). Recurring instances use stable id `event:${eventId}:${instance.date}`; one-time events keep `event:${eventId}` exactly. Views and [`calendarView.ts`](../src/core/calendarView.ts) consume `CalendarItem[]` unchanged. People-birthday dedupe stays keyed on the one-time `event.date`; recurring birthday-type events are not de-duplicated against people birthdays (birthdays remain a people-domain yearly concern).
  - **Deferred UI** (not in 22B): no recurrence editor in [`EventsPage`](../src/pages/EventsPage.tsx) (a read-only "Repeats: …" line via `formatRecurrenceSummary` is the only safe-display option); no per-instance skip/override UI, no `splitRecurrenceSeriesAtDate` edit flow / `seriesId` generation, no drag/drop.
  - **Future integration** (deferred): people birthdays may switch to `frequency: "yearly"`; fitness schedules can adopt rules later.

### Skill schedule series

- Skill series ([`skillSeries.ts`](../src/core/skillSeries.ts)): pure, dependency-free helpers for optional schedule bounds on [`Skill`](../src/core/model.ts) — tested in [`skillSeries.test.ts`](../src/core/skillSeries.test.ts). No React, UI, or calendar expansion in this phase; total functions that never throw and never mutate inputs. Dates are local `YYYY-MM-DD` keys compared lexicographically (no timezone/DST handling).
  - **Types**: `SkillRecurrenceMode` (`indefinite` \| `date_range` \| `single_day`); `SkillScheduleSeries` — single object shape `{ mode, startDate?, endDate?, singleDate? }` (easier to extend later with `seriesId`, exceptions, `archivedAt`, etc.). Optional `scheduleSeries?: SkillScheduleSeries` on `Skill`. Omitted = always active (legacy).
  - **Two layers**: `WeeklySchedule` still defines *which weekdays* have blocks; `scheduleSeries` defines *when* that template applies. Orthogonal to [`recurrence.ts`](../src/core/recurrence.ts) (life events use full RRULE-style rules; skills use weekday template + optional date window).
  - **Validation** (`isValidSkillScheduleSeries`, `normalizeSkillScheduleSeries`): `indefinite` — optional valid `startDate` (active from that date onward); `date_range` — required `startDate`/`endDate`, inclusive, `endDate >= startDate`; `single_day` — required `singleDate`. Unknown mode, invalid dates, wrong field combinations, and unknown keys → invalid.
  - **Fail-closed invalid behavior**: invalid `scheduleSeries` is **not** treated as indefinite. `normalizeSkillScheduleSeries` returns `undefined`; `isSkillActiveOnDate` returns `false` if invalid series is still in memory; `cleanupInvalidSkillScheduleSeries` strips invalid series on load/import (via [`sanitizeSkillReferences`](../src/core/sessions.ts)).
  - **Active-date helpers**: `isSkillActiveOnDate(skill, dateKey)`; `buildActiveSkillsForDate(skills, dateKey)` (preserves order); `getSkillSeriesDateRange(skill)` for future calendar range optimization (`unbounded` vs `bounded`).
  - **Persistence** (Phase 23): nullable `schedule_series jsonb` on `skills` (migration `20260528100000_skill_schedule_series.sql`; object-shape CHECK only). [`dbMappers.ts`](../src/core/dbMappers.ts) adds `parseSkillScheduleSeries` (allowlisted keys, cross-checks `normalizeSkillScheduleSeries`), wired through `assertValidSkill` / `skillToRow` / `skillFromRow` / `validatePayloadForUpload`. Remote sync unchanged (`select("*")`). Old skills without `scheduleSeries` round-trip as `NULL` / omitted field.
  - **Deferred integration**: [`calendar.ts`](../src/core/calendar.ts) `collectSkillItems` and [`timeline.ts`](../src/core/timeline.ts) `generateScheduleItems` still expand all skills by weekday; future phases call `buildActiveSkillsForDate` per date. Same for [`dashboardStats.ts`](../src/core/dashboardStats.ts), [`review.ts`](../src/core/review.ts), and [`focus.ts`](../src/core/focus.ts). No Skills page editor, recurrence UI, or notifications in this phase.

### Dashboard (`DashboardPage` + `components/dashboard`)

[`DashboardPage`](../src/pages/DashboardPage.tsx) receives `skills`, `sessions`, `events`, `people`, `jobApplications`, `careerTarget`, `workoutPlans`, `workoutSessions`, `focusFeedback`, focus feedback callbacks, and `onAddSession` from `App`, runs pure calculations in [`dashboardStats.ts`](../src/core/dashboardStats.ts), [`progression.ts`](../src/core/progression.ts), [`focus.ts`](../src/core/focus.ts), [`focusFeedback.ts`](../src/core/focusFeedback.ts), [`briefing.ts`](../src/core/briefing.ts), [`review.ts`](../src/core/review.ts), [`events.ts`](../src/core/events.ts), [`people.ts`](../src/core/people.ts), [`career.ts`](../src/core/career.ts), and [`fitness.ts`](../src/core/fitness.ts), then composes visual sections top to bottom:

1. **ProgressionHero** — account level, lifetime XP, global streak, level progress bar (hidden when no skills)
2. **TodayHero** — daily total, on-track / overdue / idle counts, aggregate progress bar
3. **DailyBriefingSection** — deterministic assistant-style greeting, day summary paragraphs (tone-aware styling), secondary suggestions, and risk flags (no CTAs)
4. **WeeklyReviewSection** — weekly greeting, summary, top wins/risks, and “View weekly review” navigation (tone-aware styling)
5. **DailyFocusSection** — top 5 ranked cross-domain focus items (after suppression filter) with urgency labels, contextual CTAs from `FocusActionType`, dismiss/snooze controls, hidden-count footer with **Review hidden** inline drawer (restore individual suppressed items), restore-all, skill quick-log, and deep-links to domain pages
6. **UpcomingEventsSection** — next 14 days of life events (up to 10 items)
7. **PeopleRemindersSection** — upcoming birthdays and contacts needing follow-up (hidden when empty)
8. **CareerActionsSection** — saved-to-apply count, needs-attention items, interview pipeline, recent applications, and “View career” navigation (hidden when empty)
9. **FitnessSummarySection** — sessions logged this week, last workout summary, recent session lines, and “View fitness” navigation (hidden when empty)
10. **CalendarPreviewSection** — next 7 days of calendar items (compact, grouped by day) with an “Open Calendar” button
11. **UnifiedTimelineSection** — today’s merged schedule blocks and timed/untimed events
12. **OverdueBehindSection** — skills behind schedule with quick log
13. **SkillProgressSection** — per-skill level, streak, lifetime XP bar, and today goal progress
14. **WeeklyPreviewSection** — weekly goal progress (hidden when no skill has `weeklyGoalMinutes`)

Shared widgets in the same folder: `ProgressBar`, `QuickLogControls`, `SkillProgressRow`, `TimelineRow`, `UnifiedTimelineRow`, `ProgressionHero`. Display formatting uses [`ui/format.ts`](../src/ui/format.ts) (`formatMinutes`, `formatLevel`, `formatXp`, `priorityEmoji`); layout tokens live in [`ui/appStyles.ts`](../src/ui/appStyles.ts).

### People domain

- **`Person`** records store name, optional birthday (`birthdayMonthDay`), preferences (likes/dislikes), gift ideas, notes, and relationship maintenance fields (`lastContactDate`, `contactCadenceDays`).
- **`LifeEvent.personId`** optionally links events to a person; legacy **`personName`** strings remain supported for older events and backup readability.
- Display uses `resolveEventPersonLabel` in [`people.ts`](../src/core/people.ts): linked person name wins, then `personName`.
- Future AI extension points (not implemented): `PersonContext` bundle for prompts, message drafting, gift suggestions, proactive nudges, CSV/vCard import — see header comment in `people.ts`.

### Career domain

- **`JobApplication`** records store company, role title, pipeline status, salary range (USD), location, remote policy, applied date, posting URL, notes, and required skills (`requiredSkillIds` linked to `Skill.id`, plus optional `requiredSkillsText` for untracked requirements).
- **`CareerTarget`** is an optional singleton dream-job target (role, company, notes, required skills) stored in `AppPayload.careerTarget` and synced to the `career_targets` table (one row per user).
- Skill-gap display uses pure helpers in [`career.ts`](../src/core/career.ts): linked skills resolve to tracker names; free-text requirements show as “not yet in tracker”; `buildSkillGapPriorityList` orders focus items for the Career page.
- Follow-up awareness uses `appliedDate` and `updatedAtIso` (no extra fields): `buildApplicationsNeedingAttention` flags saved bookmarks, stale applied roles (≥14 days), and stuck interview stages (≥21 days); quick status transitions call existing `onUpdateApplication`.
- Deleting a skill strips its id from application and target `requiredSkillIds` in the same `commit` (mirrors person unlink on events).
- Future AI extension points (not implemented): `CareerContext` bundle, job-posting parse, cover-letter draft, learning-plan nudges — see header comment in `career.ts`.

### Fitness domain

- **`WorkoutPlan`** records store a reusable template: name, optional focus (`push`, `pull`, `legs`, `full_body`, `cardio`, `mobility`), notes, and embedded **`ExerciseEntry[]`** (name, sets, reps, weight, notes).
- **`WorkoutSession`** records store a completed workout: date (`YYYY-MM-DD`), optional focus, optional `planId` link, optional `durationMinutes` (positive integer), optional `completedAtIso` (set automatically when logging a new session), notes, and embedded exercise entries (copied from a plan or entered manually).
- Exercises are embedded in plans/sessions as jsonb arrays (no separate exercise catalog table in v1).
- Pure helpers in [`fitness.ts`](../src/core/fitness.ts): focus labels, search/sort, week summary (including optional duration totals), plan→session copy (`createSessionDraftFromPlan`), recent exercise name collection for form autocomplete.
- Deleting a plan clears `planId` on linked sessions in the same `commit` (mirrors person unlink on events).
- Future phases (not implemented): calorie tracker, supplement tracker, plan scheduling, PR analytics — see Phase 13 plan deferred items.

## Data flow

```mermaid
sequenceDiagram
  participant User
  participant Page as Page_component
  participant App
  participant Local as localStorage
  participant DB as Supabase_Postgres

  User->>Page: action
  Page->>App: callback
  App->>App: commit if sync ready
  App->>Local: saveAppData
  App->>DB: debounced replaceRemotePayload
```

**Load path:** `AuthGate` → `App` → `initialSync(userId)` merges remote vs local → `saveAppData` → render pages.

**Backup:** Export/import JSON via `exportBackup` / `importBackup` in `storage.ts` (invoked from `AppShell` actions in `App`).

## Navigation

Internal tab state only (`useState<Page>` in `App`); no React Router yet. `AppShell` renders nav buttons (Dashboard, Calendar, Skills, Events, People, Career, Fitness, Review); `App` switches page children inside `<main>`.

To add a section later: extend `Page` in [`src/pages/types.ts`](../src/pages/types.ts), add a page component, wire nav in `AppShell`, and add mutations in `App` that use `commit`.

## Environment variables

Client-only (Vite `import.meta.env`):

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon key (RLS required) |
| `VITE_ENABLE_REMOTE_SYNC` | Optional; set to `"false"` to disable cloud writes |

Never commit real values. Use `.env.local` locally and Vercel project settings in production. Do not put service-role keys in client code.

## Bundle and modularization notes

The production build currently emits a single main JS chunk (~590 KB minified; Vite warns when chunks exceed 500 KB). **This warning is non-blocking** — the app builds and runs correctly today.

Likely future code-split points (not implemented yet):

- [`CareerPage`](../src/pages/CareerPage.tsx) — forms, cards, skill picker
- [`FitnessPage`](../src/pages/FitnessPage.tsx) — workout editor and session history
- [`PeoplePage`](../src/pages/PeoplePage.tsx) — contact cards and follow-up tooling
- [`EventsPage`](../src/pages/EventsPage.tsx) — life events CRUD
- Dashboard heavy derived widgets — focus/briefing engines are pure and cheap; page-level lazy loading of domain screens is the higher-yield split

No Vite config or `React.lazy` changes in the current phase; revisit when adding routes or new large dependencies.

## Deployment

- Build: `npm run build` → `dist/`
- Hosted on Vercel; configure the same `VITE_*` variables in the project
- [`vite.config.ts`](../vite.config.ts) `base` must match the deployed path if the app is not served from domain root

## Testing

- Unit tests live next to core modules (e.g. `dbMappers.test.ts`, `career.test.ts`, `fitness.test.ts`, `focus.test.ts`, `briefing.test.ts`, `review.test.ts`, `dashboardStats.test.ts`, `progression.test.ts`, `recurrence.test.ts`, `skillSeries.test.ts`)
- Run `npm test`, `npm run lint`, and `npm run build` before merging structural changes
