---
name: Career School Merge
overview: Keep the Career nav tab, add a Fitness-style Career | School switcher, and build School as a first-class domain (courses, reminders, ingest, grades) with its own calendar category — while removing School from life-event types.
todos:
  - id: phase-54-model
    content: "Phase 54: School types, school.ts + timezone/link helpers + tests, 3 RLS tables, mappers/sync, drop EventType school (migrate rows to other)"
    status: completed
  - id: phase-55-ui
    content: "Phase 55: Career | School switcher, course/reminder/grade manual CRUD, policy glance, CareerFocus deep-link"
    status: completed
  - id: phase-56-calendar
    content: "Phase 56: school CalendarCategoryKey, collector, kind colors/filters, timezone + short links in detail modal"
    status: completed
  - id: phase-57-ingest
    content: "Phase 57: Deterministic paste parser (weights, Canvas lists, messy prose), suggestion review + dedupe warnings"
    status: completed
  - id: phase-58-grades
    content: "Phase 58: Weighted what-if calculator (need-for-A, max/min letter, per-item safe scores) + grades panel"
    status: completed
  - id: phase-59-focus
    content: "Phase 59: Daily Focus/briefing for upcoming school dues; architecture + roadmap updates"
    status: completed
isProject: false
---

# Career + School merge

Keep the AppShell tab as **Career** (page id stays `"career"`). Add an inner **Career | School** switcher copied from [`FitnessSectionSwitcher`](src/components/fitness/FitnessSectionSwitcher.tsx). Do not add a second nav item. Job-application UX stays as-is.

School is a **new domain** under that page (sibling arrays on `AppPayload`, like supplements vs workouts), **not** a new `EventType`. Remove `"school"` from Events. School calendar items get their **own** `CalendarCategoryKey: "school"` so homework filters independently from interviews (Career stays violet interview stages).

No AI, no new npm libraries, no Canvas API. Paste-text ingest is deterministic table/regex parsing with a review step. Follow roadmap §6: pure helpers + tests first, `App.tsx` orchestration-only, Aether tokens, backward-compatible payload.

```mermaid
flowchart TD
  nav[AppShell Career]
  page[CareerPage]
  switcher[Career | School]
  jobs[Existing applications UI]
  school[SchoolSection]
  course[SchoolCourse]
  ingest[Paste ingest suggestions]
  rem[SchoolReminder]
  grades[Grade categories and items]
  cal[Calendar category school]
  nav --> page --> switcher
  switcher --> jobs
  switcher --> school --> course
  course --> ingest
  ingest -->|"approve"| rem
  ingest -->|"approve"| grades
  rem --> cal
  course --> rem
  course --> grades
```

## Locked decisions

- **Nav:** label Career; inner tabs Career | School; optional `CareerFocus` deep-link (`kind: "career" | "school"`, optional `courseId`) mirroring `FitnessFocus`.
- **Existing `events.type = 'school'`:** migrate to `'other'` (title unchanged). Legacy aliases `deadline` and `school` → `other`. Users recreate real deadlines inside a course.
- **Calendar:** new category `school` with subcategory colors by reminder kind. Remove School from Events type `<select>` and from `CALENDAR_EVENT_TYPE_FILTERS`.
- **Time:** each course has IANA `timezone` defaulting to `America/New_York` (Georgia Tech ET). Reminders store **source** date/time in that zone; the calendar collector converts to the browser’s local date/time. UI shows both: `Due 7:59 AM ET · 6:59 AM local`.
- **Timed vs all-day:** reminders may have no time (all-day) or user-set `startTime`/`endTime`. Quizzes/assignments may also have `open` and `close`; the collector can emit two items from one reminder (opens vs due).
- **Links:** `{ url, label }[]` on each reminder. Auto-label from hostname + last path segment; user can override. Calendar **title stays the reminder name** (never the raw URL). Tappable short labels live in the detail modal; week/3-day blocks may show one compact label as secondary text.
- **Ingest:** per-course textarea only (paste, optional `.txt` file as text). No PDF/OCR. Parser **never writes** until the user approves each suggestion. Duplicates still appear, flagged “this may already exist — create anyway?”
- **Out of scope this track:** job-pipeline changes, XP, notifications, Canvas sync, AI, PDF, a new AppShell tab.

## Domain model

Add to [`src/core/model.ts`](src/core/model.ts) + `AppPayload`:

```ts
SchoolReminderKind = "assignment" | "quiz" | "exam" | "project" | "study" | "reading" | "other"

SchoolCourse {
  id, name, code?, term?, timezone, notes?
  staff: { id, role: professor|ta|other, name, email?, notes? }[]
  officeHours: { id, who?, whenText, locationOrLink? }[]
  latePolicy?: { summary, lateDaysAllowed?, deductionPercentPerDay?, notes? }
  extraCreditNotes?, scoringNotes?   // attempts, discussions, etc.
  gradeCategories: { id, name, weightPercent, extraCredit? }[]
  createdAtIso, updatedAtIso
}

SchoolReminder {
  id, courseId, kind, title
  date, startTime?, endTime?          // due / study block (source TZ)
  openDate?, openTime?, closeDate?, closeTime?
  notes?, links: { url, label }[]
  fingerprint?                        // stable dedupe key
  createdAtIso, updatedAtIso
}

SchoolGradedItem {
  id, courseId, categoryId?, reminderId?
  name, dueDate?, dueTime?, maxScore?, score?, extraCredit?
}
```

