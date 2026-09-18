import { useRef, useState } from "react";
import type { JobApplication } from "../../core/model";
import type {
  ApplyAcceptedSuggestionToDocumentInput,
  ApplyAcceptedSuggestionToDocumentResult,
} from "../../core/resume/resumeSuggestionApply";
import type { ResumeStructureGraph } from "../../core/resume/resumeModel";
import {
  RESUME_MOBILE_ANALYSIS_SUMMARY,
  RESUME_MOBILE_FIDELITY_BANNER,
} from "../../core/resume/resumeMobileLayout";
import { styles } from "../../ui/appStyles";
import { useIsDesktopViewport } from "../../ui/useMediaQuery";
import { ResumeAnalysisPanel } from "./ResumeAnalysisPanel";
import { ResumeDocumentPane } from "./ResumeDocumentPane";
import { ResumeSection } from "./ResumeSection";
import { useResumeVersion } from "./useResumeVersion";
import { useResumes } from "./useResumes";
import "./resumeEditor.css";

export type ResumeWorkspaceProps = {
  userId: string;
  jobApplications: JobApplication[];
  /** Opens the Skills page. Must not add tracker skills. */
  onOpenSkills?: () => void;
};

/**
 * Career Resume pane (library + editor + analysis). Loaded via `React.lazy`
 * from CareerPage so JSZip / OOXML stay out of the main chunk (Phase 10F).
 */
export default function ResumeWorkspace({
  userId,
  jobApplications,
  onOpenSkills,
}: ResumeWorkspaceProps) {
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [workingGraph, setWorkingGraph] = useState<ResumeStructureGraph | null>(null);
  const resumeExportRoleRef = useRef("");
  const [resumeFocusBlockId, setResumeFocusBlockId] = useState<string | null>(null);
  const [resumeFocusNonce, setResumeFocusNonce] = useState(0);
  const coveragePrepareRef = useRef<(() => Promise<ResumeStructureGraph | null>) | null>(
    null
  );
  const suggestionApplyRef = useRef<
    | ((
        input: ApplyAcceptedSuggestionToDocumentInput
      ) => Promise<ApplyAcceptedSuggestionToDocumentResult>)
    | null
  >(null);
  const isDesktop = useIsDesktopViewport();

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
    saveAsNewResume,
  } = useResumes(userId, { enabled: true });

  const selectedResume = resumes.find((resume) => resume.id === selectedResumeId) ?? null;
  const {
    version: selectedVersion,
    loading: previewLoading,
    error: previewError,
  } = useResumeVersion(userId, selectedResume, {
    enabled: selectedResume !== null,
  });

  const resumeAnalysisPanel = selectedResume ? (
    <ResumeAnalysisPanel
      key={selectedResume.id}
      userId={userId}
      resumeId={selectedResume.id}
      resumeVersionId={selectedResume.activeVersionId}
      importFactLedger={selectedResume.importFactLedger}
      extractedStructure={selectedVersion?.extractedStructure ?? null}
      originalStoragePath={selectedVersion?.originalStoragePath ?? null}
      workingGraph={workingGraph}
      prepareWorkingGraph={() =>
        coveragePrepareRef.current?.() ?? Promise.resolve(workingGraph)
      }
      applySuggestionToDocument={(input) =>
        suggestionApplyRef.current?.(input) ??
        Promise.resolve({
          ok: false,
          code: "not_ready",
          message:
            "Open the resume preview before accepting a suggestion into the Word document.",
        })
      }
      focusedBlockId={resumeFocusBlockId}
      onFocusBlock={(blockId) => {
        setResumeFocusBlockId(blockId);
        setResumeFocusNonce((nonce) => nonce + 1);
      }}
      onExportRoleChange={(jobTitle) => {
        resumeExportRoleRef.current = jobTitle;
      }}
      jobApplications={jobApplications.map((application) => ({
        id: application.id,
        company: application.company,
        roleTitle: application.roleTitle,
      }))}
      onOpenSkills={onOpenSkills}
    />
  ) : null;

  return (
    <>
      {!isDesktop ? (
        <div
          role="status"
          style={{
            ...styles.statusWarning,
            padding: 10,
            borderRadius: 12,
          }}
        >
          {RESUME_MOBILE_FIDELITY_BANNER}
        </div>
      ) : null}
      <ResumeSection
        resumes={resumes}
        loading={resumesLoading}
        uploading={resumeUploading}
        mutatingId={resumeMutatingId}
        selectedResumeId={selectedResumeId}
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
          if (resumeId === selectedResumeId) {
            setSelectedResumeId(null);
            setWorkingGraph(null);
            setResumeFocusBlockId(null);
          }
          void deleteResume(resumeId);
        }}
        onDuplicate={(resumeId) => {
          void duplicateResume(resumeId);
        }}
        onOpen={(resumeId) => {
          setWorkingGraph(null);
          setResumeFocusBlockId(null);
          setResumeFocusNonce(0);
          resumeExportRoleRef.current = "";
          setSelectedResumeId((current) => (current === resumeId ? null : resumeId));
        }}
      />
      {selectedResume && (
        <div
          className={
            isDesktop ? "resume-workspace resume-workspace--desktop" : "resume-workspace"
          }
        >
          <div className="resume-workspace-document">
            <ResumeDocumentPane
              key={selectedResume.id}
              resumeName={selectedResume.name}
              jobRoleRef={resumeExportRoleRef}
              userId={userId}
              resumeId={selectedResume.id}
              versionId={selectedVersion?.id}
              versionN={selectedVersion?.versionN}
              versionLabel={selectedVersion?.label}
              resumeUpdatedAtIso={selectedResume.updatedAtIso}
              workingStoragePath={selectedVersion?.workingStoragePath}
              extractedStructure={selectedVersion?.extractedStructure}
              graph={selectedVersion?.extractedStructure.graph}
              loading={previewLoading}
              error={previewError}
              onWorkingGraphChange={setWorkingGraph}
              coveragePrepareRef={coveragePrepareRef}
              suggestionApplyRef={suggestionApplyRef}
              focusedBlockId={resumeFocusBlockId}
              focusNonce={resumeFocusNonce}
              savingAsNew={resumeMutatingId === selectedResume.id}
              isDesktopViewport={isDesktop}
              onSaveAsNew={async (bytes) => {
                return saveAsNewResume(
                  selectedResume.id,
                  bytes,
                  resumeExportRoleRef.current
                );
              }}
              onClose={() => {
                setWorkingGraph(null);
                setResumeFocusBlockId(null);
                resumeExportRoleRef.current = "";
                setSelectedResumeId(null);
              }}
            />
          </div>
          <div className="resume-workspace-analysis">
            {isDesktop ? (
              resumeAnalysisPanel
            ) : (
              <details className="resume-analysis-collapsible" open>
                <summary>{RESUME_MOBILE_ANALYSIS_SUMMARY}</summary>
                {resumeAnalysisPanel}
              </details>
            )}
          </div>
        </div>
      )}
    </>
  );
}
