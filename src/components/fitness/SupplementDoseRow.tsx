import { useState, type CSSProperties } from "react";
import type { SupplementIntakeLog, SupplementProtocol } from "../../core/model";
import {
  createIntakeDraft,
  formatDoseSummary,
  formatPhaseChip,
  intakeProgress,
  resolvePhaseForDate,
  upsertToggleDose,
} from "../../core/supplements";
import { AETHER_TEXT, styles } from "../../ui/appStyles";

export type SupplementDoseRowProps = {
  protocol: SupplementProtocol;
  dateKey: string;
  persistedLog?: SupplementIntakeLog;
  highlighted?: boolean;
  onUpsertIntake: (log: SupplementIntakeLog) => void;
  onOpenFitness?: () => void;
};

const completeBtn: CSSProperties = {
  ...styles.smallBtn,
  minWidth: 72,
  minHeight: 36,
  fontWeight: 800,
};

const completeBtnDone: CSSProperties = {
  ...completeBtn,
  border: "2px solid var(--aether-accent, #46c6ff)",
  background: "var(--aether-accent, #46c6ff)",
  color: AETHER_TEXT.onAccent,
};

const rowCard: CSSProperties = {
  border: "1px solid var(--aether-border, #ddd)",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 10,
  background: "var(--aether-surface, transparent)",
};

const rowHighlight: CSSProperties = {
  ...rowCard,
  border: "2px solid var(--aether-accent, #46c6ff)",
  background: "var(--aether-accent-soft, rgba(70,198,255,0.08))",
};

export function SupplementDoseRow({
  protocol,
  dateKey,
  persistedLog,
  highlighted,
  onUpsertIntake,
  onOpenFitness,
}: SupplementDoseRowProps) {
  const phase = resolvePhaseForDate(protocol, dateKey);
  const [draft] = useState(() =>
    createIntakeDraft(protocol, dateKey, {
      id: crypto.randomUUID(),
      nowIso: new Date().toISOString(),
    })
  );
  const log = persistedLog ?? draft;
  if (!phase || !log) return null;

  const intake = log;
  const progress = intakeProgress(intake);
  const chip = formatPhaseChip(phase, dateKey);

  function toggleSlot(slotId: string) {
    const slot = intake.doses.find((dose) => dose.id === slotId);
    const nextTaken = slot?.takenAtIso ? null : new Date().toISOString();
    onUpsertIntake(upsertToggleDose(intake, slotId, nextTaken));
  }

  return (
    <div
      id={`today-supplement-${protocol.id}`}
      style={highlighted ? rowHighlight : rowCard}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <strong>{protocol.name}</strong>
          <div style={{ ...styles.textSecondary, fontSize: 13 }}>
            <span style={styles.statusPill}>{chip}</span>
            {" · "}
            {formatDoseSummary(phase, protocol.unit)}
            {progress.planned > 0 ? ` · ${progress.taken}/${progress.planned}` : ""}
          </div>
        </div>
        {onOpenFitness ? (
          <button
            type="button"
            style={styles.smallBtn}
            onClick={onOpenFitness}
            aria-label={`Open ${protocol.name} in Fitness`}
          >
            Open in Fitness
          </button>
        ) : null}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {intake.doses.map((slot, index) => {
          const taken = Boolean(slot.takenAtIso);
          const label = `Dose ${index + 1}`;
          return (
            <button
              key={slot.id}
              type="button"
              aria-pressed={taken}
              aria-label={
                taken
                  ? `${protocol.name} dose ${index + 1} of ${intake.doses.length} taken`
                  : `Take ${protocol.name} dose ${index + 1} of ${intake.doses.length}`
              }
              onClick={() => toggleSlot(slot.id)}
              style={taken ? completeBtnDone : completeBtn}
            >
              {taken ? "Taken" : label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
