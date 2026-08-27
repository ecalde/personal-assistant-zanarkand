import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { SchoolCourse, SchoolGradedItem, SchoolReminder, SchoolTimelineLayout } from "../../core/model";
import {
  getCalendarColorSwatch,
  isCalendarColorToken,
  type CalendarColorToken,
} from "../../core/calendarColors";
import { resolveSchoolCourseColorToken } from "../../core/school";
import {
  applySchoolTimelineLayout,
  buildSchoolSemesterSchedule,
  formatSchoolSundayDate,
  isSchoolTimelineLayoutEmpty,
  mergeTimelineColumns,
  renameTimelineColumn,
  renameTimelineRow,
  resolveTimelineMemberKeys,
  revertTimelineColumnMerge,
  revertTimelineColumnName,
  revertTimelineRowName,
  type SchoolScheduleEntry,
  type SchoolTimelineDisplayColumn,
  type SchoolTimelineDisplayWeek,
} from "../../core/schoolSchedule";
import { styles } from "../../ui/appStyles";
import { MarkCompleteCheckbox } from "./MarkCompleteCheckbox";

export type SchoolSemesterTimelineProps = {
  courses: SchoolCourse[];
  reminders: SchoolReminder[];
  gradedItems: SchoolGradedItem[];
  layout?: SchoolTimelineLayout;
  onSaveLayout: (layout: SchoolTimelineLayout | undefined) => void;
  onSetReminderCompleted: (reminderId: string, completed: boolean) => void;
  onSetGradedItemCompleted: (itemId: string, completed: boolean) => void;
};

