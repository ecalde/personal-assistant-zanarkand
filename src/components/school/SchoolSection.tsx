import { useState } from "react";
import type { SchoolCourse, SchoolGradedItem, SchoolReminder } from "../../core/model";
import type {
  CreateSchoolCourseInput,
  CreateSchoolGradedItemInput,
  CreateSchoolReminderInput,
} from "../../core/school";
import type { SchoolIngestSuggestion } from "../../core/schoolParse";
import { styles } from "../../ui/appStyles";
import { SchoolCourseCard } from "./SchoolCourseCard";
import { SchoolCourseForm } from "./SchoolCourseForm";
import {
  emptySchoolCourseFormState,
  schoolCoursePayloadFromForm,
  validateSchoolCourseForm,
  type SchoolCourseFormState,
} from "./schoolCourseFormState";

export type SchoolSectionProps = {
  courses: SchoolCourse[];
  reminders: SchoolReminder[];
  gradedItems: SchoolGradedItem[];
  focusCourseId?: string;
  onAddCourse: (input: CreateSchoolCourseInput) => void;
  onUpdateCourse: (courseId: string, input: CreateSchoolCourseInput) => void;
  onDeleteCourse: (courseId: string) => void;
  onAddReminder: (input: CreateSchoolReminderInput) => void;
  onUpdateReminder: (reminderId: string, input: CreateSchoolReminderInput) => void;
  onDeleteReminder: (reminderId: string) => void;
  onAddGradedItem: (input: CreateSchoolGradedItemInput) => void;
  onUpdateGradedItem: (itemId: string, input: CreateSchoolGradedItemInput) => void;
  onDeleteGradedItem: (itemId: string) => void;
  onApplyIngest: (courseId: string, suggestions: SchoolIngestSuggestion[]) => void;
};

export function SchoolSection({
  courses,
  reminders,
  gradedItems,
  focusCourseId,
  onAddCourse,
  onUpdateCourse,
  onDeleteCourse,
  onAddReminder,
  onUpdateReminder,
  onDeleteReminder,
  onAddGradedItem,
  onUpdateGradedItem,
  onDeleteGradedItem,
  onApplyIngest,
}: SchoolSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SchoolCourseFormState>(emptySchoolCourseFormState());
  const [formError, setFormError] = useState<string | null>(null);

  const sortedCourses = [...courses].sort((left, right) => {
    if (left.id === focusCourseId) return -1;
    if (right.id === focusCourseId) return 1;
    return left.name.localeCompare(right.name);
  });

  function submit() {
    const error = validateSchoolCourseForm(form);
    if (error) {
      setFormError(error);
      return;
    }
    onAddCourse(schoolCoursePayloadFromForm(form));
    setForm(emptySchoolCourseFormState());
    setFormError(null);
    setShowForm(false);
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <p style={{ ...styles.textSecondary, margin: 0 }}>
          Courses, reminders, and grades. Paste a Canvas table or syllabus into a course to review
          suggestions.
        </p>
        {!showForm ? (
          <button
            type="button"
            onClick={() => {
              setForm(emptySchoolCourseFormState());
              setFormError(null);
              setShowForm(true);
            }}
          >
            Add course
          </button>
        ) : null}
      </div>

      {showForm ? (
        <SchoolCourseForm
          form={form}
          formError={formError}
          editing={false}
          onChange={setForm}
          onSubmit={submit}
          onCancel={() => {
            setShowForm(false);
            setFormError(null);
          }}
        />
      ) : null}

      {sortedCourses.length === 0 && !showForm ? (
        <p style={{ ...styles.helpText, margin: 0 }}>
          No courses yet. Add a class to track reminders, staff, and grades.
        </p>
      ) : (
        sortedCourses.map((course) => (
          <SchoolCourseCard
            key={course.id}
            course={course}
            reminders={reminders.filter((reminder) => reminder.courseId === course.id)}
            gradedItems={gradedItems.filter((item) => item.courseId === course.id)}
            highlighted={focusCourseId === course.id}
            onUpdateCourse={(input) => onUpdateCourse(course.id, input)}
            onDeleteCourse={() => onDeleteCourse(course.id)}
            onAddReminder={onAddReminder}
            onUpdateReminder={onUpdateReminder}
            onDeleteReminder={onDeleteReminder}
            onAddGradedItem={onAddGradedItem}
            onUpdateGradedItem={onUpdateGradedItem}
            onDeleteGradedItem={onDeleteGradedItem}
            onApplyIngest={(suggestions) => onApplyIngest(course.id, suggestions)}
          />
        ))
      )}
    </div>
  );
}
