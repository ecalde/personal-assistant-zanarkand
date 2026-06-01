/**
 * Aether Profiles — pure theme token system (Settings foundation phase).
 *
 * This module is dependency-free and total: every helper returns a valid value
 * for any input (invalid input falls back to defaults) and never throws or
 * mutates its arguments. It owns the *shape* of appearance preferences and the
 * derivation of CSS-variable tokens; persistence (localStorage) and React glue
 * live in separate modules so this stays testable in isolation.
 *
 * Scope (Phase 37 — Settings foundation): local theme customization only. No
 * Supabase schema, no AI/notification/account behavior. Preferences persist to
 * localStorage today; a cloud-synced singleton can be layered on later.
 */

export type AetherProfileId =
  | "azure"
  | "emerald"
  | "violet"
  | "crimson"
  | "amber"
  | "obsidian";

export type AccentIntensity = "soft" | "balanced" | "vibrant";

/**
 * Theme mode (Phase 37C). Orthogonal to the Aether Profile: the profile controls
 * the *accent*, the mode controls the *base palette* (surfaces + text). `system`
 * follows the OS `prefers-color-scheme`. Resolution to a concrete light/dark value
 * lives in {@link resolveEffectiveThemeMode} so this module stays free of
 * `matchMedia` (the React glue passes the resolved value).
 */
export type ThemeMode = "light" | "dark" | "system";

/** A mode resolved to a concrete palette (never `system`). */
export type ResolvedThemeMode = "light" | "dark";

export type InterfaceEffectKey =
  | "ambientParticles"
  | "animatedBorders"
  | "energyTrails"
  | "floatingRunes";

export type InterfaceEffects = Record<InterfaceEffectKey, boolean>;

/**
 * Global visual-effects performance tier (Phase 37D). Scales particle/rune
 * density and gates heavier effects. `low` disables particles/runes/trails and
 * makes animated borders static; `high` is full density. Optional + backward
 * compatible (default {@link DEFAULT_EFFECT_PERFORMANCE}).
 */
export type EffectPerformance = "low" | "medium" | "high";

/**
 * Explicit reduced-motion preference (Phase 37D). `system` follows
 * `prefers-reduced-motion`; `on`/`off` override it. Optional + backward
 * compatible (default {@link DEFAULT_REDUCED_MOTION}).
 */
export type ReducedMotionSetting = "system" | "on" | "off";

export type AppearancePreferences = {
  profileId: AetherProfileId;
  accentIntensity: AccentIntensity;
  /**
   * Light / Dark / System (Phase 37C). Optional for backward compatibility:
   * older persisted preferences (and backups) without this field normalize to
   * {@link DEFAULT_THEME_MODE}.
   */
  themeMode?: ThemeMode;
  effects: InterfaceEffects;
  /**
   * Global effects performance tier (Phase 37D). Optional for backward
   * compatibility: older preferences normalize to
   * {@link DEFAULT_EFFECT_PERFORMANCE}.
   */
  effectPerformance?: EffectPerformance;
  /**
   * Reduced-motion preference (Phase 37D). Optional for backward
   * compatibility: older preferences normalize to {@link DEFAULT_REDUCED_MOTION}.
   */
  reducedMotion?: ReducedMotionSetting;
};

/** Static metadata for one selectable Aether Profile (crystal card). */
export type AetherProfile = {
  id: AetherProfileId;
  /** Display name, e.g. "Azure Crystal". */
  name: string;
  /** Short evocative description shown on the crystal card. */
  description: string;
  /** Primary accent hex (buttons, highlights, selected state). */
  accent: string;
  /** Secondary accent hex (gradients, glow blends). */
  accentSecondary: string;
};

