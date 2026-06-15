// Pure calendar color/category preference resolution (no React, storage, or Supabase).
//
// Resolves a display color for a calendar item using a fixed, predefined palette
// (base hues + soft/base/strong variants) and an optional user preference object.
// Resolution precedence is: item override > subcategory > category > built-in default
// > neutral fallback. The module is total (never throws) and never mutates inputs.
//
// CalendarColorPreferences is persisted per user (AppPayload.calendarPreferences +
// calendar_preferences Supabase table). This module stays pure — resolution only;
// storage and UI wiring live elsewhere. CalendarItem is unchanged — colorKey is the
// per-item override hook.

export type CalendarCategoryKey =
  | "skill"
  | "event"
  | "people"
  | "fitness"
  | "career";

export type CalendarPaletteHue =
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "teal"
  | "cyan"
  | "blue"
  | "indigo"
  | "violet"
  | "pink"
  | "slate";

// Hue variants keep the picker constrained instead of offering a full color wheel.
export type CalendarHueVariant = "soft" | "base" | "strong";

export type CalendarColorToken = `${CalendarPaletteHue}.${CalendarHueVariant}`;

export type CalendarColorSwatch = {
  token: CalendarColorToken;
  hue: CalendarPaletteHue;
  variant: CalendarHueVariant;
  label: string;
  background: string;
  foreground: string;
  border: string;
};

// Future per-user singleton shape (kept minimal and JSON-serializable). The icon maps
// are reserved for a later phase and are not resolved here.
export type CalendarColorPreferences = {
  categories?: Partial<Record<CalendarCategoryKey, CalendarColorToken>>;
  // Keyed by "category:subcategory", e.g. "event:birthday".
  subcategories?: Record<string, CalendarColorToken>;
  // Display label override; never changes navigation tab names or categoryKey.
  aliases?: Partial<Record<CalendarCategoryKey, string>>;
  // Reserved for the future icon phase:
  // categoryIcons?: Partial<Record<CalendarCategoryKey, string>>;
  // subcategoryIcons?: Record<string, string>;
};

// Structural subset of CalendarItem so this module stays decoupled from calendar.ts.
// A CalendarItem is assignable to this type.
export type CalendarColorResolutionInput = {
  categoryKey: string;
  subcategoryKey?: string;
  colorKey?: string;
};

export type CalendarColorUsage = {
  scope: "category" | "subcategory";
  key: string;
  label: string;
};

const ALIAS_MAX_LENGTH = 40;

export const CALENDAR_CATEGORY_KEYS: readonly CalendarCategoryKey[] = [
  "skill",
  "event",
  "people",
  "fitness",
  "career",
];

const HUE_VARIANTS: readonly CalendarHueVariant[] = ["soft", "base", "strong"];

const HUE_LABELS: Record<CalendarPaletteHue, string> = {
  red: "Red",
  orange: "Orange",
  amber: "Amber",
  yellow: "Yellow",
  lime: "Lime",
  green: "Green",
  teal: "Teal",
  cyan: "Cyan",
  blue: "Blue",
  indigo: "Indigo",
  violet: "Violet",
  pink: "Pink",
  slate: "Slate",
};

// Per-hue background shades (soft = light, base = mid, strong = dark). Foreground and
// border are derived so only these anchor values are maintained by hand.
const HUE_SHADES: Record<
  CalendarPaletteHue,
  Record<CalendarHueVariant, string>
> = {
  red: { soft: "#fee2e2", base: "#ef4444", strong: "#b91c1c" },
  orange: { soft: "#ffedd5", base: "#f97316", strong: "#c2410c" },
  amber: { soft: "#fef3c7", base: "#f59e0b", strong: "#b45309" },
  yellow: { soft: "#fef9c3", base: "#eab308", strong: "#a16207" },
  lime: { soft: "#ecfccb", base: "#84cc16", strong: "#4d7c0f" },
  green: { soft: "#dcfce7", base: "#22c55e", strong: "#15803d" },
  teal: { soft: "#ccfbf1", base: "#14b8a6", strong: "#0f766e" },
  cyan: { soft: "#cffafe", base: "#06b6d4", strong: "#0e7490" },
  blue: { soft: "#dbeafe", base: "#3b82f6", strong: "#1d4ed8" },
  indigo: { soft: "#e0e7ff", base: "#6366f1", strong: "#4338ca" },
  violet: { soft: "#ede9fe", base: "#8b5cf6", strong: "#6d28d9" },
  pink: { soft: "#fce7f3", base: "#ec4899", strong: "#be185d" },
  slate: { soft: "#e2e8f0", base: "#64748b", strong: "#334155" },
};

const DARK_TEXT = "#111827";
const LIGHT_TEXT = "#ffffff";

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return [r, g, b];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// Choose the on-color text with the higher contrast ratio (accessibility).
function pickForeground(background: string): string {
  return contrastRatio(background, DARK_TEXT) >=
    contrastRatio(background, LIGHT_TEXT)
    ? DARK_TEXT
    : LIGHT_TEXT;
}

