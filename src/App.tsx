import { useMemo, useRef, useState } from "react";
import type { AppData } from "./core/storage";
import { exportBackup, importBackup, loadAppData, saveAppData } from "./core/storage";
import type { Priority, Skill, Weekday, Session } from "./core/model";
import { defaultWeeklySchedule, defaultPayload, weekdayLabel } from "./core/state";
import { parseDurationToMinutes } from "./core/duration";

function formatLocal(tsIso: string) {
  try {
    return new Date(tsIso).toLocaleString();
  } catch {
    return tsIso;
  }
}

function formatTimeOnly(tsIso: string) {
  try {
    return new Date(tsIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return tsIso;
  }
}

function id() {
  return crypto.randomUUID();
}

function priorityEmoji(p?: Priority) {
  if (!p) return "⚪";
  if (p === 1) return "🔴";
  if (p === 2) return "🟡";
  if (p === 3) return "🟢";
  return "🔵";
}

type Page = "dashboard" | "skills";

const weekdays: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default function App() {
  const [app, setApp] = useState<AppData>(() => {
    const loaded = loadAppData();
    // Safety: if payload missing for any reason
    if (!loaded.payload) return { ...loaded, payload: defaultPayload() };
    return loaded;
  });

  const [page, setPage] = useState<Page>("dashboard");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const lastSavedLabel = useMemo(() => formatLocal(app.updatedAtIso), [app.updatedAtIso]);

  function commit(next: AppData) {
    // single place to persist + update state
    const saved = saveAppData(next);
    setApp(saved);
  }

  function onSaveNow() {
    setError(null);
    commit(app);
  }

  function onExport() {
    setError(null);
    const saved = saveAppData(app);
    setApp(saved);
    exportBackup(saved);
  }

  async function onPickImportFile(e: React.ChangeEvent<HTMLInputElement>) {
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

  // ---------- SKILLS CRUD ----------
  function addSkill(name: string) {
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
    const now = new Date().toISOString();
    const skills = app.payload.skills.map((s) =>
      s.id === skillId ? { ...s, ...patch, updatedAtIso: now } : s
    );
    commit({ ...app, payload: { ...app.payload, skills } });
  }

  function deleteSkill(skillId: string) {
    const skills = app.payload.skills.filter((s) => s.id !== skillId);
    commit({ ...app, payload: { ...app.payload, skills } });
  }

  // ---------- SESSIONS ----------
  function addSession(skillId: string, minutes: number) {
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
  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div>
          <div style={styles.title}>Personal Assistant</div>
          <div style={styles.sub}>Last saved: <b>{lastSavedLabel}</b></div>
        </div>

        <div style={styles.actions}>
          <button onClick={onSaveNow}>Save Now</button>
          <button onClick={onExport}>Export Backup</button>
          <button onClick={() => fileRef.current?.click()}>Import Backup</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={onPickImportFile}
          />
        </div>
      </header>

      {error && (
        <div style={styles.errorBox}>
          <b>Error:</b> {error}
        </div>
      )}

      <nav style={styles.nav}>
        <NavButton active={page === "dashboard"} onClick={() => setPage("dashboard")}>
          Dashboard
        </NavButton>
        <NavButton active={page === "skills"} onClick={() => setPage("skills")}>
          Skills
        </NavButton>
      </nav>

      <main style={styles.main}>
        {page === "dashboard" && (
          <Dashboard skills={app.payload.skills} />
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
      </main>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.navBtn,
        ...(active ? styles.navBtnActive : {}),
      }}
    >
      {children}
    </button>
  );
}

function Dashboard({ skills }: { skills: Skill[] }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>Dashboard (Phase 1)</div>
      <div style={{ opacity: 0.85, marginBottom: 12 }}>
        Next we’ll add: daily timeline, reminders, session logging, completion rules, and XP.
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {skills.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No skills yet. Go to Skills and add “Learn SQL”, “Blender”, etc.</div>
        ) : (
          skills.map((s) => (
            <div key={s.id} style={styles.listRow}>
              <div style={{ fontSize: 18 }}>{priorityEmoji(s.priority)} <b>{s.name}</b></div>
              <div style={{ opacity: 0.8 }}>
                Daily goal: {s.dailyGoalMinutes ?? "—"}m · Weekly goal: {s.weeklyGoalMinutes ?? "—"}m
              </div>
            </div>
          ))
        )}
      </div>
    </div>
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
          <div style={{ fontWeight: 700 }}>Today</div>
          <div>{todayMinutes} min</div>
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

const styles: Record<string, React.CSSProperties> = {
  shell: { padding: "1.5rem", maxWidth: 980, margin: "0 auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" },
  header: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 28, fontWeight: 800 },
  sub: { opacity: 0.8 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  nav: { display: "flex", gap: 8, margin: "14px 0" },
  navBtn: { padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white" },
  navBtnActive: { border: "1px solid #999", fontWeight: 700 },
  main: { display: "grid", gap: 14 },
  card: { background: "#f6f6f6", padding: 16, borderRadius: 14 },
  cardTitle: { fontSize: 18, fontWeight: 800, marginBottom: 10 },
  errorBox: { background: "#ffe6e6", padding: 12, borderRadius: 12, marginBottom: 10 },
  errorInline: { marginTop: 10, background: "#ffe6e6", padding: 10, borderRadius: 12 },
  input: { padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", minWidth: 280 },
  select: { padding: "6px 8px", borderRadius: 10, border: "1px solid #ddd" },
  label: { display: "grid", gap: 6 },
  listRow: { background: "white", padding: 12, borderRadius: 12, border: "1px solid #e5e5e5" },
  dayRow: { display: "flex", gap: 10, alignItems: "center", background: "white", padding: 10, borderRadius: 12, border: "1px solid #e5e5e5" },
  blockChip: { display: "flex", gap: 6, alignItems: "center", padding: "6px 8px", borderRadius: 12, border: "1px solid #ddd", background: "#fafafa" },
  timeInput: { width: 76, padding: "4px 6px", borderRadius: 8, border: "1px solid #ddd" },
  minInput: { width: 54, padding: "4px 6px", borderRadius: 8, border: "1px solid #ddd", textAlign: "right" },
  smallBtn: { padding: "2px 6px", borderRadius: 8, border: "1px solid #ddd", background: "white" },
};