/** Resolved, ready-to-apply theme values (mostly CSS-ready strings). */
export type ThemeTokens = {
  profileId: AetherProfileId;
  accentIntensity: AccentIntensity;
  /** Concrete light/dark mode this token set was resolved for (Phase 37C). */
  themeMode: ResolvedThemeMode;
  accent: string;
  accentSecondary: string;
  /** Translucent accent for soft fills/halos. */
  accentSoft: string;
  /** App backdrop gradient (mode-dependent: navy in dark, light in light). */
  background: string;
  /** Default panel/card surface fill (mode-dependent). */
  surface: string;
  /** Elevated card/header surface fill (mode-dependent). */
  surfaceRaised: string;
  /** Inset/chip surface fill (mode-dependent). */
  surfaceSunken: string;
  /** Neutral (non-accent) border color (mode-dependent). */
  border: string;
  /** Glassmorphism panel fill (slightly accent-tinted; settings preview). */
  panelBackground: string;
  /** Thin glowing panel border color. */
  panelBorder: string;
  /** Ambient panel glow box-shadow (scales with intensity). */
  panelGlow: string;
  /** Generic accent glow box-shadow (scales with intensity). */
  glow: string;
  /** Button glow box-shadow (scales with intensity). */
  buttonGlow: string;
  /** Progress / XP bar fill gradient. */
  progressGradient: string;
  /** Primary body/heading text (alias: {@link text}). */
  textPrimary: string;
  /** Secondary labels, descriptions one step below primary. */
  textSecondary: string;
  /** Muted/helper/meta text (captions, hints, timestamps). */
  textMuted: string;
  /** Disabled or very low-emphasis text. */
  textDisabled: string;
  /** Readable text on bright accent fills (buttons, badges). */
  textOnAccent: string;
  /** @deprecated Use {@link textPrimary}; kept for backward compatibility. */
  text: string;
};

export const AETHER_PROFILES: readonly AetherProfile[] = [
  {
    id: "azure",
    name: "Azure Crystal",
    description: "The default arcane interface — cool cyan light over deep navy.",
    accent: "#46c6ff",
    accentSecondary: "#7b9bff",
  },
  {
    id: "emerald",
    name: "Emerald Crystal",
    description: "Verdant teal energy for a calm, growth-focused mood.",
    accent: "#34e0a1",
    accentSecondary: "#22d3ee",
  },
  {
    id: "violet",
    name: "Violet Crystal",
    description: "Mystic amethyst glow for focused, twilight sessions.",
    accent: "#a78bfa",
    accentSecondary: "#c084fc",
  },
  {
    id: "crimson",
    name: "Crimson Crystal",
    description: "Ember-forged rose light for high-intensity drive.",
    accent: "#fb7185",
    accentSecondary: "#f43f5e",
  },
  {
    id: "amber",
    name: "Amber Crystal",
    description: "Warm golden runes radiating steady, grounded warmth.",
    accent: "#fbbf24",
    accentSecondary: "#fb923c",
  },
  {
    id: "obsidian",
    name: "Obsidian Crystal",
    description: "Muted steel monochrome — minimal glow, maximum focus.",
    accent: "#94a3b8",
    accentSecondary: "#64748b",
  },
] as const;

export const DEFAULT_PROFILE_ID: AetherProfileId = "azure";
export const DEFAULT_ACCENT_INTENSITY: AccentIntensity = "balanced";
/**
 * Default mode is `system`: new users follow their OS, and existing users (no
 * stored `themeMode`) resolve to light when `prefers-color-scheme` is
 * unavailable, preserving today's light appearance.
 */
export const DEFAULT_THEME_MODE: ThemeMode = "system";

/** Default effects performance tier (Phase 37D): balanced density. */
export const DEFAULT_EFFECT_PERFORMANCE: EffectPerformance = "medium";

/** Default reduced-motion preference (Phase 37D): follow the OS. */
export const DEFAULT_REDUCED_MOTION: ReducedMotionSetting = "system";

export const EFFECT_PERFORMANCE_OPTIONS: readonly {
  id: EffectPerformance;
  label: string;
  description: string;
}[] = [
  { id: "low", label: "Low", description: "Minimal effects for best performance." },
  { id: "medium", label: "Medium", description: "Balanced density (recommended)." },
  { id: "high", label: "High", description: "Full ambient density." },
] as const;

