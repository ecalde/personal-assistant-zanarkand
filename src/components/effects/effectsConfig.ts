/**
 * Static layout data for the global effects layer (Phase 37D).
 *
 * Pure, dependency-free config consumed by the renderer in this folder. The
 * resolver in `src/core/themeEffects.ts` decides *how many* particles/runes to
 * show; these arrays provide stable positions/timings so the renderer never
 * recomputes random layout on every frame (which would cause flicker).
 */

export type ParticleLayout = {
  /** Horizontal anchor (CSS length, e.g. "12%"). */
  left: string;
  /** Pixel size of the mote. */
  size: number;
  /** Animation start delay (CSS time). */
  delay: string;
  /** Drift duration (CSS time). */
  duration: string;
};

/**
 * Up to 16 ambient particle slots (matches the `vibrant` intensity base). The
 * renderer slices `particleCount` from the front, so lower densities keep a
 * stable subset rather than reshuffling.
 */
export const PARTICLE_LAYOUTS: readonly ParticleLayout[] = [
  { left: "6%", size: 5, delay: "0s", duration: "13s" },
  { left: "14%", size: 3, delay: "2.4s", duration: "16s" },
  { left: "23%", size: 4, delay: "1.1s", duration: "14s" },
  { left: "31%", size: 3, delay: "3.6s", duration: "18s" },
  { left: "39%", size: 5, delay: "0.7s", duration: "12s" },
  { left: "47%", size: 3, delay: "4.2s", duration: "17s" },
  { left: "54%", size: 4, delay: "1.9s", duration: "15s" },
  { left: "61%", size: 3, delay: "2.8s", duration: "19s" },
  { left: "68%", size: 5, delay: "0.3s", duration: "13s" },
  { left: "74%", size: 3, delay: "3.1s", duration: "16s" },
  { left: "80%", size: 4, delay: "1.5s", duration: "14s" },
  { left: "85%", size: 3, delay: "4.8s", duration: "18s" },
  { left: "89%", size: 5, delay: "0.9s", duration: "12s" },
  { left: "93%", size: 3, delay: "2.2s", duration: "17s" },
  { left: "96%", size: 4, delay: "3.9s", duration: "15s" },
  { left: "99%", size: 3, delay: "1.3s", duration: "19s" },
] as const;

export type RuneLayout = {
  glyph: string;
  /** Position anchored near a viewport corner. */
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  /** Float animation duration (CSS time). */
  duration: string;
  delay: string;
};

/** Up to 4 faint runes anchored near the viewport corners. */
export const RUNE_LAYOUTS: readonly RuneLayout[] = [
  { glyph: "✦", top: "8%", left: "3%", duration: "9s", delay: "0s" },
  { glyph: "❖", top: "12%", right: "4%", duration: "11s", delay: "1.5s" },
  { glyph: "✶", bottom: "10%", left: "5%", duration: "10s", delay: "2.4s" },
  { glyph: "✧", bottom: "14%", right: "3%", duration: "12s", delay: "0.8s" },
] as const;

/** Shared marker attribute used by the reduced-motion CSS kill-switch. */
export const ANIMATED_ATTR = "data-aether-animated";

/** Class applied to opt-in panels for the centralized animated-border system. */
export const ANIMATED_BORDER_CLASS = "aether-animated-border";

/** Root data attribute toggled by {@link AnimatedBorderSystem}. */
export const BORDERS_FLAG_ATTR = "data-aether-borders";