function variantLabel(hue: CalendarPaletteHue, variant: CalendarHueVariant): string {
  const hueLabel = HUE_LABELS[hue];
  if (variant === "base") return hueLabel;
  if (variant === "soft") return `Soft ${hueLabel}`;
  return `Strong ${hueLabel}`;
}

// Border uses the next-darker shade of the same hue for a coherent outline.
function borderShade(
  hue: CalendarPaletteHue,
  variant: CalendarHueVariant
): string {
  if (variant === "soft") return HUE_SHADES[hue].base;
  return HUE_SHADES[hue].strong;
}

function buildPalette(): CalendarColorSwatch[] {
  const swatches: CalendarColorSwatch[] = [];
  for (const hue of Object.keys(HUE_SHADES) as CalendarPaletteHue[]) {
    for (const variant of HUE_VARIANTS) {
      const background = HUE_SHADES[hue][variant];
      swatches.push({
        token: `${hue}.${variant}` as CalendarColorToken,
        hue,
        variant,
        label: variantLabel(hue, variant),
        background,
        foreground: pickForeground(background),
        border: borderShade(hue, variant),
      });
    }
  }
  return swatches;
}

export const CALENDAR_PALETTE: readonly CalendarColorSwatch[] = Object.freeze(
  buildPalette().map((swatch) => Object.freeze(swatch))
);

export const CALENDAR_PALETTE_BY_TOKEN: ReadonlyMap<
  CalendarColorToken,
  CalendarColorSwatch
> = new Map(CALENDAR_PALETTE.map((swatch) => [swatch.token, swatch]));

export const FALLBACK_COLOR_TOKEN: CalendarColorToken = "slate.base";

export const DEFAULT_CATEGORY_COLOR_TOKENS: Record<
  CalendarCategoryKey,
  CalendarColorToken
> = {
  skill: "indigo.base",
  event: "red.base",
  people: "pink.base",
  fitness: "green.base",
  career: "violet.base",
};

// Sparse: unset subcategories intentionally inherit their category color.
export const DEFAULT_SUBCATEGORY_COLOR_TOKENS: Record<string, CalendarColorToken> = {
  "event:birthday": "amber.base",
};

export const DEFAULT_CATEGORY_LABELS: Record<CalendarCategoryKey, string> = {
  skill: "Skills",
  event: "Events",
  people: "People",
  fitness: "Fitness",
  career: "Career",
};

// Readable labels for the supported subcategory keys (used for "color used by" copy).
export const DEFAULT_SUBCATEGORY_LABELS: Record<string, string> = {
  "event:birthday": "Birthdays",
  "event:meeting": "Meetings",
  "event:social": "Social",
  "event:travel": "Travel",
  "event:medical": "Medical",
  "event:hangout": "Hangouts",
  "event:trip": "Trips",
  "event:holiday": "Holidays",
  "event:school": "School",
  "event:career": "Career",
  "event:work": "Work",
  "event:other": "Other events",
  "career:screening": "Screening interviews",
  "career:technical": "Technical interviews",
  "career:onsite": "Onsite interviews",
  "fitness:push": "Push workouts",
  "fitness:pull": "Pull workouts",
  "fitness:legs": "Legs workouts",
  "fitness:cardio": "Cardio",
  "fitness:mobility": "Mobility",
  "fitness:full_body": "Full body workouts",
  "skill:scheduleBlock": "Schedule blocks",
};

// Stable ordering for usage indexing and "used by" descriptions.
const SUBCATEGORY_USAGE_ORDER: readonly string[] = [
  "event:birthday",
  "event:meeting",
  "event:social",
  "event:travel",
  "event:medical",
  "event:hangout",
  "event:trip",
  "event:holiday",
  "event:school",
  "event:career",
  "event:work",
  "event:other",
  "career:screening",
  "career:technical",
  "career:onsite",
  "fitness:push",
  "fitness:pull",
  "fitness:legs",
  "fitness:cardio",
  "fitness:mobility",
  "fitness:full_body",
  "skill:scheduleBlock",
];

export function isCalendarColorToken(value: unknown): value is CalendarColorToken {
  return typeof value === "string" && CALENDAR_PALETTE_BY_TOKEN.has(value as CalendarColorToken);
}

export function isCalendarCategoryKey(value: unknown): value is CalendarCategoryKey {
  return (
    typeof value === "string" &&
    (CALENDAR_CATEGORY_KEYS as readonly string[]).includes(value)
  );
}

export function subcategoryPrefKey(
  categoryKey: string,
  subcategoryKey: string
): string {
  return `${categoryKey}:${subcategoryKey}`;
}

export function getCalendarColorSwatch(
  token: CalendarColorToken
): CalendarColorSwatch {
  return CALENDAR_PALETTE_BY_TOKEN.get(token) ?? CALENDAR_PALETTE_BY_TOKEN.get(FALLBACK_COLOR_TOKEN)!;
}

function readValidToken(value: unknown): CalendarColorToken | undefined {
  return isCalendarColorToken(value) ? value : undefined;
}