export const REDUCED_MOTION_OPTIONS: readonly {
  id: ReducedMotionSetting;
  label: string;
  description: string;
}[] = [
  { id: "system", label: "System", description: "Follow your device setting." },
  { id: "on", label: "Reduce", description: "Minimize motion everywhere." },
  { id: "off", label: "Allow", description: "Always allow effect motion." },
] as const;

export const THEME_MODE_OPTIONS: readonly {
  id: ThemeMode;
  label: string;
  description: string;
}[] = [
  { id: "light", label: "Light", description: "Bright surfaces with dark text." },
  { id: "dark", label: "Dark", description: "Deep navy Aether surfaces." },
  {
    id: "system",
    label: "System",
    description: "Follow your device's appearance.",
  },
] as const;

export const ACCENT_INTENSITY_OPTIONS: readonly {
  id: AccentIntensity;
  label: string;
}[] = [
  { id: "soft", label: "Soft" },
  { id: "balanced", label: "Balanced" },
  { id: "vibrant", label: "Vibrant" },
] as const;

export const INTERFACE_EFFECT_OPTIONS: readonly {
  id: InterfaceEffectKey;
  label: string;
  description: string;
}[] = [
  {
    id: "ambientParticles",
    label: "Ambient Particles",
    description: "Faint drifting motes of arcane light in the background.",
  },
  {
    id: "animatedBorders",
    label: "Animated Borders",
    description: "Panel borders pulse gently with channeled energy.",
  },
  {
    id: "energyTrails",
    label: "Magical Energy Trails",
    description: "Highlights leave a soft luminous trail on change.",
  },
  {
    id: "floatingRunes",
    label: "Floating Runes",
    description: "Subtle glyphs hover at the edges of key panels.",
  },
] as const;

const PROFILE_IDS: ReadonlySet<string> = new Set(AETHER_PROFILES.map((p) => p.id));
const INTENSITY_IDS: ReadonlySet<string> = new Set(
  ACCENT_INTENSITY_OPTIONS.map((o) => o.id)
);
const THEME_MODE_IDS: ReadonlySet<string> = new Set(
  THEME_MODE_OPTIONS.map((o) => o.id)
);
const EFFECT_PERFORMANCE_IDS: ReadonlySet<string> = new Set(
  EFFECT_PERFORMANCE_OPTIONS.map((o) => o.id)
);
const REDUCED_MOTION_IDS: ReadonlySet<string> = new Set(
  REDUCED_MOTION_OPTIONS.map((o) => o.id)
);
const EFFECT_KEYS: readonly InterfaceEffectKey[] = INTERFACE_EFFECT_OPTIONS.map(
  (o) => o.id
);

/**
 * Mode-specific base palette (Phase 37C). The accent is profile-derived and
 * mode-independent; these values are the surfaces/text/borders that flip between
 * Light and Dark. The Dark palette is the deep-navy Aether aesthetic (the
 * reference Dark Mode); the Light palette mirrors the app's pre-37C light look.
 */
type BasePalette = {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  /** Glass panel fill for Settings / preview widgets (Phase 37C.1). */
  panelBackground: string;
  border: string;
  /** Primary body/heading text (Phase 37C.2). */
  textPrimary: string;
  /** Secondary labels and descriptions. */
  textSecondary: string;
  /** Muted/helper/meta text. */
  textMuted: string;
  /** Disabled or very low-emphasis text. */
  textDisabled: string;
  /** Text on bright accent fills (profile-independent). */
  textOnAccent: string;
  /** Semantic success chip (on-track). */
  chipSuccessText: string;
  chipSuccessBg: string;
  chipSuccessBorder: string;
  /** Semantic danger chip (overdue/error). */
  chipDangerText: string;
  chipDangerBg: string;
  chipDangerBorder: string;
  /** Semantic warning chip (high urgency, streak). */
  chipWarningText: string;
  chipWarningBg: string;
  chipWarningBorder: string;
  /** Semantic info chip (timed events). */
  chipInfoText: string;
  chipInfoBg: string;
  chipInfoBorder: string;
  /** Semantic marker chip (time markers). */
  chipMarkerText: string;
  chipMarkerBg: string;
  chipMarkerBorder: string;
  /** Neutral/all-day chip. */
  chipNeutralText: string;
  chipNeutralBg: string;
  chipNeutralBorder: string;
  /** @deprecated Alias for textPrimary (backward compat). */
  text: string;
};

