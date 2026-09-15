import { useEffect, useMemo, useState } from "react";
import {
  applyQuickStatusTransition,
  filterAndSortApplications,
  type ApplicationStatusFilter,
  type ApplicationsSortMode,
  type QuickStatusAction,
} from "../core/career";
import type {
  CareerTarget,
  JobApplication,
  SchoolCourse,
  SchoolEnrollmentStatus,
  SchoolGradedItem,
  SchoolReminder,
  SchoolTimelineLayout,
  Skill,
} from "../core/model";
import type {
  CareerFocus,
  CreateSchoolCourseInput,
  CreateSchoolGradedItemInput,
  CreateSchoolReminderInput,
} from "../core/school";
import type { SchoolIngestSuggestion } from "../core/schoolParse";
import { persistCareerSection, readCareerSection } from "../core/careerSectionPreferences";
import { formatLocalDateKey } from "../core/timeline";
import { ApplicationCard } from "../components/career/ApplicationCard";
import { ApplicationForm } from "../components/career/ApplicationForm";
import { ApplicationsToolbar } from "../components/career/ApplicationsToolbar";
import {
  CareerSectionSwitcher,
  type CareerSection,
} from "../components/career/CareerSectionSwitcher";
import { CareerTargetSection } from "../components/career/CareerTargetSection";
import { InterviewStageSummaryBar } from "../components/career/InterviewStageSummary";
import { NeedsAttentionSection } from "../components/career/NeedsAttentionSection";
import { SkillGapPanel } from "../components/career/SkillGapPanel";
import {
  applicationFormFromApplication,
  applicationPayloadFromForm,
  emptyApplicationFormState,
  validateApplicationForm,
  type ApplicationFormState,
} from "../components/career/applicationFormState";
import { ResumeSection } from "../components/resume/ResumeSection";
import { useResumes } from "../components/resume/useResumes";
import { SchoolSection } from "../components/school/SchoolSection";
import { styles } from "../ui/appStyles";

export type CareerPageProps = {
  userId: string;
  jobApplications: JobApplication[];
  careerTarget: CareerTarget | undefined;
  skills: Skill[];
  schoolCourses: SchoolCourse[];
  schoolReminders: SchoolReminder[];
  schoolGradedItems: SchoolGradedItem[];
  careerFocus?: CareerFocus;
  onAddApplication: (
    input: Omit<JobApplication, "id" | "createdAtIso" | "updatedAtIso">
  ) => void;
  onUpdateApplication: (application: JobApplication) => void;
  onDeleteApplication: (applicationId: string) => void;
  onSetCareerTarget: (input: Omit<CareerTarget, "id" | "updatedAtIso">) => void;
  onClearCareerTarget: () => void;
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
  onApplySchoolIngest: (courseId: string, suggestions: SchoolIngestSuggestion[]) => void;
  schoolTimelineLayout?: SchoolTimelineLayout;
  onSaveTimelineLayout: (layout: SchoolTimelineLayout | undefined) => void;
  onSetReminderCompleted: (reminderId: string, completed: boolean) => void;
  onSetGradedItemCompleted: (itemId: string, completed: boolean) => void;
};

