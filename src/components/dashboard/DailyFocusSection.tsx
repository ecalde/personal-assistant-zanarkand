import type { CSSProperties } from "react";
import type { DailyFocusSummary, FocusCategory, FocusItem, FocusPriority } from "../../core/focus";
import { formatFocusCategory, formatFocusContextLine } from "../../core/focus";
import { styles } from "../../ui/appStyles";
import { formatMinutes } from "../../ui/format";
import { QuickLogControls } from "./QuickLogControls";

export type DailyFocusSectionProps = {
  summary: DailyFocusSummary;
  onOpenSkills?: () => void;
  onOpenEvents?: () => void;
  onOpenPeople?: () => void;
  onOpenCareer?: () => void;
  onOpenFitness?: () => void;
  onAddSession?: (skillId: string, minutes: number) => void;
};

const URGENCY_PILL_STYLES: Record<FocusPriority, CSSProperties> = {
  critical: styles.statusOverdue,
  high: {
    border: "1px solid #f0c674",
    background: "#fff8e6",
  },
  medium: styles.statusOnTrack,
  low: styles.statusIdle,
};

function openHandlerForCategory(
  category: FocusCategory,
  props: DailyFocusSectionProps
): (() => void) | undefined {
  switch (category) {
    case "skill":
      return props.onOpenSkills;
    case "event":
      return props.onOpenEvents;
    case "people":
      return props.onOpenPeople;
    case "career":
      return props.onOpenCareer;
    case "fitness":
      return props.onOpenFitness;
    default:
      return undefined;
  }
}

function FocusItemRow({
  item,
  onNavigate,
  onAddSession,
}: {
  item: FocusItem;
  onNavigate?: () => void;
  onAddSession?: (skillId: string, minutes: number) => void;
}) {
  const showQuickLog =
    item.category === "skill" &&
    item.sourceId !== undefined &&
    onAddSession !== undefined &&
    item.actionLabel === "Log minutes";

  return (
    <div style={styles.listRow}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{item.title}</div>
          <p style={{ margin: "4px 0 0 0", opacity: 0.8, fontSize: 14 }}>{item.description}</p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 6,
              fontSize: 12,
              opacity: 0.75,
            }}
          >
            <span>{formatFocusCategory(item.category)}</span>
            {item.estimatedMinutes !== undefined && item.estimatedMinutes > 0 && (
              <span>~{formatMinutes(item.estimatedMinutes)}</span>
            )}
          </div>
        </div>

        <span style={{ ...styles.statusPill, ...URGENCY_PILL_STYLES[item.urgency] }}>
          {item.urgencyLabel}
        </span>
      </div>

      {showQuickLog && (
        <div style={{ marginTop: 10 }}>
          <QuickLogControls
            onLog={(minutes) => onAddSession!(item.sourceId!, minutes)}
            inputAriaLabel={`Minutes to log for ${item.title}`}
          />
        </div>
      )}

      {!showQuickLog && item.actionLabel && onNavigate && (
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={onNavigate}>
            {item.actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export function DailyFocusSection({
  summary,
  onOpenSkills,
  onOpenEvents,
  onOpenPeople,
  onOpenCareer,
  onOpenFitness,
  onAddSession,
}: DailyFocusSectionProps) {
  const contextLine = formatFocusContextLine(summary.context);
  const sectionProps: DailyFocusSectionProps = {
    summary,
    onOpenSkills,
    onOpenEvents,
    onOpenPeople,
    onOpenCareer,
    onOpenFitness,
    onAddSession,
  };

  return (
    <section style={styles.dashboardSection} aria-label="Daily focus">
      <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>Today&apos;s focus</h2>

      {summary.headline && (
        <p style={{ margin: "0 0 4px 0", fontWeight: 600, fontSize: 14 }}>{summary.headline}</p>
      )}

      {contextLine && summary.items.length > 0 && (
        <p style={{ margin: "0 0 12px 0", opacity: 0.75, fontSize: 13 }}>{contextLine}</p>
      )}

      {summary.items.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.8 }}>
          You&apos;re caught up — no urgent focus items today.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {summary.items.map((item) => (
            <FocusItemRow
              key={item.id}
              item={item}
              onNavigate={openHandlerForCategory(item.category, sectionProps)}
              onAddSession={onAddSession}
            />
          ))}
        </div>
      )}
    </section>
  );
}