Persistence: three user-owned tables (`school_courses`, `school_reminders`, `school_graded_items`) with RLS, `updated_at` triggers, CHECK enums — same pattern as [`supabase/migrations/20260818120000_cooking_recipes.sql`](supabase/migrations/20260818120000_cooking_recipes.sql). Nested staff/office hours/categories/links as `jsonb` arrays validated in [`src/core/dbMappers.ts`](src/core/dbMappers.ts). Wire fetch/upsert/orphan-delete in [`src/core/remoteStorage.ts`](src/core/remoteStorage.ts).

Default GT letter scale lives in helpers (not per-course unless later needed): A 90–100, B 80–89, C 70–79, D 60–69, F &lt; 60.

## Phase 54 — Model, persistence, remove Event School

Pure [`src/core/school.ts`](src/core/school.ts) (CRUD-shaped helpers, fingerprints, timezone conversion, link labels) + tests. Migration: new tables **and** `UPDATE events SET type = 'other' WHERE type = 'school'` then drop `school` from `events_type_chk`. Update [`EventType`](src/core/model.ts), [`LEGACY_EVENT_TYPE_ALIASES`](src/core/dbMappers.ts), [`migrateLegacyEventTypes`](src/core/events.ts), Events UI, calendar event filters, [`calendarColors.ts`](src/core/calendarColors.ts) `event:school` leftovers, and the `event.type === "school"` special case in [`focus.ts`](src/core/focus.ts) / [`progressionContext.ts`](src/core/progressionContext.ts) (temporarily treat as gone; school focus returns in Phase 59).

No Career UI yet.

## Phase 55 — Career | School UI (manual CRUD)

Clone Fitness header switcher into `CareerSectionSwitcher`. [`CareerPage`](src/pages/CareerPage.tsx) hosts it; extract current job UI as the Career section body. New `src/components/school/`:

- Course list / create-edit form
- Course “block”: policy glance (staff, emails, late days, office hours, extra credit) even if empty
- Reminder form: kind, title, open/close, optional time block, notes, links (auto + manual label)
- Manual grade category + graded-item rows (so grades work before ingest)
- Late/local time caption next to each deadline

[`App.tsx`](src/App.tsx) CRUD + `careerFocus` to open School (and a course).

## Phase 56 — Calendar

New `school` in `CalendarCategoryKey` / `CalendarSourceType`. Collector `collectSchoolReminderItems` in [`src/core/calendar.ts`](src/core/calendar.ts): one item per due (and open, if set); study blocks timed when the user set times. `sourceMeta.kind: "schoolReminder"`. Sidebar kind filters like Fitness workout/supplement. Distinct default subcategory colors (assignment / quiz / exam / project / study / reading). Detail modal: timezone line, tappable link labels, **Open in Career** → School course. Do not put URLs in pill titles.

## Phase 57 — Deterministic ingest (no AI)

[`src/core/schoolParse.ts`](src/core/schoolParse.ts) auto-detects paste kind, returns suggestions only:

1. **Weight table** — Canvas `Group / Weight` rows (`Quizzes 12%`) → grade categories
2. **Assignment table** — Canvas Name / Due / Score (`Sep 7 by 7:59am`, `/ 45`) → graded items + reminder suggestions (kind from group name: Unit Quiz → quiz, Report → assignment, Final Exam → exam, Extra Credit → extraCredit flag)
3. **Prose** (syllabus + announcements) — regex for emails, URLs, dates/times, ET/timezone, late-policy percents/days, office hours, Professor/TA lines, extra credit, attempts. Section-level due dates: if one date sits at the end of a chunk that named several items, attach that date to every still-undated item in the chunk (covers “assignment 1 … assignment 2 … all due Nov 1”).

Dedupe: same `courseId` + fingerprint (`kind + normalized title + due date`) or high title-token overlap on the same date → `existingReminderId` + warning, still approvable.

UI: per-course paste box → review list (edit title/kind/date/links) → Approve selected / Skip. Tests must include the two Canvas tables from this request plus a messy shared-due-date announcement.

## Phase 58 — What-if grades

[`src/core/schoolGrades.ts`](src/core/schoolGrades.ts):

- Points-weighted inside a category when `maxScore` exists; else equal split of category weight
- 0% / ungraded / extra-credit-0% do not consume required weight; extra credit can raise the total above the required 100%
- After each score entry: current weighted %, projected **max** (100% on remaining) and **min** (0% remaining) + letter grades
- “Need **X% average** on remaining work for an A (90%)”
- Per remaining item: that same average (equal-remaining) **and** a floor if every other remaining item is 100%

Course grades panel shows categories, scores, and this range so remaining work is visible at a glance.

## Phase 59 — Daily Focus (light)

Rehome the old “school due within 3 days” focus onto `SchoolReminder` dues (`open_career` with `CareerFocus` school). Briefing/review one-liners only. No XP.

## Naming (settled)

| Surface | Name |
|---------|------|
| AppShell | Career |
| Inner tabs | Career \| School |
| Calendar category | School |
| Calendar subtypes | Assignment, Quiz, Exam, Project, Study, Reading |

## Validation per phase

Vitest for school helpers, parse fixtures, grade math, timezone conversion, calendar collector, event-type migration. `npm run typecheck` + targeted tests. After UI phases, verify in the browser: switcher, course CRUD, reminder on calendar (all-day + timed), link tap, ingest approve/deny/dedupe, grade what-if. Update [`docs/architecture.md`](docs/architecture.md) and [`docs/plans/roadmap.md`](docs/plans/roadmap.md) when a phase ships.
