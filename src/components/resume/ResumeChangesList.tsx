import { truncateForAriaLabel } from "../../core/resume/resumeBlockEdit";
import type { ResumeBlockDiff } from "../../core/resume/resumeDiff";
import { resumeBlockDiffCountLabel } from "../../core/resume/resumeDiff";
import { suggestionPlaintextDiff } from "../../core/resume/resumeSuggestionCards";
import { styles } from "../../ui/appStyles";
import "./resumeEditor.css";

export type ResumeChangesListProps = {
  diffs: readonly ResumeBlockDiff[];
  loading?: boolean;
  error?: string | null;
  focusedBlockId?: string | null;
  onFocusBlock?: (blockId: string) => void;
};

const KIND_LABEL: Record<ResumeBlockDiff["kind"], string> = {
  changed: "Changed",
  added: "Added in this copy",
  removed: "Removed from this copy",
};

/**
 * Simple list of paragraphs that differ from version 1 (Phase 9C). Original /
 * Current labels, not color-only. Click focuses the live block when it still
 * exists. This is not an ATS score.
 */
export function ResumeChangesList({
  diffs,
  loading = false,
  error = null,
  focusedBlockId = null,
  onFocusBlock,
}: ResumeChangesListProps) {
  return (
    <section aria-label="Changes versus version 1" className="resume-changes-list" style={styles.card}>
      <div style={styles.cardTitle}>Changes vs version 1</div>
      <p style={{ ...styles.helpText, margin: "0 0 10px 0" }}>
        Paragraphs that differ from this library item's first saved version (the immutable original
        for this resume). Edits you type or Accept show here. This is not an employer ATS score and
        does not predict ranking.
      </p>
      {loading ? (
        <p style={{ ...styles.metaText, margin: 0 }} role="status">
          Loading version 1 comparison…
        </p>
      ) : null}
      {error ? (
        <div style={{ ...styles.errorInline, margin: "0 0 10px 0" }} role="alert">
          <b>Could not compare to version 1:</b> {error}
        </div>
      ) : null}
      {!loading && !error ? (
        <p style={{ ...styles.metaText, margin: "0 0 10px 0" }}>{resumeBlockDiffCountLabel(diffs.length)}</p>
      ) : null}
      {!loading && !error && diffs.length > 0 ? (
        <ul style={{ display: "grid", gap: 10, listStyle: "none", margin: 0, padding: 0 }}>
          {diffs.map((diff, index) => {
            const titleId = `resume-change-title-${diff.blockId}`;
            const selected = focusedBlockId === diff.blockId;
            const canFocus = diff.kind !== "removed";
            return (
              <li key={diff.blockId}>
                <article
                  className="resume-change-card"
                  style={{
                    ...styles.card,
                    margin: 0,
                    border: selected
                      ? "1px solid var(--aether-accent, #46c6ff)"
                      : "1px solid var(--aether-border, #e5e5e5)",
                  }}
                  aria-labelledby={titleId}
                  aria-current={selected ? "true" : undefined}
                >
                  <h3 id={titleId} style={{ ...styles.cardTitle, fontSize: 15, marginBottom: 8 }}>
                    {KIND_LABEL[diff.kind]} · {index + 1} of {diffs.length}
                  </h3>
                  {diff.kind === "changed" ? (
                    <ChangedPreview diff={diff} />
                  ) : diff.kind === "added" ? (
                    <p style={{ ...styles.metaText, margin: "0 0 10px 0" }}>
                      <span style={styles.statLabel}>Current </span>
                      {truncateForAriaLabel(diff.currentText)}
                    </p>
                  ) : (
                    <p style={{ ...styles.metaText, margin: "0 0 10px 0" }}>
                      <span style={styles.statLabel}>Version 1 </span>
                      {truncateForAriaLabel(diff.baseText)}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={!canFocus || !onFocusBlock}
                    aria-label={`Show this paragraph in the resume. ${truncateForAriaLabel(
                      diff.currentText || diff.baseText
                    )}`}
                    onClick={() => {
                      if (canFocus) onFocusBlock?.(diff.blockId);
                    }}
                  >
                    Show in resume
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function ChangedPreview({ diff }: { diff: ResumeBlockDiff }) {
  const originalTokens = suggestionPlaintextDiff(diff.baseText, diff.currentText).filter(
    (token) => token.kind !== "added"
  );
  const currentTokens = suggestionPlaintextDiff(diff.baseText, diff.currentText).filter(
    (token) => token.kind !== "removed"
  );
  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
      <p style={{ ...styles.metaText, margin: 0 }}>
        <span style={styles.statLabel}>Version 1 </span>
        {originalTokens.map((token, index) =>
          token.kind === "removed" ? (
            <del key={`v1-${index}`} className="resume-suggestion-del">
              {token.text}
            </del>
          ) : (
            <span key={`v1-${index}`}>{token.text}</span>
          )
        )}
      </p>
      <p style={{ ...styles.metaText, margin: 0 }}>
        <span style={styles.statLabel}>Current </span>
        {currentTokens.map((token, index) =>
          token.kind === "added" ? (
            <ins key={`cur-${index}`} className="resume-suggestion-ins">
              {token.text}
            </ins>
          ) : (
            <span key={`cur-${index}`}>{token.text}</span>
          )
        )}
      </p>
    </div>
  );
}
