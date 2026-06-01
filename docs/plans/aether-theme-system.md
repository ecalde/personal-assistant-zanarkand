# Aether Theme System — Plan & Roadmap

This document is the **canonical plan** for the Aether Theme System: a token-based, fantasy-futuristic visual layer for Personal Assistant. It complements the high-level [roadmap](./roadmap.md) and the implementation detail in [architecture.md](../architecture.md).

**Related code**

| Module | Role |
|--------|------|
| [`src/core/theme.ts`](../../src/core/theme.ts) | Pure tokens, profiles, normalization, `resolveThemeTokens`, `themeTokensToCssVars` |
| [`src/core/theme.test.ts`](../../src/core/theme.test.ts) | Unit tests for normalization and token resolution |
| [`src/core/appearanceStorage.ts`](../../src/core/appearanceStorage.ts) | `localStorage` persistence (`pa.appearance.v1`) |
| [`src/ui/useAppearanceTheme.ts`](../../src/ui/useAppearanceTheme.ts) | React hook — loads prefs, applies `--aether-*` on `:root` |
| [`src/pages/SettingsPage.tsx`](../../src/pages/SettingsPage.tsx) | Settings UI (Appearance section) |
| [`src/components/settings/`](../../src/components/settings/) | Settings-only themed components |
| [`src/ui/appStyles.ts`](../../src/ui/appStyles.ts) | **Legacy** shared styles — still hardcoded light theme (adoption target) |

---

## Vision

Personal Assistant uses an **Aether-punk / holographic fantasy** art direction: deep navy base, cyan/teal/blue accents, thin glowing borders, soft glassmorphism, and premium MMO/JRPG menu sensibility with modern SaaS usability.

The theme system is **token-first**: components consume CSS custom properties (`--aether-*`) derived from a small set of user preferences (Aether Profile, accent intensity, interface effects). Hardcoded hex values in shared UI are phased out incrementally — not in one big-bang redesign.

---

## Current state (Phase 37A — shipped)

| Capability | Status |
|------------|--------|
| Settings page + category sidebar | ✅ Shipped |
| Six Aether Profiles (Azure default, Emerald, Violet, Crimson, Amber, Obsidian) | ✅ Shipped |
| Accent intensity (Soft / Balanced / Vibrant) | ✅ Shipped |
| Interface effect toggles (particles, borders, trails, runes) | ✅ Shipped |
| Live theme preview in Settings | ✅ Shipped |
| Pure `theme.ts` token module + tests | ✅ Shipped |
| Global `--aether-*` CSS variables on `:root` | ✅ Shipped |
| `localStorage` persistence (`pa.appearance.v1`) | ✅ Shipped |
| Rest of app consumes theme tokens | ✅ Shipped (Phase 37B) — shared chrome/widgets/domain pages read accent tokens via `appStyles.ts` |

**Important:** Selecting an Aether Profile now retints the **shared chrome app-wide** (nav active state, buttons, progress/XP bars, panel & section borders, level badges, calendar today highlights) across the Dashboard, Calendar, and domain pages, in addition to the Settings page + live preview. The deep-navy base background and primary text are intentionally **shared across all profiles**, so the app keeps its legible light base — profiles swap accents, not the whole palette (full dark-mode reskin is out of scope for the adoption layer).

---

## CSS variable contract

Variables are set on `document.documentElement` by `useAppearanceTheme`. New UI **must** prefer these over literals:

| Variable | Purpose |
|----------|---------|
| `--aether-accent` | Primary accent (buttons, highlights, selected state) |
| `--aether-accent-secondary` | Secondary accent (gradients) |
| `--aether-accent-soft` | Translucent accent fills / halos |
| `--aether-bg` | App background gradient |
| `--aether-panel-bg` | Glass panel fill |
| `--aether-panel-border` | Panel border color |
| `--aether-panel-glow` | Panel box-shadow glow |
| `--aether-glow` | Generic accent glow |
| `--aether-button-glow` | Button glow |
| `--aether-progress-gradient` | Progress / XP bar fill |
| `--aether-text` | Primary text |
| `--aether-text-muted` | Secondary text |

`data-aether-profile` and `data-aether-intensity` attributes on `:root` are available for selectors or debugging.

**Calendar note:** Category/event colors remain governed by [`calendarColors.ts`](../../src/core/calendarColors.ts) and `calendarPreferences`. Phase 37B may tint calendar chrome (borders, today highlight, toolbar) with Aether tokens where appropriate; it must **not** replace the user-configurable calendar palette unless explicitly designed.

---

## Development rule (mandatory after Phase 37A)

> **Any new UI component introduced after the Aether Theme System must consume theme tokens (`var(--aether-*)` or values from `resolveThemeTokens`) instead of introducing new hardcoded colors, unless there is a documented exception.**

Exceptions require:

1. A one-line comment in code explaining why (e.g. semantic error red, WCAG contrast fix).
2. An entry in this document under **Documented exceptions** (when the exception is recurring or non-obvious).

### Documented exceptions (initial)

| Case | Reason |
|------|--------|
| Calendar item swatches from `CALENDAR_PALETTE` | User-controlled category colors; separate preference system |
| Error / danger surfaces (`errorBox`, `errorInline`, `statusOverdue` red) | Semantic status colors — kept readable/conventional, not accent-tinted |
| On-track green (`statusOnTrack`), timeline type accents | Semantic success / item-type indicators — preserved for meaning |
| Level-up gold toast + streak pill (`LevelUpToast`, `streakPill`) | Celebratory reward palette (gold/fire) — intentional, profile-independent |
| Calendar current-time line (`calendarNowLine` red) | Conventional "now" marker — preserved |
| Native header action buttons (Save / Export / Import) | No `appStyles` entry (browser-default); styling them would be a new design, not adoption |
| Auth screen (pre-app shell) | Out of scope until theme adoption reaches auth |

