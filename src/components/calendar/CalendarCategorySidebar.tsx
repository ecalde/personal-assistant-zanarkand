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
  /** Horizontal bar above the calendar; default vertical stack for the calendar page sidebar. */
  layout?: "horizontal" | "vertical";
};

export function CalendarCategorySidebar({
  hiddenCategories,
  onToggleCategory,
  preferences,
  layout = "vertical",
}: CalendarCategorySidebarProps) {
  const isHorizontal = layout === "horizontal";

  const toggles = CALENDAR_CATEGORY_KEYS.map((category) => {
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
          ...(isHorizontal ? styles.calendarCategoryToggleInline : styles.calendarCategoryToggle),
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
        <span style={isHorizontal ? undefined : { flex: 1 }}>{label}</span>
        <span aria-hidden="true" style={{ fontSize: 11, opacity: 0.7 }}>
          {hidden ? "Off" : "On"}
        </span>
      </button>
    );
  });

  if (isHorizontal) {
    return (
      <aside style={styles.calendarCategoryBar} aria-label="Calendar category filters">
        <div style={{ fontWeight: 800, fontSize: 13, flexShrink: 0 }}>Categories</div>
        <div style={styles.calendarCategoryToggleRow}>{toggles}</div>
      </aside>
    );
  }

  return (
    <aside style={styles.calendarSidebar} aria-label="Calendar category filters">
      <div style={{ fontWeight: 800, fontSize: 13 }}>Categories</div>
      <div style={{ display: "grid", gap: 8 }}>{toggles}</div>
    </aside>
  );
}
