import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CALENDAR_CATEGORY_KEYS,
  DEFAULT_CATEGORY_COLOR_TOKENS,
  DEFAULT_CATEGORY_LABELS,
  describeColorUsage,
  getCalendarColorSwatch,
  subcategoryPrefKey,
  type CalendarCategoryKey,
  type CalendarColorPreferences,
  type CalendarColorToken,
} from "../../core/calendarColors";
import { styles } from "../../ui/appStyles";
import { CalendarColorSwatchPicker } from "./CalendarColorSwatchPicker";
import {
  CALENDAR_SETTINGS_CAREER_SUBCATEGORIES,
  CALENDAR_SETTINGS_EVENT_SUBCATEGORIES,
  CALENDAR_SETTINGS_FITNESS_SUBCATEGORIES,
  CALENDAR_SETTINGS_SECTIONS,
  calendarPreferencesFormFromPrefs,
  calendarPreferencesPayloadFromForm,
  defaultSubcategoryTokenForForm,
  draftCalendarPreferencesFromForm,
  subcategorySettingsLabel,
  validateCalendarPreferencesForm,
  type CalendarPreferencesFormState,
  type CalendarSettingsSectionKey,
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

type SettingsRowProps = {
  label: string;
  token: CalendarColorToken;
  usageLabel?: string;
  onColorChange: (token: CalendarColorToken) => void;
  onReset: () => void;
  colorAriaLabel: string;
  children?: ReactNode;
};

function SettingsRow({
  label,
  token,
  usageLabel,
  onColorChange,
  onReset,
  colorAriaLabel,
  children,
}: SettingsRowProps) {
  const swatch = getCalendarColorSwatch(token);

  return (
    <div style={styles.calendarSettingsCompactRow}>
      <span
        style={{
          ...styles.calendarSettingsRowSwatchDot,
          background: swatch.background,
          borderColor: swatch.border,
        }}
        aria-hidden="true"
      />
      <div style={styles.calendarSettingsCompactRowMain}>
        <span style={styles.calendarSettingsRowLabel}>{label}</span>
        {children}
      </div>
      <CalendarColorSwatchPicker
        value={token}
        onChange={onColorChange}
        usageLabel={usageLabel}
        ariaLabel={colorAriaLabel}
      />
      <button type="button" onClick={onReset} style={styles.calendarSettingsResetBtn} title="Reset to default">
        ↺
      </button>
    </div>
  );
}

export function CalendarSettingsSection({
  preferences,
  onSave,
}: CalendarSettingsSectionProps) {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] =
    useState<CalendarSettingsSectionKey>("categories");
  const [form, setForm] = useState<CalendarPreferencesFormState>(() =>
    calendarPreferencesFormFromPrefs(preferences)
  );
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const draftPrefs = useMemo(() => draftCalendarPreferencesFromForm(form), [form]);
  const activeMeta = CALENDAR_SETTINGS_SECTIONS.find((section) => section.key === activeSection)!;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

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
    setForm(calendarPreferencesFormFromPrefs(undefined));
    onSave(undefined);
  }

  function renderSectionContent() {
    if (activeSection === "categories") {
      return CALENDAR_CATEGORY_KEYS.map((categoryKey) => {
        const row = form.categories[categoryKey];
        const defaultLabel = DEFAULT_CATEGORY_LABELS[categoryKey];
        return (
          <SettingsRow
            key={categoryKey}
            label={defaultLabel}
            token={row.colorToken}
            usageLabel={usageForToken(row.colorToken)}
            onColorChange={(token) => updateCategoryColor(categoryKey, token)}
            onReset={() => resetCategory(categoryKey)}
            colorAriaLabel={`Color for ${defaultLabel}`}
          >
            <input
              type="text"
              value={row.alias}
              placeholder={`Display label (${defaultLabel})`}
              maxLength={40}
              onChange={(event) => updateCategoryAlias(categoryKey, event.target.value)}
              style={styles.calendarSettingsInlineAlias}
            />
          </SettingsRow>
        );
      });
    }

    if (activeSection === "events") {
      return CALENDAR_SETTINGS_EVENT_SUBCATEGORIES.map((suffix) => {
        const prefKey = subcategoryPrefKey("event", suffix);
        const token = form.subcategories[prefKey];
        const label = subcategorySettingsLabel(prefKey);
        return (
          <SettingsRow
            key={prefKey}
            label={label}
            token={token}
            usageLabel={usageForToken(token)}
            onColorChange={(next) => updateSubcategoryColor(prefKey, next)}
            onReset={() => resetSubcategory("event", suffix)}
            colorAriaLabel={`Color for ${label}`}
          />
        );
      });
    }

    if (activeSection === "fitness") {
      return CALENDAR_SETTINGS_FITNESS_SUBCATEGORIES.map((suffix) => {
        const prefKey = subcategoryPrefKey("fitness", suffix);
        const token = form.subcategories[prefKey];
        const label = subcategorySettingsLabel(prefKey);
        return (
          <SettingsRow
            key={prefKey}
            label={label}
            token={token}
            usageLabel={usageForToken(token)}
            onColorChange={(next) => updateSubcategoryColor(prefKey, next)}
            onReset={() => resetSubcategory("fitness", suffix)}
            colorAriaLabel={`Color for ${label}`}
          />
        );
      });
    }

    return CALENDAR_SETTINGS_CAREER_SUBCATEGORIES.map((suffix) => {
      const prefKey = subcategoryPrefKey("career", suffix);
      const token = form.subcategories[prefKey];
      const label = subcategorySettingsLabel(prefKey);
      return (
        <SettingsRow
          key={prefKey}
          label={label}
          token={token}
          usageLabel={usageForToken(token)}
          onColorChange={(next) => updateSubcategoryColor(prefKey, next)}
          onReset={() => resetSubcategory("career", suffix)}
          colorAriaLabel={`Color for ${label}`}
        />
      );
    });
  }

  return (
    <>
      <button
        type="button"
        style={styles.calendarSettingsOpenBtn}
        onClick={() => {
          setOpen(true);
          setError(null);
          setSavedNotice(null);
        }}
      >
        Calendar settings
      </button>

      {open ? (
        <div
          style={styles.calendarModalOverlay}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            style={styles.calendarSettingsModalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={styles.calendarSettingsModalHeader}>
              <div>
                <h2 id="calendar-settings-title" style={styles.calendarSettingsModalTitle}>
                  Calendar settings
                </h2>
                <p style={styles.calendarSettingsModalSubtitle}>
                  Customize colors and category labels. Click a color to pick from the palette.
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                style={styles.calendarSettingsCloseBtn}
                onClick={() => setOpen(false)}
                aria-label="Close calendar settings"
              >
                ✕
              </button>
            </div>

            <div style={styles.calendarSettingsModalBody}>
              <nav style={styles.calendarSettingsNav} aria-label="Settings sections">
                {CALENDAR_SETTINGS_SECTIONS.map((section) => {
                  const active = section.key === activeSection;
                  return (
                    <button
                      key={section.key}
                      type="button"
                      aria-current={active ? "true" : undefined}
                      style={{
                        ...styles.calendarSettingsNavTab,
                        ...(active ? styles.calendarSettingsNavTabActive : {}),
                      }}
                      onClick={() => setActiveSection(section.key)}
                    >
                      {section.label}
                    </button>
                  );
                })}
              </nav>

              <div style={styles.calendarSettingsPanel}>
                <div style={styles.calendarSettingsPanelHeader}>
                  <h3 style={styles.calendarSettingsPanelTitle}>{activeMeta.label}</h3>
                  <p style={styles.calendarSettingsPanelDescription}>{activeMeta.description}</p>
                </div>
                <div style={styles.calendarSettingsPanelList}>{renderSectionContent()}</div>
              </div>
            </div>

            {error ? (
              <p
                role="alert"
                style={{
                  ...styles.textMuted,
                  color: "var(--aether-chip-danger-text, #8a1c1c)",
                  margin: 0,
                  fontSize: 13,
                }}
              >
                {error}
              </p>
            ) : null}
            {savedNotice ? (
              <p
                style={{
                  color: "var(--aether-chip-success-text, #1b5e20)",
                  margin: 0,
                  fontSize: 13,
                }}
              >
                {savedNotice}
              </p>
            ) : null}

            <div style={styles.calendarSettingsActions}>
              <button type="button" onClick={handleSave}>
                Save settings
              </button>
              <button type="button" onClick={handleResetAll}>
                Reset all
              </button>
              <button type="button" style={styles.ghostBtn} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