const LIGHT_BASE: BasePalette = {
  background: "linear-gradient(160deg, #f6f8fc 0%, #eef2f8 100%)",
  surface: "#ffffff",
  surfaceRaised: "#f6f6f6",
  surfaceSunken: "#fafafa",
  panelBackground: "rgba(255, 255, 255, 0.78)",
  border: "#e5e5e5",
  textPrimary: "#1a2233",
  textSecondary: "#3d4d66",
  textMuted: "#5a6b85",
  textDisabled: "#8a97ad",
  textOnAccent: "#04101f",
  chipSuccessText: "#1b5e20",
  chipSuccessBg: "#ecfff1",
  chipSuccessBorder: "#b9e6c7",
  chipDangerText: "#8a1c1c",
  chipDangerBg: "#ffecec",
  chipDangerBorder: "#f2b8b8",
  chipWarningText: "#7a5b12",
  chipWarningBg: "#fff8e8",
  chipWarningBorder: "#f0d9a8",
  chipInfoText: "#0d47a1",
  chipInfoBg: "#e3f2fd",
  chipInfoBorder: "#90caf9",
  chipMarkerText: "#6a1b9a",
  chipMarkerBg: "#f3e5f5",
  chipMarkerBorder: "#ce93d8",
  chipNeutralText: "#37474f",
  chipNeutralBg: "#eceff1",
  chipNeutralBorder: "#cfd8dc",
  text: "#1a2233",
};

const DARK_BASE: BasePalette = {
  background: "linear-gradient(160deg, #060c1a 0%, #0a1530 55%, #0b1024 100%)",
  surface: "rgba(14, 26, 50, 0.66)",
  surfaceRaised: "rgba(20, 34, 62, 0.82)",
  surfaceSunken: "rgba(8, 16, 34, 0.7)",
  panelBackground: "rgba(14, 26, 50, 0.55)",
  border: "rgba(120, 160, 220, 0.18)",
  textPrimary: "#e8f1ff",
  textSecondary: "#c5d4ea",
  textMuted: "#9fb3d1",
  textDisabled: "#6b7f99",
  textOnAccent: "#04101f",
  chipSuccessText: "#86efac",
  chipSuccessBg: "rgba(27, 94, 32, 0.28)",
  chipSuccessBorder: "rgba(134, 239, 172, 0.35)",
  chipDangerText: "#fca5a5",
  chipDangerBg: "rgba(138, 28, 28, 0.28)",
  chipDangerBorder: "rgba(252, 165, 165, 0.35)",
  chipWarningText: "#fcd34d",
  chipWarningBg: "rgba(122, 91, 18, 0.28)",
  chipWarningBorder: "rgba(252, 211, 77, 0.35)",
  chipInfoText: "#93c5fd",
  chipInfoBg: "rgba(13, 71, 161, 0.28)",
  chipInfoBorder: "rgba(147, 197, 253, 0.35)",
  chipMarkerText: "#d8b4fe",
  chipMarkerBg: "rgba(106, 27, 154, 0.28)",
  chipMarkerBorder: "rgba(216, 180, 254, 0.35)",
  chipNeutralText: "#b0bec5",
  chipNeutralBg: "rgba(55, 71, 79, 0.35)",
  chipNeutralBorder: "rgba(176, 190, 197, 0.3)",
  text: "#e8f1ff",
};

function basePaletteForMode(mode: ResolvedThemeMode): BasePalette {
  return mode === "dark" ? DARK_BASE : LIGHT_BASE;
}

