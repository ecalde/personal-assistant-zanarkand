import { useState } from "react";
import type { SchoolCourse, SchoolGradedItem, SchoolReminder } from "../../core/model";
import {
  formatSchoolDueCaption,
  resolveLocalTimeZone,
  SCHOOL_REMINDER_KIND_LABELS,
  type CreateSchoolCourseInput,
  type CreateSchoolGradedItemInput,
  type CreateSchoolReminderInput,
} from "../../core/school";
import type { SchoolIngestSuggestion } from "../../core/schoolParse";
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

export type SchoolCourseCardProps = {
  course: SchoolCourse;
  reminders: SchoolReminder[];
  gradedItems: SchoolGradedItem[];
  highlighted?: boolean;
  onUpdateCourse: (input: CreateSchoolCourseInput) => void;
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
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{course.name}</h2>
              <p style={{ ...styles.textMuted, margin: "4px 0 0" }}>
                {[course.code, course.term, course.timezone].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
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
              <button type="button" onClick={onDeleteCourse}>
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

      <section style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Reminders</h3>
          {!showReminderForm ? (
            <button
              type="button"
              onClick={() => {
                setReminderForm(emptySchoolReminderFormState());
                setEditingReminderId(null);
                setReminderError(null);
                setShowReminderForm(true);
              }}
            >
              Add reminder
            </button>
          ) : null}
        </div>
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
        {reminders.length === 0 && !showReminderForm ? (
          <p style={{ ...styles.helpText, margin: 0 }}>No reminders yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {reminders.map((reminder) => (
              <li key={reminder.id} style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong>{reminder.title}</strong>
                  <span style={styles.textMuted}>
                    {SCHOOL_REMINDER_KIND_LABELS[reminder.kind]}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReminderForm(schoolReminderFormFromReminder(reminder));
                      setEditingReminderId(reminder.id);
                      setReminderError(null);
                      setShowReminderForm(true);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" onClick={() => onDeleteReminder(reminder.id)}>
                    Delete
                  </button>
                </div>
                <div style={{ ...styles.helpText }}>
                  {formatSchoolDueCaption({
                    date: reminder.date,
                    time: reminder.startTime,
                    sourceTimeZone: course.timezone,
                    localTimeZone,
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SchoolGradesEditor
        course={course}
        reminders={reminders}
        items={gradedItems}
        onAddItem={onAddGradedItem}
        onUpdateItem={onUpdateGradedItem}
        onDeleteItem={onDeleteGradedItem}
      />
    </article>
  );
}
