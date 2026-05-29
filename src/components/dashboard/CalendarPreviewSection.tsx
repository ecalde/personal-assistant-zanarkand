import { useMemo } from "react";
import {
  buildCalendarItemsForRange,
  groupCalendarItemsByDate,
} from "../../core/calendar";
import {
  resolveCalendarItemColor,
  type CalendarColorPreferences,
} from "../../core/calendarColors";
import { formatItemTimeLabel } from "../../core/calendarView";
import { formatLocalDateKey, iterateDateRange } from "../../core/timeline";
import type { LifeEvent, Person, Skill, WorkoutPlan, WorkoutSession } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type CalendarPreviewSectionProps = {
  skills: Skill[];
  events: LifeEvent[];
  people: Person[];
  workoutSessions: WorkoutSession[];
  workoutPlans: WorkoutPlan[];
  todayKey: string;
  calendarPreferences?: CalendarColorPreferences;
  onOpenCalendar?: () => void;
};

const PREVIEW_DAYS = 7;
const MAX_ITEMS_PER_DAY = 3;

function formatDayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "Today";
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function CalendarPreviewSection({
  skills,
  events,
  people,
  workoutSessions,
  workoutPlans,
  todayKey,
  calendarPreferences,
  onOpenCalendar,
}: CalendarPreviewSectionProps) {
  const endKey = useMemo(() => {
    const date = new Date(
      Number(todayKey.slice(0, 4)),
      Number(todayKey.slice(5, 7)) - 1,
      Number(todayKey.slice(8, 10))
    );
    date.setDate(date.getDate() + PREVIEW_DAYS - 1);
    return formatLocalDateKey(date);
  }, [todayKey]);

  const itemsByDate = useMemo(() => {
    const items = buildCalendarItemsForRange(
      {
        startDate: todayKey,
        endDate: endKey,
        skills,
        events,
        people,
        workoutSessions,
        workoutPlans,
      },
      { includeFitnessHistory: true }
    );
    return groupCalendarItemsByDate(items);
  }, [todayKey, endKey, skills, events, people, workoutSessions, workoutPlans]);

  const days = iterateDateRange(todayKey, endKey);
  const hasAnyItems = days.some((dateKey) => (itemsByDate.get(dateKey) ?? []).length > 0);

  return (
    <section style={styles.dashboardSection} aria-label="Calendar preview">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ fontWeight: 800, margin: 0, fontSize: 16 }}>Calendar preview</h2>
        {onOpenCalendar ? (
          <button type="button" style={styles.smallBtn} onClick={onOpenCalendar}>
            Open Calendar
          </button>
        ) : null}
      </div>
      <p style={{ margin: "0 0 12px 0", opacity: 0.8 }}>Next {PREVIEW_DAYS} days.</p>

      {!hasAnyItems ? (
        <p style={{ margin: 0, opacity: 0.8 }}>Nothing scheduled in the next week.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {days.map((dateKey) => {
            const dayItems = (itemsByDate.get(dateKey) ?? []).slice(0, MAX_ITEMS_PER_DAY);
            const overflow = (itemsByDate.get(dateKey) ?? []).length - dayItems.length;
            if (dayItems.length === 0) return null;

            return (
              <div key={dateKey} style={styles.listRow}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                  {formatDayLabel(dateKey, todayKey)}
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  {dayItems.map((item) => {
                    const color = resolveCalendarItemColor(item, calendarPreferences);
                    const timeLabel = formatItemTimeLabel(item);
                    return (
                      <div
                        key={item.id}
                        style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            ...styles.calendarCategorySwatch,
                            background: color.background,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 13,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {timeLabel ? <span style={{ opacity: 0.7 }}>{timeLabel} · </span> : null}
                          {item.title}
                        </span>
                      </div>
                    );
                  })}
                  {overflow > 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>+{overflow} more</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
