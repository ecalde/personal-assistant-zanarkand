import { useMemo, useState } from "react";
import {
  filterAndSortApplications,
  type ApplicationStatusFilter,
  type ApplicationsSortMode,
} from "../core/career";
import type { CareerTarget, JobApplication, Skill } from "../core/model";
import { ApplicationCard } from "../components/career/ApplicationCard";
import { ApplicationForm } from "../components/career/ApplicationForm";
import { ApplicationsToolbar } from "../components/career/ApplicationsToolbar";
import { CareerTargetSection } from "../components/career/CareerTargetSection";
import { SkillGapPanel } from "../components/career/SkillGapPanel";
import {
  applicationFormFromApplication,
  applicationPayloadFromForm,
  emptyApplicationFormState,
  validateApplicationForm,
  type ApplicationFormState,
} from "../components/career/applicationFormState";
import { styles } from "../ui/appStyles";

export type CareerPageProps = {
  jobApplications: JobApplication[];
  careerTarget: CareerTarget | undefined;
  skills: Skill[];
  onAddApplication: (
    input: Omit<JobApplication, "id" | "createdAtIso" | "updatedAtIso">
  ) => void;
  onUpdateApplication: (application: JobApplication) => void;
  onDeleteApplication: (applicationId: string) => void;
  onSetCareerTarget: (input: Omit<CareerTarget, "id" | "updatedAtIso">) => void;
  onClearCareerTarget: () => void;
};

export default function CareerPage({
  jobApplications,
  careerTarget,
  skills,
  onAddApplication,
  onUpdateApplication,
  onDeleteApplication,
  onSetCareerTarget,
  onClearCareerTarget,
}: CareerPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ApplicationFormState>(emptyApplicationFormState());
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<ApplicationsSortMode>("recent");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredApplications = useMemo(
    () =>
      filterAndSortApplications(jobApplications, {
        query,
        sortMode,
        statusFilter,
      }),
    [jobApplications, query, sortMode, statusFilter]
  );

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

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <header>
        <h1 style={{ fontWeight: 900, margin: "0 0 6px 0" }}>Career</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Track job applications, salaries, and skills needed for your dream role.
        </p>
      </header>

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
                {query.trim()
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
                    expanded={expandedId === application.id}
                    onToggleExpand={() =>
                      setExpandedId((current) =>
                        current === application.id ? null : application.id
                      )
                    }
                    onEdit={() => openEditForm(application)}
                    onDelete={() => onDeleteApplication(application.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
