# Aether Theme System — Modes & Global Effects Plan

This document is the **detailed phase plan** for completing the Aether Theme System into a true theming system **before** appearance cloud sync. It extends the canonical [Aether Theme System plan](./aether-theme-system.md) and the high-level [roadmap](./roadmap.md), and the implementation reference in [architecture.md](../architecture.md).

> **Status:** Phases **37C** and **37C.1** are shipped; **37D (Global Visual Effects)** and **37E (Appearance Cloud Sync)** remain planned. **Do not implement** the remaining phases until each is explicitly started.

---

## 1. Why this plan exists

Phase 37B made the app **accent-aware**: selecting an Aether Profile (Azure / Emerald / Violet / Crimson / Amber / Obsidian) retints chrome app-wide via `var(--aether-*)` accent tokens in [`appStyles.ts`](../../src/ui/appStyles.ts). But the application **still behaves like a light theme**: the Settings page is the only surface that shows the intended deep-navy fantasy-futuristic aesthetic, while Dashboard, Calendar, Skills, Events, People, Career, Fitness, and Review keep a predominantly white base.

Two capabilities are missing before cloud sync makes appearance permanent:

1. **Theme Modes** — a true Light / Dark / System axis. The current Settings dark aesthetic becomes the reference **Dark Mode**; Aether Profiles keep controlling **accent** independently of mode (`Azure + Light`, `Azure + Dark`, `Emerald + Light`, …).
2. **Global Visual Effects** — the four interface effects (Ambient Particles, Animated Borders, Magical Energy Trails, Floating Runes) currently live **inside `SettingsPage.tsx`** (inline keyframes + hardcoded particle/rune arrays) and only render on the Settings page. They must become a **single centralized engine** mounted once, configurable globally, performance-aware, mobile-graceful, and reduced-motion ready.

Cloud sync is intentionally **last** so the `AppearancePreferences` shape (which gains `themeMode` and effect/performance fields) is **finalized before** it is committed to a Supabase table and a strict DB parser.

---

## 2. Recommended phase order & naming

The user proposed bundling modes + effects into one phase. They are large and independently testable, so this plan **splits them** and recommends this order:

| Phase | Name | Rationale for position |
|-------|------|------------------------|
| **37C** ✅ | **Theme Modes (Light / Dark / System)** — *shipped* | Establishes the base-palette axis and the surface-token migration in `appStyles.ts`. Everything visual depends on a stable mode model. |
| **37C.1** ✅ | **Settings Theme Mode Participation** — *shipped* | Settings page follows the same mode-aware tokens; completes the 37C user-facing deliverable. |
| **37D** | **Global Visual Effects** | Centralizes effects on top of the now-complete token system; effects read mode + accent tokens, so modes must exist first. |
| **37E** | **Appearance Cloud Sync** | Persists the **final** `AppearancePreferences` shape (profile + intensity + **mode** + **effects** + **performance**) to Supabase. Doing it last avoids a second migration when the shape grows. |

> This **renumbers** the previously-planned "Phase 37C — Appearance Cloud Sync" to **Phase 37E**. The roadmap and architecture docs are updated to match. Names are chosen to read cleanly in the existing `37x` Aether track; alternatives ("Phase 37C — Theme Modes", "Phase 37D — Effects Engine") are equivalent.

**Why order matters (sequencing constraints):**

- Effects (37D) reference mode-dependent surface/text tokens introduced in 37C; building effects first would hardcode light assumptions.
- Cloud sync (37E) serializes the full preference object. Stabilizing `themeMode` + effect/performance fields first means **one** table schema and **one** `dbMappers` parser, with `normalizeAppearancePreferences` guaranteeing backward compatibility for older payloads.

---

## 3. Shared design principles (all three phases)

