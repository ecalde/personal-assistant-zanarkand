import { useMemo, useState } from "react";
import {
  CALENDAR_CATEGORY_KEYS,
  DEFAULT_CATEGORY_COLOR_TOKENS,
  DEFAULT_CATEGORY_LABELS,
  describeColorUsage,
  subcategoryPrefKey,
  type CalendarCategoryKey,
  type CalendarColorPreferences,
  type CalendarColorToken,
} from "../../core/calendarColors";
import { styles } from "../../ui/appStyles";
import { CalendarColorSwatchPicker } from "./CalendarColorSwatchPicker";
import {
  CALENDAR_SETTINGS_EVENT_SUBCATEGORIES,
  CALENDAR_SETTINGS_FITNESS_SUBCATEGORIES,
  calendarPreferencesFormFromPrefs,
  calendarPreferencesPayloadFromForm,
  defaultSubcategoryTokenForForm,
  draftCalendarPreferencesFromForm,
  subcategorySettingsLabel,
  validateCalendarPreferencesForm,
  type CalendarPreferencesFormState,
} from "./calendarPreferencesFormState";

export type CalendarSettingsSectionProps = {
  preferences?: CalendarColorPreferences;
  onSave: (prefs: CalendarColorPreferences | undefined) => void;
};

function resetCategoryRow(categoryKey: CalendarCategoryKey) {
  return {
    colorToken: DEFAULT_CATEGORY_COLOR_TOKENS[categoryKey],
    alias: DEFAULT_CATEGORY_LABELS[categoryKey],
  };
}

