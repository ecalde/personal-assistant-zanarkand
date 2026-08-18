import { useMemo, useState } from "react";
import type { SupplementIntakeLog, SupplementProtocol } from "../../core/model";
import { dueProtocolsForDate, findIntakeForProtocolDate } from "../../core/supplements";
import { styles } from "../../ui/appStyles";
import { SupplementDoseRow } from "./SupplementDoseRow";
import { SupplementProtocolCard } from "./SupplementProtocolCard";
import { SupplementProtocolForm } from "./SupplementProtocolForm";
import {
  emptySupplementProtocolFormState,
  supplementProtocolFormFromProtocol,
  supplementProtocolPayloadFromForm,
  validateSupplementProtocolForm,
  type SupplementProtocolFormState,
} from "./supplementProtocolFormState";

export type SupplementTrackerSectionProps = {
  protocols: SupplementProtocol[];
  logs: SupplementIntakeLog[];
  todayKey: string;
  focusProtocolId?: string;
  onAddProtocol: (
    input: Omit<SupplementProtocol, "id" | "createdAtIso" | "updatedAtIso">
  ) => void;
  onUpdateProtocol: (protocol: SupplementProtocol) => void;
  onDeleteProtocol: (protocolId: string) => void;
  onUpsertIntake: (log: SupplementIntakeLog) => void;
};

export function SupplementTrackerSection({
  protocols,
  logs,
  todayKey,
  focusProtocolId,
  onAddProtocol,
  onUpdateProtocol,
  onDeleteProtocol,
  onUpsertIntake,
}: SupplementTrackerSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplementProtocolFormState>(() =>
    emptySupplementProtocolFormState(todayKey)
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const dueToday = useMemo(() => {
    const due = dueProtocolsForDate(protocols, todayKey);
    if (!focusProtocolId) return due;
    return [...due].sort((a, b) => {
      if (a.id === focusProtocolId) return -1;
      if (b.id === focusProtocolId) return 1;
      return 0;
    });
  }, [protocols, todayKey, focusProtocolId]);

  const sortedProtocols = useMemo(
    () =>
      [...protocols].sort((a, b) => {
        const byUpdated = b.updatedAtIso.localeCompare(a.updatedAtIso);
        if (byUpdated !== 0) return byUpdated;
        return a.name.localeCompare(b.name);
      }),
    [protocols]
  );

  function resetForm() {
    setForm(emptySupplementProtocolFormState(todayKey));
    setEditingId(null);
    setFormError(null);
    setShowForm(false);
  }

  function openCreateForm() {
    setForm(emptySupplementProtocolFormState(todayKey));
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(protocol: SupplementProtocol) {
    setForm(supplementProtocolFormFromProtocol(protocol));
    setEditingId(protocol.id);
    setFormError(null);
    setShowForm(true);
  }

  function handleSubmit() {
    const validationError = validateSupplementProtocolForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const payload = supplementProtocolPayloadFromForm(form);

    if (editingId) {
      const existing = protocols.find((protocol) => protocol.id === editingId);
      if (!existing) {
        setFormError("Could not find that protocol.");
        return;
      }
      onUpdateProtocol({ ...existing, ...payload });
    } else {
      onAddProtocol(payload);
    }

    resetForm();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {dueToday.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Today&apos;s supplements</div>
          <div style={{ ...styles.textSecondary, marginBottom: 12 }}>
            Tap each dose as you take it. The first tap saves today&apos;s log.
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {dueToday.map((protocol) => (
              <SupplementDoseRow
                key={`${protocol.id}:${todayKey}`}
                protocol={protocol}
                dateKey={todayKey}
                persistedLog={findIntakeForProtocolDate(logs, protocol.id, todayKey)}
                highlighted={focusProtocolId === protocol.id}
                onUpsertIntake={onUpsertIntake}
              />
            ))}
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={styles.cardTitle}>Protocols</div>
          {!showForm && (
            <button type="button" onClick={openCreateForm}>
              Add protocol
            </button>
          )}
        </div>

        {showForm && (
          <div style={{ marginBottom: 12 }}>
            <SupplementProtocolForm
              editing={Boolean(editingId)}
              form={form}
              formError={formError}
              onChange={setForm}
              onSubmit={handleSubmit}
              onCancel={resetForm}
            />
          </div>
        )}

        {protocols.length === 0 ? (
          <div>
            <div style={{ marginBottom: 12 }}>
              Add a protocol to track daily doses. Creatine can use a 7-day loading
              phase, then one maintenance dose.
            </div>
            {!showForm && (
              <button type="button" onClick={openCreateForm}>
                Add your first protocol
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {sortedProtocols.map((protocol) => (
              <SupplementProtocolCard
                key={protocol.id}
                protocol={protocol}
                logs={logs}
                todayKey={todayKey}
                expanded={expandedId === protocol.id}
                onToggleExpand={() =>
                  setExpandedId((current) => (current === protocol.id ? null : protocol.id))
                }
                onEdit={() => openEditForm(protocol)}
                onDelete={() => onDeleteProtocol(protocol.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
