import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RESUME_SUGGESTION_KEYBOARD_HELP,
  RESUME_SUGGESTIONS_HEADING_ID,
  focusResumeSuggestionReviewTarget,
  neighborSuggestionId,
  nextSuggestionIdAfterDismiss,
} from "../../core/resume/resumeSuggestionA11y";
import { RESUME_JOB_DESCRIPTION_MAX_CHARS } from "../../core/resume/resumeDbMappers";
import { resumeJobDescriptionExceedsCap } from "../../core/resume/resumeLimits";
import {
  analyzeResumeJobCoverage,
  buildResumeCoverageView,
  mentionsForCoverageAnalysis,
  mergeMentionIndexesForCoverage,
  structureForCoverageAnalyze,
} from "../../core/resume/resumeCoverage";
import { storedJobAnalysisIsStaleForDraft } from "../../core/resume/resumeInvalidation";
import type {
  ApplyAcceptedSuggestionToDocumentInput,
  ApplyAcceptedSuggestionToDocumentResult,
} from "../../core/resume/resumeSuggestionApply";
import type {
  MatchResult,
  ResumeExtractedStructure,
  ResumeFactLedger,
  ResumeStructureGraph,
} from "../../core/resume/resumeModel";
import {
  diffResumeBlocksAgainstVersionOne,
} from "../../core/resume/resumeDiff";
import { documentFontFamilies } from "../../core/resume/resumeFonts";
import { layoutDocumentBlocksFromGraph } from "../../core/resume/resumeLayout";
import {
  parseResumeApplicationLinkSelectValue,
  resumeApplicationLinkLabel,
  resumeApplicationLinkOptions,
  resumeApplicationLinkSelectValue,
  type ResumeApplicationLinkOption,
} from "../../core/resume/resumeApplicationLink";
import { getResumeVersionById } from "../../lib/resumeRemote";
import { styles } from "../../ui/appStyles";
import { ResumeCoveragePanel } from "./ResumeCoveragePanel";
import { ResumeChangesList } from "./ResumeChangesList";
import { SuggestionCard } from "./SuggestionCard";
import { useResumeFontPreflight } from "./useResumeFontPreflight";
import { useResumeJobSession } from "./useResumeJobSession";
import { useResumeSuggestionCards } from "./useResumeSuggestionCards";
import { useResumeVersionOneBaseline } from "./useResumeVersionOneBaseline";
import "./resumeEditor.css";

export type ResumeAnalysisPanelProps = {
  userId: string;
  resumeId: string;
  resumeVersionId: string | null;
  importFactLedger: ResumeFactLedger;
  extractedStructure: ResumeExtractedStructure | null;
  /** Immutable original object for version-1 plaintext (9C). */
  originalStoragePath?: string | null;
  workingGraph?: ResumeStructureGraph | null;
  /** Flush + autosave + live editor graph at Analyze time. */
  prepareWorkingGraph?: () => Promise<ResumeStructureGraph | null>;
  applySuggestionToDocument?: (
    input: ApplyAcceptedSuggestionToDocumentInput
  ) => Promise<ApplyAcceptedSuggestionToDocumentResult>;
  focusedBlockId?: string | null;
  onFocusBlock?: (blockId: string) => void;
  /** Live job-title field for named DOCX export (9A). */
  onExportRoleChange?: (jobTitle: string) => void;
  /** Career applications for optional session link (9D). Soft FK only. */
  jobApplications?: ResumeApplicationLinkOption[];
  /** Opens Skills. Must not add tracker skills from coverage. */
  onOpenSkills?: () => void;
};

/**
 * Right-pane JD paste + honest coverage (Phase 5E/5F/7E). Analyze runs the
 * deterministic parser and matcher. Accept rematches that stored parse against
 * current plaintext (no LLM, no new JD parse). Reset / Replace leave the Word
 * file untouched and drop coverage. Document edits do not re-parse the JD.
 * There is no ATS score. Changes vs version 1 lists edited paragraphs against
 * the immutable original (not the autosaved working graph). Optional Career
 * application link stores `application_id` only — it does not copy into
 * job_applications or print a PDF.
 */
