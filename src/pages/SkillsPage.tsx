import { useRef, useState } from "react";
import { SkillEditor } from "../components/skills/SkillEditor";
import { SkillScheduleFields } from "../components/skills/SkillScheduleFields";
import {
  emptySkillScheduleFormState,
  skillScheduleSeriesFromForm,
  type SkillScheduleFormState,
  type SkillScheduleUiMode,
  validateSkillScheduleForm,
} from "../components/skills/skillScheduleFormState";
import type { Session, Skill, SkillScheduleSeries } from "../core/model";
import { styles } from "../ui/appStyles";

export type SkillsPageProps = {
  skills: Skill[];
  sessions: Session[];
  onAdd: (name: string, scheduleSeries?: SkillScheduleSeries) => void;
  onUpdate: (skillId: string, patch: Partial<Skill>) => void;
  onSetScheduleSeries: (skillId: string, series: SkillScheduleSeries | undefined) => void;
  onDelete: (skillId: string) => void;
  onAddSession: (skillId: string, minutes: number) => void;
  onDeleteSession: (sessionId: string) => void;
};

export default function SkillsPage({
  skills,
  sessions,
  onAdd,
  onUpdate,
  onSetScheduleSeries,
  onDelete,
  onAddSession,
  onDeleteSession,
}: SkillsPageProps) {
  const [newName, setNewName] = useState("");
  const [createScheduleForm, setCreateScheduleForm] = useState<SkillScheduleFormState>(
    emptySkillScheduleFormState
  );
  const createScheduleFormRef = useRef(createScheduleForm);
  const [createScheduleError, setCreateScheduleError] = useState<string | null>(null);

  function setCreateScheduleFormState(next: SkillScheduleFormState) {
    createScheduleFormRef.current = next;
    setCreateScheduleForm(next);
  }

  function handleCreateModeChange(mode: SkillScheduleUiMode) {
    setCreateScheduleFormState({ ...createScheduleFormRef.current, mode });
    setCreateScheduleError(null);
  }

  function handleAddSkill() {
    const trimmed = newName.trim();
    if (!trimmed) return;

    const form = createScheduleFormRef.current;
    const scheduleError = validateSkillScheduleForm(form);
    if (scheduleError) {
      setCreateScheduleError(scheduleError);
      return;
    }

    const scheduleSeries = skillScheduleSeriesFromForm(form);
    onAdd(trimmed, scheduleSeries);
    setNewName("");
    const empty = emptySkillScheduleFormState();
    setCreateScheduleFormState(empty);
    setCreateScheduleError(null);
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={styles.card}>
        <div style={styles.cardTitle}>Skills</div>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={styles.label}>
            Skill name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder='e.g., "Learn SQL"'
              style={styles.input}
            />
          </label>

          <SkillScheduleFields
            state={createScheduleForm}
            radioGroupName="skill-schedule-create"
            onChange={setCreateScheduleFormState}
            onModeChange={handleCreateModeChange}
            onDateBlur={() => {
              setCreateScheduleError(validateSkillScheduleForm(createScheduleFormRef.current));
            }}
            error={createScheduleError}
          />

          <div>
            <button type="button" onClick={handleAddSkill}>
              Add Skill
            </button>
          </div>
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
            onScheduleSeriesChange={(series) => onSetScheduleSeries(s.id, series)}
            onDelete={() => onDelete(s.id)}
          />
        ))
      )}
    </div>
  );
}
