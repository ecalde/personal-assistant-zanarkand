import { useMemo, useRef, useState } from "react";
import { parseDurationToMinutes } from "../../core/duration";
import type { Priority, Session, Skill, SkillScheduleSeries, Weekday } from "../../core/model";
import { formatSkillScheduleSeriesLabel } from "../../core/skillSeries";
import {
  expectedMinutesByNow,
  weekdayFromDate,
  type CompletionStatus,
} from "../../core/schedule";
import { weekdayLabel } from "../../core/state";
import { styles } from "../../ui/appStyles";
import { formatLocal, formatTimeOnly, priorityEmoji } from "../../ui/format";
import { GoalInput } from "./GoalInput";
import { SkillScheduleFields } from "./SkillScheduleFields";
import {
  skillScheduleFormFromSeries,
  skillScheduleSeriesEqual,
  skillScheduleSeriesFromForm,
  type SkillScheduleFormState,
  type SkillScheduleUiMode,
  validateSkillScheduleForm,
} from "./skillScheduleFormState";

const weekdays: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function scheduleSeriesSyncKey(skill: Skill): string {
  return skill.scheduleSeries ? JSON.stringify(skill.scheduleSeries) : "omit";
}

type SkillScheduleEditorSectionProps = {
  skill: Skill;
  onScheduleSeriesChange: (series: SkillScheduleSeries | undefined) => void;
};

function SkillScheduleEditorSection({
  skill,
  onScheduleSeriesChange,
}: SkillScheduleEditorSectionProps) {
  const [scheduleForm, setScheduleForm] = useState<SkillScheduleFormState>(() =>
    skillScheduleFormFromSeries(skill.scheduleSeries)
  );
  const scheduleFormRef = useRef(scheduleForm);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  function setScheduleFormState(next: SkillScheduleFormState) {
    scheduleFormRef.current = next;
    setScheduleForm(next);
  }

  function commitScheduleForm(nextForm: SkillScheduleFormState) {
    const error = validateSkillScheduleForm(nextForm);
    if (error) {
      setScheduleError(error);
      return;
    }

    setScheduleError(null);
    const series = skillScheduleSeriesFromForm(nextForm);
    if (skillScheduleSeriesEqual(series, skill.scheduleSeries)) return;
    onScheduleSeriesChange(series);
  }

  function handleScheduleModeChange(mode: SkillScheduleUiMode) {
    const nextForm = { ...scheduleFormRef.current, mode };
    setScheduleFormState(nextForm);

    if (mode === "indefinite") {
      setScheduleError(null);
      if (skill.scheduleSeries !== undefined) {
        onScheduleSeriesChange(undefined);
      }
      return;
    }

    setScheduleError(null);
  }

  function handleScheduleDateBlur() {
    const form = scheduleFormRef.current;
    if (form.mode === "indefinite") return;
    commitScheduleForm(form);
  }

  return (
    <SkillScheduleFields
      state={scheduleForm}
      radioGroupName={`skill-schedule-${skill.id}`}
      onChange={setScheduleFormState}
      onModeChange={handleScheduleModeChange}
      onDateBlur={handleScheduleDateBlur}
      error={scheduleError}
    />
  );
}

export type SkillEditorProps = {
  skill: Skill;
  sessions: Session[];
  onAddSession: (minutes: number) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdate: (patch: Partial<Skill>) => void;
  onScheduleSeriesChange: (series: SkillScheduleSeries | undefined) => void;
  onDelete: () => void;
};

