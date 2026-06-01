/**
 * Global visual effects — pure decision layer (Phase 37D).
 *
 * This module is dependency-free and total: every helper returns a valid value
 * for any input and never throws or mutates its arguments. It owns the single
 * source of truth for *which* interface effects render and *at what density*,
 * given the user's {@link AppearancePreferences} and a runtime
 * {@link EffectEnvironment} (reduced motion, mobile, touch, performance tier).
 *
 * React glue (reading `prefers-reduced-motion`, viewport, pointer type) and the
 * actual rendering live in `src/components/effects/`, so this stays testable in
 * isolation. Effects read colors from the existing `--aether-*` CSS variables,
 * so they are not represented here.
 *
 * Scope (Phase 37D): centralized effect resolution only. No Supabase, no cloud
 * sync (37E), no new effect types beyond the four named ones.
 */
import {
  DEFAULT_EFFECT_PERFORMANCE,
  DEFAULT_REDUCED_MOTION,
  type AccentIntensity,
  type AppearancePreferences,
  type EffectPerformance,
  type ReducedMotionSetting,
} from "./theme";

/** Runtime inputs (resolved by the React layer) that gate/scale effects. */
export type EffectEnvironment = {
  /** True when motion should be suppressed (explicit pref or `prefers-reduced-motion`). */
  reducedMotion: boolean;
  /** True below the desktop breakpoint (density degrades). */
  isMobile: boolean;
  /** True when there is no precise pointer (touch) — disables energy trails. */
  isTouch: boolean;
  /** Performance tier scaling density and gating heavier effects. */
  performance: EffectPerformance;
};

/** The resolved render decision for one frame of preferences + environment. */
export type ResolvedEffectSettings = {
  /** Render ambient drifting particles. */
  ambientParticles: boolean;
  /** Number of particles to render (0 when disabled). */
  particleCount: number;
  /** Render floating runes (may be static). */
  floatingRunes: boolean;
  /** Number of runes to render (0 when disabled). */
  runeCount: number;
  /** Animate the runes (false → static glyphs under reduced motion). */
  runesAnimated: boolean;
  /** Apply the animated-border treatment to opted-in panels. */
  animatedBorders: boolean;
  /** Animate the border glow (false → static border under reduced motion / low tier). */
  bordersAnimated: boolean;
  /** Render the cursor energy trail (desktop, precise-pointer only). */
  energyTrails: boolean;
  /** Number of trail segments following the cursor (0 when disabled). */
  trailSegments: number;
};

/**
 * Base particle density driven by Accent Intensity (per the Phase 37D
 * requirement: "density controlled by Accent Intensity"). Performance tier and
 * mobile scale these further.
 */
const PARTICLE_BASE_BY_INTENSITY: Record<AccentIntensity, number> = {
  soft: 6,
  balanced: 10,
  vibrant: 16,
};

/** Performance-tier multiplier applied to the intensity-derived particle base. */
const PARTICLE_TIER_MULT: Record<EffectPerformance, number> = {
  low: 0,
  medium: 0.6,
  high: 1,
};

/** Rune counts per tier (low frequency, decorative). */
const RUNE_COUNT_BY_TIER: Record<EffectPerformance, number> = {
  low: 0,
  medium: 2,
  high: 4,
};

/** Cursor-trail segment counts per tier (desktop only). */
const TRAIL_SEGMENTS_BY_TIER: Record<EffectPerformance, number> = {
  low: 0,
  medium: 6,
  high: 10,
};

/** Density factor applied on mobile viewports (heavier effects degrade first). */
const MOBILE_DENSITY_FACTOR = 0.4;

/**
 * Resolve an (explicit-or-system) reduced-motion preference into a boolean.
 * Pure: the caller supplies `systemPrefersReduced` (the React glue reads
 * `prefers-reduced-motion`).
 */
export function resolveReducedMotion(
  setting: ReducedMotionSetting,
  systemPrefersReduced: boolean
): boolean {
  if (setting === "on") return true;
  if (setting === "off") return false;
  return systemPrefersReduced;
}

/**
 * Single source of truth: decide which effects render and at what density.
 *
 * Gating order: per-effect user toggle → reduced motion → performance tier →
 * mobile/touch. Reduced motion turns off all *motion* (particles, trails) and
 * downgrades borders/runes to static; mobile reduces density and disables the
 * cursor trail; touch always disables the cursor trail; the `low` tier disables
 * particles/runes/trails and forces static borders.
 */
export function resolveEffectSettings(
  prefs: AppearancePreferences,
  env: EffectEnvironment
): ResolvedEffectSettings {
  const performance = env.performance;
  const { reducedMotion, isMobile, isTouch } = env;
  const intensity = prefs.accentIntensity;
  const toggles = prefs.effects;

  // --- Ambient particles: density driven by accent intensity, then tier/mobile.
  const particleBase = PARTICLE_BASE_BY_INTENSITY[intensity] ?? 0;
  const particleScaled =
    particleBase *
    (PARTICLE_TIER_MULT[performance] ?? 0) *
    (isMobile ? MOBILE_DENSITY_FACTOR : 1);
  const particleCount =
    toggles.ambientParticles && !reducedMotion ? Math.round(particleScaled) : 0;
  const ambientParticles = particleCount > 0;

  // --- Floating runes: low frequency; static (not animated) under reduced motion.
  const runeBase = RUNE_COUNT_BY_TIER[performance] ?? 0;
  const runeScaled = isMobile ? Math.ceil(runeBase / 2) : runeBase;
  const runeCount = toggles.floatingRunes ? runeScaled : 0;
  const floatingRunes = runeCount > 0;
  const runesAnimated = floatingRunes && !reducedMotion;

  // --- Animated borders: static under reduced motion or the low tier.
  const animatedBorders = toggles.animatedBorders;
  const bordersAnimated =
    animatedBorders && !reducedMotion && performance !== "low";

  // --- Energy trails: desktop + precise-pointer only; off on reduced motion/low.
  const trailBase = TRAIL_SEGMENTS_BY_TIER[performance] ?? 0;
  const energyTrails =
    toggles.energyTrails &&
    !reducedMotion &&
    !isTouch &&
    !isMobile &&
    trailBase > 0;
  const trailSegments = energyTrails ? trailBase : 0;

  return {
    ambientParticles,
    particleCount,
    floatingRunes,
    runeCount,
    runesAnimated,
    animatedBorders,
    bordersAnimated,
    energyTrails,
    trailSegments,
  };
}

/**
 * Convenience: build an {@link EffectEnvironment} with safe defaults, coercing
 * preference fields that may be absent on legacy payloads. The React layer
 * normally passes a fully-resolved env; this is used by tests/preview helpers.
 */
export function effectEnvironment(
  prefs: AppearancePreferences,
  overrides: Partial<EffectEnvironment> = {}
): EffectEnvironment {
  return {
    reducedMotion: false,
    isMobile: false,
    isTouch: false,
    performance: prefs.effectPerformance ?? DEFAULT_EFFECT_PERFORMANCE,
    ...overrides,
  };
}

/** Re-exported defaults for callers that want the canonical fallbacks. */
export { DEFAULT_EFFECT_PERFORMANCE, DEFAULT_REDUCED_MOTION };
