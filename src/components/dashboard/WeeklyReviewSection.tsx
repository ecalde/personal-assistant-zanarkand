import type { CSSProperties } from "react";
import type { ReviewTone, WeeklyReview } from "../../core/review";
import { styles } from "../../ui/appStyles";

export type WeeklyReviewSectionProps = {
  review: WeeklyReview;
  onOpenReview?: () => void;
};

const TONE_SECTION_STYLES: Record<ReviewTone, CSSProperties> = {
  neutral: {},
  encouraging: {
    borderColor: "#b9e6c7",
    background: "#fafffb",
  },
  warning: {
    borderColor: "#e8c98a",
    background: "#fffaf0",
  },
};

function splitSummaryLines(summary: string): string[] {
  return summary.split(/(?<=\.)\s+/).filter((line) => line.trim().length > 0);
}

function formatWeekRange(weekStartKey: string, weekEndKey: string): string {
  const formatKey = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    if (!year || !month || !day) return key;
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };
  return `${formatKey(weekStartKey)} – ${formatKey(weekEndKey)}`;
}

export function WeeklyReviewSection({ review, onOpenReview }: WeeklyReviewSectionProps) {
  const summaryLines = splitSummaryLines(review.summary);
  const sectionStyle: CSSProperties = {
    ...styles.dashboardSection,
    ...TONE_SECTION_STYLES[review.tone],
  };
  const topWins = review.wins.slice(0, 3);
  const topRisks = review.risks.slice(0, 3);

  return (
    <section style={sectionStyle} aria-label="Weekly review">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <h2 style={{ fontWeight: 800, margin: 0, fontSize: 16 }}>Weekly review</h2>
        {onOpenReview && (
          <button type="button" onClick={onOpenReview}>
            View weekly review
          </button>
        )}
      </div>

      <p style={{ margin: "0 0 4px 0", fontSize: 12, opacity: 0.7 }}>
        {review.week.weekKey} · {formatWeekRange(review.week.weekStartKey, review.week.weekEndKey)}
      </p>

      <p
        style={{
          margin: "0 0 4px 0",
          fontWeight: 800,
          fontSize: 18,
          lineHeight: 1.3,
        }}
      >
        {review.greeting}
      </p>

      <p style={{ margin: "0 0 12px 0", fontWeight: 600, fontSize: 14 }}>{review.headline}</p>

      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {summaryLines.map((line) => (
          <p key={line} style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
            {line}
          </p>
        ))}
      </div>

      {topWins.length > 0 && (
        <div style={{ marginBottom: topRisks.length > 0 ? 12 : 0 }}>
          <h3
            style={{
              fontWeight: 600,
              margin: "0 0 6px 0",
              fontSize: 13,
              opacity: 0.75,
            }}
          >
            Wins
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            {topWins.map((win) => (
              <li key={win} style={{ fontSize: 13, lineHeight: 1.4 }}>
                {win}
              </li>
            ))}
          </ul>
        </div>
      )}

      {topRisks.length > 0 && (
        <div style={{ paddingTop: topWins.length > 0 ? 10 : 0, borderTop: topWins.length > 0 ? "1px solid #ececec" : undefined }}>
          <h3
            style={{
              fontWeight: 600,
              margin: "0 0 6px 0",
              fontSize: 13,
              opacity: 0.8,
            }}
          >
            Risks for next week
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            {topRisks.map((risk) => (
              <li key={risk} style={{ fontSize: 13, lineHeight: 1.4, color: "#8a5a00" }}>
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
