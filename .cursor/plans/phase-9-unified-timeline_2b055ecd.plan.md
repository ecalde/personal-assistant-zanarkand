---
name: phase-9-unified-timeline
overview: Introduce a new pure derivation module `src/core/timeline.ts` that merges skill schedule blocks and life events into a single chronological timeline with overlap detection plus daily workload/forecasting primitives, then integrate it into the Dashboard in an incremental, non-breaking way (no persistence/auth/router changes, no new deps, string-based date/time only).
todos:
  - id: read-call-sites
    content: Confirm how `App.tsx` passes `events` into pages and where dashboard gets events today; plan prop-shape change if needed.
    status: completed
  - id: define-types
    content: Define `UnifiedTimelineItem` union + conflict/workload types in `src/core/timeline.ts` (string-first, minute-derived).
    status: completed
  - id: merge-and-sort
    content: Implement `buildUnifiedTimelineRange` that expands schedule templates into dated items, merges with events, and sorts stably.
    status: completed
  - id: detect-overlaps
    content: Implement per-day overlap detection and conflict classification; exclude startTime-only events from minute overlaps.
    status: completed
  - id: daily-workload
    content: Implement daily workload aggregation producing planned/blocked/conflict/net metrics.
    status: completed
  - id: unit-tests
    content: Add `src/core/timeline.test.ts` mirroring existing vitest style; cover sorting, merging, overlaps, workload totals.
    status: completed
  - id: dashboard-ui
    content: Add presentational unified timeline components and wire them in `DashboardPage.tsx` (keep `App.tsx` orchestration-only).
    status: completed
  - id: incremental-rollout
    content: Keep old schedule-only timeline available during transition; remove/legacy it after unified timeline is validated.
    status: completed
isProject: false
---

## Context and constraints (confirmed)
- **Keep boundaries**: `src/core/*` contains pure derivations; pages compose; dashboard components are presentational; `src/App.tsx` stays orchestration-only.
- **No new deps**, no persistence/auth/router/notifications/AI.
- **Dates/times remain strings**:
  - Date keys: `YYYY-MM-DD` (lexicographic compare is valid)
  - Time keys: `HH:MM` (lexicographic compare is valid)
  - **Do not convert storage** to JS `Date` objects; derivations may accept `now: Date` for “today” selection only (consistent with `dashboardStats.ts`).
- Existing relevant code:
  - Event ordering within a day already treats **timed before untimed** in `src/core/events.ts`.
  - Schedule block minutes parsing exists in `parseHHMMToMinutes` in `src/core/schedule.ts`.
  - Dashboard today timeline is currently schedule-only via `buildTimelineItems` in `src/core/dashboardStats.ts`.

## Goals for Phase 9
- **Unified timeline**: merge skill schedule blocks + life events into one ordered list.
- **Overlap detection**: detect overlaps among timed items and compute overlap minutes.
- **Daily workload totals**: planned skill minutes, blocked minutes (events), conflict minutes, net free minutes.
- **Forecasting-ready**: provide primitives to build week views and future workload summaries.

## 1) Proposed types (for `src/core/timeline.ts`)
Add a new domain-derivation surface separate from `dashboardStats.ts`.

### Core primitives
- **`TimeRange`** (string-first, minute-computable):
  - `date: string` (`YYYY-MM-DD`)
  - `startTime?: string` (`HH:MM`, optional)
  - `endTime?: string` (`HH:MM`, optional)
  - `startMin?: number` (derived via `parseHHMMToMinutes`)
  - `endMin?: number` (derived)
  - Invariants:
    - If `endTime` is set, `startTime` must be set.
    - A range is **timed** iff both `startTime` and `endTime` exist.

### Unified timeline items
- **`UnifiedTimelineItemKind`** = `"scheduleBlock" | "lifeEvent"`

- **`UnifiedTimelineItemBase`**:
  - `kind: UnifiedTimelineItemKind`
  - `date: string`
  - `title: string` (display-friendly)
  - `startTime?: string`
  - `endTime?: string`
  - `startMin?: number`
  - `endMin?: number`
  - `durationMinutes?: number` (only when timed)
  - `sortKey`: derived (see sorting section)

