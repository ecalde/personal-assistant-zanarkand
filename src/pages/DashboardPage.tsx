import { useMemo, useState } from "react";
import type { Priority, ScheduleBlock, Session, Skill } from "../core/model";
import {
  addMinutesToHHMM,
  expectedMinutesByNow,
  minutesSinceMidnight,
  parseHHMMToMinutes,
  weekdayFromDate,
  type BlockStatus,
  type CompletionStatus,
} from "../core/schedule";
import { styles } from "../ui/appStyles";
import { priorityEmoji } from "../ui/format";

export type DashboardPageProps = {
  skills: Skill[];
  sessions: Session[];
  onAddSession: (skillId: string, minutes: number) => void;
};

export default function DashboardPage({
  skills,
  sessions,
  onAddSession,
}: DashboardPageProps) {
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
