import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppPayload, Priority, Skill, Weekday, Session } from "./core/model";
import {
  initialSync,
  isRemoteSyncEnabled,
  replaceRemotePayload,
} from "./core/remoteStorage";
import {
  expectedMinutesByNow,
  weekdayFromDate,
  type CompletionStatus,
} from "./core/schedule";
import { cloudSafeMessage, loadDataErrorMessage } from "./core/syncErrors";
import type { AppData } from "./core/storage";
import { exportBackup, importBackup, loadAppData, saveAppData } from "./core/storage";
import { defaultWeeklySchedule, weekdayLabel } from "./core/state";
import { parseDurationToMinutes } from "./core/duration";
import { AppShell } from "./components/layout/AppShell";
import DashboardPage from "./pages/DashboardPage";
import type { Page } from "./pages/types";
import { fullViewportCenter, styles } from "./ui/appStyles";
import { formatLocal, formatTimeOnly, priorityEmoji } from "./ui/format";

const REMOTE_DEBOUNCE_MS = 400;

function id() {
  return crypto.randomUUID();
}

const weekdays: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export type AppProps = {
  userId: string;
  onSignOut?: () => void;
};

export default function App({ userId, onSignOut }: AppProps) {
  const [app, setApp] = useState<AppData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncPending, setSyncPending] = useState(false);

  const [page, setPage] = useState<Page>("dashboard");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const syncReadyRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastSavedLabel = useMemo(
    () => (app ? formatLocal(app.updatedAtIso) : ""),
    [app?.updatedAtIso]
  );

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const persistRemote = useCallback(
    async (payload: AppPayload) => {
      if (!isRemoteSyncEnabled()) return;

      setSyncPending(true);
      try {
        await replaceRemotePayload(userId, payload);
        setSyncError(null);
      } catch (err) {
        setSyncError(cloudSafeMessage(err));
      } finally {
        setSyncPending(false);
      }
    },
    [userId]
  );

  const scheduleRemotePersist = useCallback(
    (payload: AppPayload) => {
      if (!syncReadyRef.current || !isRemoteSyncEnabled()) return;

      clearDebounce();
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void persistRemote(payload);
      }, REMOTE_DEBOUNCE_MS);
    },
    [clearDebounce, persistRemote]
  );

  const runInitialSync = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    syncReadyRef.current = false;
    clearDebounce();

    try {
      const data = await initialSync(userId, () => loadAppData(userId));
      setApp(data);
      setSyncError(null);
      syncReadyRef.current = true;
    } catch (err) {
      setDataError(loadDataErrorMessage(err));
      setApp(null);
      syncReadyRef.current = false;
    } finally {
      setDataLoading(false);
    }
  }, [userId, clearDebounce]);

  useEffect(() => {
    void runInitialSync();
    return () => {
      syncReadyRef.current = false;
      clearDebounce();
    };
  }, [runInitialSync, clearDebounce]);

  function commit(next: AppData) {
    if (!syncReadyRef.current) return;

    const saved = saveAppData(next, userId);
    setApp(saved);
    setSyncError(null);
    scheduleRemotePersist(saved.payload);
  }

  async function onSaveNow() {
    if (!app || !syncReadyRef.current) return;

    setError(null);
    const saved = saveAppData(app, userId);
    setApp(saved);
    setSyncError(null);
    clearDebounce();

    if (isRemoteSyncEnabled()) {
      await persistRemote(saved.payload);
    }
  }

  function onExport() {
    if (!app) return;

    setError(null);
    const saved = saveAppData(app, userId);
    setApp(saved);
    exportBackup(saved);
  }

  async function onPickImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!syncReadyRef.current) return;

    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const imported = await importBackup(f);
      commit(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      e.target.value = "";
    }
  }

  async function onRetryCloudSave() {
    if (!app) return;
    await persistRemote(app.payload);
  }

  // ---------- SKILLS CRUD ----------
  function addSkill(name: string) {
    if (!app) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    const now = new Date().toISOString();
    const newSkill: Skill = {
      id: id(),
      name: trimmed,
      schedule: defaultWeeklySchedule(),
      createdAtIso: now,
      updatedAtIso: now,
      dailyGoalMinutes: 30,
      weeklyGoalMinutes: 180,
      priority: 2,
    };

    commit({
      ...app,
      payload: {
        ...app.payload,
        skills: [newSkill, ...app.payload.skills],
      },
    });
  }

  function updateSkill(skillId: string, patch: Partial<Skill>) {
    if (!app) return;

    const now = new Date().toISOString();
    const skills = app.payload.skills.map((s) =>
      s.id === skillId ? { ...s, ...patch, updatedAtIso: now } : s
    );
    commit({ ...app, payload: { ...app.payload, skills } });
  }

  function deleteSkill(skillId: string) {
    if (!app) return;

    const skills = app.payload.skills.filter((s) => s.id !== skillId);
    commit({ ...app, payload: { ...app.payload, skills } });
  }

  // ---------- SESSIONS ----------
  function addSession(skillId: string, minutes: number) {
    if (!app) return;
    if (!Number.isInteger(minutes) || minutes <= 0) return;

    const now = new Date().toISOString();
    const session: Session = {
      id: id(),
      skillId,
      minutes,
      startedAtIso: now,
      createdAtIso: now,
    };

    commit({
      ...app,
      payload: {
        ...app.payload,
        sessions: [session, ...(app.payload.sessions ?? [])],
      },
    });
  }

  function deleteSession(sessionId: string) {
    if (!app) return;

    const nextSessions = (app.payload.sessions ?? []).filter((s) => s.id !== sessionId);
    commit({
      ...app,
      payload: {
        ...app.payload,
        sessions: nextSessions,
      },
    });
  }

  // ---------- UI ----------
  if (dataLoading) {
    return (
      <div style={fullViewportCenter}>
        Loading your data…
      </div>
    );
  }

  if (dataError) {
    return (
      <div style={{ ...fullViewportCenter, padding: "1.5rem", textAlign: "center" }}>
        <p style={{ marginBottom: 12 }}>{dataError}</p>
        <button type="button" onClick={() => void runInitialSync()}>
          Retry
        </button>
      </div>
    );
  }

  if (!app) {
    return null;
  }

  return (
    <AppShell
      lastSavedLabel={lastSavedLabel}
      syncPending={syncPending}
      onSignOut={onSignOut}
      onSaveNow={onSaveNow}
      onExport={onExport}
      onImportClick={() => fileRef.current?.click()}
      fileInputRef={fileRef}
      onPickImportFile={onPickImportFile}
      error={error}
      syncError={syncError}
      onRetryCloudSave={onRetryCloudSave}
      page={page}
      onPageChange={setPage}
    >
      {page === "dashboard" && (
        <DashboardPage
          skills={app.payload.skills}
          sessions={app.payload.sessions ?? []}
          onAddSession={addSession}
        />
      )}

      {page === "skills" && (
        <SkillsPage
          skills={app.payload.skills}
          sessions={app.payload.sessions}
          onAdd={addSkill}
          onUpdate={updateSkill}
          onDelete={deleteSkill}
          onAddSession={addSession}
          onDeleteSession={deleteSession}
        />
      )}
    </AppShell>
  );
}

