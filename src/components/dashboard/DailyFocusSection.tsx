import { useId, useState, type CSSProperties } from "react";
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
import { buildFocusSourceSnapshot, type HiddenFocusFeedbackItem } from "../../core/focusFeedback";
import { styles } from "../../ui/appStyles";
import { formatLocal, formatMinutes } from "../../ui/format";
import { QuickLogControls } from "./QuickLogControls";

export type DailyFocusSectionProps = {
  summary: DailyFocusSummary;
  hiddenCount?: number;
  hiddenFocusItems?: HiddenFocusFeedbackItem[];
  onDismissFocusItem?: (focusItemId: string, sourceSnapshot?: string) => void;
  onSnoozeFocusItem?: (focusItemId: string, hours: number, sourceSnapshot?: string) => void;
  onSnoozeFocusItemUntilTomorrow?: (focusItemId: string, sourceSnapshot?: string) => void;
  onRestoreAll?: () => void;
  onRestoreFocusFeedbackEntry?: (feedbackId: string) => void;
  onOpenSkills?: () => void;
  onOpenEvents?: () => void;
  onOpenPeople?: () => void;
  onOpenCareer?: () => void;
  onOpenFitness?: () => void;
  onAddSession?: (skillId: string, minutes: number) => void;
};

const URGENCY_PILL_STYLES: Record<FocusPriority, CSSProperties> = {
  critical: styles.statusOverdue,
  high: styles.statusWarning,
  medium: styles.statusOnTrack,
  low: styles.statusIdle,
};