- **`ScheduleBlockTimelineItem`** extends base:
  - `kind: "scheduleBlock"`
  - `skillId: string`
  - `skillName: string`
  - `skillPriority?: 1|2|3|4`
  - `blockId: string`
  - `plannedMinutes: number`

- **`LifeEventTimelineItem`** extends base:
  - `kind: "lifeEvent"`
  - `eventId: string`
  - `eventType: EventType`
  - `reminder: boolean`
  - `personName?: string`
  - **Duration policy (your choice)**: if `endTime` missing, treat as **non-forecastable** timed marker (see below).

### Overlap model
- **`TimelineConflict`**:
  - `date: string`
  - `aId: string` (stable id like `"scheduleBlock:<skillId>:<blockId>:<date>"` or `"lifeEvent:<eventId>"`)
  - `bId: string`
  - `overlapStartTime: string`
  - `overlapEndTime: string`
  - `overlapMinutes: number`
  - `severity: "info" | "warn"` (reserve for future)
  - `reason: "eventBlocksSchedule" | "scheduleOverlap" | "eventOverlap"`

- **`UnifiedTimelineDay`**:
  - `date: string`
  - `items: UnifiedTimelineItem[]` (sorted)
  - `conflicts: TimelineConflict[]`

### Workload aggregation
- **`DailyWorkloadTotals`**:
  - `date: string`
  - `plannedSkillMinutes: number` (sum of schedule blocks for that date)
  - `blockedMinutes: number` (sum of **forecastable** event durations)
  - `conflictMinutes: number` (sum of overlap minutes between schedule blocks and events; see conflict policy)
  - `netAvailableForSkillsMinutes: number` = `plannedSkillMinutes - conflictMinutes` (or alternative metric below)
  - `netFreeMinutes: number` = `1440 - blockedMinutes` (future: subtract sleep, etc.)

Notes:
- Because you selected **“Track both”**, we’ll compute:
  - **Visual overlap flags** via `conflicts[]`
  - **Forecasting metrics** via `blockedMinutes` and `conflictMinutes`

## 2) Unified sorting strategy
Use stable, string-safe sorting that matches existing event behavior:
1. **By `date` ascending** (`a.date.localeCompare(b.date)`).
2. Within a day:
   - **Timed items first** (requires `startTime` AND `endTime` for “timed range”; items with only `startTime` are treated as “time-anchored marker”, still timed-first but non-forecastable).
   - For timed items: sort by `startTime` asc; then by `endTime` asc.
   - Then by `kind` (optional: schedule blocks before events, or vice versa; keep stable).
   - Then by `title` asc.
   - Then by stable id asc.

This parallels `compareLifeEventsWithinDay` (timed before untimed, then `startTime`, then `title`, then `id`).

## 3) Merge algorithm (events + schedule blocks)
### Inputs
- `skills: Skill[]`
- `events: LifeEvent[]`
- `range: { startDate: string; endDate: string }` (inclusive, lexicographic)
- Optional `opts`:
  - `includeUntimedEvents: boolean` (default true)
  - `includeScheduleBlocks: boolean` (default true)

### Steps
1. **Generate schedule occurrences** for the date range:
   - For each date in range, determine `Weekday` using a local helper (can accept a `Date` for iteration, but do not store `Date`s in output).
   - For each skill’s `schedule[weekday]`, emit `ScheduleBlockTimelineItem` with:
     - `date` = dayKey
     - `startTime` = block.startTime
     - `endTime` = `addMinutesToHHMM(block.startTime, block.minutes)`
     - `durationMinutes` = block.minutes
2. **Map life events** in range:
   - Emit `LifeEventTimelineItem` for each event where `startDate <= event.date <= endDate`.
   - If both `startTime` and `endTime` exist: mark as forecastable with `durationMinutes`.
   - If only `startTime` exists (your selection “invalid without end”):
     - Keep it as a **time-anchored marker** (`startTime` set; `endTime` undefined; `durationMinutes` undefined)
     - Exclude from `blockedMinutes` and overlap-minute computations.
   - If neither time exists: untimed.
