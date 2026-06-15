import {
  APPLICATION_STATUS_LABELS,
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_OUTCOME_LABELS,
  getInterviewStageStatuses,
  isInterviewStageStatus,
  sortApplicationInterviews,
} from "../../core/career";
import type { JobApplication } from "../../core/model";
import { styles } from "../../ui/appStyles";
import {
  emptyInterviewFormState,
  formatInterviewSummary,
  type ApplicationInterviewFormState,
} from "./interviewFormState";

export type ApplicationInterviewsSectionProps = {
  application: JobApplication;
  interviews: ApplicationInterviewFormState[];
  onChange: (interviews: ApplicationInterviewFormState[]) => void;
  showPrompt?: boolean;
};

function formatInterviewDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function InterviewEditor({
  form,
  index,
  onChange,
  onRemove,
}: {
  form: ApplicationInterviewFormState;
  index: number;
  onChange: (next: ApplicationInterviewFormState) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ ...styles.listRow, display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Interview {index + 1}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 4, minWidth: 150 }}>
          <span>Date *</span>
          <input
            type="date"
            value={form.date}
            onChange={(e) => onChange({ ...form, date: e.target.value })}
            required
          />
        </label>
        <label style={{ display: "grid", gap: 4, minWidth: 120 }}>
          <span>Start</span>
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => onChange({ ...form, startTime: e.target.value })}
          />
        </label>
        <label style={{ display: "grid", gap: 4, minWidth: 120 }}>
          <span>End</span>
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => onChange({ ...form, endTime: e.target.value })}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 4, minWidth: 140 }}>
          <span>Stage</span>
          <select
            value={form.stage}
            onChange={(e) =>
              onChange({
                ...form,
                stage: e.target.value as ApplicationInterviewFormState["stage"],
              })
            }
          >
            <option value="">Use application status</option>
            {getInterviewStageStatuses().map((stage) => (
              <option key={stage} value={stage}>
                {APPLICATION_STATUS_LABELS[stage]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, minWidth: 140 }}>
          <span>Format</span>
          <select
            value={form.format}
            onChange={(e) =>
              onChange({
                ...form,
                format: e.target.value as ApplicationInterviewFormState["format"],
              })
            }
          >
            <option value="">Not specified</option>
            {(Object.keys(INTERVIEW_FORMAT_LABELS) as Array<
              keyof typeof INTERVIEW_FORMAT_LABELS
            >).map((format) => (
              <option key={format} value={format}>
                {INTERVIEW_FORMAT_LABELS[format]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, minWidth: 140 }}>
          <span>Outcome</span>
          <select
            value={form.outcome}
            onChange={(e) =>
              onChange({
                ...form,
                outcome: e.target.value as ApplicationInterviewFormState["outcome"],
              })
            }
          >
            {(Object.keys(INTERVIEW_OUTCOME_LABELS) as Array<
              keyof typeof INTERVIEW_OUTCOME_LABELS
            >).map((outcome) => (
              <option key={outcome} value={outcome}>
                {INTERVIEW_OUTCOME_LABELS[outcome]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label style={{ display: "grid", gap: 4 }}>
        <span>Notes</span>
        <textarea
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
          rows={2}
          style={{ width: "100%", resize: "vertical" }}
        />
      </label>
      <button type="button" onClick={onRemove}>
        Remove interview
      </button>
    </div>
  );
}

export function ApplicationInterviewsSection({
  application,
  interviews,
  onChange,
  showPrompt = false,
}: ApplicationInterviewsSectionProps) {
  function patchInterview(index: number, next: ApplicationInterviewFormState) {
    onChange(interviews.map((row, rowIndex) => (rowIndex === index ? next : row)));
  }

  function removeInterview(index: number) {
    onChange(interviews.filter((_, rowIndex) => rowIndex !== index));
  }

  function addInterview() {
    const defaultStage = getInterviewStageStatuses().find(
      (stage) => stage === application.status
    );
    onChange([
      ...interviews,
      {
        ...emptyInterviewFormState(),
        stage: defaultStage ?? "",
      },
    ]);
  }

  return (
    <section style={{ display: "grid", gap: 10 }} aria-label="Interviews">
      <div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Interviews</div>
        {showPrompt && isInterviewStageStatus(application.status) && interviews.length === 0 ? (
          <p style={{ margin: 0, ...styles.textSecondary, fontSize: 13 }}>
            Scheduled an interview? Add the date here and it will appear on your calendar
            automatically.
          </p>
        ) : (
          <p style={{ margin: 0, ...styles.textSecondary, fontSize: 13 }}>
            Interview dates show on the calendar under the Career category.
          </p>
        )}
      </div>

      {interviews.map((form, index) => (
        <InterviewEditor
          key={form.id}
          form={form}
          index={index}
          onChange={(next) => patchInterview(index, next)}
          onRemove={() => removeInterview(index)}
        />
      ))}

      <button type="button" onClick={addInterview}>
        Add interview
      </button>
    </section>
  );
}

export type ApplicationInterviewsSummaryProps = {
  application: JobApplication;
  onEditInterview?: (interviewId: string) => void;
};

export function ApplicationInterviewsSummary({
  application,
}: ApplicationInterviewsSummaryProps) {
  const interviews = sortApplicationInterviews(application.interviews ?? []).filter(
    (interview) => interview.outcome !== "cancelled"
  );

  if (interviews.length === 0) {
    return (
      <p style={{ margin: 0, ...styles.textMuted, fontSize: 13 }}>
        No interviews scheduled yet.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {interviews.map((interview) => {
        const scheduleLabel = interview.startTime
          ? `${formatInterviewDate(interview.date)} · ${interview.startTime}${
              interview.endTime ? `–${interview.endTime}` : ""
            }`
          : formatInterviewDate(interview.date);

        return (
          <div key={interview.id} style={{ display: "grid", gap: 2 }}>
            <strong>{formatInterviewSummary(interview, application)}</strong>
            <span style={{ ...styles.textSecondary, fontSize: 13 }}>{scheduleLabel}</span>
            {interview.notes ? (
              <span style={{ ...styles.textSecondary, fontSize: 13 }}>{interview.notes}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
