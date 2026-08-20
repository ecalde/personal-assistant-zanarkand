import type { ReactNode } from "react";
import {
  CALENDAR_CATEGORY_KEYS,
  DEFAULT_CATEGORY_COLOR_TOKENS,
  getCalendarColorSwatch,
  resolveCalendarItemColorToken,
  resolveCategoryLabel,
  type CalendarCategoryKey,
  type CalendarColorPreferences,
} from "../../core/calendarColors";
import {
  CALENDAR_EVENT_TYPE_FILTER_LABELS,
  CALENDAR_EVENT_TYPE_FILTERS,
  CALENDAR_FITNESS_TYPE_FILTER_LABELS,
  CALENDAR_FITNESS_TYPE_FILTERS,
  CALENDAR_COOKING_TYPE_FILTER_LABELS,
  CALENDAR_COOKING_TYPE_FILTERS,
  type CalendarCookingTypeFilter,
} from "../../core/calendarView";
import type { EventType, FitnessType } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type CalendarCategorySidebarProps = {
  hiddenCategories: ReadonlySet<CalendarCategoryKey>;
  hiddenEventSubcategories: ReadonlySet<EventType>;
  hiddenFitnessTypes: ReadonlySet<FitnessType>;
  hiddenCookingTypes: ReadonlySet<CalendarCookingTypeFilter>;
  onToggleCategory: (category: CalendarCategoryKey) => void;
  onToggleEventSubcategory: (eventType: EventType) => void;
  onToggleFitnessType: (fitnessType: FitnessType) => void;
  onToggleCookingType: (cookingType: CalendarCookingTypeFilter) => void;
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
          ...(isHorizontal ? { width: 8, height: 8, borderRadius: 99 } : {}),
          background: swatchBackground,
        }}
        aria-hidden="true"
      />
      <span style={isHorizontal ? undefined : { flex: 1 }}>{label}</span>
      {isHorizontal ? null : (
        <span aria-hidden="true" style={{ fontSize: 11, ...styles.textDisabled }}>
          {hidden ? "Off" : "On"}
        </span>
      )}
    </button>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={styles.calendarCategoryGroup}>
      <div style={styles.calendarCategoryGroupLabel}>{label}</div>
      {children}
    </div>
  );
}

export function CalendarCategorySidebar({
  hiddenCategories,
  hiddenEventSubcategories,
  hiddenFitnessTypes,
  hiddenCookingTypes,
  onToggleCategory,
  onToggleEventSubcategory,
  onToggleFitnessType,
  onToggleCookingType,
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

  const fitnessTypeToggles = CALENDAR_FITNESS_TYPE_FILTERS.map((fitnessType) => {
    const hidden = hiddenFitnessTypes.has(fitnessType);
    const token = resolveCalendarItemColorToken(
      { categoryKey: "fitness", subcategoryKey: fitnessType },
      preferences
    );
    const swatch = getCalendarColorSwatch(token);
    const label = CALENDAR_FITNESS_TYPE_FILTER_LABELS[fitnessType];

    return (
      <FilterToggle
        key={fitnessType}
        label={label}
        hidden={hidden}
        swatchBackground={swatch.background}
        onToggle={() => onToggleFitnessType(fitnessType)}
        layout={layout}
      />
    );
  });

  const cookingTypeToggles = CALENDAR_COOKING_TYPE_FILTERS.map((cookingType) => {
    const hidden = hiddenCookingTypes.has(cookingType);
    const token = resolveCalendarItemColorToken(
      { categoryKey: "cooking", subcategoryKey: cookingType },
      preferences
    );
    const swatch = getCalendarColorSwatch(token);
    const label = CALENDAR_COOKING_TYPE_FILTER_LABELS[cookingType];

    return (
      <FilterToggle
        key={cookingType}
        label={label}
        hidden={hidden}
        swatchBackground={swatch.background}
        onToggle={() => onToggleCookingType(cookingType)}
        layout={layout}
      />
    );
  });

  if (isHorizontal) {
    return (
      <aside style={styles.calendarCategoryBar} aria-label="Calendar filters">
        <FilterGroup label="Categories">{categoryToggles}</FilterGroup>
        <FilterGroup label="Event types">{eventTypeToggles}</FilterGroup>
        <FilterGroup label="Fitness types">{fitnessTypeToggles}</FilterGroup>
        <FilterGroup label="Cooking types">{cookingTypeToggles}</FilterGroup>
      </aside>
    );
  }

  return (
    <aside style={styles.calendarSidebar} aria-label="Calendar filters">
      <div style={{ fontWeight: 800, fontSize: 13 }}>Categories</div>
      <div style={{ display: "grid", gap: 8 }}>{categoryToggles}</div>
      <div style={{ fontWeight: 800, fontSize: 13, marginTop: 4 }}>Event types</div>
      <div style={{ display: "grid", gap: 8 }}>{eventTypeToggles}</div>
      <div style={{ fontWeight: 800, fontSize: 13, marginTop: 4 }}>Fitness types</div>
      <div style={{ display: "grid", gap: 8 }}>{fitnessTypeToggles}</div>
      <div style={{ fontWeight: 800, fontSize: 13, marginTop: 4 }}>Cooking types</div>
      <div style={{ display: "grid", gap: 8 }}>{cookingTypeToggles}</div>
    </aside>
  );
}