---

## Phase track

### Phase 37A — Settings Page Foundation ✅ Shipped

**Goal:** Establish the theme token system, Settings UI, and local persistence.

**Delivered:** Settings tab, Aether Profiles, intensity/effects, live preview, `theme.ts`, `useAppearanceTheme`, `localStorage` — see [architecture.md](../architecture.md#settings-page--aether-profiles-theme-foundation).

---

### Phase 37B — Theme Adoption Layer · ✅ Shipped

**Goal:** Migrate the application from hardcoded colors to Aether theme tokens.

**Delivered (centralized in [`appStyles.ts`](../../src/ui/appStyles.ts) — the shared style registry consumed by every page/component):**

1. **Shared chrome** — active nav state (`navBtnActive`: accent border + soft fill), buttons (`smallBtn`, `dashboardQuickActionBtn`, calendar view toggle)
2. **Shared widgets** — `ProgressBar` (`progressFill` → accent, `progressFillXp` → progress gradient), `statusPill` base border, `levelBadge` accent-soft fill
3. **Dashboard** — section/card borders (`dashboardSection`, `statCard`, `dashboardCalendarCard`, `timelineRow`, `listRow`, `dayRow`), plus inline section dividers in `DailyFocusSection`, `UnifiedTimelineSection`, `WeeklyReviewSection`, `DailyBriefingSection`. `TodayHero` + `ProgressionPanel` inherit these tokens.
4. **Calendar chrome** — today highlights (`calendarDayCellToday`, `calendarDayNumberToday`, `calendarWeekColHeaderToday`, `calendarWeekDayColumnToday`), view toggle active state, sidebar/category/settings panel borders, palette selection ring (**not** the user palette swatch colors)
5. **Domain pages** — Skills/Events/People/Career/Fitness/Review inherit themed `input`/`select`/`listRow`/`statusPill`/card borders; Events weekday pills + Skills schedule rows tinted with accent tokens

**Key decision:** the deep-navy base background and primary text are **shared across all six profiles** (`BASE` in `theme.ts`), so they were left as the legible light base; only the **accent-derived tokens** (`--aether-accent`, `--aether-accent-soft`, `--aether-panel-border`, `--aether-progress-gradient`) were adopted. This guarantees a profile switch visibly recolors chrome **without** producing dark-on-dark contrast issues, and avoids any layout/redesign.

**Requirements honored:**

- Replaced hardcoded visual styling only — **no layout or UX redesigns**
- `var(--aether-*, <literal>)` everywhere, with the original literal kept as fallback for pre-hydration / unset CSS vars
- Backward compatible (app usable if CSS vars fail)
- No schema or dependency changes

**Tested:** [`theme.test.ts`](../../src/core/theme.test.ts) adds a "Phase 37B adoption token contract" block — each profile yields distinct accent / progress-gradient / panel-border / accent-soft CSS variables, the shared base background stays stable, and panel-border / accent-soft are derived from the active accent.

**Deliverable met:** Selecting an Aether Profile visibly changes the appearance of the application chrome (Dashboard, nav, buttons, progress bars, borders, calendar today highlights).

**Out of scope (unchanged):** `calendarPreferences` palette; Settings page (already themed); semantic status colors (see exceptions below).

---

### Phase 37C — Appearance Cloud Sync · Planned

**Goal:** Synchronize appearance preferences across devices.

**Scope:**

- Add `appearance_preferences` Supabase singleton (mirror `calendar_preferences` / `gamification_state` pattern)
- Persist: `profileId`, `accentIntensity`, `effects`
- Wire `dbMappers` parse/validate through existing `normalizeAppearancePreferences`
- `initialSync` / debounced remote write from `App.tsx` or dedicated hook
- **Local fallback:** keep `pa.appearance.v1` as cache; on first sync merge remote wins or last-write-wins policy (document in plan before implementation)
- **Backward compatibility:** users with only localStorage prefs continue to work; first sign-in on new device uploads local prefs if remote empty

**Deliverable:** User theme preferences follow the account across devices.

**Out of scope:** Syncing calendar color preferences (already synced separately).

---

## Relationship to product phases

The Aether track (37A–37C) is **orthogonal** to feature phases below. New feature UI should be theme-aware from day one (see development rule).

| Phase | Name | Theme touchpoint |
|-------|------|------------------|
| 38 | Notifications & Reminders | Notifications Settings category becomes functional |
| 39 | Analytics & Trends | Charts/tables use tokens |
| 40 | AI Insight Layer | Insight cards use tokens |
| 41 | Agentic Planning Layer | Proposal UI uses tokens |

---

## Deferred calendar work (unchanged)

These remain separate from the Aether track:

- **36.1** — Recurring-occurrence drag + scope picker
- **36.2** — Skill/workout schedule drag

---

## Testing expectations

| Phase | Tests |
|-------|-------|
| 37A | ✅ `theme.test.ts` — normalization, token resolution |
| 37B | ✅ `theme.test.ts` "adoption token contract" — distinct per-profile accent / progress-gradient / panel-border / accent-soft CSS vars + stable shared base; no behavior change to pure core (visual recolor verified manually) |
| 37C | `dbMappers` parse tests for appearance JSON; sync integration tests |

Always run `npm test`, `npm run lint`, `npm run build` before merge.

---

*Last updated: 2026-05-31 — Phase 37A + 37B shipped (theme adoption layer live via `appStyles.ts` accent tokens); 37C (cloud sync) planned.*