const SECONDARY_BUTTON_STYLE: CSSProperties = styles.ghostBtn;

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
  onDismissFocusItem,
  onSnoozeFocusItem,
  onSnoozeFocusItemUntilTomorrow,
}: {
  item: FocusItem;
  nowIso: string;
  onAction?: () => void;
  onAddSession?: (skillId: string, minutes: number) => void;
  onDismissFocusItem?: (focusItemId: string, sourceSnapshot?: string) => void;
  onSnoozeFocusItem?: (focusItemId: string, hours: number, sourceSnapshot?: string) => void;
  onSnoozeFocusItemUntilTomorrow?: (focusItemId: string, sourceSnapshot?: string) => void;
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

  const showFeedbackActions =
    onDismissFocusItem !== undefined ||
    onSnoozeFocusItem !== undefined ||
    onSnoozeFocusItemUntilTomorrow !== undefined;

  const sourceSnapshot = buildFocusSourceSnapshot(item.title, item.description);

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
          <p style={{ margin: "4px 0 0 0", fontSize: 14, ...styles.textMuted }}>{item.description}</p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 6,
              fontSize: 12,
              ...styles.textMuted,
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

      {showFeedbackActions && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 10,
          }}
        >
          {onDismissFocusItem && (
            <button
              type="button"
              style={SECONDARY_BUTTON_STYLE}
              onClick={() => onDismissFocusItem(item.id, sourceSnapshot)}
              aria-label={`Dismiss ${item.title}`}
            >
              Dismiss
            </button>
          )}
          {onSnoozeFocusItem && (
            <button
              type="button"
              style={SECONDARY_BUTTON_STYLE}
              onClick={() => onSnoozeFocusItem(item.id, 3, sourceSnapshot)}
              aria-label={`Snooze ${item.title} for 3 hours`}
            >
              Snooze 3h
            </button>
          )}
          {onSnoozeFocusItemUntilTomorrow && (
            <button
              type="button"
              style={SECONDARY_BUTTON_STYLE}
              onClick={() => onSnoozeFocusItemUntilTomorrow(item.id, sourceSnapshot)}
              aria-label={`Snooze ${item.title} until tomorrow`}
            >
              Snooze tomorrow
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function HiddenFocusFeedbackRow({
  item,
  onRestore,
}: {
  item: HiddenFocusFeedbackItem;
  onRestore: (feedbackId: string) => void;
}) {
  const [titleLine, ...descriptionLines] = item.displayLabel.split("\n");
  const descriptionLine = descriptionLines.join("\n").trim();
  const restoreLabel = descriptionLine || titleLine;

  return (
    <div
      style={{
        ...styles.listRow,
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{titleLine}</div>
        {descriptionLine && (
          <p style={{ margin: "4px 0 0 0", fontSize: 13, ...styles.textMuted }}>{descriptionLine}</p>
        )}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 6,
            fontSize: 12,
            ...styles.textMuted,
          }}
        >
          <span>
            {item.actionLabel} · {item.expiryLabel}
          </span>
          <span>Hidden {formatLocal(item.feedback.createdAtIso)}</span>
        </div>
      </div>
      <button
        type="button"
        style={{ ...SECONDARY_BUTTON_STYLE, marginTop: 4, alignSelf: "flex-start" }}
        onClick={() => onRestore(item.feedback.id)}
        aria-label={`Restore ${restoreLabel}`}
      >
        Restore
      </button>
    </div>
  );
}

export function DailyFocusSection({
  summary,
  hiddenCount = 0,
  hiddenFocusItems = [],
  onDismissFocusItem,
  onSnoozeFocusItem,
  onSnoozeFocusItemUntilTomorrow,
  onRestoreAll,
  onRestoreFocusFeedbackEntry,
  onOpenSkills,
  onOpenEvents,
  onOpenPeople,
  onOpenCareer,
  onOpenFitness,
  onAddSession,
}: DailyFocusSectionProps) {
  const drawerId = useId();
  const [drawerOpenAtCount, setDrawerOpenAtCount] = useState<number | null>(null);
  const contextLine = formatFocusContextLine(summary.context);
  const showHiddenFooter = hiddenCount > 0 && (onRestoreAll || onRestoreFocusFeedbackEntry);
  const drawerOpen =
    drawerOpenAtCount !== null &&
    drawerOpenAtCount === hiddenFocusItems.length &&
    hiddenFocusItems.length > 0;

  const sectionProps: DailyFocusSectionProps = {
    summary,
    hiddenCount,
    hiddenFocusItems,
    onDismissFocusItem,
    onSnoozeFocusItem,
    onSnoozeFocusItemUntilTomorrow,
    onRestoreAll,
    onRestoreFocusFeedbackEntry,
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
        <p style={{ margin: "0 0 12px 0", fontSize: 13, ...styles.textMuted }}>{contextLine}</p>
      )}

      {summary.items.length === 0 ? (
        <p style={{ margin: 0, ...styles.textMuted }}>
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
              onDismissFocusItem={onDismissFocusItem}
              onSnoozeFocusItem={onSnoozeFocusItem}
              onSnoozeFocusItemUntilTomorrow={onSnoozeFocusItemUntilTomorrow}
            />
          ))}
        </div>
      )}

      {showHiddenFooter && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
            fontSize: 12,
            ...styles.textMuted,
          }}
        >
          <span>
            {hiddenCount} focus item{hiddenCount === 1 ? "" : "s"} hidden
          </span>
          {onRestoreFocusFeedbackEntry && hiddenFocusItems.length > 0 && (
            <button
              type="button"
              style={SECONDARY_BUTTON_STYLE}
              onClick={() =>
                setDrawerOpenAtCount((prev) =>
                  prev === hiddenFocusItems.length ? null : hiddenFocusItems.length
                )
              }
              aria-expanded={drawerOpen}
              aria-controls={drawerId}
            >
              Review hidden
            </button>
          )}
          {onRestoreAll && (
            <button type="button" style={SECONDARY_BUTTON_STYLE} onClick={onRestoreAll}>
              Restore all
            </button>
          )}
        </div>
      )}

      {drawerOpen && onRestoreFocusFeedbackEntry && (
        <div
          id={drawerId}
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            border: "1px solid var(--aether-panel-border, #e5e5e5)",
            background: "var(--aether-surface-sunken, #fafafa)",
            display: "grid",
            gap: 8,
          }}
        >
          <h3 style={{ fontWeight: 700, margin: 0, fontSize: 14 }}>Hidden focus items</h3>
          {hiddenFocusItems.map((item) => (
            <HiddenFocusFeedbackRow
              key={item.feedback.id}
              item={item}
              onRestore={onRestoreFocusFeedbackEntry}
            />
          ))}
        </div>
      )}

      <p style={{ margin: "12px 0 0 0", fontSize: 12, ...styles.textDisabled }}>
        Hidden items may reappear when conditions change.
      </p>
    </section>
  );
}
