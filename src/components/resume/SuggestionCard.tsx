import type { SuggestionCardView } from "../../core/resume/resumeSuggestionCards";
import { styles } from "../../ui/appStyles";
import "./resumeEditor.css";

export type SuggestionCardProps = {
  view: SuggestionCardView;
  selected?: boolean;
  onFocusBlock: (blockId: string) => void;
};

/**
 * Review card for one block rewrite (Phase 7A). Original / Suggested are
 * labeled in text; del/ins is extra, not the only cue. Click focuses the
 * matching resume paragraph. No accept / reject / regenerate here (7B).
 */
export function SuggestionCard({ view, selected = false, onFocusBlock }: SuggestionCardProps) {
  const titleId = `resume-suggestion-title-${view.suggestion.id}`;
  const originalId = `resume-suggestion-original-${view.suggestion.id}`;
  const suggestedId = `resume-suggestion-suggested-${view.suggestion.id}`;

  return (
    <article
      className="resume-suggestion-card"
      style={{
        ...styles.card,
        margin: 0,
        border: selected
          ? "1px solid var(--aether-accent, #46c6ff)"
          : "1px solid var(--aether-border, #e5e5e5)",
      }}
      aria-labelledby={titleId}
      aria-describedby={`${originalId} ${suggestedId}`}
      aria-current={selected ? "true" : undefined}
    >
      <h3 id={titleId} style={{ ...styles.cardTitle, fontSize: 15, marginBottom: 8 }}>
        {view.title}
      </h3>
      <p style={{ ...styles.metaText, margin: "0 0 10px 0" }}>{view.suggestion.reasoning}</p>

      <div id={originalId} style={{ display: "grid", gap: 4, marginBottom: 10 }}>
        <div style={styles.statLabel}>{view.originalLabel}</div>
        <p style={{ margin: 0 }}>
          {view.originalTokens.map((token, index) =>
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
          {view.suggestedTokens.map((token, index) =>
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

      <button
        type="button"
        aria-label={`${view.title}. Show this paragraph in the resume.`}
        onClick={() => onFocusBlock(view.sourceBlockId)}
      >
        Show in resume
      </button>
    </article>
  );
}
