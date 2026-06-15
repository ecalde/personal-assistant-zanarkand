import {
  CALENDAR_CATEGORY_KEYS,
  DEFAULT_CATEGORY_COLOR_TOKENS,
  DEFAULT_CATEGORY_LABELS,
  DEFAULT_SUBCATEGORY_COLOR_TOKENS,
  DEFAULT_SUBCATEGORY_LABELS,
  FALLBACK_COLOR_TOKEN,
  isCalendarCategoryKey,
  isCalendarColorToken,
  resolveCalendarItemColorToken,
  resolveCategoryLabel,
  sanitizeCategoryAlias,
  subcategoryPrefKey,
  type CalendarCategoryKey,
  type CalendarColorPreferences,
  type CalendarColorToken,
} from "../../core/calendarColors";

export const CALENDAR_SETTINGS_EVENT_SUBCATEGORIES = [
  "birthday",
  "meeting",
  "social",
  "travel",
  "medical",
  "hangout",
  "trip",
  "holiday",
  "school",
  "career",
  "work",
  "other",
] as const;

export const CALENDAR_SETTINGS_FITNESS_SUBCATEGORIES = [
  "push",
  "pull",
  "legs",
  "cardio",
  "mobility",
  "full_body",
] as const;

export type CalendarCategoryFormRow = {
  colorToken: CalendarColorToken;
  alias: string;
};

export type CalendarPreferencesFormState = {
  categories: Record<CalendarCategoryKey, CalendarCategoryFormRow>;
  subcategories: Record<string, CalendarColorToken>;
};

function defaultCategoryRow(categoryKey: CalendarCategoryKey): CalendarCategoryFormRow {
  return {
    colorToken: DEFAULT_CATEGORY_COLOR_TOKENS[categoryKey],
    alias: DEFAULT_CATEGORY_LABELS[categoryKey],
  };
}

export function emptyCalendarPreferencesFormState(): CalendarPreferencesFormState {
  const categories = {} as Record<CalendarCategoryKey, CalendarCategoryFormRow>;
  for (const key of CALENDAR_CATEGORY_KEYS) {
    categories[key] = defaultCategoryRow(key);
  }
  return { categories, subcategories: {} };
}

function effectiveSubcategoryToken(
  categoryKey: CalendarCategoryKey,
  subcategoryKey: string,
  prefs?: CalendarColorPreferences
): CalendarColorToken {
  return resolveCalendarItemColorToken(
    { categoryKey, subcategoryKey },
    prefs
  );
}

export function calendarPreferencesFormFromPrefs(
  prefs?: CalendarColorPreferences
): CalendarPreferencesFormState {
  const categories = {} as Record<CalendarCategoryKey, CalendarCategoryFormRow>;
  for (const key of CALENDAR_CATEGORY_KEYS) {
    categories[key] = {
      colorToken: resolveCalendarItemColorToken({ categoryKey: key }, prefs),
      alias: resolveCategoryLabel(key, prefs),
    };
  }

  const subcategories: Record<string, CalendarColorToken> = {};

  for (const suffix of CALENDAR_SETTINGS_EVENT_SUBCATEGORIES) {
    const prefKey = subcategoryPrefKey("event", suffix);
    subcategories[prefKey] = effectiveSubcategoryToken("event", suffix, prefs);
  }

  for (const suffix of CALENDAR_SETTINGS_FITNESS_SUBCATEGORIES) {
    const prefKey = subcategoryPrefKey("fitness", suffix);
    subcategories[prefKey] = effectiveSubcategoryToken("fitness", suffix, prefs);
  }

  for (const [prefKey, token] of Object.entries(prefs?.subcategories ?? {})) {
    if (isCalendarColorToken(token)) {
      subcategories[prefKey] = token;
    }
  }

  return { categories, subcategories };
}

function isDefaultCategoryColor(
  categoryKey: CalendarCategoryKey,
  token: CalendarColorToken
): boolean {
  return token === DEFAULT_CATEGORY_COLOR_TOKENS[categoryKey];
}

