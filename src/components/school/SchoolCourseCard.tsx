import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { SchoolCourse, SchoolEnrollmentStatus, SchoolGradedItem, SchoolReminder } from "../../core/model";
import {
  formatSchoolDueCaption,
  resolveLocalTimeZone,
  resolveSchoolCourseColorToken,
  resolveSchoolEnrollmentStatus,
  SCHOOL_ENROLLMENT_STATUS_LABELS,
  SCHOOL_ENROLLMENT_STATUSES,
  SCHOOL_REMINDER_KIND_LABELS,
  type CreateSchoolCourseInput,
  type CreateSchoolGradedItemInput,
  type CreateSchoolReminderInput,
} from "../../core/school";
import { getCalendarColorSwatch } from "../../core/calendarColors";
import { computeCourseGradeWhatIf, formatSchoolGradePercent } from "../../core/schoolGrades";
import type { SchoolIngestSuggestion } from "../../core/schoolParse";
import { formatLocalDateKey } from "../../core/timeline";
import { styles } from "../../ui/appStyles";
import { SchoolCourseForm } from "./SchoolCourseForm";
import { SchoolGradesEditor } from "./SchoolGradesEditor";
import { SchoolIngestPanel } from "./SchoolIngestPanel";
import { SchoolPolicyGlance } from "./SchoolPolicyGlance";
import { SchoolReminderForm } from "./SchoolReminderForm";
import {
  schoolCourseFormFromCourse,
  schoolCoursePayloadFromForm,
  validateSchoolCourseForm,
  type SchoolCourseFormState,
} from "./schoolCourseFormState";
import {
  emptySchoolReminderFormState,
  schoolReminderFormFromReminder,
  schoolReminderPayloadFromForm,
  validateSchoolReminderForm,
  type SchoolReminderFormState,
} from "./schoolReminderFormState";

const FOLD_LIST_MAX_HEIGHT = "min(70vh, 640px)";

export type SchoolCourseCardProps = {
  course: SchoolCourse;
  reminders: SchoolReminder[];
  gradedItems: SchoolGradedItem[];
  highlighted?: boolean;
  onUpdateCourse: (input: CreateSchoolCourseInput) => void;
  onSetEnrollment: (
    status: SchoolEnrollmentStatus,
    options?: { deleteData?: boolean }
  ) => void;
  onDeleteCourse: () => void;
  onAddReminder: (input: CreateSchoolReminderInput) => void;
  onUpdateReminder: (reminderId: string, input: CreateSchoolReminderInput) => void;
  onDeleteReminder: (reminderId: string) => void;
  onAddGradedItem: (input: CreateSchoolGradedItemInput) => void;
  onUpdateGradedItem: (itemId: string, input: CreateSchoolGradedItemInput) => void;
  onDeleteGradedItem: (itemId: string) => void;
  onApplyIngest: (suggestions: SchoolIngestSuggestion[]) => void;
};

