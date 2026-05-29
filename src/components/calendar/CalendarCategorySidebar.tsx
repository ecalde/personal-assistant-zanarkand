import {
  CALENDAR_CATEGORY_KEYS,
  DEFAULT_CATEGORY_COLOR_TOKENS,
  getCalendarColorSwatch,
  resolveCalendarItemColorToken,
  resolveCategoryLabel,
  type CalendarCategoryKey,
  type CalendarColorPreferences,
} from "../../core/calendarColors";
import { styles } from "../../ui/appStyles";

export type CalendarCategorySidebarProps = {
  hiddenCategories: ReadonlySet<CalendarCategoryKey>;
  onToggleCategory: (category: CalendarCategoryKey) => void;
  preferences?: CalendarColorPreferences;
};

export function CalendarCategorySidebar({
  hiddenCategories,
  onToggleCategory,
  preferences,
}: CalendarCategorySidebarProps) {
  return (
    <aside style={styles.calendarSidebar} aria-label="Calendar category filters">
      <div style={{ fontWeight: 800, fontSize: 13 }}>Categories</div>
      {CALENDAR_CATEGORY_KEYS.map((category) => {
        const hidden = hiddenCategories.has(category);
        const token =
          resolveCalendarItemColorToken({ categoryKey: category }, preferences) ??
          DEFAULT_CATEGORY_COLOR_TOKENS[category];
        const swatch = getCalendarColorSwatch(token);
        const label = resolveCategoryLabel(category, preferences);

        return (
          <button
            key={category}
            type="button"
            role="switch"
            aria-checked={!hidden}
            aria-label={`${label} (${hidden ? "hidden" : "shown"})`}
            onClick={() => onToggleCategory(category)}
            style={{
              ...styles.calendarCategoryToggle,
              ...(hidden ? styles.calendarCategoryToggleHidden : {}),
            }}
          >
            <span
              style={{
                ...styles.calendarCategorySwatch,
                background: swatch.background,
              }}
              aria-hidden="true"
            />
            <span style={{ flex: 1 }}>{label}</span>
            <span aria-hidden="true" style={{ fontSize: 11, opacity: 0.7 }}>
              {hidden ? "Off" : "On"}
            </span>
          </button>
        );
      })}
      <p style={{ ...styles.helpText, marginTop: 4 }}>
        Toggling only changes what is shown. Nothing is saved.
      </p>
    </aside>
  );
}
