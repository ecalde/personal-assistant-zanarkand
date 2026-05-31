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

export type InterfaceEffectKey =
  | "ambientParticles"
  | "animatedBorders"
  | "energyTrails"
  | "floatingRunes";

export type InterfaceEffects = Record<InterfaceEffectKey, boolean>;

export type AppearancePreferences = {
  profileId: AetherProfileId;
  accentIntensity: AccentIntensity;
  effects: InterfaceEffects;
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
  accent: string;
  accentSecondary: string;
  /** Translucent accent for soft fills/halos. */
  accentSoft: string;
  /** Deep navy app backdrop gradient (shared across all profiles). */
  background: string;
  /** Glassmorphism panel fill (shared base, slightly accent-tinted). */
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
  /** Primary readable text color. */
  text: string;
  /** Muted/secondary text color. */
  textMuted: string;
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
const EFFECT_KEYS: readonly InterfaceEffectKey[] = INTERFACE_EFFECT_OPTIONS.map(
  (o) => o.id
);

/** Shared deep-navy base palette (constant across every profile). */
const BASE = {
  background: "linear-gradient(160deg, #060c1a 0%, #0a1530 55%, #0b1024 100%)",
  text: "#e8f1ff",
  textMuted: "#9fb3d1",
} as const;

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
    effects: defaultInterfaceEffects(),
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

  return { profileId, accentIntensity, effects };
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

/** Resolve appearance preferences into ready-to-apply CSS-friendly tokens. */
export function resolveThemeTokens(prefs: AppearancePreferences): ThemeTokens {
  const profile = getAetherProfile(prefs.profileId);
  const mult = INTENSITY_GLOW[prefs.accentIntensity] ?? INTENSITY_GLOW.balanced;
  const { accent, accentSecondary } = profile;

  return {
    profileId: profile.id,
    accentIntensity: prefs.accentIntensity,
    accent,
    accentSecondary,
    accentSoft: withAlpha(accent, 0.16),
    background: BASE.background,
    panelBackground: "rgba(14, 26, 50, 0.55)",
    panelBorder: withAlpha(accent, 0.28),
    panelGlow: glowShadow(accent, 30, 0.18, mult),
    glow: glowShadow(accent, 20, 0.45, mult),
    buttonGlow: glowShadow(accent, 16, 0.55, mult),
    progressGradient: `linear-gradient(90deg, ${accentSecondary}, ${accent})`,
    text: BASE.text,
    textMuted: BASE.textMuted,
  };
}

/** CSS custom-property names consumed by the Settings UI (and, later, the app). */
export const THEME_CSS_VARS = {
  accent: "--aether-accent",
  accentSecondary: "--aether-accent-secondary",
  accentSoft: "--aether-accent-soft",
  background: "--aether-bg",
  panelBackground: "--aether-panel-bg",
  panelBorder: "--aether-panel-border",
  panelGlow: "--aether-panel-glow",
  glow: "--aether-glow",
  buttonGlow: "--aether-button-glow",
  progressGradient: "--aether-progress-gradient",
  text: "--aether-text",
  textMuted: "--aether-text-muted",
} as const;

/** Map resolved tokens to the CSS custom-property name/value pairs. */
export function themeTokensToCssVars(tokens: ThemeTokens): Record<string, string> {
  return {
    [THEME_CSS_VARS.accent]: tokens.accent,
    [THEME_CSS_VARS.accentSecondary]: tokens.accentSecondary,
    [THEME_CSS_VARS.accentSoft]: tokens.accentSoft,
    [THEME_CSS_VARS.background]: tokens.background,
    [THEME_CSS_VARS.panelBackground]: tokens.panelBackground,
    [THEME_CSS_VARS.panelBorder]: tokens.panelBorder,
    [THEME_CSS_VARS.panelGlow]: tokens.panelGlow,
    [THEME_CSS_VARS.glow]: tokens.glow,
    [THEME_CSS_VARS.buttonGlow]: tokens.buttonGlow,
    [THEME_CSS_VARS.progressGradient]: tokens.progressGradient,
    [THEME_CSS_VARS.text]: tokens.text,
    [THEME_CSS_VARS.textMuted]: tokens.textMuted,
  };
}