export function SchoolSemesterTimeline({
  courses,
  reminders,
  gradedItems,
  layout,
  onSaveLayout,
  onSetReminderCompleted,
  onSetGradedItemCompleted,
}: SchoolSemesterTimelineProps) {
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [editing, setEditing] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const allEnrolledSchedule = useMemo(
    () =>
      buildSchoolSemesterSchedule({
        courses,
        reminders,
        gradedItems,
      }),
    [courses, reminders, gradedItems]
  );
  const enrolled = allEnrolledSchedule.enrolledCourses;
  const activeFilter =
    courseFilter !== "all" && enrolled.some((course) => course.id === courseFilter)
      ? courseFilter
      : "all";
  const schedule = useMemo(
    () =>
      activeFilter === "all"
        ? allEnrolledSchedule
        : buildSchoolSemesterSchedule({
            courses,
            reminders,
            gradedItems,
            courseIdFilter: activeFilter,
          }),
    [allEnrolledSchedule, activeFilter, courses, reminders, gradedItems]
  );
  const view = useMemo(() => applySchoolTimelineLayout(schedule, layout), [schedule, layout]);
  const selectedEntry = useMemo(() => {
    if (!selectedEntryId) return null;
    for (const week of view.weeks) {
      for (const entries of Object.values(week.entriesByColumn)) {
        const match = entries.find((entry) => entry.id === selectedEntryId);
        if (match) return match;
      }
    }
    return null;
  }, [selectedEntryId, view]);

  function persist(next: SchoolTimelineLayout) {
    onSaveLayout(isSchoolTimelineLayoutEmpty(next) ? undefined : next);
  }

  return (
    <section
      aria-labelledby="school-term-timeline-heading"
      style={{
        ...styles.card,
        display: "grid",
        gap: 12,
        padding: 14,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h2 id="school-term-timeline-heading" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
            Term Timeline
          </h2>
          <p style={{ ...styles.captionText, margin: "4px 0 0" }}>
            {schedule.term.label} · {schedule.term.sundays.length} weeks · Sunday
            midnight due dates
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {enrolled.length > 1 ? (
            <div
              role="group"
              aria-label="Filter Term Timeline by class"
              style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}
            >
              <FilterChip
                label="All classes"
                selected={activeFilter === "all"}
                onClick={() => setCourseFilter("all")}
              />
              {enrolled.map((course) => (
                <FilterChip
                  key={course.id}
                  label={course.code?.trim() || course.name}
                  selected={activeFilter === course.id}
                  swatchToken={course.colorToken}
                  onClick={() => setCourseFilter(course.id)}
                />
              ))}
            </div>
          ) : enrolled.length === 1 ? (
            <CourseLegend courses={enrolled} />
          ) : null}
          {enrolled.length > 0 ? (
            <button type="button" style={styles.ghostBtn} onClick={() => setEditing((value) => !value)}>
              {editing ? "Done editing" : "Edit table"}
            </button>
          ) : null}
        </div>
      </header>

      {enrolled.length > 1 ? <CourseLegend courses={enrolled} /> : null}

      {editing && enrolled.length > 0 ? (
        <TimelineEditor
          layout={layout}
          columns={view.columns}
          weeks={view.weeks}
          onPersist={persist}
        />
      ) : null}

      {enrolled.length === 0 ? (
        <p style={{ ...styles.helpText, margin: 0 }}>
          Mark a class as enrolled to plot its dated work on this term's Sunday grid.
        </p>
      ) : null}

      <div style={{ overflowX: "auto", margin: "0 -4px", padding: "0 4px 4px" }}>
        <table
          style={{
            width: "100%",
            minWidth: Math.max(520, 168 + view.columns.length * 128),
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: 12,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  ...headerCellStyle,
                  ...stickyColStyle(0),
                  zIndex: 3,
                  minWidth: 72,
                  width: 72,
                  borderTopLeftRadius: 12,
                }}
              >
                Week
              </th>
              <th
                style={{
                  ...headerCellStyle,
                  minWidth: 92,
                }}
              >
                Due date
              </th>
              {view.columns.map((column, index) => (
                <th
                  key={column.key}
                  style={{
                    ...headerCellStyle,
                    minWidth: 120,
                    borderTopRightRadius:
                      index === view.columns.length - 1 ? 12 : undefined,
                  }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.weeks.map((week) => (
              <tr
                key={week.sundayDate}
                style={{
                  background: week.isCurrent
                    ? "color-mix(in srgb, var(--aether-accent, #46c6ff) 12%, transparent)"
                    : week.isGradesWeek
                      ? "transparent"
                      : undefined,
                }}
              >
                <td
                  style={{
                    ...bodyCellStyle,
                    ...stickyColStyle(0),
                    zIndex: 2,
                    fontWeight: 800,
                    background: week.isCurrent
                      ? "color-mix(in srgb, var(--aether-accent, #46c6ff) 12%, var(--aether-surface, #fff))"
                      : "var(--aether-surface, #fff)",
                  }}
                >
                  {week.weekNumber}
                </td>
                <td
                  style={{
                    ...bodyCellStyle,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--aether-text-secondary, #3d4d66)",
                  }}
                >
                  {week.dueLabel}
                </td>
                {week.isGradesWeek ? (
                  <td
                    colSpan={Math.max(view.columns.length, 1)}
                    style={{
                      ...bodyCellStyle,
                      textAlign: "center",
                      background: getCalendarColorSwatch("pink.soft").background,
                      color: getCalendarColorSwatch("pink.soft").foreground,
                      fontWeight: 800,
                      letterSpacing: "0.02em",
                      borderBottomRightRadius: 12,
                    }}
                  >
                    Grades submitted
                  </td>
                ) : (
                  view.columns.map((column, index) => {
                    const entries = week.entriesByColumn[column.key] ?? [];
                    return (
                      <td
                        key={column.key}
                        style={{
                          ...bodyCellStyle,
                          verticalAlign: "top",
                          borderBottomRightRadius:
                            week.weekNumber === view.weeks.length - 1 &&
                            index === view.columns.length - 1
                              ? 12
                              : undefined,
                        }}
                      >
                        {entries.length === 0 ? null : (
                          <div style={{ display: "grid", gap: 4 }}>
                            {entries.map((entry) => (
                              <SchedulePill
                                key={entry.id}
                                entry={entry}
                                showCourse={enrolled.length > 1 && activeFilter === "all"}
                                onSelect={() => setSelectedEntryId(entry.id)}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedEntry ? (
        <SchoolWorkDetailModal
          entry={selectedEntry}
          reminder={
            selectedEntry.reminderId
              ? reminders.find((item) => item.id === selectedEntry.reminderId)
              : undefined
          }
          onClose={() => setSelectedEntryId(null)}
          onSetCompleted={(completed) => {
            if (selectedEntry.reminderId) {
              onSetReminderCompleted(selectedEntry.reminderId, completed);
              return;
            }
            if (selectedEntry.gradedItemId) {
              onSetGradedItemCompleted(selectedEntry.gradedItemId, completed);
            }
          }}
        />
      ) : null}
    </section>
  );
}

function TimelineEditor({
  layout,
  columns,
  weeks,
  onPersist,
}: {
  layout?: SchoolTimelineLayout;
  columns: SchoolTimelineDisplayColumn[];
  weeks: SchoolTimelineDisplayWeek[];
  onPersist: (layout: SchoolTimelineLayout) => void;
}) {
  const [mergeKeys, setMergeKeys] = useState<string[]>(["", ""]);
  const [mergeLabel, setMergeLabel] = useState("");
  const [renameTarget, setRenameTarget] = useState("");
  const [renameValue, setRenameValue] = useState("");

  const instructionWeeks = weeks.filter((week) => !week.isGradesWeek);
  const renamedColumns = columns.filter((column) => column.isRenamed);
  const mergedColumns = columns.filter((column) => column.isMerged);
  const renamedRows = instructionWeeks.filter((week) => week.isDueRenamed);

  function availableMergeOptions(index: number) {
    const taken = new Set(mergeKeys.filter((key, i) => key && i !== index));
    return columns.filter((column) => !taken.has(column.key));
  }

  function setMergeKey(index: number, value: string) {
    setMergeKeys((current) => current.map((key, i) => (i === index ? value : key)));
  }

  function merge() {
    const selected = mergeKeys.filter(Boolean);
    const members = resolveTimelineMemberKeys(selected, columns);
    if (members.length < 2) return;
    onPersist(mergeTimelineColumns(layout, members, mergeLabel, crypto.randomUUID()));
    setMergeKeys(["", ""]);
    setMergeLabel("");
  }

  function applyRename() {
    if (!renameTarget) return;
    if (renameTarget.startsWith("row:")) {
      const sundayDate = renameTarget.slice(4);
      const week = weeks.find((entry) => entry.sundayDate === sundayDate);
      if (!week) return;
      onPersist(renameTimelineRow(layout, sundayDate, renameValue, week.originalDueLabel));
    } else {
      onPersist(renameTimelineColumn(layout, renameTarget, renameValue, columns));
    }
  }

  const selectedForRename = renameTarget.startsWith("row:")
    ? instructionWeeks.find((week) => `row:${week.sundayDate}` === renameTarget)
    : columns.find((column) => column.key === renameTarget);
  const canRevertRename = selectedForRename
    ? "isDueRenamed" in selectedForRename
      ? selectedForRename.isDueRenamed
      : selectedForRename.isRenamed
    : false;

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        padding: 12,
        borderRadius: 12,
        border: "1px solid var(--aether-border, #e5e5e5)",
        background: "var(--aether-surface-sunken, #fafafa)",
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>Merge columns</h3>
        <p style={{ ...styles.captionText, margin: "4px 0 8px" }}>
          Groups headers on this table only. Class grade categories stay unchanged.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {mergeKeys.map((value, index) => (
            <label key={index} style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 650 }}>
              Column {index + 1}
              <select
                value={value}
                onChange={(event) => setMergeKey(index, event.target.value)}
                style={styles.inputFluid}
              >
                <option value="">Select a column</option>
                {availableMergeOptions(index).map((column) => (
                  <option key={column.key} value={column.key}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {mergeKeys.length < columns.length ? (
            <button
              type="button"
              style={styles.ghostBtn}
              onClick={() => setMergeKeys((current) => [...current, ""])}
            >
              Add another column
            </button>
          ) : null}
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 650 }}>
            Merged name
            <input
              value={mergeLabel}
              onChange={(event) => setMergeLabel(event.target.value)}
              placeholder="Term Project"
              style={styles.inputFluid}
            />
          </label>
          <button
            type="button"
            onClick={merge}
            disabled={mergeKeys.filter(Boolean).length < 2}
          >
            Merge selected
          </button>
        </div>
        {mergedColumns.length > 0 ? (
          <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 6 }}>
            {mergedColumns.map((column) => (
              <li
                key={column.key}
                style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontSize: 12 }}>
                  <strong>{column.label}</strong>
                  <span style={{ ...styles.captionText }}> · {column.originalLabel}</span>
                </span>
                {column.groupId ? (
                  <button
                    type="button"
                    style={styles.ghostBtn}
                    onClick={() => onPersist(revertTimelineColumnMerge(layout, column.groupId!))}
                  >
                    Revert merge
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>Rename a column or row</h3>
        <p style={{ ...styles.captionText, margin: "4px 0 8px" }}>
          Saved names can still be reverted to the original table labels.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 650 }}>
            What to rename
            <select
              value={renameTarget}
              onChange={(event) => {
                const value = event.target.value;
                setRenameTarget(value);
                if (value.startsWith("row:")) {
                  const week = weeks.find((entry) => `row:${entry.sundayDate}` === value);
                  setRenameValue(week?.dueLabel ?? "");
                } else {
                  const column = columns.find((entry) => entry.key === value);
                  setRenameValue(column?.label ?? "");
                }
              }}
              style={styles.inputFluid}
            >
              <option value="">Select a column or row</option>
              {columns.map((column) => (
                <option key={column.key} value={column.key}>
                  Column: {column.label}
                </option>
              ))}
              {instructionWeeks.map((week) => (
                <option key={week.sundayDate} value={`row:${week.sundayDate}`}>
                  Row: Week {week.weekNumber} · {week.originalDueLabel}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 650 }}>
            Name
            <input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              style={styles.inputFluid}
              disabled={!renameTarget}
            />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={applyRename} disabled={!renameTarget || !renameValue.trim()}>
              Save name
            </button>
            <button
              type="button"
              style={styles.ghostBtn}
              disabled={!canRevertRename}
              onClick={() => {
                if (!renameTarget) return;
                if (renameTarget.startsWith("row:")) {
                  onPersist(revertTimelineRowName(layout, renameTarget.slice(4)));
                } else {
                  onPersist(revertTimelineColumnName(layout, renameTarget, columns));
                }
                const original = selectedForRename
                  ? "originalDueLabel" in selectedForRename
                    ? selectedForRename.originalDueLabel
                    : selectedForRename.originalLabel
                  : "";
                setRenameValue(original);
              }}
            >
              Revert name
            </button>
          </div>
        </div>
        {renamedColumns.length + renamedRows.length > 0 ? (
          <p style={{ ...styles.captionText, margin: "8px 0 0" }}>
            Custom names: {[
              ...renamedColumns.map((column) => column.label),
              ...renamedRows.map((week) => week.dueLabel),
            ].join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CourseLegend({ courses }: { courses: SchoolCourse[] }) {
  return (
    <ul
      style={{
        listStyle: "none",
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        margin: 0,
        padding: 0,
      }}
    >
      {courses.map((course) => {
        const swatch = overlaySwatch(course.colorToken);
        return (
          <li
            key={course.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 650,
              color: "var(--aether-text-secondary, #3d4d66)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                ...styles.calendarCategorySwatch,
                background: swatch.background,
                borderColor: swatch.border,
              }}
            />
            {course.code?.trim() || course.name}
          </li>
        );
      })}
    </ul>
  );
}

function FilterChip({
  label,
  selected,
  swatchToken,
  onClick,
}: {
  label: string;
  selected: boolean;
  swatchToken?: CalendarColorToken;
  onClick: () => void;
}) {
  const swatch = swatchToken ? overlaySwatch(swatchToken) : undefined;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={{
        ...styles.ghostBtn,
        borderRadius: 999,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: selected
          ? "color-mix(in srgb, var(--aether-accent, #46c6ff) 16%, transparent)"
          : "transparent",
        borderColor: selected
          ? "var(--aether-accent, #46c6ff)"
          : "var(--aether-border, #ccc)",
      }}
    >
      {swatch ? (
        <span
          aria-hidden="true"
          style={{
            ...styles.calendarCategorySwatch,
            width: 10,
            height: 10,
            background: swatch.background,
            borderColor: swatch.border,
          }}
        />
      ) : null}
      {label}
    </button>
  );
}

function SchedulePill({
  entry,
  showCourse,
  onSelect,
}: {
  entry: SchoolScheduleEntry;
  showCourse: boolean;
  onSelect: () => void;
}) {
  const swatch = overlaySwatch(entry.colorToken);
  const label = showCourse ? `${entry.courseLabel}: ${entry.title}` : entry.title;
  return (
    <button
      type="button"
      title={entry.completed ? `${label} (completed)` : label}
      aria-label={entry.completed ? `${label}, completed` : label}
      onClick={onSelect}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
        borderRadius: 8,
        padding: "5px 8px",
        background: swatch.background,
        color: swatch.foreground,
        border: `1px solid ${swatch.border}`,
        boxShadow: `inset 3px 0 0 ${accentBar(entry.colorToken)}`,
        lineHeight: 1.25,
        overflow: "hidden",
        opacity: entry.completed ? 0.48 : 1,
      }}
    >
      {showCourse ? (
        <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.8, letterSpacing: "0.02em" }}>
          {entry.courseLabel}
        </div>
      ) : null}
      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
        {entry.completed ? (
          <span aria-hidden="true" style={{ marginRight: 4 }}>
            ✓
          </span>
        ) : null}
        {entry.title}
      </div>
    </button>
  );
}

function SchoolWorkDetailModal({
  entry,
  reminder,
  onClose,
  onSetCompleted,
}: {
  entry: SchoolScheduleEntry;
  reminder?: SchoolReminder;
  onClose: () => void;
  onSetCompleted: (completed: boolean) => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const links = reminder?.links ?? [];
  return (
    <div style={styles.calendarModalOverlay} onClick={onClose} role="presentation">
      <div
        style={styles.calendarModalCard}
        role="dialog"
        aria-modal="true"
        aria-label={entry.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, flex: 1 }}>{entry.title}</h2>
          <button type="button" style={styles.smallBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={styles.calendarModalRow}>
            <span style={styles.calendarModalLabel}>Course</span>
            <span>{entry.courseLabel}</span>
          </div>
          <div style={styles.calendarModalRow}>
            <span style={styles.calendarModalLabel}>Due</span>
            <span>{formatSchoolSundayDate(entry.dueDate)}</span>
          </div>
          {entry.completed ? (
            <div style={styles.calendarModalRow}>
              <span style={styles.calendarModalLabel}>Status</span>
              <span>Complete</span>
            </div>
          ) : null}
          {links.length > 0 ? (
            <div style={styles.calendarModalRow}>
              <span style={styles.calendarModalLabel}>Links</span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {links.map((link) => (
                  <a
                    key={`${link.url}:${link.label}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                  </a>
                ))}
              </span>
            </div>
          ) : null}
        </div>
        <MarkCompleteCheckbox
          id={`timeline-complete-${entry.id}`}
          checked={entry.completed}
          onChange={onSetCompleted}
        />
      </div>
    </div>
  );
}

function overlaySwatch(token?: CalendarColorToken) {
  const resolved = resolveSchoolCourseColorToken(token);
  const hue = resolved?.split(".")[0] ?? "slate";
  const soft = `${hue}.soft`;
  if (isCalendarColorToken(soft)) return getCalendarColorSwatch(soft);
  return getCalendarColorSwatch("slate.soft");
}

function accentBar(token?: CalendarColorToken): string {
  const resolved = resolveSchoolCourseColorToken(token);
  if (!resolved) return getCalendarColorSwatch("slate.base").background;
  return getCalendarColorSwatch(resolved).background;
}

const headerCellStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  background: "var(--aether-text-primary, #1a2233)",
  color: "var(--aether-surface, #ffffff)",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  borderBottom: "none",
  boxSizing: "border-box",
};

const bodyCellStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--aether-border, #e5e5e5)",
  borderRight: "1px solid var(--aether-border, #e5e5e5)",
  verticalAlign: "middle",
  boxSizing: "border-box",
};

function stickyColStyle(offset: number): CSSProperties {
  return {
    position: "sticky",
    left: offset,
    zIndex: 1,
    borderRight: "1px solid var(--aether-border, #e5e5e5)",
  };
}
