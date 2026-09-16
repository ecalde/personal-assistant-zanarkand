import { useCallback, useMemo, useState } from "react";
import { RESUME_JOB_DESCRIPTION_MAX_CHARS } from "../../core/resume/resumeDbMappers";
import {
  analyzeResumeJobCoverage,
  buildResumeCoverageView,
  mentionsForCoverageAnalysis,
  mergeMentionIndexesForCoverage,
  structureForCoverageAnalyze,
} from "../../core/resume/resumeCoverage";
import { storedJobAnalysisIsStaleForDraft } from "../../core/resume/resumeInvalidation";
import type { ResumeExtractedStructure, ResumeFactLedger, ResumeStructureGraph } from "../../core/resume/resumeModel";
import { getResumeVersionById } from "../../lib/resumeRemote";
import { styles } from "../../ui/appStyles";
import { ResumeCoveragePanel } from "./ResumeCoveragePanel";
import { useResumeJobSession } from "./useResumeJobSession";
import "./resumeEditor.css";

export type ResumeAnalysisPanelProps = {
  userId: string;
  resumeId: string;
  resumeVersionId: string | null;
  importFactLedger: ResumeFactLedger;
  extractedStructure: ResumeExtractedStructure | null;
  workingGraph?: ResumeStructureGraph | null;
  /** Flush + autosave + live editor graph at Analyze time. */
  prepareWorkingGraph?: () => Promise<ResumeStructureGraph | null>;
};

/**
 * Right-pane JD paste + honest coverage (Phase 5E/5F). Analyze runs the
 * deterministic parser and matcher. Reset / Replace leave the Word file
 * untouched and drop coverage. Document edits do not re-parse the JD. There
 * is no ATS score.
 */
