import { useState } from "react";
import type { SessionHistoryGroup } from "../../core/workoutHistory";
import type { WorkoutPlan, WorkoutSession } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { WorkoutSessionCard } from "./WorkoutSessionCard";

export type SessionHistoryGroupsProps = {
  groups: SessionHistoryGroup[];
  plans: WorkoutPlan[];
  onResume: (session: WorkoutSession) => void;
  onEdit: (session: WorkoutSession) => void;
  onDelete: (sessionId: string) => void;
};

function SessionHistoryGroupItem({
  group,
  plans,
  onResume,
  onEdit,
  onDelete,
}: {
  group: SessionHistoryGroup;
  plans: WorkoutPlan[];
  onResume: (session: WorkoutSession) => void;
  onEdit: (session: WorkoutSession) => void;
  onDelete: (sessionId: string) => void;
}) {
  const [open, setOpen] = useState(group.defaultExpanded);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      style={styles.sessionHistoryGroup}
    >
      <summary style={styles.sessionHistorySummary}>
        <span>{group.label}</span>
        <span style={{ ...styles.textMuted, fontWeight: 700, fontSize: 13 }}>
          {group.sessions.length} session{group.sessions.length === 1 ? "" : "s"}
        </span>
      </summary>
      <div style={styles.sessionHistoryBody}>
        <div style={styles.workoutGalleryGrid}>
          {group.sessions.map((session) => (
            <WorkoutSessionCard
              key={session.id}
              session={session}
              plans={plans}
              onOpen={group.kind === "in_progress" ? () => onResume(session) : undefined}
              onEdit={() => onEdit(session)}
              onDelete={() => onDelete(session.id)}
            />
          ))}
        </div>
      </div>
    </details>
  );
}

export function SessionHistoryGroups({
  groups,
  plans,
  onResume,
  onEdit,
  onDelete,
}: SessionHistoryGroupsProps) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {groups.map((group) => (
        <SessionHistoryGroupItem
          key={group.id}
          group={group}
          plans={plans}
          onResume={onResume}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