/**
 * Resolves the color token for a calendar item.
 * Precedence: item override > subcategory > category > fallback.
 * Unknown/invalid tokens at any step are ignored so resolution always falls through
 * to a valid token. Never throws; never mutates `prefs`.
 */
export function resolveCalendarItemColorToken(
  input: CalendarColorResolutionInput,
  prefs?: CalendarColorPreferences
): CalendarColorToken {
  const override = readValidToken(input.colorKey);
  if (override) return override;

  if (input.subcategoryKey !== undefined && input.subcategoryKey.length > 0) {
    const key = subcategoryPrefKey(input.categoryKey, input.subcategoryKey);
    const fromPrefs = readValidToken(prefs?.subcategories?.[key]);
    if (fromPrefs) return fromPrefs;
    if (input.categoryKey === "event" && input.subcategoryKey === "school") {
      const legacyDeadline = readValidToken(prefs?.subcategories?.["event:deadline"]);
      if (legacyDeadline) return legacyDeadline;
    }
    const fromDefault = readValidToken(DEFAULT_SUBCATEGORY_COLOR_TOKENS[key]);
    if (fromDefault) return fromDefault;
  }

  if (isCalendarCategoryKey(input.categoryKey)) {
    const fromPrefs = readValidToken(prefs?.categories?.[input.categoryKey]);
    if (fromPrefs) return fromPrefs;
    const fromDefault = readValidToken(
      DEFAULT_CATEGORY_COLOR_TOKENS[input.categoryKey]
    );
    if (fromDefault) return fromDefault;
  }

  return FALLBACK_COLOR_TOKEN;
}

/** Resolves a calendar item to its full palette swatch. */
export function resolveCalendarItemColor(
  input: CalendarColorResolutionInput,
  prefs?: CalendarColorPreferences
): CalendarColorSwatch {
  return getCalendarColorSwatch(resolveCalendarItemColorToken(input, prefs));
}

/**
 * Normalizes a user-supplied category display alias: trims, collapses internal
 * whitespace, strips control characters, and caps length. Returns undefined when the
 * result is empty (treat as "no alias").
 */
export function sanitizeCategoryAlias(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  // Collapse whitespace (incl. tabs/newlines) first, then strip remaining control chars.
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/\s+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (cleaned.length === 0) return undefined;
  return cleaned.slice(0, ALIAS_MAX_LENGTH);
}

/**
 * Resolves the display label for a category. A sanitized alias wins; otherwise the
 * built-in default label is used. Never changes `categoryKey` or navigation tab names.
 */
export function resolveCategoryLabel(
  categoryKey: string,
  prefs?: CalendarColorPreferences
): string {
  if (isCalendarCategoryKey(categoryKey)) {
    const alias = sanitizeCategoryAlias(prefs?.aliases?.[categoryKey]);
    if (alias) return alias;
    return DEFAULT_CATEGORY_LABELS[categoryKey];
  }
  return categoryKey;
}

function subcategoryLabel(key: string): string {
  return DEFAULT_SUBCATEGORY_LABELS[key] ?? key;
}

/**
 * Builds a reverse index from color token to the assignments using it, merging
 * built-in defaults with preference overrides. Reuse is allowed (never deduped or
 * blocked): a token shared by several categories/subcategories simply lists them all.
 */
export function buildColorUsageIndex(
  prefs?: CalendarColorPreferences
): Map<CalendarColorToken, CalendarColorUsage[]> {
  const index = new Map<CalendarColorToken, CalendarColorUsage[]>();

  const add = (token: CalendarColorToken, usage: CalendarColorUsage) => {
    const existing = index.get(token);
    if (existing) {
      existing.push(usage);
    } else {
      index.set(token, [usage]);
    }
  };

  for (const categoryKey of CALENDAR_CATEGORY_KEYS) {
    const token =
      readValidToken(prefs?.categories?.[categoryKey]) ??
      DEFAULT_CATEGORY_COLOR_TOKENS[categoryKey];
    add(token, {
      scope: "category",
      key: categoryKey,
      label: resolveCategoryLabel(categoryKey, prefs),
    });
  }

  const subcategoryKeys: string[] = [...SUBCATEGORY_USAGE_ORDER];
  for (const key of Object.keys(prefs?.subcategories ?? {})) {
    if (!subcategoryKeys.includes(key)) subcategoryKeys.push(key);
  }

  for (const key of subcategoryKeys) {
    const token =
      readValidToken(prefs?.subcategories?.[key]) ??
      readValidToken(DEFAULT_SUBCATEGORY_COLOR_TOKENS[key]);
    if (!token) continue;
    add(token, { scope: "subcategory", key, label: subcategoryLabel(key) });
  }

  return index;
}

/**
 * Human-readable summary of everything a color token is assigned to, e.g.
 * "Skills, Events". Returns an empty string when the token is unused.
 */
export function describeColorUsage(
  token: CalendarColorToken,
  prefs?: CalendarColorPreferences
): string {
  const usages = buildColorUsageIndex(prefs).get(token);
  if (!usages || usages.length === 0) return "";
  return usages.map((usage) => usage.label).join(", ");
}