3. **Concatenate and sort** using the unified comparator.
4. **Build per-day groupings**: `UnifiedTimelineDay[]` keyed by date.

Design choice: keep the merge fully pure and deterministic; do not read “today” inside core—callers provide range.

## 4) Overlap/conflict detection
### Timed eligibility
- Only items with **both `startTime` and `endTime`** participate in minute-overlap math.
- Items with only `startTime` are displayed but do not generate overlap minutes.

### Algorithm
Per day:
- Gather timed items and convert to minute intervals (`[startMin, endMin)`).
- Sort by `startMin` ascending.
- Sweep line:
  - Maintain an “active” list of intervals that haven’t ended.
  - For each interval, compare against currently active ones to compute overlap:
    - overlapStart = max(a.startMin, b.startMin)
    - overlapEnd = min(a.endMin, b.endMin)
    - if overlapEnd > overlapStart → conflict
- Classify conflicts:
  - schedule vs event → `reason="eventBlocksSchedule"` (for `conflictMinutes`)
  - schedule vs schedule → `reason="scheduleOverlap"`
  - event vs event → `reason="eventOverlap"`

### Output
- Return `conflicts[]` (pairwise overlaps) and also a per-item derived flag:
  - `hasConflict: boolean`
  - `conflictWithKinds: Set<kind>` (or small boolean fields)

## 5) Daily workload aggregation
Provide a pure function:
- `computeDailyWorkload(days: UnifiedTimelineDay[]): DailyWorkloadTotals[]`

Rules:
- `plannedSkillMinutes`: sum schedule block `plannedMinutes` (range-based occurrences).
- `blockedMinutes`: sum forecastable life event durations (timed with endTime).
- `conflictMinutes`:
  - Sum overlap minutes **only for schedule-vs-event** conflicts (since you want both a visual flag + a metric).
  - (Optional future) also compute `scheduleOverlapMinutes` separately for schedule-vs-schedule.

Clarify metric semantics (documented in module docs, not storage):
- `netAvailableForSkillsMinutes = plannedSkillMinutes - conflictMinutes` indicates how much scheduled skill work is realistically feasible if events are immovable.

## 6) Future weekly forecasting support (no UI commitment yet)
Add small, composable primitives in `timeline.ts` that forecasting can reuse:
- `buildUnifiedTimelineRange(skills, events, startDate, endDate): UnifiedTimelineDay[]`
- `computeDailyWorkload(...)`
- `summarizeWeek(workloads): { totalPlanned; totalBlocked; totalConflict; totalNetAvailable }`

Future extension points (explicitly non-AI for now):
- **Rescheduling suggestions**: produce “gaps” between blocked event intervals.
- **Feasibility score**: compare planned vs net available.
- **Moveable vs fixed events**: later add an event field (not now) to decide what can be shifted.

## 7) UI architecture (presentational-only)
Introduce a new dashboard section component without moving domain logic into components.

### Components
- Keep existing `src/components/dashboard/TimelineSection.tsx` initially.
- Add (later in Phase 9) a new section:
  - `src/components/dashboard/UnifiedTimelineSection.tsx`
  - `src/components/dashboard/UnifiedTimelineRow.tsx`

Props:
- `days: UnifiedTimelineDay[]` (or just `items` for today)
- `workload: DailyWorkloadTotals` (for the day)
- `onAddSession(skillId, minutes)` retained for schedule items.

Rendering rules (minimal viable):
- Render one merged list for “Today”: schedule blocks and events interleaved.
- Untimed events appear after timed items (consistent with current event ordering).
- Conflicted items show a small pill like “Conflict” (purely derived).

No new routing; Events management remains on `EventsPage`.

## 8) Dashboard integration (orchestration preserved)
Update only `DashboardPage.tsx` (page-level derivation and composition):
- Replace `buildTimelineItems(skills, sessions)` with a new call to `core/timeline.ts` for today’s date range (`today..today`).
- Continue passing `onAddSession` down; only schedule rows render log buttons.