export function ResumeAnalysisPanel({
  userId,
  resumeId,
  resumeVersionId,
  importFactLedger,
  extractedStructure,
  workingGraph = null,
  prepareWorkingGraph,
}: ResumeAnalysisPanelProps) {
  const {
    draft,
    setDraft,
    status,
    error,
    session,
    hasActiveSession,
    persistNow,
    persistAnalysis,
    resetSession,
    replaceSession,
    retry,
  } = useResumeJobSession({
    userId,
    resumeId,
    resumeVersionId: resumeVersionId ?? undefined,
    enabled: Boolean(resumeVersionId),
  });

  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const disabled = !resumeVersionId || status === "loading" || status === "saving";
  const jdLength = draft.jobDescriptionText.length;
  const tooLong = jdLength > RESUME_JOB_DESCRIPTION_MAX_CHARS;

  const coverageView = useMemo(() => {
    if (!session?.parsedJob || !session.matchResult) return null;
    if (storedJobAnalysisIsStaleForDraft(session, draft)) return null;
    return buildResumeCoverageView(
      session.parsedJob,
      session.matchResult,
      extractedStructure?.atsWarnings ?? []
    );
  }, [session, draft, extractedStructure]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzeError(null);
    const persisted = await persistNow();
    if (!persisted.ok) return;

    const text = draft.jobDescriptionText.trim();
    if (!text) {
      if (persisted.session) await persistAnalysis(null, null);
      return;
    }
    if (!resumeVersionId) return;

    try {
      let liveGraph: ResumeStructureGraph | null = workingGraph;
      if (prepareWorkingGraph) {
        try {
          liveGraph = (await prepareWorkingGraph()) ?? workingGraph;
        } catch {
          liveGraph = workingGraph;
        }
      }
      let savedSnapshot: ResumeExtractedStructure | null = null;
      try {
        const version = await getResumeVersionById(userId, resumeId, resumeVersionId);
        savedSnapshot = version?.extractedStructure ?? null;
      } catch {
        savedSnapshot = null;
      }
      const structure = structureForCoverageAnalyze({
        openSnapshot: extractedStructure,
        workingGraph: liveGraph,
        savedSnapshot,
      });
      const { parsedJob, matchResult } = analyzeResumeJobCoverage({
        jobDescriptionText: draft.jobDescriptionText,
        company: draft.company,
        jobTitle: draft.jobTitle,
        importLedger: importFactLedger,
        mentionIndex: mergeMentionIndexesForCoverage([
          mentionsForCoverageAnalysis(structure),
          liveGraph,
          savedSnapshot?.graph,
        ]),
        firstSeenVersionId: resumeVersionId,
      });
      const saved = await persistAnalysis(parsedJob, matchResult);
      if (!saved) setAnalyzeError("Could not save coverage.");
    } catch {
      setAnalyzeError("Could not analyze this job description.");
    }
  }, [
    persistNow,
    persistAnalysis,
    draft,
    resumeVersionId,
    extractedStructure,
    workingGraph,
    prepareWorkingGraph,
    importFactLedger,
    userId,
    resumeId,
  ]);

  const statusText =
    status === "loading"
      ? "Loading saved job description…"
      : status === "saving"
        ? "Saving to cloud…"
        : status === "saved"
          ? "Saved."
          : null;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section aria-label="Job description" style={styles.card} className="resume-analysis-panel">
        <div style={styles.cardTitle}>Job description</div>
        <p style={{ ...styles.helpText, margin: "0 0 10px 0" }}>
          Paste a job description to save it with this resume. Analyze shows coverage against facts
          already on this resume. It does not change the Word document. Editing the resume does not
          re-run Analyze. Reset discards the saved description. Replace archives it, drops coverage,
          and starts a new one.
        </p>

        {!resumeVersionId ? (
          <p style={{ ...styles.metaText, margin: 0 }}>
            Open a resume with a saved version to paste a job description.
          </p>
        ) : (
          <>
            <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              <span style={styles.metaText}>Company</span>
              <input
                type="text"
                value={draft.company}
                disabled={disabled}
                autoComplete="organization"
                onChange={(event) => setDraft({ ...draft, company: event.target.value })}
              />
            </label>

            <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              <span style={styles.metaText}>Job title</span>
              <input
                type="text"
                value={draft.jobTitle}
                disabled={disabled}
                autoComplete="off"
                onChange={(event) => setDraft({ ...draft, jobTitle: event.target.value })}
              />
            </label>

            <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              <span style={styles.metaText}>Job description</span>
              <textarea
                value={draft.jobDescriptionText}
                disabled={disabled}
                rows={14}
                spellCheck
                onChange={(event) =>
                  setDraft({ ...draft, jobDescriptionText: event.target.value })
                }
                style={{ width: "100%", minHeight: 180, resize: "vertical", boxSizing: "border-box" }}
              />
            </label>

            <p style={{ ...styles.metaText, margin: "0 0 10px 0" }}>
              {jdLength.toLocaleString()} / {RESUME_JOB_DESCRIPTION_MAX_CHARS.toLocaleString()}{" "}
              characters
            </p>

            {statusText ? (
              <p style={{ ...styles.metaText, margin: "0 0 10px 0" }} role="status">
                {statusText}
              </p>
            ) : null}

            {error || tooLong || analyzeError ? (
              <div style={{ ...styles.errorInline, margin: "0 0 10px 0" }} role="alert">
                <b>
                  {tooLong
                    ? "Job description is too long."
                    : analyzeError
                      ? "Analyze failed:"
                      : "Cloud save failed:"}
                </b>{" "}
                {tooLong
                  ? `Shorten it below ${RESUME_JOB_DESCRIPTION_MAX_CHARS.toLocaleString()} characters.`
                  : (analyzeError ?? error ?? "Could not save job description.")}{" "}
                {!tooLong && error && !analyzeError ? (
                  <button type="button" style={styles.smallBtn} onClick={() => retry()}>
                    Retry cloud save
                  </button>
                ) : null}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={disabled || tooLong}
                onClick={() => void handleAnalyze()}
              >
                Analyze
              </button>
              <button type="button" disabled={disabled} onClick={() => void resetSession()}>
                Reset
              </button>
              <button
                type="button"
                disabled={disabled || !hasActiveSession}
                onClick={() => void replaceSession()}
              >
                Replace
              </button>
            </div>
          </>
        )}
      </section>

      {coverageView ? <ResumeCoveragePanel view={coverageView} /> : null}
    </div>
  );
}