export function SchoolCourseCard({
  course,
  reminders,
  gradedItems,
  highlighted,
  onUpdateCourse,
  onSetEnrollment,
  onDeleteCourse,
  onAddReminder,
  onUpdateReminder,
  onDeleteReminder,
  onAddGradedItem,
  onUpdateGradedItem,
  onDeleteGradedItem,
  onApplyIngest,
}: SchoolCourseCardProps) {
  const localTimeZone = resolveLocalTimeZone();
  const [editing, setEditing] = useState(false);
  const [courseForm, setCourseForm] = useState<SchoolCourseFormState>(() =>
    schoolCourseFormFromCourse(course)
  );
  const [courseError, setCourseError] = useState<string | null>(null);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [reminderForm, setReminderForm] = useState<SchoolReminderFormState>(
    emptySchoolReminderFormState()
  );
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [gradesOpen, setGradesOpen] = useState(false);
  const [gradesAddRequestId, setGradesAddRequestId] = useState(0);
  const [editingCategories, setEditingCategories] = useState(false);
  const [dropPrompt, setDropPrompt] = useState(false);

  const sortedReminders = useMemo(
    () =>
      [...reminders].sort((left, right) => {
        const byDate = left.date.localeCompare(right.date);
        if (byDate !== 0) return byDate;
        return left.title.localeCompare(right.title);
      }),
    [reminders]
  );
  const gradeSnapshot = useMemo(
    () => computeCourseGradeWhatIf(course, gradedItems),
    [course, gradedItems]
  );
  const today = formatLocalDateKey(new Date());
  const nextReminder =
    sortedReminders.find((reminder) => reminder.date >= today) ?? sortedReminders[0];
  const reminderMeta =
    sortedReminders.length === 0
      ? "None"
      : `${sortedReminders.length}${nextReminder ? ` · next ${compactSchoolDate(nextReminder.date)}` : ""}`;
  const gradeMeta =
    gradeSnapshot.currentPercent !== undefined
      ? `${formatSchoolGradePercent(gradeSnapshot.currentPercent)}${
          gradeSnapshot.currentLetter ? ` ${gradeSnapshot.currentLetter}` : ""
        }`
      : course.gradeCategories.length === 0
        ? "None"
        : `${course.gradeCategories.length} categor${course.gradeCategories.length === 1 ? "y" : "ies"}`;

  const enrollmentStatus = resolveSchoolEnrollmentStatus(course.enrollmentStatus);
  const dueCaption = formatSchoolDueCaption({
    date: reminderForm.date,
    time: reminderForm.startTime || undefined,
    sourceTimeZone: course.timezone,
    localTimeZone,
  });

  function saveCourse() {
    const error = validateSchoolCourseForm(courseForm);
    if (error) {
      setCourseError(error);
      return;
    }
    onUpdateCourse(schoolCoursePayloadFromForm(courseForm));
    setEditing(false);
    setCourseError(null);
  }

  function saveReminder() {
    const error = validateSchoolReminderForm(reminderForm);
    if (error) {
      setReminderError(error);
      return;
    }
    const payload = schoolReminderPayloadFromForm(reminderForm, course.id);
    if (editingReminderId) onUpdateReminder(editingReminderId, payload);
    else onAddReminder(payload);
    setShowReminderForm(false);
    setEditingReminderId(null);
    setReminderForm(emptySchoolReminderFormState());
    setReminderError(null);
  }

  return (
    <article
      id={`school-course-${course.id}`}
      style={{
        ...styles.card,
        outline: highlighted ? "2px solid var(--aether-accent, #46c6ff)" : undefined,
        display: "grid",
        gap: 12,
      }}
    >
      {editing ? (
        <SchoolCourseForm
          form={courseForm}
          formError={courseError}
          editing
          onChange={setCourseForm}
          onSubmit={saveCourse}
          onCancel={() => {
            setCourseForm(schoolCourseFormFromCourse(course));
            setCourseError(null);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
                <CourseColorSwatch colorToken={course.colorToken} />
                {course.name}
              </h2>
              <p style={{ ...styles.textMuted, margin: "4px 0 0" }}>
                {[course.code, course.term, course.timezone].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
              <EnrollmentStatusControl
                courseId={course.id}
                courseName={course.name}
                status={enrollmentStatus}
                dropPrompt={dropPrompt}
                onRequestStatus={(status) => {
                  if (status === "dropped" && enrollmentStatus !== "dropped") {
                    setDropPrompt(true);
                    return;
                  }
                  setDropPrompt(false);
                  onSetEnrollment(status);
                }}
                onKeepDropped={() => {
                  setDropPrompt(false);
                  onSetEnrollment("dropped");
                }}
                onDeleteDropped={() => {
                  setDropPrompt(false);
                  onSetEnrollment("dropped", { deleteData: true });
                }}
                onCancelDrop={() => setDropPrompt(false)}
              />
              <button
                type="button"
                onClick={() => {
                  setCourseForm(schoolCourseFormFromCourse(course));
                  setCourseError(null);
                  setEditing(true);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Delete ${course.name}? Reminders and grades for this class will also be removed.`
                    )
                  ) {
                    return;
                  }
                  onDeleteCourse();
                }}
              >
                Delete
              </button>
            </div>
          </div>
          <SchoolPolicyGlance course={course} />
          <SchoolIngestPanel
            course={course}
            reminders={reminders}
            gradedItems={gradedItems}
            onApply={onApplyIngest}
          />
        </>
      )}

      <div
        style={{
          display: "grid",
          gap: 10,
          alignItems: "start",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
        }}
      >
        <CourseFold
          title="Reminders"
          meta={reminderMeta}
          open={remindersOpen || showReminderForm}
          onOpenChange={setRemindersOpen}
          action={
            showReminderForm ? null : (
              <button
                type="button"
                style={styles.ghostBtn}
                onClick={(event) => {
                  stopFoldToggle(event);
                  setReminderForm(emptySchoolReminderFormState());
                  setEditingReminderId(null);
                  setReminderError(null);
                  setShowReminderForm(true);
                  setRemindersOpen(true);
                }}
              >
                Add
              </button>
            )
          }
        >
          {showReminderForm ? (
            <SchoolReminderForm
              form={reminderForm}
              formError={reminderError}
              editing={editingReminderId !== null}
              dueCaption={reminderForm.date ? dueCaption : undefined}
              onChange={setReminderForm}
              onSubmit={saveReminder}
              onCancel={() => {
                setShowReminderForm(false);
                setEditingReminderId(null);
                setReminderError(null);
              }}
            />
          ) : null}
          {sortedReminders.length === 0 && !showReminderForm ? (
            <p style={{ ...styles.helpText, margin: 0 }}>No reminders yet.</p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "grid",
                gap: 4,
                maxHeight: showReminderForm ? "min(40vh, 360px)" : FOLD_LIST_MAX_HEIGHT,
                overflow: "auto",
              }}
            >
              {sortedReminders.map((reminder) => (
                <li
                  key={reminder.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 8,
                    alignItems: "center",
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: "var(--aether-surface-sunken, #fafafa)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {reminder.title}
                    </div>
                    <div style={{ ...styles.captionText }}>
                      {SCHOOL_REMINDER_KIND_LABELS[reminder.kind]}
                      {" · "}
                      {compactSchoolDate(reminder.date)}
                      {reminder.startTime ? ` ${compactSchoolTime(reminder.startTime)}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      style={styles.ghostBtn}
                      onClick={() => {
                        setReminderForm(schoolReminderFormFromReminder(reminder));
                        setEditingReminderId(reminder.id);
                        setReminderError(null);
                        setShowReminderForm(true);
                        setRemindersOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      style={styles.ghostBtn}
                      onClick={() => onDeleteReminder(reminder.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CourseFold>

        <CourseFold
          title="Grades"
          meta={gradeMeta}
          open={gradesOpen || editingCategories}
          onOpenChange={setGradesOpen}
          action={
            <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button
                type="button"
                style={styles.ghostBtn}
                onClick={(event) => {
                  stopFoldToggle(event);
                  setGradesOpen(true);
                  setEditingCategories(true);
                }}
              >
                Categories
              </button>
              <button
                type="button"
                style={styles.ghostBtn}
                onClick={(event) => {
                  stopFoldToggle(event);
                  setGradesOpen(true);
                  setGradesAddRequestId((value) => value + 1);
                }}
              >
                Add
              </button>
            </span>
          }
        >
          <SchoolGradesEditor
            course={course}
            reminders={reminders}
            items={gradedItems}
            compact
            hideHeader
            addRequestId={gradesAddRequestId}
            editingCategories={editingCategories}
            listMaxHeight={FOLD_LIST_MAX_HEIGHT}
            onAddItem={onAddGradedItem}
            onUpdateItem={onUpdateGradedItem}
            onDeleteItem={onDeleteGradedItem}
            onSaveCategories={(gradeCategories) => {
              onUpdateCourse({
                ...schoolCoursePayloadFromForm(schoolCourseFormFromCourse(course)),
                gradeCategories,
              });
              setEditingCategories(false);
            }}
            onCancelCategoryEdit={() => setEditingCategories(false)}
          />
        </CourseFold>
      </div>
    </article>
  );
}

function CourseFold({
  title,
  meta,
  open,
  onOpenChange,
  action,
  children,
}: {
  title: string;
  meta: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      style={{ ...styles.sessionHistoryGroup, minWidth: 0 }}
    >
      <summary style={{ ...styles.sessionHistorySummary, fontSize: 14, padding: "8px 12px" }}>
        <span>{title}</span>
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ ...styles.textMuted, fontWeight: 700, fontSize: 12 }}>{meta}</span>
          {action}
        </span>
      </summary>
      <div style={{ ...styles.sessionHistoryBody, padding: "0 10px 10px" }}>{children}</div>
    </details>
  );
}

function stopFoldToggle(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function EnrollmentStatusControl({
  courseId,
  courseName,
  status,
  dropPrompt,
  onRequestStatus,
  onKeepDropped,
  onDeleteDropped,
  onCancelDrop,
}: {
  courseId: string;
  courseName: string;
  status: SchoolEnrollmentStatus;
  dropPrompt: boolean;
  onRequestStatus: (status: SchoolEnrollmentStatus) => void;
  onKeepDropped: () => void;
  onDeleteDropped: () => void;
  onCancelDrop: () => void;
}) {
  const dialogLabelId = `drop-class-${courseId}`;
  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
      <div
        role="group"
        aria-label={`Enrollment for ${courseName}`}
        style={{
          display: "inline-flex",
          border: "1px solid var(--aether-border, #ccc)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {SCHOOL_ENROLLMENT_STATUSES.map((value) => {
          const selected = value === status;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => onRequestStatus(value)}
              style={{
                ...styles.ghostBtn,
                border: "none",
                borderRadius: 0,
                fontWeight: selected ? 800 : 650,
                background: selected
                  ? value === "dropped"
                    ? "var(--aether-chip-danger-bg, #ffecec)"
                    : value === "completed"
                      ? "var(--aether-chip-success-bg, #ecfff1)"
                      : "color-mix(in srgb, var(--aether-accent, #46c6ff) 18%, transparent)"
                  : "transparent",
                color:
                  selected && value === "dropped"
                    ? "var(--aether-chip-danger-text, #8a1c1c)"
                    : selected && value === "completed"
                      ? "var(--aether-chip-success-text, #1b5e20)"
                      : "var(--aether-text-primary, inherit)",
              }}
            >
              {SCHOOL_ENROLLMENT_STATUS_LABELS[value]}
            </button>
          );
        })}
      </div>
      {dropPrompt ? (
        <div
          role="dialog"
          aria-labelledby={dialogLabelId}
          style={{
            ...styles.card,
            padding: 12,
            maxWidth: 320,
            display: "grid",
            gap: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          <p id={dialogLabelId} style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
            Drop {courseName}?
          </p>
          <p style={{ ...styles.captionText, margin: 0 }}>
            Keep reminders and grades stored, or delete this class entirely.
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" style={styles.ghostBtn} onClick={onCancelDrop}>
              Cancel
            </button>
            <button type="button" onClick={onKeepDropped}>
              Keep stored
            </button>
            <button type="button" onClick={onDeleteDropped}>
              Delete class
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CourseColorSwatch({ colorToken }: { colorToken: SchoolCourse["colorToken"] }) {
  const token = resolveSchoolCourseColorToken(colorToken);
  if (!token) return null;
  const swatch = getCalendarColorSwatch(token);
  return (
    <span
      aria-hidden="true"
      title={swatch.label}
      style={{
        ...styles.calendarCategorySwatch,
        width: 14,
        height: 14,
        background: swatch.background,
        borderColor: swatch.border,
      }}
    />
  );
}

function compactSchoolDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function compactSchoolTime(time: string): string {
  const [hourRaw, minuteRaw] = time.split(":").map(Number);
  if (!Number.isInteger(hourRaw) || !Number.isInteger(minuteRaw)) return time;
  const period = hourRaw >= 12 ? "PM" : "AM";
  const hour12 = hourRaw % 12 === 0 ? 12 : hourRaw % 12;
  return `${hour12}:${String(minuteRaw).padStart(2, "0")} ${period}`;
}