/** Glow multipliers: higher intensity → stronger blur and alpha. */
const INTENSITY_GLOW: Record<AccentIntensity, number> = {
  soft: 0.45,
  balanced: 0.8,
  vibrant: 1.15,
};

export function isAetherProfileId(value: unknown): value is AetherProfileId {
  return typeof value === "string" && PROFILE_IDS.has(value);
}

export function isAccentIntensity(value: unknown): value is AccentIntensity {
  return typeof value === "string" && INTENSITY_IDS.has(value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && THEME_MODE_IDS.has(value);
}

export function isEffectPerformance(value: unknown): value is EffectPerformance {
  return typeof value === "string" && EFFECT_PERFORMANCE_IDS.has(value);
}

export function isReducedMotionSetting(
  value: unknown
): value is ReducedMotionSetting {
  return typeof value === "string" && REDUCED_MOTION_IDS.has(value);
}

/**
 * Resolve a (possibly `system`) {@link ThemeMode} into a concrete light/dark
 * palette choice. Pure: the caller supplies `systemPrefersDark` (the React glue
 * reads `prefers-color-scheme`). `system` with an unknown OS preference resolves
 * to light, preserving the app's pre-37C appearance.
 */
export function resolveEffectiveThemeMode(
  mode: ThemeMode,
  systemPrefersDark: boolean
): ResolvedThemeMode {
  if (mode === "light" || mode === "dark") return mode;
  return systemPrefersDark ? "dark" : "light";
}

export function getAetherProfile(id: AetherProfileId): AetherProfile {
  return AETHER_PROFILES.find((p) => p.id === id) ?? AETHER_PROFILES[0];
}

export function defaultInterfaceEffects(): InterfaceEffects {
  return {
    ambientParticles: false,
    animatedBorders: true,
    energyTrails: false,
    floatingRunes: false,
  };
}

export function defaultAppearancePreferences(): AppearancePreferences {
  return {
    profileId: DEFAULT_PROFILE_ID,
    accentIntensity: DEFAULT_ACCENT_INTENSITY,
    themeMode: DEFAULT_THEME_MODE,
    effects: defaultInterfaceEffects(),
    effectPerformance: DEFAULT_EFFECT_PERFORMANCE,
    reducedMotion: DEFAULT_REDUCED_MOTION,
  };
}

/**
 * Coerce arbitrary (possibly untrusted / legacy) input into a valid
 * {@link AppearancePreferences}. Unknown profile/intensity fall back to
 * defaults; effect flags are read per-key (missing → default), and any extra
 * keys are dropped. Never throws.
 */
export function normalizeAppearancePreferences(
  input: unknown
): AppearancePreferences {
  const base = defaultAppearancePreferences();
  if (!input || typeof input !== "object") {
    return base;
  }
  const raw = input as Record<string, unknown>;

  const profileId = isAetherProfileId(raw.profileId)
    ? raw.profileId
    : base.profileId;
  const accentIntensity = isAccentIntensity(raw.accentIntensity)
    ? raw.accentIntensity
    : base.accentIntensity;
  const themeMode = isThemeMode(raw.themeMode) ? raw.themeMode : base.themeMode;
  const effectPerformance = isEffectPerformance(raw.effectPerformance)
    ? raw.effectPerformance
    : base.effectPerformance;
  const reducedMotion = isReducedMotionSetting(raw.reducedMotion)
    ? raw.reducedMotion
    : base.reducedMotion;

  const effects = defaultInterfaceEffects();
  const rawEffects =
    raw.effects && typeof raw.effects === "object"
      ? (raw.effects as Record<string, unknown>)
      : {};
  for (const key of EFFECT_KEYS) {
    if (typeof rawEffects[key] === "boolean") {
      effects[key] = rawEffects[key] as boolean;
    }
  }

  return {
    profileId,
    accentIntensity,
    themeMode,
    effects,
    effectPerformance,
    reducedMotion,
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) {
    return { r: 255, g: 255, b: 255 };
  }
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${round(clamp01(alpha))})`;
}

function glowShadow(hex: string, baseBlur: number, baseAlpha: number, mult: number): string {
  return `0 0 ${round(baseBlur * mult)}px ${withAlpha(hex, baseAlpha * mult)}`;
}

/**
 * Resolve appearance preferences into ready-to-apply CSS-friendly tokens.
 *
 * `resolvedMode` is the concrete light/dark palette to use. It is optional so
 * existing single-arg callers keep working: when omitted it is derived from
 * `prefs.themeMode` via {@link resolveEffectiveThemeMode} (treating `system` as
 * light, since this pure module cannot read `prefers-color-scheme`). The React
 * glue passes the real resolved mode.
 */
export function resolveThemeTokens(
  prefs: AppearancePreferences,
  resolvedMode?: ResolvedThemeMode
): ThemeTokens {
  const profile = getAetherProfile(prefs.profileId);
  const mult = INTENSITY_GLOW[prefs.accentIntensity] ?? INTENSITY_GLOW.balanced;
  const { accent, accentSecondary } = profile;
  const mode =
    resolvedMode ??
    resolveEffectiveThemeMode(prefs.themeMode ?? DEFAULT_THEME_MODE, false);
  const palette = basePaletteForMode(mode);

  return {
    profileId: profile.id,
    accentIntensity: prefs.accentIntensity,
    themeMode: mode,
    accent,
    accentSecondary,
    accentSoft: withAlpha(accent, 0.16),
    background: palette.background,
    surface: palette.surface,
    surfaceRaised: palette.surfaceRaised,
    surfaceSunken: palette.surfaceSunken,
    border: palette.border,
    panelBackground: palette.panelBackground,
    panelBorder: withAlpha(accent, 0.28),
    panelGlow: glowShadow(accent, 30, 0.18, mult),
    glow: glowShadow(accent, 20, 0.45, mult),
    buttonGlow: glowShadow(accent, 16, 0.55, mult),
    progressGradient: `linear-gradient(90deg, ${accentSecondary}, ${accent})`,
    textPrimary: palette.textPrimary,
    textSecondary: palette.textSecondary,
    textMuted: palette.textMuted,
    textDisabled: palette.textDisabled,
    textOnAccent: palette.textOnAccent,
    text: palette.textPrimary,
  };
}

/** CSS custom-property names consumed by the Settings UI (and, later, the app). */
export const THEME_CSS_VARS = {
  accent: "--aether-accent",
  accentSecondary: "--aether-accent-secondary",
  accentSoft: "--aether-accent-soft",
  background: "--aether-bg",
  surface: "--aether-surface",
  surfaceRaised: "--aether-surface-raised",
  surfaceSunken: "--aether-surface-sunken",
  border: "--aether-border",
  panelBackground: "--aether-panel-bg",
  panelBorder: "--aether-panel-border",
  panelGlow: "--aether-panel-glow",
  glow: "--aether-glow",
  buttonGlow: "--aether-button-glow",
  progressGradient: "--aether-progress-gradient",
  /** Primary body/heading text (Phase 37C.2). */
  textPrimary: "--aether-text-primary",
  textSecondary: "--aether-text-secondary",
  textMuted: "--aether-text-muted",
  textDisabled: "--aether-text-disabled",
  textOnAccent: "--aether-text-on-accent",
  /** Backward-compatible alias for textPrimary. */
  text: "--aether-text",
  chipSuccessText: "--aether-chip-success-text",
  chipSuccessBg: "--aether-chip-success-bg",
  chipSuccessBorder: "--aether-chip-success-border",
  chipDangerText: "--aether-chip-danger-text",
  chipDangerBg: "--aether-chip-danger-bg",
  chipDangerBorder: "--aether-chip-danger-border",
  chipWarningText: "--aether-chip-warning-text",
  chipWarningBg: "--aether-chip-warning-bg",
  chipWarningBorder: "--aether-chip-warning-border",
  chipInfoText: "--aether-chip-info-text",
  chipInfoBg: "--aether-chip-info-bg",
  chipInfoBorder: "--aether-chip-info-border",
  chipMarkerText: "--aether-chip-marker-text",
  chipMarkerBg: "--aether-chip-marker-bg",
  chipMarkerBorder: "--aether-chip-marker-border",
  chipNeutralText: "--aether-chip-neutral-text",
  chipNeutralBg: "--aether-chip-neutral-bg",
  chipNeutralBorder: "--aether-chip-neutral-border",
} as const;

/** Map resolved tokens to the CSS custom-property name/value pairs. */
export function themeTokensToCssVars(tokens: ThemeTokens): Record<string, string> {
  const palette = basePaletteForMode(tokens.themeMode);
  return {
    [THEME_CSS_VARS.accent]: tokens.accent,
    [THEME_CSS_VARS.accentSecondary]: tokens.accentSecondary,
    [THEME_CSS_VARS.accentSoft]: tokens.accentSoft,
    [THEME_CSS_VARS.background]: tokens.background,
    [THEME_CSS_VARS.surface]: tokens.surface,
    [THEME_CSS_VARS.surfaceRaised]: tokens.surfaceRaised,
    [THEME_CSS_VARS.surfaceSunken]: tokens.surfaceSunken,
    [THEME_CSS_VARS.border]: tokens.border,
    [THEME_CSS_VARS.panelBackground]: tokens.panelBackground,
    [THEME_CSS_VARS.panelBorder]: tokens.panelBorder,
    [THEME_CSS_VARS.panelGlow]: tokens.panelGlow,
    [THEME_CSS_VARS.glow]: tokens.glow,
    [THEME_CSS_VARS.buttonGlow]: tokens.buttonGlow,
    [THEME_CSS_VARS.progressGradient]: tokens.progressGradient,
    [THEME_CSS_VARS.textPrimary]: tokens.textPrimary,
    [THEME_CSS_VARS.textSecondary]: tokens.textSecondary,
    [THEME_CSS_VARS.textMuted]: tokens.textMuted,
    [THEME_CSS_VARS.textDisabled]: tokens.textDisabled,
    [THEME_CSS_VARS.textOnAccent]: tokens.textOnAccent,
    // Backward-compatible alias: --aether-text mirrors primary.
    [THEME_CSS_VARS.text]: tokens.textPrimary,
    [THEME_CSS_VARS.chipSuccessText]: palette.chipSuccessText,
    [THEME_CSS_VARS.chipSuccessBg]: palette.chipSuccessBg,
    [THEME_CSS_VARS.chipSuccessBorder]: palette.chipSuccessBorder,
    [THEME_CSS_VARS.chipDangerText]: palette.chipDangerText,
    [THEME_CSS_VARS.chipDangerBg]: palette.chipDangerBg,
    [THEME_CSS_VARS.chipDangerBorder]: palette.chipDangerBorder,
    [THEME_CSS_VARS.chipWarningText]: palette.chipWarningText,
    [THEME_CSS_VARS.chipWarningBg]: palette.chipWarningBg,
    [THEME_CSS_VARS.chipWarningBorder]: palette.chipWarningBorder,
    [THEME_CSS_VARS.chipInfoText]: palette.chipInfoText,
    [THEME_CSS_VARS.chipInfoBg]: palette.chipInfoBg,
    [THEME_CSS_VARS.chipInfoBorder]: palette.chipInfoBorder,
    [THEME_CSS_VARS.chipMarkerText]: palette.chipMarkerText,
    [THEME_CSS_VARS.chipMarkerBg]: palette.chipMarkerBg,
    [THEME_CSS_VARS.chipMarkerBorder]: palette.chipMarkerBorder,
    [THEME_CSS_VARS.chipNeutralText]: palette.chipNeutralText,
    [THEME_CSS_VARS.chipNeutralBg]: palette.chipNeutralBg,
    [THEME_CSS_VARS.chipNeutralBorder]: palette.chipNeutralBorder,
  };
}