function SkillsPage({
  skills,
  sessions,
  onAdd,
  onUpdate,
  onDelete,
  onAddSession,
  onDeleteSession,
}: {
  skills: Skill[];
  sessions: Session[];
  onAdd: (name: string) => void;
  onUpdate: (skillId: string, patch: Partial<Skill>) => void;
  onDelete: (skillId: string) => void;
  onAddSession: (skillId: string, minutes: number) => void;
  onDeleteSession: (sessionId: string) => void;
}) {
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

function SkillEditor({
  skill,
  sessions,
  onAddSession,
  onDeleteSession,
  onUpdate,
  onDelete,
}: {
  skill: Skill;
  sessions: Session[];
  onAddSession: (minutes: number) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdate: (patch: Partial<Skill>) => void;
  onDelete: () => void;
}) {
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
    const next = blocks.map(b => (b.id === blockId ? { ...b, ...patch } : b));
    onUpdate({ schedule: { ...skill.schedule, [day]: next } });
  }

  function deleteBlock(day: Weekday, blockId: string) {
    const blocks = skill.schedule[day] ?? [];
    const next = blocks.filter(b => b.id !== blockId);
    onUpdate({ schedule: { ...skill.schedule, [day]: next } });
  }

  return (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18 }}>
            <b>{skill.name}</b> <span style={{ opacity: 0.8 }}>{priorityEmoji(skill.priority)} {skill.priority ?? "—"}</span>
          </div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Updated: {formatLocal(skill.updatedAtIso)}
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
                  background: "white",
                  border: "1px solid #e5e5e5",
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

      {durationError && (
        <div style={styles.errorInline}>{durationError}</div>
      )}

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
                      <button onClick={() => deleteBlock(day, b.id)} style={styles.smallBtn}>✕</button>
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

function GoalInput({
  label,
  defaultValue,
  hint,
  onCommit,
}: {
  label: string;
  defaultValue: string;
  hint: string;
  onCommit: (value: string) => void;
}) {
  const [val, setVal] = useState(defaultValue);

  return (
    <label style={styles.label}>
      {label}
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => val.trim() && onCommit(val)}
        placeholder={hint}
        style={styles.input}
      />
      <div style={{ fontSize: 12, opacity: 0.7 }}>{hint}</div>
    </label>
  );
}
