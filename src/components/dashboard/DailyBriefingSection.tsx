import type { CSSProperties } from "react";
import type { BriefingTone, DailyBriefing } from "../../core/briefing";
import { styles } from "../../ui/appStyles";

export type DailyBriefingSectionProps = {
  briefing: DailyBriefing;
};

const TONE_SECTION_STYLES: Record<BriefingTone, CSSProperties> = {
  neutral: {},
  encouraging: styles.briefingToneSuccess,
  warning: styles.briefingToneWarm,
};

function splitSummaryLines(summary: string): string[] {
  return summary.split(/(?<=\.)\s+/).filter((line) => line.trim().length > 0);
}

export function DailyBriefingSection({ briefing }: DailyBriefingSectionProps) {
  const summaryLines = splitSummaryLines(briefing.summary);
  const sectionStyle: CSSProperties = {
    ...styles.dashboardSection,
    ...TONE_SECTION_STYLES[briefing.tone],
  };

  return (
    <section style={sectionStyle} aria-label="Daily briefing">
      <h2 style={{ fontWeight: 800, margin: "0 0 10px 0", fontSize: 16 }}>Daily briefing</h2>

      <p
        style={{
          margin: "0 0 12px 0",
          fontWeight: 800,
          fontSize: 20,
          lineHeight: 1.3,
        }}
      >
        {briefing.greeting}
      </p>

      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {summaryLines.map((line) => (
          <p key={line} style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
            {line}
          </p>
        ))}
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, ...styles.textSecondary }}>
          {briefing.workloadSummary}
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, ...styles.textSecondary }}>
          {briefing.focusSummary}
        </p>
      </div>

      {briefing.recommendations.length > 0 && (
        <div
          style={{
            marginBottom: briefing.riskFlags.length > 0 ? 12 : 0,
            paddingTop: 10,
            borderTop: "1px solid var(--aether-panel-border, #ececec)",
          }}
        >
          <h3
            style={{
              fontWeight: 600,
              margin: "0 0 6px 0",
              fontSize: 13,
              ...styles.textMuted,
            }}
          >
            More ideas (beyond Today&apos;s focus)
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            {briefing.recommendations.map((recommendation) => (
              <li key={recommendation} style={{ fontSize: 13, lineHeight: 1.4, ...styles.textSecondary }}>
                {recommendation}
              </li>
            ))}
          </ul>
        </div>
      )}

      {briefing.riskFlags.length > 0 && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--aether-panel-border, #ececec)" }}>
          <h3
            style={{
              fontWeight: 600,
              margin: "0 0 6px 0",
              fontSize: 13,
              ...styles.textMuted,
            }}
          >
            Heads up
          </h3>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {briefing.riskFlags.map((flag) => (
              <li
                key={flag}
                style={{
                  ...styles.statusPill,
                  ...styles.statusWarning,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
