import {
  CALENDAR_CATEGORY_KEYS,
  DEFAULT_CATEGORY_COLOR_TOKENS,
  getCalendarColorSwatch,
  resolveCalendarItemColorToken,
  resolveCategoryLabel,
  type CalendarCategoryKey,
  type CalendarColorPreferences,
} from "../../core/calendarColors";
import { CALENDAR_EVENT_TYPE_FILTER_LABELS, CALENDAR_EVENT_TYPE_FILTERS } from "../../core/calendarView";
import type { EventType } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type CalendarCategorySidebarProps = {
  hiddenCategories: ReadonlySet<CalendarCategoryKey>;
  hiddenEventSubcategories: ReadonlySet<EventType>;
  onToggleCategory: (category: CalendarCategoryKey) => void;
  onToggleEventSubcategory: (eventType: EventType) => void;
  preferences?: CalendarColorPreferences;
  /** Horizontal bar above the calendar; default vertical stack for the calendar page sidebar. */
  layout?: "horizontal" | "vertical";
};

type FilterToggleProps = {
  label: string;
  hidden: boolean;
  swatchBackground: string;
  onToggle: () => void;
  layout: "horizontal" | "vertical";
};

function FilterToggle({
  label,
  hidden,
  swatchBackground,
  onToggle,
  layout,
}: FilterToggleProps) {
  const isHorizontal = layout === "horizontal";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!hidden}
      aria-label={`${label} (${hidden ? "hidden" : "shown"})`}
      onClick={onToggle}
      style={{
        ...(isHorizontal ? styles.calendarCategoryToggleInline : styles.calendarCategoryToggle),
        ...(hidden ? styles.calendarCategoryToggleHidden : {}),
      }}
    >
      <span
        style={{
          ...styles.calendarCategorySwatch,
          background: swatchBackground,
        }}
        aria-hidden="true"
      />
      <span style={isHorizontal ? undefined : { flex: 1 }}>{label}</span>
      <span aria-hidden="true" style={{ fontSize: 11, ...styles.textDisabled }}>
        {hidden ? "Off" : "On"}
      </span>
    </button>
  );
}

export function CalendarCategorySidebar({
  hiddenCategories,
  hiddenEventSubcategories,
  onToggleCategory,
  onToggleEventSubcategory,
  preferences,
  layout = "vertical",
}: CalendarCategorySidebarProps) {
  const isHorizontal = layout === "horizontal";

  const categoryToggles = CALENDAR_CATEGORY_KEYS.map((category) => {
    const hidden = hiddenCategories.has(category);
    const token =
      resolveCalendarItemColorToken({ categoryKey: category }, preferences) ??
      DEFAULT_CATEGORY_COLOR_TOKENS[category];
    const swatch = getCalendarColorSwatch(token);
    const label = resolveCategoryLabel(category, preferences);

    return (
      <FilterToggle
        key={category}
        label={label}
        hidden={hidden}
        swatchBackground={swatch.background}
        onToggle={() => onToggleCategory(category)}
        layout={layout}
      />
    );
  });

  const eventTypeToggles = CALENDAR_EVENT_TYPE_FILTERS.map((eventType) => {
    const hidden = hiddenEventSubcategories.has(eventType);
    const token = resolveCalendarItemColorToken(
      { categoryKey: "event", subcategoryKey: eventType },
      preferences
    );
    const swatch = getCalendarColorSwatch(token);
    const label = CALENDAR_EVENT_TYPE_FILTER_LABELS[eventType];

    return (
      <FilterToggle
        key={eventType}
        label={label}
        hidden={hidden}
        swatchBackground={swatch.background}
        onToggle={() => onToggleEventSubcategory(eventType)}
        layout={layout}
      />
    );
  });

  if (isHorizontal) {
    return (
      <aside
        style={{ ...styles.calendarCategoryBar, flexDirection: "column", alignItems: "stretch" }}
        aria-label="Calendar filters"
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 13, flexShrink: 0 }}>Categories</div>
          <div style={styles.calendarCategoryToggleRow}>{categoryToggles}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 13, flexShrink: 0 }}>Event types</div>
          <div style={styles.calendarCategoryToggleRow}>{eventTypeToggles}</div>
        </div>
      </aside>
    );
  }

  return (
    <aside style={styles.calendarSidebar} aria-label="Calendar filters">
      <div style={{ fontWeight: 800, fontSize: 13 }}>Categories</div>
      <div style={{ display: "grid", gap: 8 }}>{categoryToggles}</div>
      <div style={{ fontWeight: 800, fontSize: 13, marginTop: 4 }}>Event types</div>
      <div style={{ display: "grid", gap: 8 }}>{eventTypeToggles}</div>
    </aside>
  );
}