Keep `App.tsx` unchanged (still passes `skills`, `sessions`, `events`, callbacks).

## 9) Validation/testing strategy
Follow existing `vitest` unit-test style (`src/core/events.test.ts`, `dashboardStats.test.ts`).

Add `src/core/timeline.test.ts` covering:
- Sorting:
  - date ordering
  - timed-before-untimed
  - tie-breakers stable
- Merge correctness:
  - schedule block occurrence endTime computed via `addMinutesToHHMM`
  - events included/excluded by range
- Overlaps:
  - schedule vs event overlap minutes computed correctly
  - schedule vs schedule conflicts detected
  - event with `startTime` only produces no overlap minutes (per your selection)
- Workload totals:
  - plannedSkillMinutes sums blocks
  - blockedMinutes sums only forecastable events
  - conflictMinutes sums schedule-vs-event overlaps only

Also add lightweight invariants tests:
- `endTime` before `startTime` should never exist for schedule blocks; for life events it’s already validated in `EventsPage` UI.

## 10) Incremental implementation order (low risk)
### Phase 9.1: Pure core module
- Create `src/core/timeline.ts` with:
  - type definitions
  - `buildUnifiedTimelineRange`
  - overlap detection
  - workload aggregation
- Add `src/core/timeline.test.ts`.

### Phase 9.2: Dashboard-only integration (today)
- Add a new derived selector in `DashboardPage.tsx`:
  - get `today` as `YYYY-MM-DD` (reuse existing `todayIsoDate` approach; keep it local to page)
  - call `buildUnifiedTimelineRange(..., today, today)`
- Add `UnifiedTimelineSection` and `UnifiedTimelineRow` components.
- Keep existing `TimelineSection` temporarily behind a feature toggle constant inside `DashboardPage` to reduce churn (no router changes).

### Phase 9.3: Replace old schedule-only timeline
- Remove or deprecate `buildTimelineItems` usage in dashboard.
- Keep `buildTimelineItems` in `dashboardStats.ts` if still useful elsewhere (or mark as legacy, but no breaking changes required).

### Phase 9.4: Week preview hook (no new UI required)
- Use `buildUnifiedTimelineRange` + `computeDailyWorkload` to power a future “Week load” widget; for now only expose functions.

## File structure changes (planned)
- New: `src/core/timeline.ts`
- New: `src/core/timeline.test.ts`
- New (UI): `src/components/dashboard/UnifiedTimelineSection.tsx`
- New (UI): `src/components/dashboard/UnifiedTimelineRow.tsx`
- Update: `src/pages/DashboardPage.tsx`
- (Optional) Update: `src/components/dashboard/TimelineSection.tsx` / `TimelineRow.tsx` only if you decide to fully replace rather than add new components.

## Migration impact analysis
- **No persistence/schema changes**: uses existing `Skill.schedule` and `LifeEvent` fields.
- **No auth/router changes**.
- **Dashboard impact**: timeline section will now require `events` as input; currently `DashboardPage` only reads `skills` + `sessions` for timeline.
  - This means `App.tsx` already has events in payload; `DashboardPage` will need to receive and use them (if it isn’t already). This is a prop-shape change at the page boundary only.
- **Existing tests** unaffected; new tests added for `timeline.ts`.

## Future AI extension points (explicitly not implemented)
Keep extension seams in `timeline.ts` as pure function outputs, so an AI layer can consume them later without touching persistence:
- `computeGapsForDay(day): { startTime; endTime; minutes }[]`
- `rankRescheduleTargets(items, workload): RankedSuggestion[]` (placeholder type)
- `explainConflicts(conflicts): string[]` (pure string summaries)

These remain stubs or out-of-scope until “AI integrations” are allowed.

## Testing checklist (when implementing)
- `npm test`
- `npm run lint`
- `npm run build`
- Manual: create events with
  - untimed
  - startTime only
  - start+end times overlapping a schedule block
  - event-event overlaps
  - verify dashboard shows merged ordering and conflict pills
