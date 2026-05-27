import type { CSSProperties } from "react";
import type {
  DailyFocusSummary,
  FocusActionType,
  FocusItem,
  FocusPriority,
} from "../../core/focus";
import {
  formatFocusActionLabel,
  formatFocusCategory,
  formatFocusContextLine,
  formatFocusExpirationHint,
} from "../../core/focus";
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

function resolveFocusActionHandler(
  actionType: FocusActionType,
  props: DailyFocusSectionProps
): (() => void) | undefined {
  switch (actionType) {
    case "open_skills":
      return props.onOpenSkills;
    case "open_events":
    case "resolve_conflict":
      return props.onOpenEvents;
    case "open_people":
    case "contact_person":
      return props.onOpenPeople;
    case "open_career":
    case "apply_to_job":
      return props.onOpenCareer;
    case "open_fitness":
    case "schedule_workout":
      return props.onOpenFitness;
    case "log_skill_minutes":
      return undefined;
  }
}

function FocusItemRow({
  item,
  nowIso,
  onAction,
  onAddSession,
}: {
  item: FocusItem;
  nowIso: string;
  onAction?: () => void;
  onAddSession?: (skillId: string, minutes: number) => void;
}) {
  const actionType = item.suggestedActionType;
  const ctaLabel =
    actionType !== undefined
      ? formatFocusActionLabel(actionType)
      : item.actionLabel;
  const expirationHint =
    item.expiresAtIso !== undefined
      ? formatFocusExpirationHint(item.expiresAtIso, nowIso)
      : undefined;

  const showQuickLog =
    actionType === "log_skill_minutes" &&
    item.actionTargetId !== undefined &&
    onAddSession !== undefined;

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
            {expirationHint && <span>{expirationHint}</span>}
          </div>
        </div>

        <span style={{ ...styles.statusPill, ...URGENCY_PILL_STYLES[item.urgency] }}>
          {item.urgencyLabel}
        </span>
      </div>

      {showQuickLog && (
        <div style={{ marginTop: 10 }}>
          <QuickLogControls
            onLog={(minutes) => onAddSession!(item.actionTargetId!, minutes)}
            inputAriaLabel={`Minutes to log for ${item.title}`}
          />
        </div>
      )}

      {!showQuickLog && ctaLabel && onAction && (
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={onAction}>
            {ctaLabel}
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
              nowIso={summary.generatedAtIso}
              onAction={
                item.suggestedActionType
                  ? resolveFocusActionHandler(item.suggestedActionType, sectionProps)
                  : undefined
              }
              onAddSession={onAddSession}
            />
          ))}
        </div>
      )}
    </section>
  );
}
