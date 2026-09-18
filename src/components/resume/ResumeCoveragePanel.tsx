import {
  assertHonestCoverageCopy,
  coverageCopyBlob,
  type CoverageListItem,
  type ResumeCoverageView,
} from "../../core/resume/resumeCoverage";
import { styles } from "../../ui/appStyles";

export type ResumeCoveragePanelProps = {
  view: ResumeCoverageView;
  /** Opens Skills. Does not add missing terms to the tracker. */
  onOpenSkills?: () => void;
};

/**
 * Honest coverage + parseability (Phase 5E). Architecture §31 / ADR-014:
 * named bars, missing list, unverified label. Never an "ATS Score".
 */
export function ResumeCoveragePanel({ view, onOpenSkills }: ResumeCoveragePanelProps) {
  assertHonestCoverageCopy(coverageCopyBlob(view));

  return (
    <section aria-label="Job match coverage" className="resume-coverage-panel" style={styles.card}>
      <div style={styles.cardTitle}>Job match coverage</div>
      <p style={{ ...styles.helpText, margin: "0 0 10px 0" }}>{view.disclosure}</p>
      <p style={{ ...styles.metaText, margin: "0 0 12px 0" }}>{view.heuristicCaption}</p>

      <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
        {view.bars.map((bar) => {
          const percent = bar.total > 0 ? Math.min(100, (bar.count / bar.total) * 100) : 0;
          const labelId = `resume-coverage-${bar.id}`;
          return (
            <div key={bar.id} style={{ display: "grid", gap: 4 }}>
              <div style={styles.statLabel} id={labelId}>
                {bar.label}
              </div>
              <div
                style={styles.progressTrack}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={bar.total}
                aria-valuenow={bar.total > 0 ? Math.min(bar.count, bar.total) : 0}
                aria-labelledby={labelId}
              >
                <div style={{ ...styles.progressFill, width: `${percent}%` }} />
              </div>
              <span style={styles.metaText}>{bar.detail}</span>
            </div>
          );
        })}
      </div>

      <p style={{ ...styles.metaText, margin: "0 0 12px 0" }}>
        Related wording matches (shown separately from explicit coverage):{" "}
        <strong>{view.semanticSupportedCount}</strong>
      </p>

      <CoverageList
        title="Missing required"
        empty="No missing required terms."
        items={view.missingRequired}
      />
      {onOpenSkills ? (
        <p style={{ ...styles.helpText, margin: "0 0 12px 0" }}>
          Review missing terms in the Skills tracker if you want to log them there. Opening Skills
          does not add requirements automatically.{" "}
          <button type="button" style={styles.smallBtn} onClick={onOpenSkills}>
            Open Skills tracker
          </button>
        </p>
      ) : null}
      <CoverageList title="Uncertain" empty="No uncertain matches." items={view.uncertain} />
      <CoverageList
        title="On this document (unverified)"
        empty="No unverified on-page terms."
        items={view.onPageUnverified}
        emphasizeUnverified
      />
      <CoverageList
        title="Conflicts with imported facts"
        empty="No contradicted requirements."
        items={view.contradicted}
      />

      <div style={{ marginTop: 12 }}>
        <div style={{ ...styles.cardTitle, fontSize: 14 }}>Parseability checks</div>
        {view.parseabilityWarnings.length === 0 ? (
          <p style={{ ...styles.metaText, margin: "6px 0 0 0" }}>
            No parseability warnings on this working copy. These checks are not a vendor ATS
            result.
          </p>
        ) : (
          <ul className="resume-coverage-list">
            {view.parseabilityWarnings.map((warning) => (
              <li key={`${warning.code}-${warning.message}`}>
                {warning.message}
                {warning.occurrences > 1 ? ` (${warning.occurrences})` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CoverageList({
  title,
  empty,
  items,
  emphasizeUnverified = false,
}: {
  title: string;
  empty: string;
  items: CoverageListItem[];
  emphasizeUnverified?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...styles.cardTitle, fontSize: 14 }}>{title}</div>
      {items.length === 0 ? (
        <p style={{ ...styles.metaText, margin: "6px 0 0 0" }}>{empty}</p>
      ) : (
        <ul className="resume-coverage-list">
          {items.map((item) => (
            <li key={item.requirementId}>
              <span>{item.text}</span>
              <span
                className={
                  emphasizeUnverified || item.status === "on_page_unverified"
                    ? "resume-coverage-unverified"
                    : "resume-coverage-status"
                }
              >
                {item.statusLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