Aligned with [roadmap §6 rules](./roadmap.md#6-rules-for-future-phases):

1. **Pure helpers first** — extend [`theme.ts`](../../src/core/theme.ts) and add `themeEffects.ts` (pure, dependency-free, total, no React) with tests **before** any UI.
2. **Tests before UI** — token/mode/effect resolution covered in `theme.test.ts` / `themeEffects.test.ts` before components consume them.
3. **`App.tsx` orchestration only** — App mounts the centralized effects layer and calls `useAppearanceTheme` once; **no** effect math or palette logic in `App.tsx`.
4. **No unnecessary dependencies** — CSS custom properties + CSS animations + small React only. No animation/particle libraries.
5. **Backward compatible** — new preference fields are **optional** with safe defaults via `normalizeAppearancePreferences`; older `pa.appearance.v1` blobs and (later) DB rows load unchanged.
6. **Strong typing** — discriminated unions for `ThemeMode` and effect config; no `any`.
7. **Reuse the existing token system** — keep `--aether-*` CSS variables as the single contract; extend it, do not fork it. The `BASE` constant in `theme.ts` becomes mode-aware rather than being replaced.

**Preserved exceptions (unchanged across all phases):** the user-controlled calendar palette ([`calendarColors.ts`](../../src/core/calendarColors.ts) + `calendarPreferences`) and semantic status colors (error/overdue red, on-track green, level-up/streak gold, calendar current-time line) are **not** retinted by mode or accent. See [documented exceptions](./aether-theme-system.md#documented-exceptions-initial).

---

## 4. Phase 37C — Theme Modes (Light / Dark / System) · ✅ Shipped

> **Implemented as specified below.** Notable as-built decisions: `themeMode` is an **optional** field on `AppearancePreferences` (default `system`) for backward compatibility; `resolveThemeTokens` takes an **optional** `resolvedMode` second arg; the React glue **mirrors the base background + text onto `document.body`**; semantic light-fill chips received **fixed dark text** (contrast-fix exception). Settings page mode participation was deferred to **37C.1** (now shipped).

### Goal

Add a true theme-mode axis orthogonal to Aether Profiles. The Settings deep-navy aesthetic becomes the reference **Dark Mode**; the current app look becomes **Light Mode**; **System** follows `prefers-color-scheme`.

### Preference model changes ([`theme.ts`](../../src/core/theme.ts))

- New type: `export type ThemeMode = "light" | "dark" | "system";`
- Extend `AppearancePreferences` with optional `themeMode: ThemeMode`.
- **Default:** `"system"`. Rationale: modern expectation; resolution falls back to **light** when `prefers-color-scheme` is unavailable (SSR / pre-hydration), so existing light-OS users keep today's look. (Conservative alternative — default `"light"` — is documented in the plan; the implementer keeps `system` unless product decides otherwise.)
- `normalizeAppearancePreferences` reads `themeMode` per-key (invalid/missing → default), preserving backward compatibility.
- New pure resolver (keeps `theme.ts` free of `matchMedia`):
  ```ts
  export type ResolvedThemeMode = "light" | "dark";
  export function resolveEffectiveThemeMode(
    mode: ThemeMode,
    systemPrefersDark: boolean
  ): ResolvedThemeMode; // "system" → systemPrefersDark ? "dark" : "light"
  ```

### Base palette becomes mode-aware

- Replace the single `BASE` constant with **two** palettes: `LIGHT_BASE` and `DARK_BASE`.
  - `DARK_BASE` = today's deep-navy values (`background` navy gradient, `text` `#e8f1ff`, `textMuted` `#9fb3d1`) plus dark surfaces.
  - `LIGHT_BASE` = today's effective light look extracted from `appStyles.ts` (white/near-white surfaces, dark text).
- `resolveThemeTokens(prefs, resolvedMode)` selects the base palette by resolved mode; **accent tokens remain profile-derived and mode-independent** (so `Azure + Light` and `Azure + Dark` share the same accent hue).
- **New surface tokens** added to `ThemeTokens` + `THEME_CSS_VARS` so chrome backgrounds can flip by mode (today these are hardcoded `#fff` / `#f6f6f6` / `#fafafa` / `#333` in `appStyles.ts`):

  | New CSS var | Purpose | Light | Dark |
  |-------------|---------|-------|------|
  | `--aether-surface` | Default panel/card fill | `#ffffff` | `rgba(14,26,50,0.66)` |
  | `--aether-surface-raised` | Elevated cards / headers | `#f6f6f6` | `rgba(20,34,62,0.8)` |
  | `--aether-surface-sunken` | Chips / insets | `#fafafa` | `rgba(8,16,34,0.7)` |
  | `--aether-border` | Neutral (non-accent) borders | `#e5e5e5` | `rgba(120,160,220,0.18)` |
  | `--aether-text` | Primary text (now mode-driven) | `#1a2233` | `#e8f1ff` |
  | `--aether-text-muted` | Secondary text (now mode-driven) | `#5a6b85` | `#9fb3d1` |
  | `--aether-bg` | App backdrop (now mode-driven) | light gradient | existing navy gradient |

  The existing accent vars (`--aether-accent`, `--aether-accent-soft`, `--aether-panel-border`, `--aether-progress-gradient`, glows) are unchanged in meaning and stay profile-derived.

### React glue ([`useAppearanceTheme.ts`](../../src/ui/useAppearanceTheme.ts))

- Subscribe to `window.matchMedia("(prefers-color-scheme: dark)")` (with change listener + cleanup).
- Compute `resolvedMode = resolveEffectiveThemeMode(prefs.themeMode, systemPrefersDark)`.
- Resolve tokens with the resolved mode; apply expanded CSS vars on `:root`; set `data-aether-mode` (`light`/`dark`) alongside existing `data-aether-profile` / `data-aether-intensity`.
- Add `setThemeMode(mode: ThemeMode)` to `AppearanceThemeController`.

### Surface-token migration ([`appStyles.ts`](../../src/ui/appStyles.ts))

The heart of this phase: migrate hardcoded **surface/text/neutral-border** colors to the new vars with literal fallbacks (mirrors the Phase 37B accent migration). Examples: `card` `#f6f6f6` → `var(--aether-surface-raised, #f6f6f6)`; `listRow`/`dayRow`/`dashboardSection` `white` → `var(--aether-surface, #fff)`; `blockChip` `#fafafa` → `var(--aether-surface-sunken, #fafafa)`; default text → `var(--aether-text, #1a2233)`; neutral borders `#e5e5e5`/`#ddd` → `var(--aether-border, …)`.

**Constraints during migration:**

- **No layout/UX redesign** — only color/background/border values change (same Phase 37B discipline).
- Keep every literal as the `var()` fallback (usable pre-hydration / if vars unset).
- **Do not** touch semantic colors or the calendar palette.
- Verify **contrast in both modes** for all six profiles (no dark-on-dark, no light-on-light).
- Settings page already uses its own dark `settingsStyles`; ensure it reads from the shared dark base where it makes sense but is **not** regressed.

### Settings UI

- Add a **Theme Mode** control (segmented Light / Dark / System) to the Appearance section, themed and accessible (`role="radiogroup"` / `radio`, `aria-checked`, visible non-color active marker) — pattern mirrors `AccentIntensityControl`.
- Live preview reflects the chosen mode (the preview already consumes resolved tokens directly).

### Tests ([`theme.test.ts`](../../src/core/theme.test.ts))

- `resolveEffectiveThemeMode`: `light`/`dark` pass through; `system` honors `systemPrefersDark` both ways.
- Light vs dark tokens: surface/text/background differ by resolved mode; **accent is identical** across modes for the same profile (mode/accent orthogonality).
- `normalizeAppearancePreferences`: missing/invalid `themeMode` → default; valid passes through; older blobs (no `themeMode`) still normalize.
- Contrast sanity: each resolved mode yields a dark-on-light or light-on-dark text/surface pairing (token-level assertion, not pixel rendering).

### Out of scope (37C)

Global effects centralization (37D), cloud sync (37E), redesigning component layouts, theming the calendar item palette, theming the pre-app auth screen (tracked separately).

### Deliverable

`Azure + Light`, `Azure + Dark`, `Emerald + Light`, `Emerald + Dark`, … all render correctly app-wide; mode is selectable in Settings and persists in `localStorage`; System follows the OS. Settings participation completed in **37C.1**.

---

## 4.1. Phase 37C.1 — Settings Theme Mode Participation · ✅ Shipped

**Goal:** Make the Settings page follow Light / Dark / System using the same mode-aware Aether tokens as the rest of the application.

**Delivered:**

- **`panelBackground` mode-aware** in [`theme.ts`](../../src/core/theme.ts): light translucent glass (`rgba(255, 255, 255, 0.78)`); dark navy glass (`rgba(14, 26, 50, 0.55)`); mapped to `--aether-panel-bg`.
- **[`settingsStyles.ts`](../../src/components/settings/settingsStyles.ts)** migrated from fixed dark rgba literals to `--aether-bg`, `--aether-surface-*`, `--aether-border`, `--aether-panel-bg`, `--aether-text*`, `--aether-panel-border`, and accent vars. Glassmorphism + accent glow preserved. On-accent controls use fixed `#04101f` text.
- **[`ThemePreviewCard`](../../src/components/settings/ThemePreviewCard.tsx)** preview inset uses resolved `tokens.surfaceSunken` / `tokens.border`.
- **Tests:** `theme.test.ts` Phase 37C.1 block.

**Deliverable met:** Settings chrome matches the selected Theme Mode; Dark Mode preserves the deep-navy fantasy aesthetic; Light Mode is readable and consistent with the rest of the app.

---

## 5. Phase 37D — Global Visual Effects

### Goal

Promote the four effects from a **Settings-local** implementation to a **single centralized engine** rendered once across the whole app, globally configurable, performance-aware, mobile-graceful, and reduced-motion ready — with **no duplicated implementations**.

### Current state to refactor

`SettingsPage.tsx` currently owns: `EFFECT_KEYFRAMES` (inline `<style>` with `aether-pulse` / `aether-drift` / `aether-float` + a `prefers-reduced-motion` block), the `PARTICLES` and `RUNES` arrays, and the `effectLayer` rendering. `ThemePreviewCard` independently animates `aether-pulse`. Only `ambientParticles`, `animatedBorders`, and `floatingRunes` are actually rendered; **`energyTrails` is a toggle with no implementation yet**.

### Pure core ([new `src/core/themeEffects.ts`](../../src/core/themeEffects.ts) + `themeEffects.test.ts`)

Pure, dependency-free, total (never throws/mutates), no React. Owns the **decision logic** for what renders and at what density:

- New preference field: `effectPerformance?: "high" | "balanced" | "low"` on `AppearancePreferences` (optional; default `"balanced"`; normalized like other fields). Controls particle/rune density and animation cost.
- New (optional) field for future explicit reduced motion: `reducedMotion?: "system" | "on" | "off"` (default `"system"` → follow `prefers-reduced-motion`). This satisfies the "must allow future reduced-motion support" requirement by reserving the shape now; UI for it can ship later.
- `type EffectEnvironment = { reducedMotion: boolean; isMobile: boolean; performance: "high" | "balanced" | "low"; };`
- `type ResolvedEffectSettings = { ambientParticles: boolean; animatedBorders: boolean; energyTrails: boolean; floatingRunes: boolean; particleCount: number; runeCount: number; };`
- `resolveEffectSettings(prefs, env): ResolvedEffectSettings` — single source of truth:
  - **Reduced motion → all motion effects off** (counts `0`); animated borders fall back to a static (non-animated) border.
  - **Mobile → reduced density** (fewer particles/runes; heavier effects like trails may disable).
  - **Performance tiers** scale `particleCount` / `runeCount` (`low` may force particles/runes off).
  - Respects each user toggle (off → off regardless of tier).
- Keep all particle/rune **layout data** (positions, delays) as pure config consumed by the renderer.

### Centralized renderer ([new `src/components/effects/`](../../src/components/effects/))

- `GlobalEffectStyles.tsx` — injects `EFFECT_KEYFRAMES` **once** (moved out of `SettingsPage`). Shared `prefers-reduced-motion` rule lives here.
- `AetherEffectsLayer.tsx` — fixed, `pointer-events: none`, `aria-hidden` overlay mounted **once in `App.tsx`** behind the app shell. Renders ambient particles + floating runes per `resolveEffectSettings`. Reads `--aether-*` vars so effects match the active mode + accent.
- `AetherRunes.tsx` (or a `useFloatingRunes` decorator) — reusable wrapper for **major dashboard widgets** so runes can decorate specific panels without each widget reimplementing them.
- **Animated borders** — a single shared style/class (in `appStyles.ts` or an effects style module) gated by the resolved flag, applied to panels via the existing token system; no per-component keyframes.
- **Magical Energy Trails** (new) — centralized micro-interaction layer:
  - **Page transitions:** `App.tsx` already owns `page` state; on change it passes a transition signal to the effects layer (e.g. a key/counter) that plays a short themed shimmer. No routing dependency.
  - **Toggle/button/selection press:** a single shared themed "ripple/trail" CSS class + tiny `useEnergyTrail` hook (or a delegated pointer handler) reused by buttons/toggles. One implementation, opt-in via class.
  - Honors reduced-motion / performance (off in `low` / reduced-motion).
- `ThemePreviewCard` and `SettingsPage` are **refactored to consume the shared engine/config** (preview can pass an explicit "force on for preview" environment) so there is exactly one effect implementation.

### Mobile & performance

- Use [`useIsDesktopViewport`](../../src/ui/useMediaQuery.ts) (≥1024px) to set `env.isMobile`; density scales down below the breakpoint.
- `effectPerformance` lets users (or future auto-detection) drop to `low` (minimal/no particles, no trails).
- Reduced motion via `window.matchMedia("(prefers-reduced-motion: reduce)")` feeds `env.reducedMotion` and the centralized CSS rule.

### App orchestration ([`App.tsx`](../../src/App.tsx))

- Mount `<GlobalEffectStyles />` and `<AetherEffectsLayer .../>` once, fed by `appearance.preferences` + resolved env. Pass the page-change signal for trails. **No effect math in `App.tsx`** — it only wires inputs.

### Tests ([`themeEffects.test.ts`](../../src/core/themeEffects.test.ts))

- Reduced motion → all motion effects off, counts `0`, animated borders static.
- Mobile → reduced counts vs desktop.
- Performance `low` → particles/runes minimized or off; `high` → full density.
- User toggle off → effect off regardless of tier/env.
- Normalization: missing/invalid `effectPerformance` / `reducedMotion` → defaults; older blobs load unchanged.

### Out of scope (37D)

Cloud sync (37E), new effect types beyond the four named, per-widget custom effect authoring UI, and any layout redesign.

### Deliverable

A single centralized effects engine: ambient particles + animated borders + floating runes + energy trails render consistently across the app (not just Settings), driven by one pure resolver, respecting performance, mobile, and reduced-motion — with no duplicated code.

---

## 6. Phase 37E — Appearance Cloud Sync

### Goal

Synchronize the **complete** appearance preferences (profile, intensity, **theme mode**, **effects**, **performance**) across devices, with localStorage fallback and full backward compatibility. (This is the previously-planned "Phase 37C — Appearance Cloud Sync", renumbered to follow modes + effects.)

### Scope

- New Supabase singleton table `appearance_preferences` (one row per user keyed by `user_id` PK, `preferences jsonb NOT NULL` with object CHECK, `updated_at` trigger, RLS owner policies, revoke public/anon, grant authenticated) — **mirroring `calendar_preferences` / `gamification_state`**.
- [`dbMappers.ts`](../../src/core/dbMappers.ts): add `AppearancePreferencesRow`, `appearancePreferencesToRow` / `appearancePreferencesFromRow`, and a strict `parseAppearancePreferences` (allowlisted keys; `profileId` ∈ profiles; `accentIntensity` ∈ options; `themeMode` ∈ `light|dark|system`; `effectPerformance` ∈ tiers; `effects` booleans per known key; unknown keys rejected) that cross-checks `normalizeAppearancePreferences`.
- [`remoteStorage.ts`](../../src/core/remoteStorage.ts): fetch the row in `initialSync`; debounced upsert on change; singleton semantics (upsert when present).
- Sync orchestration from `App.tsx` (or a dedicated `useAppearanceSync` hook) layered on `useAppearanceTheme`: keep `pa.appearance.v1` as the local cache.
- **Conflict policy (decide in this phase's implementation step):** first sign-in on a new device with empty remote → upload local; otherwise last-write-wins by `updated_at`. Document the chosen policy before coding.
- **Backward compatibility:** localStorage-only users keep working; missing/partial rows normalize via `normalizeAppearancePreferences`; `VITE_ENABLE_REMOTE_SYNC=false` falls back to local only.

### Decision: payload vs. dedicated singleton

Use a **dedicated `appearance_preferences` table** (not `AppPayload`), matching `calendar_preferences` / `gamification_state`. Appearance is cross-cutting UI state, not domain data, and keeping it out of `AppPayload` avoids bloating the main sync envelope.

### Tests

- `dbMappers` parse/round-trip tests for appearance JSON (valid, partial, malformed, unknown-key rejection, each enum field).
- Normalization tests already cover shape coercion; add sync-merge policy tests if a pure merge helper is introduced.

### Out of scope (37E)

Syncing calendar color preferences (already synced separately); per-device mode overrides (possible follow-up).

### Deliverable

A signed-in user's theme — profile, intensity, mode, and effects — follows their account across devices.

---

## 7. Combined testing expectations

| Phase | Tests |
|-------|-------|
| 37C | ✅ `theme.test.ts` — mode resolution, mode/accent orthogonality, mode-dependent surface/text tokens, normalization of `themeMode`, contrast sanity |
| 37C.1 | ✅ `theme.test.ts` — mode-aware `panelBackground`, `--aether-panel-bg` mapping |
| 37D | `themeEffects.test.ts` — reduced-motion off-switch, mobile density, performance tiers, per-toggle gating, normalization of `effectPerformance`/`reducedMotion` |
| 37E | `dbMappers` appearance parse/round-trip + enum/unknown-key validation; optional sync-merge policy tests |

Always run `npm test`, `npm run lint`, `npm run build` before merge.

---

## 8. Updated CSS variable contract (additions in 37C)

Added to the existing contract in [aether-theme-system.md](./aether-theme-system.md#css-variable-contract):

| Variable | Purpose | Mode-dependent? |
|----------|---------|-----------------|
| `--aether-surface` | Default panel/card fill | Yes |
| `--aether-surface-raised` | Elevated surfaces | Yes |
| `--aether-surface-sunken` | Insets/chips | Yes |
| `--aether-border` | Neutral (non-accent) borders | Yes |
| `--aether-bg` | App backdrop | Yes (now) |
| `--aether-panel-bg` | Glass panel fill (Settings / preview) | Yes (37C.1) |
| `--aether-text` / `--aether-text-muted` | Text | Yes (now) |

`data-aether-mode` (`light`/`dark`) is set on `:root` alongside `data-aether-profile` / `data-aether-intensity`.

---

*Created: 2026-05-31 — Planning for Phase 37C (Theme Modes), 37D (Global Visual Effects), 37E (Appearance Cloud Sync). Updated 2026-05-31 — Phase 37C + 37C.1 shipped; 37D/37E remain planned.*