export function CalendarSettingsSection({
  preferences,
  onSave,
}: CalendarSettingsSectionProps) {
  const [form, setForm] = useState<CalendarPreferencesFormState>(() =>
    calendarPreferencesFormFromPrefs(preferences)
  );
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const draftPrefs = useMemo(() => draftCalendarPreferencesFromForm(form), [form]);

  function usageForToken(token: CalendarColorToken): string | undefined {
    const label = describeColorUsage(token, draftPrefs);
    return label.length > 0 ? label : undefined;
  }

  function updateCategoryColor(categoryKey: CalendarCategoryKey, token: CalendarColorToken) {
    setSavedNotice(null);
    setForm((current) => ({
      ...current,
      categories: {
        ...current.categories,
        [categoryKey]: { ...current.categories[categoryKey], colorToken: token },
      },
    }));
  }

  function updateCategoryAlias(categoryKey: CalendarCategoryKey, alias: string) {
    setSavedNotice(null);
    setForm((current) => ({
      ...current,
      categories: {
        ...current.categories,
        [categoryKey]: { ...current.categories[categoryKey], alias },
      },
    }));
  }

  function resetCategory(categoryKey: CalendarCategoryKey) {
    setSavedNotice(null);
    setForm((current) => ({
      ...current,
      categories: {
        ...current.categories,
        [categoryKey]: resetCategoryRow(categoryKey),
      },
    }));
  }

  function updateSubcategoryColor(prefKey: string, token: CalendarColorToken) {
    setSavedNotice(null);
    setForm((current) => ({
      ...current,
      subcategories: { ...current.subcategories, [prefKey]: token },
    }));
  }

  function resetSubcategory(categoryKey: CalendarCategoryKey, suffix: string) {
    setSavedNotice(null);
    const prefKey = subcategoryPrefKey(categoryKey, suffix);
    setForm((current) => ({
      ...current,
      subcategories: {
        ...current.subcategories,
        [prefKey]: defaultSubcategoryTokenForForm(prefKey, current),
      },
    }));
  }

  function handleSave() {
    const validationError = validateCalendarPreferencesForm(form);
    if (validationError) {
      setError(validationError);
      setSavedNotice(null);
      return;
    }
    setError(null);
    onSave(calendarPreferencesPayloadFromForm(form));
    setSavedNotice("Calendar color settings saved.");
  }

  function handleResetAll() {
    if (
      !window.confirm(
        "Reset all calendar color settings to defaults? This cannot be undone until you save again."
      )
    ) {
      return;
    }
    setError(null);
    setSavedNotice(null);
    onSave(undefined);
  }

  return (
    <details style={styles.calendarSettingsSection}>
      <summary style={styles.calendarSettingsSummary}>Calendar settings</summary>

      <div style={styles.calendarSettingsBody}>
        <section style={styles.calendarSettingsGroup} aria-label="Category colors and labels">
          <h2 style={styles.calendarSettingsGroupTitle}>Categories</h2>
          {CALENDAR_CATEGORY_KEYS.map((categoryKey) => {
            const row = form.categories[categoryKey];
            const defaultLabel = DEFAULT_CATEGORY_LABELS[categoryKey];
            return (
              <div key={categoryKey} style={styles.calendarSettingsRow}>
                <div style={styles.calendarSettingsRowHeader}>
                  <span style={styles.calendarSettingsRowLabel}>{defaultLabel}</span>
                  <button
                    type="button"
                    onClick={() => resetCategory(categoryKey)}
                    style={{ fontSize: 12 }}
                  >
                    Reset to default
                  </button>
                </div>
                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Display label
                  <input
                    type="text"
                    value={row.alias}
                    placeholder={defaultLabel}
                    maxLength={40}
                    onChange={(event) => updateCategoryAlias(categoryKey, event.target.value)}
                    style={styles.calendarSettingsAliasInput}
                  />
                </label>
                <CalendarColorSwatchPicker
                  value={row.colorToken}
                  onChange={(token) => updateCategoryColor(categoryKey, token)}
                  usageLabel={usageForToken(row.colorToken)}
                  fieldsetLegend={`Color for ${defaultLabel}`}
                />
              </div>
            );
          })}
        </section>

        <section style={styles.calendarSettingsGroup} aria-label="Event subcategory colors">
          <h2 style={styles.calendarSettingsGroupTitle}>Events</h2>
          {CALENDAR_SETTINGS_EVENT_SUBCATEGORIES.map((suffix) => {
            const prefKey = subcategoryPrefKey("event", suffix);
            const token = form.subcategories[prefKey];
            const label = subcategorySettingsLabel(prefKey);
            return (
              <div key={prefKey} style={styles.calendarSettingsRow}>
                <div style={styles.calendarSettingsRowHeader}>
                  <span style={styles.calendarSettingsRowLabel}>{label}</span>
                  <button
                    type="button"
                    onClick={() => resetSubcategory("event", suffix)}
                    style={{ fontSize: 12 }}
                  >
                    Reset to default
                  </button>
                </div>
                <CalendarColorSwatchPicker
                  value={token}
                  onChange={(next) => updateSubcategoryColor(prefKey, next)}
                  usageLabel={usageForToken(token)}
                  fieldsetLegend={`Color for ${label}`}
                />
              </div>
            );
          })}
        </section>

        <section style={styles.calendarSettingsGroup} aria-label="Fitness subcategory colors">
          <h2 style={styles.calendarSettingsGroupTitle}>Fitness</h2>
          {CALENDAR_SETTINGS_FITNESS_SUBCATEGORIES.map((suffix) => {
            const prefKey = subcategoryPrefKey("fitness", suffix);
            const token = form.subcategories[prefKey];
            const label = subcategorySettingsLabel(prefKey);
            return (
              <div key={prefKey} style={styles.calendarSettingsRow}>
                <div style={styles.calendarSettingsRowHeader}>
                  <span style={styles.calendarSettingsRowLabel}>{label}</span>
                  <button
                    type="button"
                    onClick={() => resetSubcategory("fitness", suffix)}
                    style={{ fontSize: 12 }}
                  >
                    Reset to default
                  </button>
                </div>
                <CalendarColorSwatchPicker
                  value={token}
                  onChange={(next) => updateSubcategoryColor(prefKey, next)}
                  usageLabel={usageForToken(token)}
                  fieldsetLegend={`Color for ${label}`}
                />
              </div>
            );
          })}
        </section>

        {error ? (
          <p role="alert" style={{ color: "#b91c1c", margin: 0, fontSize: 13 }}>
            {error}
          </p>
        ) : null}
        {savedNotice ? (
          <p style={{ color: "#15803d", margin: 0, fontSize: 13 }}>{savedNotice}</p>
        ) : null}

        <div style={styles.calendarSettingsActions}>
          <button type="button" onClick={handleSave}>
            Save settings
          </button>
          <button type="button" onClick={handleResetAll}>
            Reset all
          </button>
        </div>
      </div>
    </details>
  );
}