export default function CareerPage({
  userId,
  jobApplications,
  careerTarget,
  skills,
  schoolCourses,
  schoolReminders,
  schoolGradedItems,
  careerFocus,
  onAddApplication,
  onUpdateApplication,
  onDeleteApplication,
  onSetCareerTarget,
  onClearCareerTarget,
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
  onApplySchoolIngest,
  schoolTimelineLayout,
  onSaveTimelineLayout,
  onSetReminderCompleted,
  onSetGradedItemCompleted,
}: CareerPageProps) {
  const [section, setSection] = useState<CareerSection>(() =>
    careerFocus?.kind === "school" ? "school" : readCareerSection("career")
  );
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ApplicationFormState>(emptyApplicationFormState());
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<ApplicationsSortMode>("recent");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    resumes,
    loading: resumesLoading,
    uploading: resumeUploading,
    mutatingId: resumeMutatingId,
    error: resumeError,
    uploadResume,
    renameResume,
    setDefaultResume,
    deleteResume,
    duplicateResume,
  } = useResumes(userId, { enabled: section === "resume" });

  const todayKey = formatLocalDateKey(new Date());

  const filteredApplications = useMemo(
    () =>
      filterAndSortApplications(jobApplications, {
        query,
        sortMode,
        statusFilter,
        todayKey,
      }),
    [jobApplications, query, sortMode, statusFilter, todayKey]
  );

  useEffect(() => {
    if (careerFocus?.kind !== "school") return;
    setSection("school");
    if (!careerFocus.courseId) return;
    document.getElementById(`school-course-${careerFocus.courseId}`)?.scrollIntoView({
      block: "nearest",
    });
  }, [careerFocus]);

  function resetForm() {
    setForm(emptyApplicationFormState());
    setEditingId(null);
    setFormError(null);
    setShowForm(false);
  }

  function openCreateForm() {
    setForm(emptyApplicationFormState());
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(application: JobApplication) {
    setForm(applicationFormFromApplication(application));
    setEditingId(application.id);
    setFormError(null);
    setShowForm(true);
  }

  function handleSubmit() {
    const error = validateApplicationForm(form);
    if (error) {
      setFormError(error);
      return;
    }

    const payload = applicationPayloadFromForm(form);
    if (editingId) {
      const existing = jobApplications.find((app) => app.id === editingId);
      if (!existing) return;
      onUpdateApplication({
        ...existing,
        ...payload,
      });
    } else {
      onAddApplication(payload);
    }
    resetForm();
  }

  function handleQuickAction(application: JobApplication, action: QuickStatusAction) {
    onUpdateApplication(applyQuickStatusTransition(application, action, todayKey));
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={styles.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={styles.cardTitle}>Career</div>
          <CareerSectionSwitcher
            value={section}
            onChange={(next) => {
              setSection(next);
              persistCareerSection(next);
            }}
          />
        </div>
        <div style={{ ...styles.textSecondary }}>
          {section === "career"
            ? "Track job applications, salaries, and skills needed for your dream role."
            : section === "school"
              ? "Track courses, reminders, staff, and grades. Paste a syllabus or Canvas table to review suggestions."
              : "Upload and tailor DOCX resumes for job applications."}
        </div>
      </div>

      {section === "resume" ? (
        <ResumeSection
          resumes={resumes}
          loading={resumesLoading}
          uploading={resumeUploading}
          mutatingId={resumeMutatingId}
          error={resumeError}
          onUpload={(file) => {
            void uploadResume(file);
          }}
          onRename={(resumeId, name) => {
            void renameResume(resumeId, name);
          }}
          onSetDefault={(resumeId) => {
            void setDefaultResume(resumeId);
          }}
          onDelete={(resumeId) => {
            void deleteResume(resumeId);
          }}
          onDuplicate={(resumeId) => {
            void duplicateResume(resumeId);
          }}
        />
      ) : section === "school" ? (
        <SchoolSection
          courses={schoolCourses}
          reminders={schoolReminders}
          gradedItems={schoolGradedItems}
          focusCourseId={careerFocus?.kind === "school" ? careerFocus.courseId : undefined}
          onAddCourse={onAddCourse}
          onUpdateCourse={onUpdateCourse}
          onSetEnrollment={onSetEnrollment}
          onDeleteCourse={onDeleteCourse}
          onAddReminder={onAddReminder}
          onUpdateReminder={onUpdateReminder}
          onDeleteReminder={onDeleteReminder}
          onAddGradedItem={onAddGradedItem}
          onUpdateGradedItem={onUpdateGradedItem}
          onDeleteGradedItem={onDeleteGradedItem}
          onApplyIngest={onApplySchoolIngest}
          timelineLayout={schoolTimelineLayout}
          onSaveTimelineLayout={onSaveTimelineLayout}
          onSetReminderCompleted={onSetReminderCompleted}
          onSetGradedItemCompleted={onSetGradedItemCompleted}
        />
      ) : (
        <>
          <NeedsAttentionSection jobApplications={jobApplications} todayKey={todayKey} />

          <InterviewStageSummaryBar jobApplications={jobApplications} />

          <CareerTargetSection
            careerTarget={careerTarget}
            skills={skills}
            onSet={onSetCareerTarget}
            onClear={onClearCareerTarget}
          />

          <SkillGapPanel skills={skills} careerTarget={careerTarget} />

          <section aria-label="Job applications">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <h2 style={{ fontWeight: 800, margin: 0, fontSize: 16 }}>Applications</h2>
              {!showForm && (
                <button type="button" onClick={openCreateForm}>
                  Add application
                </button>
              )}
            </div>

            {showForm && (
              <ApplicationForm
                form={form}
                skills={skills}
                formError={formError}
                editing={editingId !== null}
                onChange={setForm}
                onSubmit={handleSubmit}
                onCancel={resetForm}
              />
            )}

            {jobApplications.length === 0 && !showForm ? (
              <p style={{ ...styles.helpText, margin: 0 }}>
                No applications yet. Save roles you&apos;re interested in or track where you&apos;ve
                applied.
              </p>
            ) : (
              <>
                <ApplicationsToolbar
                  query={query}
                  sortMode={sortMode}
                  statusFilter={statusFilter}
                  resultCount={filteredApplications.length}
                  totalCount={jobApplications.length}
                  onQueryChange={setQuery}
                  onSortModeChange={setSortMode}
                  onStatusFilterChange={setStatusFilter}
                />

                {filteredApplications.length === 0 ? (
                  <p style={{ ...styles.helpText, margin: 0 }}>
                    {statusFilter === "needs-attention"
                      ? "Nothing needs attention right now — you're caught up on follow-ups."
                      : query.trim()
                        ? `No matches for '${query.trim()}'.`
                        : "No applications match this filter."}
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {filteredApplications.map((application) => (
                      <ApplicationCard
                        key={application.id}
                        application={application}
                        skills={skills}
                        todayKey={todayKey}
                        expanded={expandedId === application.id}
                        onToggleExpand={() =>
                          setExpandedId((current) =>
                            current === application.id ? null : application.id
                          )
                        }
                        onEdit={() => openEditForm(application)}
                        onDelete={() => onDeleteApplication(application.id)}
                        onUpdateApplication={onUpdateApplication}
                        onQuickAction={(action) => handleQuickAction(application, action)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