export function SkillEditor({
  skill,
  sessions,
  onAddSession,
  onDeleteSession,
  onUpdate,
  onScheduleSeriesChange,
  onDelete,
}: SkillEditorProps) {
  const [durationError, setDurationError] = useState<string | null>(null);
  const [logMinutes, setLogMinutes] = useState("");

  const todaySessions = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startIso = startOfToday.toISOString();

    return sessions
      .filter((ss) => ss.skillId === skill.id && ss.startedAtIso >= startIso)
      .sort((a, b) => b.startedAtIso.localeCompare(a.startedAtIso)); // newest first
  }, [sessions, skill.id]);

  const todayMinutes = useMemo(() => {
    return todaySessions.reduce((sum, ss) => sum + ss.minutes, 0);
  }, [todaySessions]);

  const completion = useMemo(() => {
    const now = new Date();
    const dayKey = weekdayFromDate(now);
    const blocks = skill.schedule[dayKey] ?? [];

    const expectedByNow = expectedMinutesByNow(blocks, now);

    const status: CompletionStatus =
      expectedByNow === 0
        ? "idle"
        : todayMinutes >= expectedByNow
          ? "onTrack"
          : "overdue";

    return {
      status,
      expectedByNow,
    };
  }, [skill.schedule, todayMinutes]);

  function setDailyGoal(input: string) {
    const res = parseDurationToMinutes(input);
    if (!res.ok) return setDurationError(res.message);
    setDurationError(null);
    onUpdate({ dailyGoalMinutes: res.minutes });
  }

  function setWeeklyGoal(input: string) {
    const res = parseDurationToMinutes(input);
    if (!res.ok) return setDurationError(res.message);
    setDurationError(null);
    onUpdate({ weeklyGoalMinutes: res.minutes });
  }

  function addBlock(day: Weekday) {
    const blocks = skill.schedule[day] ?? [];
    const next = [
      ...blocks,
      { id: crypto.randomUUID(), startTime: "06:00", minutes: 30 },
    ];
    onUpdate({ schedule: { ...skill.schedule, [day]: next } });
  }

  function updateBlock(day: Weekday, blockId: string, patch: Partial<{ startTime: string; minutes: number }>) {
    const blocks = skill.schedule[day] ?? [];
    const next = blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b));
    onUpdate({ schedule: { ...skill.schedule, [day]: next } });
  }

  function deleteBlock(day: Weekday, blockId: string) {
    const blocks = skill.schedule[day] ?? [];
    const next = blocks.filter((b) => b.id !== blockId);
    onUpdate({ schedule: { ...skill.schedule, [day]: next } });
  }

  return (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18 }}>
            <b>{skill.name}</b>{" "}
            <span style={{ opacity: 0.8 }}>
              {priorityEmoji(skill.priority)} {skill.priority ?? "—"}
            </span>
          </div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Updated: {formatLocal(skill.updatedAtIso)}
          </div>
          <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4 }}>
            {formatSkillScheduleSeriesLabel(skill)}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={styles.label}>
            Priority
            <select
              value={skill.priority ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                onUpdate({ priority: v === "" ? undefined : (Number(v) as Priority) });
              }}
              style={styles.select}
            >
              <option value="">None</option>
              <option value="1">1 🔴</option>
              <option value="2">2 🟡</option>
              <option value="3">3 🟢</option>
              <option value="4">4 🔵</option>
            </select>
          </label>

          <button onClick={onDelete} style={{ background: "#ffe6e6" }}>
            Delete
          </button>
        </div>
      </div>

      <hr style={{ margin: "14px 0", opacity: 0.2 }} />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ opacity: 0.85 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700 }}>Today</div>
              <div>{todayMinutes} min</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Expected by now: {completion.expectedByNow} min
              </div>
            </div>

            <span
              style={{
                ...styles.statusPill,
                ...(completion.status === "onTrack"
                  ? styles.statusOnTrack
                  : completion.status === "overdue"
                    ? styles.statusOverdue
                    : styles.statusIdle),
              }}
              title="Based on your schedule blocks up to the current time"
            >
              {completion.status === "onTrack"
                ? "🟢 On track"
                : completion.status === "overdue"
                  ? "🔴 Overdue"
                  : "⚪ Idle"}
            </span>
          </div>
        </div>

        <label style={styles.label}>
          Log minutes
          <input
            value={logMinutes}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (!/^\d*$/.test(raw)) return; // no decimals, digits only
              setLogMinutes(raw);
            }}
            placeholder="e.g., 20"
            style={{ ...styles.input, minWidth: 140 }}
          />
          <div style={{ fontSize: 12, opacity: 0.7 }}>Whole minutes only</div>
        </label>

        <button
          onClick={() => {
            const raw = logMinutes.trim();
            if (!raw) return;
            const n = parseInt(raw, 10);
            if (!Number.isInteger(n) || n <= 0) return;
            onAddSession(n);
            setLogMinutes("");
          }}
        >
          Add session
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Today’s sessions</div>

        {todaySessions.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No sessions logged today.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {todaySessions.map((ss) => (
              <div
                key={ss.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--aether-surface, white)",
                  border: "1px solid var(--aether-panel-border, #e5e5e5)",
                  padding: "8px 10px",
                  borderRadius: 12,
                }}
              >
                <div>
                  <b>{ss.minutes} min</b>{" "}
                  <span style={{ opacity: 0.75 }}>· {formatTimeOnly(ss.startedAtIso)}</span>
                </div>

                <button
                  onClick={() => onDeleteSession(ss.id)}
                  style={styles.smallBtn}
                  title="Delete session"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <GoalInput
          label="Daily goal"
          defaultValue={`${skill.dailyGoalMinutes ?? ""}`}
          hint='Examples: 30, 30min, 1hr, 0.5hr'
          onCommit={setDailyGoal}
        />
        <GoalInput
          label="Weekly goal"
          defaultValue={`${skill.weeklyGoalMinutes ?? ""}`}
          hint='Examples: 180, 3hr, 5hrs'
          onCommit={setWeeklyGoal}
        />
      </div>

      {durationError && <div style={styles.errorInline}>{durationError}</div>}

      <div style={{ marginTop: 14 }}>
        <SkillScheduleEditorSection
          key={`${skill.id}-${scheduleSeriesSyncKey(skill)}`}
          skill={skill}
          onScheduleSeriesChange={onScheduleSeriesChange}
        />
      </div>

      <div style={{ marginTop: 14, fontWeight: 600 }}>Weekly schedule template</div>
      <div style={{ opacity: 0.8, marginBottom: 10 }}>
        Add planned blocks (we’ll later support exceptions + multiple blocks/day on the dashboard timeline).
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {weekdays.map((day) => {
          const blocks = skill.schedule[day] ?? [];
          return (
            <div key={day} style={styles.dayRow}>
              <div style={{ width: 48, fontWeight: 600 }}>{weekdayLabel(day)}</div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", flex: 1 }}>
                {blocks.length === 0 ? (
                  <span style={{ opacity: 0.7 }}>No blocks</span>
                ) : (
                  blocks.map((b) => (
                    <div key={b.id} style={styles.blockChip}>
                      <input
                        value={b.startTime}
                        onChange={(e) => updateBlock(day, b.id, { startTime: e.target.value })}
                        style={styles.timeInput}
                      />
                      <input
                        value={String(b.minutes)}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          if (!/^\d*$/.test(raw)) return;
                          const n = raw === "" ? 0 : parseInt(raw, 10);
                          updateBlock(day, b.id, { minutes: n });
                        }}
                        style={styles.minInput}
                      />
                      <span style={{ opacity: 0.8 }}>min</span>
                      <button onClick={() => deleteBlock(day, b.id)} style={styles.smallBtn}>
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>

              <button onClick={() => addBlock(day)}>+ Block</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
