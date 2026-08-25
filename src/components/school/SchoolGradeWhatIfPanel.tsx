import {
  formatNeedForACaption,
  formatSchoolGradePercent,
  type SchoolGradeWhatIf,
} from "../../core/schoolGrades";
import { styles } from "../../ui/appStyles";

export type SchoolGradeWhatIfPanelProps = {
  snapshot: SchoolGradeWhatIf;
  compact?: boolean;
};

function letterSuffix(letter?: string): string {
  return letter ? ` ${letter}` : "";
}

function Stat({
  label,
  value,
  letter,
}: {
  label: string;
  value?: number;
  letter?: string;
}) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>
        {value === undefined ? "—" : formatSchoolGradePercent(value)}
        {letterSuffix(letter)}
      </div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

export function SchoolGradeWhatIfPanel({ snapshot, compact = false }: SchoolGradeWhatIfPanelProps) {
  if (snapshot.aStatus === "empty" && snapshot.categories.length === 0) return null;

  if (compact) {
    const current =
      snapshot.currentPercent === undefined
        ? "—"
        : `${formatSchoolGradePercent(snapshot.currentPercent)}${letterSuffix(snapshot.currentLetter)}`;
    return (
      <p style={{ ...styles.helpText, margin: 0 }}>
        {snapshot.aStatus === "empty"
          ? formatNeedForACaption(snapshot)
          : `Current ${current} · min ${formatSchoolGradePercent(snapshot.minPercent)}${letterSuffix(snapshot.minLetter)} · max ${formatSchoolGradePercent(snapshot.maxPercent)}${letterSuffix(snapshot.maxLetter)}. ${formatNeedForACaption(snapshot)}`}
      </p>
    );
  }

  return (
    <section
      style={{ ...styles.dashboardSection, display: "grid", gap: 10, padding: 10 }}
      aria-label="Grade what-if"
    >
      {snapshot.aStatus === "empty" ? (
        <p style={{ ...styles.helpText, margin: 0 }}>{formatNeedForACaption(snapshot)}</p>
      ) : (
        <>
          <div style={styles.dashboardGrid}>
            <Stat label="Current" value={snapshot.currentPercent} letter={snapshot.currentLetter} />
            <Stat label="Min remaining 0%" value={snapshot.minPercent} letter={snapshot.minLetter} />
            <Stat
              label="Max remaining 100%"
              value={snapshot.maxPercent}
              letter={snapshot.maxLetter}
            />
          </div>
          <p style={{ ...styles.helpText, margin: 0 }}>{formatNeedForACaption(snapshot)}</p>
        </>
      )}
    </section>
  );
}