export function ResumeAnalysisPanel({
  userId,
  resumeId,
  resumeVersionId,
  importFactLedger,
  extractedStructure,
  originalStoragePath = null,
  workingGraph = null,
  prepareWorkingGraph,
  applySuggestionToDocument,
  focusedBlockId = null,
  onFocusBlock,
  onExportRoleChange,
  jobApplications = [],
  onOpenSkills,
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

  useEffect(() => {
    onExportRoleChange?.(draft.jobTitle);
  }, [draft.jobTitle, onExportRoleChange]);

  const persistMatchResult = useCallback(
    async (matchResult: MatchResult) => {
      const parsedJob = session?.parsedJob;
      if (!parsedJob) return false;
      return persistAnalysis(parsedJob, matchResult);
    },
    [persistAnalysis, session?.parsedJob]
  );

  const graphForLayout = workingGraph ?? extractedStructure?.graph ?? null;
  const versionOneBaseline = useResumeVersionOneBaseline({
    userId,
    resumeId,
    originalStoragePath,
    blockMap: extractedStructure?.blockMap,
    enabled: Boolean(resumeVersionId && originalStoragePath),
  });
  const versionOneDiffs = useMemo(() => {
    if (!versionOneBaseline.baseByBlockId || !graphForLayout) return [];
    return diffResumeBlocksAgainstVersionOne(
      versionOneBaseline.baseByBlockId,
      graphForLayout.blocks
    );
  }, [versionOneBaseline.baseByBlockId, graphForLayout]);
  const fontFamilies = useMemo(
    () => documentFontFamilies(graphForLayout?.blocks ?? []),
    [graphForLayout]
  );
  const fontPreflight = useResumeFontPreflight(fontFamilies);
  const substitutionActive = fontPreflight?.substitutionActive ?? false;
  const layoutDocumentBlocks = useMemo(
    () => layoutDocumentBlocksFromGraph(graphForLayout?.blocks ?? [], substitutionActive),
    [graphForLayout, substitutionActive]
  );

  const suggestions = useResumeSuggestionCards({
    userId,
    resumeId,
    resumeVersionId,
    session,
    importFactLedger,
    workingGraph: graphForLayout,
    enabled: Boolean(resumeVersionId),
    applyToDocument: applySuggestionToDocument,
    persistMatchResult,
    substitutionActive,
  });

  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const disabled = !resumeVersionId || status === "loading" || status === "saving";
  const jdLength = draft.jobDescriptionText.length;
  const tooLong = resumeJobDescriptionExceedsCap(draft.jobDescriptionText);

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
    if (resumeJobDescriptionExceedsCap(draft.jobDescriptionText)) return;
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

  const visibleSuggestionIds = useMemo(
    () => suggestions.cards.map((view) => view.suggestion.id),
    [suggestions.cards]
  );

  const focusSuggestionCard = useCallback((suggestionId: string | null) => {
    window.requestAnimationFrame(() => {
      focusResumeSuggestionReviewTarget(suggestionId);
    });
  }, []);

  const handleAcceptSuggestion = useCallback(
    async (suggestionId: string) => {
      const nextId = nextSuggestionIdAfterDismiss(visibleSuggestionIds, suggestionId);
      const dismissed = await suggestions.accept(suggestionId);
      if (dismissed) focusSuggestionCard(nextId);
    },
    [visibleSuggestionIds, suggestions, focusSuggestionCard]
  );

  const handleRejectSuggestion = useCallback(
    async (suggestionId: string) => {
      const nextId = nextSuggestionIdAfterDismiss(visibleSuggestionIds, suggestionId);
      const dismissed = await suggestions.reject(suggestionId);
      if (dismissed) focusSuggestionCard(nextId);
    },
    [visibleSuggestionIds, suggestions, focusSuggestionCard]
  );

  const handleNavigateSuggestionCard = useCallback(
    (currentId: string, direction: "next" | "prev") => {
      const neighbor = neighborSuggestionId(visibleSuggestionIds, currentId, direction);
      if (neighbor) focusSuggestionCard(neighbor);
    },
    [visibleSuggestionIds, focusSuggestionCard]
  );

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
          re-run Analyze. Accepting a suggestion rematches coverage on the new wording. Reset
          discards the saved description. Replace archives it, drops coverage, and starts a new one.
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
              <span style={styles.metaText}>Link to Career application</span>
              <select
                className="resume-application-link-select"
                value={resumeApplicationLinkSelectValue(draft.applicationId)}
                disabled={disabled}
                aria-label="Link to Career application"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    applicationId: parseResumeApplicationLinkSelectValue(event.target.value),
                  })
                }
              >
                <option value="">Not linked</option>
                {resumeApplicationLinkOptions(jobApplications, draft.applicationId).map(
                  (application) => (
                    <option key={application.id} value={application.id}>
                      {resumeApplicationLinkLabel(application)}
                    </option>
                  )
                )}
              </select>
              <span style={{ ...styles.helpText, margin: 0 }}>
                Optional. Saves a link on this job session only. It does not copy the resume into
                the application, change Career fields, or create a PDF.
              </span>
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

      {coverageView ? (
        <ResumeCoveragePanel view={coverageView} onOpenSkills={onOpenSkills} />
      ) : null}

      <ResumeChangesList
        diffs={versionOneDiffs}
        loading={versionOneBaseline.loading}
        error={versionOneBaseline.error}
        focusedBlockId={focusedBlockId}
        onFocusBlock={onFocusBlock}
      />

      <section aria-label="Resume suggestions" style={styles.card}>
        <div
          id={RESUME_SUGGESTIONS_HEADING_ID}
          tabIndex={-1}
          style={styles.cardTitle}
        >
          Suggestions
        </div>
        <p style={{ ...styles.helpText, margin: "0 0 10px 0" }}>
          Each card is one paragraph. Show in resume focuses that block. Accept writes the
          suggested wording into the Word document through the same formatting-safe patcher
          as typing, only if that paragraph has not changed since the suggestion was generated.
          After a successful Accept, job-match coverage rematches the current wording without
          re-running Analyze or treating unverified on-page terms as imported evidence.
          If a suggested line is likely to wrap, the card warns — Accept is not blocked.
          If you edit the paragraph first, the card is marked stale and Accept does not apply.
          Reject hides the card. Regenerating replaces the proposed wording after the same
          grounding checks. If formatting cannot be preserved, the document stays unchanged.{" "}
          {RESUME_SUGGESTION_KEYBOARD_HELP}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button
            type="button"
            aria-label="Generate resume suggestions"
            disabled={!suggestions.canGenerate}
            onClick={() => void suggestions.generate()}
          >
            Generate suggestions
          </button>
          {suggestions.generating ? (
            <button
              type="button"
              aria-label="Cancel generating resume suggestions"
              onClick={() => suggestions.cancelGenerate()}
            >
              Cancel
            </button>
          ) : null}
        </div>
        {suggestions.generateDisabledReason ? (
          <p style={{ ...styles.metaText, margin: "0 0 10px 0" }}>
            {suggestions.generateDisabledReason}
          </p>
        ) : null}
        {suggestions.generating && suggestions.generateProgress ? (
          <p style={{ ...styles.metaText, margin: "0 0 10px 0" }} role="status">
            Generating suggestion {suggestions.generateProgress.current} of{" "}
            {suggestions.generateProgress.total}
          </p>
        ) : null}
        {suggestions.generateError ? (
          <div style={{ ...styles.errorInline, margin: "0 0 10px 0" }} role="alert">
            <b>Could not generate suggestions:</b> {suggestions.generateError}
          </div>
        ) : null}
        {suggestions.reviewError ? (
          <div style={{ ...styles.errorInline, margin: "0 0 10px 0" }} role="alert">
            <b>Could not update suggestion:</b> {suggestions.reviewError}
          </div>
        ) : null}
        {suggestions.cards.length === 0 && !suggestions.generating ? (
          <p style={{ ...styles.metaText, margin: 0 }}>No suggestions yet.</p>
        ) : (
          <ul
            style={{ display: "grid", gap: 10, listStyle: "none", margin: 0, padding: 0 }}
          >
            {suggestions.cards.map((view) => {
              const layoutBlock = graphForLayout?.blocks.find(
                (block) => block.blockId === view.sourceBlockId
              );
              return (
              <li
                key={view.suggestion.id}
                aria-posinset={view.index}
                aria-setsize={view.total}
              >
                <SuggestionCard
                  view={view}
                  selected={focusedBlockId === view.sourceBlockId}
                  proposedDraft={
                    suggestions.drafts[view.suggestion.id] ?? view.suggestion.proposedText
                  }
                  busy={
                    suggestions.busySuggestionId === view.suggestion.id || suggestions.generating
                  }
                  requirements={suggestions.requirements}
                  layoutRuns={layoutBlock?.runs ?? []}
                  documentBlocks={layoutDocumentBlocks}
                  substitutionActive={substitutionActive}
                  onProposedDraftChange={(text) => suggestions.setDraft(view.suggestion.id, text)}
                  onFocusBlock={(blockId) => onFocusBlock?.(blockId)}
                  onAccept={() => void handleAcceptSuggestion(view.suggestion.id)}
                  onReject={() => void handleRejectSuggestion(view.suggestion.id)}
                  onNavigateCard={(direction) =>
                    handleNavigateSuggestionCard(view.suggestion.id, direction)
                  }
                  onRegenerate={(options) => void suggestions.regenerate(view.suggestion.id, options)}
                />
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
