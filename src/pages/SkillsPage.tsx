import { useState } from "react";
import { SkillEditor } from "../components/skills/SkillEditor";
import type { Session, Skill } from "../core/model";
import { styles } from "../ui/appStyles";

export type SkillsPageProps = {
  skills: Skill[];
  sessions: Session[];
  onAdd: (name: string) => void;
  onUpdate: (skillId: string, patch: Partial<Skill>) => void;
  onDelete: (skillId: string) => void;
  onAddSession: (skillId: string, minutes: number) => void;
  onDeleteSession: (sessionId: string) => void;
};

export default function SkillsPage({
  skills,
  sessions,
  onAdd,
  onUpdate,
  onDelete,
  onAddSession,
  onDeleteSession,
}: SkillsPageProps) {
  const [newName, setNewName] = useState("");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={styles.card}>
        <div style={styles.cardTitle}>Skills</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder='e.g., "Learn SQL"'
            style={styles.input}
          />
          <button
            onClick={() => {
              onAdd(newName);
              setNewName("");
            }}
          >
            Add Skill
          </button>
        </div>
      </div>

      {skills.length === 0 ? (
        <div style={styles.card}>Add your first skill above.</div>
      ) : (
        skills.map((s) => (
          <SkillEditor
            key={s.id}
            skill={s}
            sessions={sessions}
            onAddSession={(minutes) => onAddSession(s.id, minutes)}
            onDeleteSession={onDeleteSession}
            onUpdate={(patch) => onUpdate(s.id, patch)}
            onDelete={() => onDelete(s.id)}
          />
        ))
      )}
    </div>
  );
}
