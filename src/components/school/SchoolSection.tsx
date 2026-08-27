import { useEffect, useRef, useState } from "react";
import type { SchoolCourse, SchoolEnrollmentStatus, SchoolGradedItem, SchoolReminder, SchoolTimelineLayout } from "../../core/model";
import type {
  CreateSchoolCourseInput,
  CreateSchoolGradedItemInput,
  CreateSchoolReminderInput,
} from "../../core/school";
import { isSchoolCourseEnrolled } from "../../core/school";
import type { SchoolIngestSuggestion } from "../../core/schoolParse";
import { styles } from "../../ui/appStyles";
import { SchoolCourseCard } from "./SchoolCourseCard";
import { SchoolCourseForm } from "./SchoolCourseForm";
import { SchoolSemesterTimeline } from "./SchoolSemesterTimeline";
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
  onSetEnrollment: (
    courseId: string,
    status: SchoolEnrollmentStatus,
    options?: { deleteData?: boolean }
  ) => void;
  onDeleteCourse: (courseId: string) => void;
  onAddReminder: (input: CreateSchoolReminderInput) => void;
  onUpdateReminder: (reminderId: string, input: CreateSchoolReminderInput) => void;
  onDeleteReminder: (reminderId: string) => void;
  onAddGradedItem: (input: CreateSchoolGradedItemInput) => void;
  onUpdateGradedItem: (itemId: string, input: CreateSchoolGradedItemInput) => void;
  onDeleteGradedItem: (itemId: string) => void;
  onApplyIngest: (courseId: string, suggestions: SchoolIngestSuggestion[]) => void;
  timelineLayout?: SchoolTimelineLayout;
  onSaveTimelineLayout: (layout: SchoolTimelineLayout | undefined) => void;
  onSetReminderCompleted: (reminderId: string, completed: boolean) => void;
  onSetGradedItemCompleted: (itemId: string, completed: boolean) => void;
};

export function SchoolSection({
  courses,
  reminders,
  gradedItems,
  focusCourseId,
  onAddCourse,
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
  timelineLayout,
  onSaveTimelineLayout,
  onSetReminderCompleted,
  onSetGradedItemCompleted,
}: SchoolSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SchoolCourseFormState>(emptySchoolCourseFormState());
  const [formError, setFormError] = useState<string | null>(null);
  const [pastOpen, setPastOpen] = useState(() =>
    Boolean(focusCourseId && courses.some((course) => course.id === focusCourseId && !isSchoolCourseEnrolled(course)))
  );

  const enrolledCourses = courses.filter(isSchoolCourseEnrolled);
  const pastCourses = courses.filter((course) => !isSchoolCourseEnrolled(course));
  const pastCount = pastCourses.length;
  const previousPastCount = useRef(pastCount);

  useEffect(() => {
    if (pastCount > previousPastCount.current) setPastOpen(true);
    previousPastCount.current = pastCount;
  }, [pastCount]);

  const sortedEnrolled = sortCourses(enrolledCourses, focusCourseId);
  const sortedPast = sortCourses(pastCourses, focusCourseId);

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
      <SchoolSemesterTimeline
        courses={courses}
        reminders={reminders}
        gradedItems={gradedItems}
        layout={timelineLayout}
        onSaveLayout={onSaveTimelineLayout}
        onSetReminderCompleted={onSetReminderCompleted}
        onSetGradedItemCompleted={onSetGradedItemCompleted}
      />

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

      {sortedEnrolled.length === 0 && !showForm ? (
        <p style={{ ...styles.helpText, margin: 0 }}>
          No enrolled classes. Add a course or mark a past class as enrolled.
        </p>
      ) : (
        sortedEnrolled.map((course) => (
          <SchoolCourseCard
            key={course.id}
            course={course}
            reminders={reminders.filter((reminder) => reminder.courseId === course.id)}
            gradedItems={gradedItems.filter((item) => item.courseId === course.id)}
            highlighted={focusCourseId === course.id}
            onUpdateCourse={(input) => onUpdateCourse(course.id, input)}
            onSetEnrollment={(status, options) => onSetEnrollment(course.id, status, options)}
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

      {sortedPast.length > 0 ? (
        <details
          open={pastOpen}
          onToggle={(event) => setPastOpen(event.currentTarget.open)}
          style={styles.sessionHistoryGroup}
        >
          <summary style={{ ...styles.sessionHistorySummary, fontSize: 14, padding: "8px 12px" }}>
            <span>Past classes</span>
            <span style={{ ...styles.textMuted, fontWeight: 700, fontSize: 12 }}>
              {sortedPast.length}
            </span>
          </summary>
          <div style={{ ...styles.sessionHistoryBody, padding: "0 10px 10px", display: "grid", gap: 12 }}>
            {sortedPast.map((course) => (
              <SchoolCourseCard
                key={course.id}
                course={course}
                reminders={reminders.filter((reminder) => reminder.courseId === course.id)}
                gradedItems={gradedItems.filter((item) => item.courseId === course.id)}
                highlighted={focusCourseId === course.id}
                onUpdateCourse={(input) => onUpdateCourse(course.id, input)}
                onSetEnrollment={(status, options) => onSetEnrollment(course.id, status, options)}
                onDeleteCourse={() => onDeleteCourse(course.id)}
                onAddReminder={onAddReminder}
                onUpdateReminder={onUpdateReminder}
                onDeleteReminder={onDeleteReminder}
                onAddGradedItem={onAddGradedItem}
                onUpdateGradedItem={onUpdateGradedItem}
                onDeleteGradedItem={onDeleteGradedItem}
                onApplyIngest={(suggestions) => onApplyIngest(course.id, suggestions)}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function sortCourses(courses: SchoolCourse[], focusCourseId?: string): SchoolCourse[] {
  return [...courses].sort((left, right) => {
    if (left.id === focusCourseId) return -1;
    if (right.id === focusCourseId) return 1;
    return left.name.localeCompare(right.name);
  });
}
