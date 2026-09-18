import { useMemo, useState, type KeyboardEvent } from "react";
import {
  compareSuggestionLineLayoutForBlock,
  createCanvasMeasureTextFn,
  suggestionLayoutBlocksAccept,
  suggestionLineLayoutWarning,
  type LayoutDocumentBlock,
  type LayoutRunHint,
} from "../../core/resume/resumeLayout";
import type { Requirement } from "../../core/resume/resumeModel";
import {
  isSuggestionShortcutEditableTarget,
  resumeSuggestionReviewShortcut,
  suggestionCardElementId,
} from "../../core/resume/resumeSuggestionA11y";
import {
  suggestionPlaintextDiff,
  type SuggestionCardView,
} from "../../core/resume/resumeSuggestionCards";
import type { ResumeRegenerationOptions } from "../../core/resume/resumeSuggestionState";
import { styles } from "../../ui/appStyles";
import "./resumeEditor.css";

export type SuggestionCardProps = {
  view: SuggestionCardView;
  selected?: boolean;
  proposedDraft: string;
  busy?: boolean;
  requirements: readonly Requirement[];
  layoutRuns?: readonly LayoutRunHint[];
  documentBlocks?: readonly LayoutDocumentBlock[];
  substitutionActive?: boolean;
  onProposedDraftChange: (text: string) => void;
  onFocusBlock: (blockId: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onNavigateCard?: (direction: "next" | "prev") => void;
  onRegenerate: (options: ResumeRegenerationOptions) => void;
};

/**
 * Review card for one block rewrite (Phase 7B–8C, 10C). Original / Suggested
 * labels plus del/ins. Line-wrap, page-count, and fingerprint-stale warnings
 * compare snapshot vs draft (warn-only; Accept stays enabled). Font load
 * (Carlito vs Calibri) invalidates stored layout reports and recomputes live.
 * Accept patches the Word file when the original-text hash still matches;
 * stale cards stay visible for regenerate. Reject persists a decision.
 * Alt+Enter / Alt+Backspace are extras; buttons remain the primary path.
 */
export function SuggestionCard({
  view,
  selected = false,
  proposedDraft,
  busy = false,
  requirements,
  layoutRuns = [],
  documentBlocks = [],
  substitutionActive = false,
  onProposedDraftChange,
  onFocusBlock,
  onAccept,
  onReject,
  onNavigateCard,
  onRegenerate,
}: SuggestionCardProps) {
  const [emphasizeRequirementId, setEmphasizeRequirementId] = useState("");
  const titleId = `resume-suggestion-title-${view.suggestion.id}`;
  const cardId = suggestionCardElementId(view.suggestion.id);
  const originalId = `resume-suggestion-original-${view.suggestion.id}`;
  const suggestedId = `resume-suggestion-suggested-${view.suggestion.id}`;
  const editId = `resume-suggestion-edit-${view.suggestion.id}`;
  const emphasizeId = `resume-suggestion-emphasize-${view.suggestion.id}`;
  const layoutWarningId = `resume-suggestion-layout-${view.suggestion.id}`;

  const originalTokens = suggestionPlaintextDiff(view.suggestion.originalText, proposedDraft).filter(
    (token) => token.kind !== "added"
  );
  const suggestedTokens = suggestionPlaintextDiff(view.suggestion.originalText, proposedDraft).filter(
    (token) => token.kind !== "removed"
  );

  const measure = useMemo(() => createCanvasMeasureTextFn(), []);
  const lineLayout = compareSuggestionLineLayoutForBlock({
    originalText: view.suggestion.originalText,
    candidateText: proposedDraft,
    runs: layoutRuns,
    measure,
    substitutionActive,
    documentBlocks,
    targetBlockId: view.sourceBlockId,
  });
  const layoutWarning = suggestionLineLayoutWarning(lineLayout, {
    storedLayout: view.suggestion.layoutConstraint,
  });
  const acceptBlockedByLayout = suggestionLayoutBlocksAccept(lineLayout);
  const acceptDisabled = busy || view.stale || acceptBlockedByLayout;

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    const action = resumeSuggestionReviewShortcut({
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      targetIsEditable: isSuggestionShortcutEditableTarget(event.target),
    });
    if (!action) return;
    if (action === "accept") {
      if (acceptDisabled) return;
      event.preventDefault();
      onAccept();
      return;
    }
    if (action === "reject") {
      if (busy) return;
      event.preventDefault();
      onReject();
      return;
    }
    event.preventDefault();
    onNavigateCard?.(action === "nextCard" ? "next" : "prev");
  }

  return (
    <article
      id={cardId}
      className="resume-suggestion-card"
      tabIndex={0}
      style={{
        ...styles.card,
        margin: 0,
        border: selected
          ? "1px solid var(--aether-accent, #46c6ff)"
          : "1px solid var(--aether-border, #e5e5e5)",
      }}
      aria-label={view.ariaLabel}
      aria-labelledby={titleId}
      aria-describedby={`${originalId} ${suggestedId}${layoutWarning ? ` ${layoutWarningId}` : ""}`}
      aria-current={selected ? "true" : undefined}
      aria-busy={busy || undefined}
      onKeyDown={handleCardKeyDown}
    >
      <h3 id={titleId} style={{ ...styles.cardTitle, fontSize: 15, marginBottom: 8 }}>
        {view.title}
      </h3>
      <p style={{ ...styles.metaText, margin: "0 0 10px 0" }}>{view.suggestion.reasoning}</p>
      {view.suggestion.status === "blocked_formatting" ? (
        <p style={{ ...styles.metaText, margin: "0 0 10px 0" }} role="status">
          This wording could not be applied without flattening formatting. Edit it or regenerate,
          then Accept again. The Word document is unchanged.
        </p>
      ) : null}
      {view.stale ? (
        <p style={{ ...styles.metaText, margin: "0 0 10px 0" }} role="status">
          This paragraph changed after the suggestion was generated. Accept cannot apply it.
          Regenerate using the current wording. The Word document is unchanged.
        </p>
      ) : null}
      {layoutWarning ? (
        <p
          id={layoutWarningId}
          style={{ ...styles.statusWarning, ...styles.metaText, margin: "0 0 10px 0", padding: 8 }}
          role="status"
        >
          {layoutWarning}
        </p>
      ) : null}

      <div id={originalId} style={{ display: "grid", gap: 4, marginBottom: 10 }}>
        <div style={styles.statLabel}>{view.originalLabel}</div>
        <p style={{ margin: 0 }}>
          {originalTokens.map((token, index) =>
            token.kind === "removed" ? (
              <del key={index} className="resume-suggestion-del">
                {token.text}
              </del>
            ) : (
              <span key={index}>{token.text}</span>
            )
          )}
        </p>
      </div>

      <div id={suggestedId} style={{ display: "grid", gap: 4, marginBottom: 12 }}>
        <div style={styles.statLabel}>{view.suggestedLabel}</div>
        <p style={{ margin: 0 }}>
          {suggestedTokens.map((token, index) =>
            token.kind === "added" ? (
              <ins key={index} className="resume-suggestion-ins">
                {token.text}
              </ins>
            ) : (
              <span key={index}>{token.text}</span>
            )
          )}
        </p>
      </div>

      <label htmlFor={editId} style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        <span style={styles.statLabel}>Edit suggested wording</span>
        <textarea
          id={editId}
          value={proposedDraft}
          disabled={busy}
          rows={4}
          spellCheck
          onChange={(event) => onProposedDraftChange(event.target.value)}
          style={{ width: "100%", resize: "vertical", boxSizing: "border-box" }}
        />
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <button
          type="button"
          aria-label={`${view.title}. Show this paragraph in the resume.`}
          disabled={busy}
          onClick={() => onFocusBlock(view.sourceBlockId)}
        >
          Show in resume
        </button>
        <button
          type="button"
          aria-label={`${view.title}. Accept this suggestion.`}
          aria-keyshortcuts="Alt+Enter"
          disabled={acceptDisabled}
          onClick={onAccept}
        >
          Accept
        </button>
        <button
          type="button"
          aria-label={`${view.title}. Reject this suggestion.`}
          aria-keyshortcuts="Alt+Backspace"
          disabled={busy}
          onClick={onReject}
        >
          Reject
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={styles.statLabel}>Regenerate</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            aria-label={`${view.title}. Regenerate a shorter suggestion.`}
            disabled={busy}
            onClick={() => onRegenerate({ shorter: true })}
          >
            Shorter
          </button>
          <button
            type="button"
            aria-label={`${view.title}. Regenerate closer to the original wording.`}
            disabled={busy}
            onClick={() => onRegenerate({ closerToOriginal: true })}
          >
            Closer to original
          </button>
        </div>
        <label htmlFor={emphasizeId} style={{ display: "grid", gap: 6 }}>
          <span style={styles.metaText}>Emphasize requirement</span>
          <select
            id={emphasizeId}
            value={emphasizeRequirementId}
            disabled={busy || requirements.length === 0}
            onChange={(event) => setEmphasizeRequirementId(event.target.value)}
          >
            <option value="">Choose a requirement</option>
            {requirements.map((requirement) => (
              <option key={requirement.id} value={requirement.id}>
                {requirement.priority}: {requirement.text}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label={`${view.title}. Regenerate emphasizing the selected requirement.`}
          disabled={busy || !emphasizeRequirementId}
          onClick={() =>
            onRegenerate({ emphasizeRequirementId: emphasizeRequirementId || undefined })
          }
        >
          Emphasize selected requirement
        </button>
      </div>
    </article>
  );
}