function effectiveSubcategoryDefault(
  prefKey: string,
  form: CalendarPreferencesFormState
): CalendarColorToken {
  const explicitDefault = DEFAULT_SUBCATEGORY_COLOR_TOKENS[prefKey];
  if (explicitDefault !== undefined) return explicitDefault;

  const colon = prefKey.indexOf(":");
  if (colon === -1) return FALLBACK_COLOR_TOKEN;
  const categoryKey = prefKey.slice(0, colon) as CalendarCategoryKey;
  if (!isCalendarCategoryKey(categoryKey)) return FALLBACK_COLOR_TOKEN;
  return form.categories[categoryKey].colorToken;
}

function isDefaultSubcategoryColor(
  prefKey: string,
  token: CalendarColorToken,
  form: CalendarPreferencesFormState
): boolean {
  return token === effectiveSubcategoryDefault(prefKey, form);
}

export function calendarPreferencesPayloadFromForm(
  form: CalendarPreferencesFormState
): CalendarColorPreferences | undefined {
  const categories: Partial<Record<CalendarCategoryKey, CalendarColorToken>> = {};
  const aliases: Partial<Record<CalendarCategoryKey, string>> = {};
  const subcategories: Record<string, CalendarColorToken> = {};

  for (const key of CALENDAR_CATEGORY_KEYS) {
    const row = form.categories[key];
    if (!isDefaultCategoryColor(key, row.colorToken)) {
      categories[key] = row.colorToken;
    }
    const alias = sanitizeCategoryAlias(row.alias);
    if (alias !== undefined && alias !== DEFAULT_CATEGORY_LABELS[key]) {
      aliases[key] = alias;
    }
  }

  for (const [prefKey, token] of Object.entries(form.subcategories)) {
    if (!isDefaultSubcategoryColor(prefKey, token, form)) {
      subcategories[prefKey] = token;
    }
  }

  const prefs: CalendarColorPreferences = {};
  if (Object.keys(categories).length > 0) prefs.categories = categories;
  if (Object.keys(subcategories).length > 0) prefs.subcategories = subcategories;
  if (Object.keys(aliases).length > 0) prefs.aliases = aliases;

  return isCalendarPreferencesEmpty(prefs) ? undefined : prefs;
}

export function isCalendarPreferencesEmpty(prefs: CalendarColorPreferences): boolean {
  const hasCategories = prefs.categories && Object.keys(prefs.categories).length > 0;
  const hasSubcategories =
    prefs.subcategories && Object.keys(prefs.subcategories).length > 0;
  const hasAliases = prefs.aliases && Object.keys(prefs.aliases).length > 0;
  return !hasCategories && !hasSubcategories && !hasAliases;
}

export function validateCalendarPreferencesForm(
  form: CalendarPreferencesFormState
): string | null {
  for (const key of CALENDAR_CATEGORY_KEYS) {
    const row = form.categories[key];
    if (!isCalendarColorToken(row.colorToken)) {
      return `Invalid color for ${DEFAULT_CATEGORY_LABELS[key]}.`;
    }
    if (row.alias.trim().length > 0 && sanitizeCategoryAlias(row.alias) === undefined) {
      return `Display label for ${DEFAULT_CATEGORY_LABELS[key]} is invalid.`;
    }
  }

  for (const [prefKey, token] of Object.entries(form.subcategories)) {
    if (!isCalendarColorToken(token)) {
      const label = DEFAULT_SUBCATEGORY_LABELS[prefKey] ?? prefKey;
      return `Invalid color for ${label}.`;
    }
  }

  return null;
}

/** Builds draft prefs from form for live "used by" labeling while editing. */
export function draftCalendarPreferencesFromForm(
  form: CalendarPreferencesFormState
): CalendarColorPreferences {
  return calendarPreferencesPayloadFromForm(form) ?? {};
}

export function defaultSubcategoryTokenForForm(
  prefKey: string,
  form: CalendarPreferencesFormState
): CalendarColorToken {
  return effectiveSubcategoryDefault(prefKey, form);
}

export function subcategorySettingsLabel(prefKey: string): string {
  return DEFAULT_SUBCATEGORY_LABELS[prefKey] ?? prefKey;
}
