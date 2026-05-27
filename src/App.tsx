import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppPayload, Priority, Skill, Weekday, Session, ScheduleBlock } from "./core/model";
import {
  initialSync,
  isRemoteSyncEnabled,
  replaceRemotePayload,
} from "./core/remoteStorage";
import {
  addMinutesToHHMM,
  expectedMinutesByNow,
  minutesSinceMidnight,
  parseHHMMToMinutes,
  weekdayFromDate,
  type BlockStatus,
  type CompletionStatus,
} from "./core/schedule";
import { cloudSafeMessage, loadDataErrorMessage } from "./core/syncErrors";
import type { AppData } from "./core/storage";
import { exportBackup, importBackup, loadAppData, saveAppData } from "./core/storage";
import { defaultWeeklySchedule, weekdayLabel } from "./core/state";
import { parseDurationToMinutes } from "./core/duration";
import { fullViewportCenter, styles } from "./ui/appStyles";
import { formatLocal, formatTimeOnly, priorityEmoji } from "./ui/format";

const REMOTE_DEBOUNCE_MS = 400;

function id() {
  return crypto.randomUUID();
}

type Page = "dashboard" | "skills";

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
    <div style={styles.shell}>
      <header style={styles.header}>
        <div>
          <div style={styles.title}>Personal Assistant</div>
          <div style={styles.sub}>
            Last saved: <b>{lastSavedLabel}</b>
            {syncPending && (
              <>
                {" "}
                · <span>Saving to cloud…</span>
              </>
            )}
          </div>
        </div>

        <div style={styles.actions}>
          {onSignOut && (
            <button type="button" onClick={onSignOut}>
              Sign out
            </button>
          )}
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

      {syncError && (
        <div style={styles.errorBox}>
          <b>Cloud save failed:</b> {syncError}{" "}
          <button type="button" onClick={() => void onRetryCloudSave()}>
            Retry cloud save
          </button>
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
          <Dashboard
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

function Dashboard({
  skills,
  sessions,
  onAddSession,
}: {
  skills: Skill[];
  sessions: Session[];
  onAddSession: (skillId: string, minutes: number) => void;
}) {
  const [logBySkill, setLogBySkill] = useState<Record<string, string>>({});

  function setLogValue(skillId: string, value: string) {
    // digits only (no decimals)
    if (!/^\d*$/.test(value)) return;
    setLogBySkill((prev) => ({ ...prev, [skillId]: value }));
  }

  function commitLog(skillId: string, minutes: number) {
    if (!Number.isInteger(minutes) || minutes <= 0) return;
    onAddSession(skillId, minutes);
    setLogBySkill((prev) => ({ ...prev, [skillId]: "" }));
  }

  const rows = useMemo(() => {
    const now = new Date();
    const dayKey = weekdayFromDate(now);

    // start of today ISO
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startIso = startOfToday.toISOString();

    return skills.map((skill) => {
      const todaySessions = sessions.filter(
        (ss) => ss.skillId === skill.id && ss.startedAtIso >= startIso
      );

      const todayMinutes = todaySessions.reduce((sum, ss) => sum + ss.minutes, 0);

      const blocks = skill.schedule[dayKey] ?? [];
      const expectedByNow = expectedMinutesByNow(blocks, now);

      const status: CompletionStatus =
        expectedByNow === 0
          ? "idle"
          : todayMinutes >= expectedByNow
            ? "onTrack"
            : "overdue";

      return {
        skill,
        todayMinutes,
        expectedByNow,
        status,
      };
    });
  }, [skills, sessions]);

  const overdue = useMemo(
    () => rows.filter((r) => r.status === "overdue"),
    [rows]
  );

  const timelineItems = useMemo(() => {
    const now = new Date();
    const dayKey = weekdayFromDate(now);

    // start of today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startIso = startOfToday.toISOString();

    const currentMinute = minutesSinceMidnight(now);
    const nowIsoValue = now.toISOString();

    // Precompute "minutes logged today so far" per skill
    const loggedBySkill: Record<string, number> = {};
    for (const s of sessions) {
      if (s.startedAtIso < startIso) continue;
      if (s.startedAtIso > nowIsoValue) continue; // logged in the future shouldn't count

      loggedBySkill[s.skillId] = (loggedBySkill[s.skillId] ?? 0) + s.minutes;
    }

    // For each skill, get blocks for today and calculate cumulative planned minutes
    const items: Array<{
      skill: Skill;
      block: ScheduleBlock;
      startTime: string;
      endTime: string;
      startMin: number;
      endMin: number;
      plannedUpToStart: number;
      plannedUpToEnd: number;
      loggedSoFar: number;
      status: BlockStatus;
    }> = [];

    for (const skill of skills) {
      const blocks = skill.schedule[dayKey] ?? [];
      const sortedBlocks = [...blocks].sort(
        (a, b) => parseHHMMToMinutes(a.startTime) - parseHHMMToMinutes(b.startTime)
      );

      let cumulative = 0;
      const loggedSoFar = loggedBySkill[skill.id] ?? 0;

      for (const block of sortedBlocks) {
        const startMin = parseHHMMToMinutes(block.startTime);
        const endMin = startMin + (Number.isInteger(block.minutes) ? block.minutes : 0);

        const plannedUpToStart = cumulative;
        const plannedUpToEnd = cumulative + (Number.isInteger(block.minutes) ? block.minutes : 0);

        // Determine per-block status
        let status: BlockStatus = "upcoming";

        if (currentMinute < startMin) {
          status = "upcoming";
        } else if (currentMinute >= startMin && currentMinute < endMin) {
          // block currently happening
          status = loggedSoFar >= plannedUpToStart ? "inProgress" : "behind";
        } else {
          // block ended
          status = loggedSoFar >= plannedUpToEnd ? "done" : "behind";
        }

        items.push({
          skill,
          block,
          startTime: block.startTime,
          endTime: addMinutesToHHMM(block.startTime, block.minutes),
          startMin,
          endMin,
          plannedUpToStart,
          plannedUpToEnd,
          loggedSoFar,
          status,
        });

        cumulative = plannedUpToEnd;
      }
    }

    // Sort across ALL skills by time
    items.sort((a, b) => a.startMin - b.startMin);

    return items;
  }, [skills, sessions]);

  const sortedRows = useMemo(() => {
    // Sort: priority 1->4, then name
    const pr = (p?: Priority) => (p ?? 999);
    return [...rows].sort((a, b) => {
      const ap = pr(a.skill.priority);
      const bp = pr(b.skill.priority);
      if (ap !== bp) return ap - bp;
      return a.skill.name.localeCompare(b.skill.name);
    });
  }, [rows]);
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>Dashboard (Phase 1)</div>
      <div style={{ opacity: 0.85, marginBottom: 12 }}>
        Next we’ll add: daily timeline, reminders, completion rules, and XP.
      </div>

      {skills.length === 0 ? (
        <div style={{ opacity: 0.8 }}>
          No skills yet. Go to Skills and add “Learn SQL”, “Blender”, etc.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {/* Overdue section */}
          <div style={{ background: "white", border: "1px solid #e5e5e5", padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Overdue right now</div>

            {overdue.length === 0 ? (
              <div style={{ opacity: 0.8 }}>Nothing overdue 🎉</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {overdue.map((r) => (
                  <div key={r.skill.id} style={styles.listRow}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 16 }}>
                        {priorityEmoji(r.skill.priority)} <b>{r.skill.name}</b>
                      </div>

                      <span style={{ ...styles.statusPill, ...styles.statusOverdue }}>
                        🔴 Overdue
                      </span>
                    </div>

                    <div style={{ opacity: 0.8, marginTop: 4 }}>
                      Today: <b>{r.todayMinutes}m</b> · Expected by now: <b>{r.expectedByNow}m</b>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                      <input
                        value={logBySkill[r.skill.id] ?? ""}
                        onChange={(e) => setLogValue(r.skill.id, e.target.value.trim())}
                        placeholder="minutes"
                        style={{ ...styles.input, minWidth: 120, width: 120 }}
                      />

                      <button
                        onClick={() => {
                          const raw = (logBySkill[r.skill.id] ?? "").trim();
                          if (!raw) return;
                          const n = parseInt(raw, 10);
                          commitLog(r.skill.id, n);
                        }}
                      >
                        Log
                      </button>

                      <button onClick={() => commitLog(r.skill.id, 15)} style={styles.smallBtn}>
                        +15
                      </button>
                      <button onClick={() => commitLog(r.skill.id, 30)} style={styles.smallBtn}>
                        +30
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All skills section */}
          <div style={{ background: "white", border: "1px solid #e5e5e5", padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>All skills today</div>

            {/* Timeline section */}
            <div style={{ background: "white", border: "1px solid #e5e5e5", padding: 12, borderRadius: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Today’s timeline</div>
              <div style={{ opacity: 0.8, marginBottom: 10 }}>
                Your scheduled blocks for today, sorted by time (based on your weekly template).
              </div>

              {timelineItems.length === 0 ? (
                <div style={{ opacity: 0.8 }}>No schedule blocks for today.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {timelineItems.map((it) => (
                    <div
                      key={`${it.skill.id}:${it.block.id}`}
                      style={{
                        background: "white",
                        border: "1px solid #e5e5e5",
                        padding: 10,
                        borderRadius: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>
                          {it.startTime}–{it.endTime} · {priorityEmoji(it.skill.priority)} {it.skill.name}
                        </div>
                        <div style={{ opacity: 0.8, fontSize: 13 }}>
                          Block: <b>{it.block.minutes}m</b> · Logged so far: <b>{it.loggedSoFar}m</b>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span
                          style={{
                            ...styles.statusPill,
                            ...(it.status === "done"
                              ? styles.statusOnTrack
                              : it.status === "behind"
                                ? styles.statusOverdue
                                : it.status === "inProgress"
                                  ? styles.statusOnTrack
                                  : styles.statusIdle),
                          }}
                        >
                          {it.status === "done"
                            ? "✅ Done"
                            : it.status === "behind"
                              ? "🔴 Behind"
                              : it.status === "inProgress"
                                ? "🟢 In progress"
                                : "⏳ Upcoming"}
                        </span>

                        <button onClick={() => commitLog(it.skill.id, 15)} style={styles.smallBtn}>
                          +15
                        </button>
                        <button onClick={() => commitLog(it.skill.id, 30)} style={styles.smallBtn}>
                          +30
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {sortedRows.map((r) => (
                <div key={r.skill.id} style={styles.listRow}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 16 }}>
                      {priorityEmoji(r.skill.priority)} <b>{r.skill.name}</b>
                    </div>

                    <span
                      style={{
                        ...styles.statusPill,
                        ...(r.status === "onTrack"
                          ? styles.statusOnTrack
                          : r.status === "overdue"
                            ? styles.statusOverdue
                            : styles.statusIdle),
                      }}
                    >
                      {r.status === "onTrack"
                        ? "🟢 On track"
                        : r.status === "overdue"
                          ? "🔴 Overdue"
                          : "⚪ Idle"}
                    </span>
                  </div>

                  <div style={{ opacity: 0.8, marginTop: 4 }}>
                    Today: <b>{r.todayMinutes}m</b> · Expected by now: <b>{r.expectedByNow}m</b> · Goal:{" "}
                    <b>{r.skill.dailyGoalMinutes ?? "—"}m</b>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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
