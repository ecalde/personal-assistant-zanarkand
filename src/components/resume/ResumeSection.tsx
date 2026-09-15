import { useState, type ChangeEvent } from "react";
import {
  RESUME_DOCX_CONTENT_TYPE,
  RESUME_UPLOAD_MAX_BYTES,
} from "../../core/resume/resumeFileValidation";
import { validateResumeName } from "../../core/resume/resumeLibrary";
import type { Resume } from "../../core/resume/resumeModel";
import { styles } from "../../ui/appStyles";

export type ResumeSectionProps = {
  resumes: Resume[];
  loading?: boolean;
  uploading?: boolean;
  /** Resume id currently being renamed / set-default / deleted, or null. */
  mutatingId?: string | null;
  error?: string | null;
  onUpload: (file: File) => void;
  onRename: (resumeId: string, name: string) => void;
  onSetDefault: (resumeId: string) => void;
  onDelete: (resumeId: string) => void;
  onDuplicate: (resumeId: string) => void;
};

const MAX_MEGABYTES = Math.round(RESUME_UPLOAD_MAX_BYTES / (1024 * 1024));

export function ResumeSection({
  resumes,
  loading = false,
  uploading = false,
  mutatingId = null,
  error = null,
  onUpload,
  onRename,
  onSetDefault,
  onDelete,
  onDuplicate,
}: ResumeSectionProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear the picker so re-selecting the same file fires another change event.
    event.target.value = "";
    if (file) onUpload(file);
  }

  function startRename(resume: Resume) {
    setRenamingId(resume.id);
    setRenameValue(resume.name);
    setRenameError(null);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
    setRenameError(null);
  }

  function submitRename(resumeId: string) {
    const validationError = validateResumeName(renameValue);
    if (validationError) {
      setRenameError(validationError);
      return;
    }
    onRename(resumeId, renameValue);
    cancelRename();
  }

  function handleDelete(resume: Resume) {
    const confirmed = window.confirm(
      `Delete "${resume.name}"? This permanently removes the resume and its stored files.`
    );
    if (confirmed) onDelete(resume.id);
  }

  return (
    <section aria-label="Resume library" style={{ display: "grid", gap: 14 }}>
      <div style={styles.card}>
        <div style={styles.cardTitle}>Add a resume</div>
        <p style={{ ...styles.helpText, margin: "0 0 10px 0" }}>
          Word .docx only, up to {MAX_MEGABYTES} MB. Macro-enabled files are not accepted. Your
          original upload is kept unchanged in your private cloud storage.
        </p>
        <label style={{ display: "inline-grid", gap: 6 }}>
          <span style={styles.metaText}>Word document</span>
          <input
            type="file"
            accept={`.docx,${RESUME_DOCX_CONTENT_TYPE}`}
            disabled={uploading}
            onChange={handleFileChange}
          />
        </label>
        {uploading && (
          <p style={{ ...styles.metaText, margin: "10px 0 0 0" }} role="status">
            Uploading to your cloud account…
          </p>
        )}
        {error && <div style={styles.errorInline}>{error}</div>}
      </div>

      {loading && resumes.length === 0 ? (
        <p style={{ ...styles.helpText, margin: 0 }}>Loading resumes…</p>
      ) : resumes.length === 0 ? (
        <p style={{ ...styles.helpText, margin: 0 }}>No resumes yet.</p>
      ) : (
        <ul style={{ display: "grid", gap: 10, listStyle: "none", margin: 0, padding: 0 }}>
          {resumes.map((resume) => {
            const busy = mutatingId === resume.id;
            const isRenaming = renamingId === resume.id;
            return (
              <li key={resume.id} style={styles.listRow}>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700 }}>{resume.name}</span>
                      {resume.isDefault && (
                        <span style={styles.metaText} aria-label="Default resume">
                          · Default
                        </span>
                      )}
                    </div>
                    <div style={styles.metaText}>
                      {resume.sourceFilename} · added {formatUploadedOn(resume.createdAtIso)}
                    </div>
                  </div>

                  {!isRenaming && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {!resume.isDefault && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onSetDefault(resume.id)}
                        >
                          Set default
                        </button>
                      )}
                      <button type="button" disabled={busy} onClick={() => startRename(resume)}>
                        Rename
                      </button>
                      <button type="button" disabled={busy} onClick={() => onDuplicate(resume.id)}>
                        Duplicate
                      </button>
                      <button type="button" disabled={busy} onClick={() => handleDelete(resume)}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {isRenaming && (
                  <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={styles.metaText}>Resume name</span>
                      <input
                        type="text"
                        value={renameValue}
                        autoFocus
                        disabled={busy}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") submitRename(resume.id);
                          if (event.key === "Escape") cancelRename();
                        }}
                      />
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => submitRename(resume.id)}
                      >
                        Save
                      </button>
                      <button type="button" disabled={busy} onClick={cancelRename}>
                        Cancel
                      </button>
                    </div>
                    {renameError && <div style={styles.errorInline}>{renameError}</div>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatUploadedOn(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? "recently" : parsed.toLocaleDateString();
}
