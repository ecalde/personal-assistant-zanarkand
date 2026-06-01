# Phase 37D — Global Visual Effects

This is the implementation plan for **Phase 37D** of the Aether Theme System. It extends the high-level [roadmap](./roadmap.md), the canonical [Aether Theme System plan](./aether-theme-system.md), and the modes/effects companion plan ([aether-theme-modes-and-effects.md §5](./aether-theme-modes-and-effects.md#5-phase-37d--global-visual-effects)). Architecture reference: [architecture.md](../architecture.md).

> **Predecessors:** Phases **37A** (Settings foundation), **37B** (theme adoption), **37C** (Light/Dark/System modes), **37C.1** (Settings mode participation) are shipped. **37E** (Appearance Cloud Sync) is intentionally **not** part of this phase and must not be started here.

---

## 1. Goals

Promote the four interface effects — **Ambient Particles**, **Animated Borders**, **Magical Energy Trails**, **Floating Runes** — from their current **Settings-local** implementation (inline keyframes + hardcoded particle/rune arrays in `SettingsPage.tsx`) into a **single centralized global effects engine** that:

1. Mounts **once** near `App.tsx` / `AppShell` and renders consistently across the whole application (not just Settings).
2. Reads exclusively from existing `AppearancePreferences` + Aether theme tokens (`--aether-*`). No new color sources.
3. Has **no duplicated effect implementations** across pages — exactly one source of truth for decision logic (a pure resolver) and one renderer per effect.
4. Is **performance-aware** (low / medium / high tiers), **mobile-graceful** (density degradation, touch-only-effect gating), and **reduced-motion ready** (`prefers-reduced-motion`).
5. Introduces **no new dependencies** — CSS custom properties, CSS animations, and small React only.

---

## 2. Scope

**Pure core**

- New module `src/core/themeEffects.ts` (pure, dependency-free, total, no React) owning the **decision logic**: given preferences + a runtime environment, decide which effects render and at what density.
- New optional `AppearancePreferences` fields (backward compatible, normalized): `effectPerformance?: "low" | "medium" | "high"` (default `"medium"`) and `reducedMotion?: "system" | "on" | "off"` (default `"system"`).
- Pure config for particle/rune **layout data** (positions, delays) consumed by the renderer.

**Centralized renderer** (`src/components/effects/`)

- `ThemeEffectsLayer` — the single mounted container; computes the runtime environment via hooks, calls the pure resolver, and renders the sub-layers:
  ```
  ThemeEffectsLayer
  ├── AmbientParticlesLayer
  ├── FloatingRunesLayer
  ├── EnergyTrailLayer
  └── AnimatedBorderSystem
  ```
- `GlobalEffectStyles` — injects shared keyframes **once** (moved out of `SettingsPage`), plus the shared `prefers-reduced-motion` rule and the reusable animated-border class.
- `AnimatedBorderSystem` — sets a root flag (`data-aether-borders`) driving the shared `.aether-animated-border` class; no per-component keyframes.

**Wiring & UI**

- Mount `<GlobalEffectStyles />` + `<ThemeEffectsLayer … />` once in `App.tsx` (orchestration only — no effect math in `App.tsx`).
- Extend `useAppearanceTheme` with `setEffectPerformance` / `setReducedMotion` controllers; extend media-query hooks (`useReducedMotion`, precise-pointer detection).
- Refactor `SettingsPage` + `ThemePreviewCard` to **consume the shared engine** (delete local keyframes/arrays), and add Settings controls for **Effect Performance** and **Reduced Motion**.

**Tests / docs**

- `themeEffects.test.ts` + normalization tests in `theme.test.ts`.
- Update roadmap, architecture, and theme docs; mark Phase 37D implemented.

---

## 3. Non-goals

- **Appearance Cloud Sync (37E)** — no Supabase table, no `dbMappers` work. (The new preference fields are designed so 37E can serialize them later without a second migration.)
- New effect **types** beyond the four named.
- Per-widget custom effect-authoring UI.
- Any **layout / UX redesign** — only additive decorative layers and color/animation values.
- Theming the calendar item palette or semantic status colors (preserved exceptions).
- Re-theming the pre-app auth screen.

---

## 4. Architecture

```
App.tsx (orchestration only)
 ├── <GlobalEffectStyles/>          // keyframes + reduced-motion rule + .aether-animated-border (injected once)
 ├── <ThemeEffectsLayer            // single fixed, pointer-events:none, aria-hidden overlay
 │      preferences=… />
 │     ├── AmbientParticlesLayer   // drifting accent motes behind content
 │     ├── FloatingRunesLayer      // faint runes near viewport/panel corners
 │     ├── EnergyTrailLayer        // cursor trail (desktop, non-touch only)
 │     └── AnimatedBorderSystem    // sets data-aether-borders root flag (CSS-driven)
 └── <AppShell> … pages … </AppShell>
```

**Decision logic lives in one pure function:**

```ts
type EffectPerformance = "low" | "medium" | "high";
type ReducedMotionSetting = "system" | "on" | "off";

type EffectEnvironment = {
  reducedMotion: boolean;     // resolved (explicit on/off, else prefers-reduced-motion)
  isMobile: boolean;          // viewport < desktop breakpoint
  isTouch: boolean;           // no precise pointer (hover:none / pointer:coarse)
  performance: EffectPerformance;
};

type ResolvedEffectSettings = {
  ambientParticles: boolean;  // render particles at all
  particleCount: number;
  floatingRunes: boolean;
  runeCount: number;
  runesAnimated: boolean;     // static when reduced motion
  animatedBorders: boolean;   // apply border treatment
  bordersAnimated: boolean;   // static when reduced motion / low tier
  energyTrails: boolean;
  trailSegments: number;
};

function resolveEffectSettings(
  prefs: AppearancePreferences,
  env: EffectEnvironment
): ResolvedEffectSettings;
```

**Design decisions (chosen; documented here so they are explicit):**

| Decision | Choice | Rationale |
|---|---|---|
| Performance tier names | `low` / `medium` / `high` (default `medium`) | Matches the Phase 37D requirement wording (the earlier internal sketch said `low/balanced/high`; this plan standardizes on the requirement's naming). |
| Ambient particle **density driver** | **Accent Intensity** is the primary density driver (`soft < balanced < vibrant`), then scaled by performance tier and mobile | Requirement: "density controlled by Accent Intensity." Tier/mobile act as multipliers on top. |
| Energy Trails behavior | **Cursor-follow trail** (fading accent motes that follow pointer/hover), **desktop + precise-pointer only**, auto-disabled on touch | Requirement: "cursor interactions and hover transitions may leave subtle energy traces … desktop only … disabled on touch." |
| Animated Borders coverage | Reusable opt-in `.aether-animated-border` class + root flag, applied to a **curated set** of major panels (Settings panels, dashboard section cards) rather than every card | Requirement: "must not create excessive repainting." Animating box-shadow on every panel is the classic repaint cost; a curated set keeps it global-feeling but cheap. The class is available for incremental adoption elsewhere. |
| Floating Runes placement | Faint glyphs anchored near **viewport corners/edges** in the single overlay | "occasional faint runes near panel corners … low frequency … decorative … non-interactive." A single overlay avoids per-widget reimplementation. |
| New preference fields | `effectPerformance` + `reducedMotion`, both **optional** with safe defaults | Backward compatibility; finalizes the shape before 37E serializes it. |

---

## 5. Data flow

```
AppearancePreferences (localStorage: pa.appearance.v1)
        │  loaded + normalized by theme.ts
        ▼
useAppearanceTheme() ──► preferences (+ setEffectPerformance / setReducedMotion)
        │
        ▼
ThemeEffectsLayer (React)
        │  builds EffectEnvironment from hooks:
        │   • useReducedMotion()           → prefers-reduced-motion (+ explicit on/off override)
        │   • useIsDesktopViewport()       → isMobile
        │   • precise-pointer media query  → isTouch
        │   • prefs.effectPerformance      → performance tier
        ▼
resolveEffectSettings(prefs, env)  ── PURE, single source of truth ──►  ResolvedEffectSettings
        │
        ├──► AmbientParticlesLayer  (reads --aether-accent / --aether-glow)
        ├──► FloatingRunesLayer     (reads --aether-accent-soft)
        ├──► EnergyTrailLayer       (reads --aether-accent; pointer events)
        └──► AnimatedBorderSystem   (sets data-aether-borders → CSS .aether-animated-border)
```

Effects never read raw colors — only `--aether-*` CSS variables, so they automatically follow the active **mode + profile + intensity** resolved in Phase 37C.

---

## 6. Performance considerations

- **Single overlay**: particles, runes, and the cursor trail all live in **one** fixed `pointer-events:none` layer mounted once — no per-page mounts, no per-widget particle systems.
- **Tiers** scale cost: `low` disables particles/runes/trails and makes borders static; `medium` is the default balanced density; `high` is full density. Counts are bounded constants (no unbounded loops).
- **Compositor-friendly animations**: particle drift, rune float, and the cursor trail use `transform` / `opacity` only (GPU-composited, no layout/paint thrash). The cursor trail uses a **fixed-size DOM node pool** updated on a throttled `requestAnimationFrame`, not per-move node creation.
- **Animated borders animate `box-shadow` only** on a curated set of panels with a slow cycle and `will-change`, intentionally avoiding app-wide per-card box-shadow animation (documented to prevent "excessive repainting").
- **Mobile degradation**: below the desktop breakpoint, particle/rune counts drop and the cursor trail is fully disabled (touch has no hover/precise pointer anyway).
- **No new dependencies**: no particle/animation libraries.

---

## 7. Mobile behavior

- `isMobile` (viewport `< 1024px`, via `useIsDesktopViewport`) reduces `particleCount` and `runeCount` and is one gate for disabling the cursor trail.
- `isTouch` (no precise pointer: `(hover: none)` / `(pointer: coarse)`) **disables Energy Trails entirely** — they are desktop/precise-pointer only.
- Heavier effects degrade first; ambient particles and runes remain available at reduced density so the aesthetic survives on phones without jank.

---

## 8. Accessibility considerations

Honors `prefers-reduced-motion: reduce` (and an explicit user `reducedMotion` override). When reduced motion is active:

| Effect | Behavior under reduced motion |
|---|---|
| Ambient Particles | **Disabled** (count `0`). |
| Magical Energy Trails | **Disabled**. |
| Animated Borders | **Minimized** — border treatment may still render but **without animation** (static border/glow). |
| Floating Runes | **Static** — runes may still render but do not float/animate. |

- The entire layer is `aria-hidden` and `pointer-events:none`, so it never affects focus order, screen readers, or interaction.
- Reduced-motion is enforced **twice** for safety: in the pure resolver (counts/flags) **and** via a global CSS `@media (prefers-reduced-motion: reduce)` rule in `GlobalEffectStyles`.
- The new Settings controls (Effect Performance, Reduced Motion) follow the existing accessible `role="radiogroup"` / `radio` + `aria-checked` pattern with non-color-only active markers.

---

## 9. Testing strategy

**`src/core/themeEffects.test.ts`** (pure, deterministic):

- Reduced motion → particles off (count `0`), trails off, `bordersAnimated === false`, `runesAnimated === false`.
- Mobile → strictly fewer particles/runes than desktop for the same prefs; cursor trail off.
- Touch → energy trails off regardless of tier.
- Performance tiers: `low` minimizes/disables particles+runes+trails; `high` ≥ `medium` density; counts monotonic.
- **Accent Intensity drives particle density**: `vibrant > balanced > soft` particle counts (same tier/env).
- Per-toggle gating: any user effect toggle `false` ⇒ that effect off regardless of tier/env.

**`src/core/theme.test.ts`** (Phase 37D block):

- `normalizeAppearancePreferences`: missing/invalid `effectPerformance` → `"medium"`; missing/invalid `reducedMotion` → `"system"`; valid values pass through; **older blobs without the fields still normalize** (backward compatibility).
- `defaultAppearancePreferences` includes the new defaults; type guards (`isEffectPerformance`, `isReducedMotionSetting`) behave.

**Manual / build**: `npm test`, `npm run lint`, `npm run build` all green; visual smoke check across profiles + modes on desktop and a mobile viewport.

---

## 10. Rollout strategy

- **Additive & backward compatible**: new preference fields are optional with safe defaults; existing `pa.appearance.v1` blobs load unchanged. Default effect toggles are unchanged (`animatedBorders` on; particles/trails/runes off), so the app's default look is preserved until a user opts in.
- **No schema / dependency / layout changes** — pure-core-first, tests-before-UI, `App.tsx` stays orchestration-only (roadmap §6 rules).
- **Single-PR phase**: pure resolver + tests → centralized renderer → wiring + Settings refactor → docs. Effects are gated behind existing user toggles, so risk is contained.
- **Forward-compatible with 37E**: the finalized `AppearancePreferences` shape (profile + intensity + mode + effects + **performance** + **reducedMotion**) is exactly what Cloud Sync will serialize, avoiding a second migration.

---

## 11. Deliverable

A single centralized effects engine — Ambient Particles, Animated Borders, Magical Energy Trails, and Floating Runes — rendering consistently across the app from **one pure resolver** and **one mounted layer**, respecting performance tiers, mobile constraints, and reduced-motion, with no duplicated implementations and no new dependencies.

---

*Created: 2026-05-31 — Phase 37D (Global Visual Effects) implementation plan. Sibling of [aether-theme-modes-and-effects.md](./aether-theme-modes-and-effects.md); 37E (Appearance Cloud Sync) remains out of scope.*
