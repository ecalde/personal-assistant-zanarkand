import { useMemo, useState, type CSSProperties } from "react";
import {
  buildMuscleMonthHeatmap,
  buildMuscleWeekSnapshot,
  listMuscleMonthKeys,
  listMuscleWeekSnapshots,
  muscleStatusFromCounts,
  weekStartKeyFromDateKey,
  type MuscleMonthHeatmap,
  type MuscleStatus,
  type MuscleWeekSnapshot,
} from "../../core/muscleCoverage";
import {
  MUSCLE_CATALOG,
  muscleLabel,
  type MuscleId,
} from "../../core/muscleMap";
import type { WorkoutPlan, WorkoutSession } from "../../core/model";
import { AETHER_TEXT, SURFACE, styles } from "../../ui/appStyles";
import {
  ACHILLES,
  ANATOMY_VIEWBOX,
  BACK_FOOT,
  BACK_HAND,
  BACK_HEAD,
  BACK_MUSCLES,
  BACK_NECK,
  BACK_ORIGIN,
  BACK_SKIN_ARM,
  BACK_SKIN_TORSO,
  CLAVICLE,
  EAR,
  FRONT_FOOT,
  FRONT_HAND,
  FRONT_HEAD,
  FRONT_MUSCLES,
  FRONT_NECK,
  FRONT_ORIGIN,
  FRONT_SKIN_ARM,
  FRONT_SKIN_TORSO,
  ILIAC_CREST,
  JAW,
  KNEE_CAP,
  LINEA_ALBA,
  SPINE,
  type MuscleShape,
} from "./muscleAnatomyGeometry";

export type MuscleAnatomyChartProps = {
  plans: WorkoutPlan[];
  sessions: WorkoutSession[];
  todayKey: string;
};

type AnatomyMode = "weekly" | "heatmap";

const IDLE_FILL =
  "color-mix(in srgb, var(--aether-text-muted) 18%, var(--aether-surface-sunken, #fafafa))";
const SKIN_FILL =
  "color-mix(in srgb, var(--aether-text-muted) 7%, var(--aether-surface-raised, #f6f6f6))";
const FEATURE_FILL =
  "color-mix(in srgb, var(--aether-text-muted) 14%, var(--aether-surface, #ffffff))";
const IDLE_STROKE = "var(--aether-border, #c8d0dc)";
const SCHEDULED_FILL = "var(--aether-chip-warning-bg, #f6e7c8)";
const SCHEDULED_STROKE = "var(--aether-chip-warning-border, #c4922a)";
const COMPLETED_FILL = "var(--aether-chip-success-bg, #d5efd8)";
const COMPLETED_STROKE = "var(--aether-chip-success-border, #2f8a46)";
const FIBER_STROKE = "color-mix(in srgb, var(--aether-text-primary) 28%, transparent)";

const svgFrame: CSSProperties = {
  width: "100%",
  maxWidth: 720,
  height: "auto",
  display: "block",
  margin: "0 auto",
};

function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const start = parseDate(weekStart);
  const end = parseDate(weekEnd);
  if (!start || !end) return `Week of ${weekStart}`;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const yearOpts: Intl.DateTimeFormatOptions = { ...opts, year: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, yearOpts)}`;
}

function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  if (!year || !month) return yearMonth;
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function parseDate(dateKey: string): Date | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function weeklyFill(status: MuscleStatus): { fill: string; stroke: string } {
  if (status === "completed") return { fill: COMPLETED_FILL, stroke: COMPLETED_STROKE };
  if (status === "scheduled") return { fill: SCHEDULED_FILL, stroke: SCHEDULED_STROKE };
  return { fill: IDLE_FILL, stroke: IDLE_STROKE };
}

function heatmapFill(percent: number | undefined): { fill: string; stroke: string } {
  if (!percent || percent <= 0) return { fill: IDLE_FILL, stroke: IDLE_STROKE };
  const amount = Math.round(22 + percent * 78);
  return {
    fill: `color-mix(in srgb, #5c1324 ${amount}%, var(--aether-surface-raised, #f6f6f6))`,
    stroke: `color-mix(in srgb, #3a0c16 ${Math.round(percent * 70)}%, var(--aether-border, #c8d0dc))`,
  };
}

function uniqueUnmapped(snapshot: MuscleWeekSnapshot): string[] {
  return [...new Set([...snapshot.unmappedScheduledNames, ...snapshot.unmappedCompletedNames])];
}

function musclesWithStatus(
  snapshot: MuscleWeekSnapshot,
  status: MuscleStatus
): MuscleId[] {
  return MUSCLE_CATALOG.filter(
    (entry) => muscleStatusFromCounts(snapshot.byMuscle[entry.id]) === status
  ).map((entry) => entry.id);
}

export function MuscleAnatomyChart({
  plans,
  sessions,
  todayKey,
}: MuscleAnatomyChartProps) {
  const currentWeekStart = weekStartKeyFromDateKey(todayKey);
  const weekSnapshots = useMemo(
    () => listMuscleWeekSnapshots(plans, sessions, todayKey),
    [plans, sessions, todayKey]
  );
  const thisWeek = useMemo(
    () =>
      (currentWeekStart ? weekSnapshots.find((row) => row.weekStart === currentWeekStart) : undefined) ??
      (currentWeekStart ? buildMuscleWeekSnapshot(plans, sessions, currentWeekStart) : undefined),
    [currentWeekStart, weekSnapshots, plans, sessions]
  );

  const pastWeeks = weekSnapshots.filter((row) => row.weekStart !== currentWeekStart);
  const [archiveWeekStart, setArchiveWeekStart] = useState<string | undefined>(
    () => pastWeeks[0]?.weekStart
  );
  const archiveWeek =
    pastWeeks.find((row) => row.weekStart === archiveWeekStart) ?? pastWeeks[0];

  const monthKeys = useMemo(
    () => listMuscleMonthKeys(sessions, todayKey),
    [sessions, todayKey]
  );
  const [monthKey, setMonthKey] = useState<string>(() => monthKeys[0] ?? todayKey.slice(0, 7));
  const selectedMonth = monthKeys.includes(monthKey) ? monthKey : (monthKeys[0] ?? monthKey);
  const monthHeatmap = useMemo(
    () => buildMuscleMonthHeatmap(plans, sessions, selectedMonth),
    [plans, sessions, selectedMonth]
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <AnatomyCard
        title="This week"
        lead="Muscles from plans scheduled this week, versus muscles you have actually trained. The map resets each Monday."
        snapshot={thisWeek}
        mode="weekly"
      />

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
          <div style={{ ...styles.cardTitle, marginBottom: 0 }}>Weekly snapshots</div>
          {pastWeeks.length > 0 && (
            <label style={{ ...styles.label, margin: 0, maxWidth: 280 }}>
              Week
              <select
                value={archiveWeek?.weekStart ?? ""}
                onChange={(event) => setArchiveWeekStart(event.target.value)}
                style={styles.select}
              >
                {pastWeeks.map((row) => (
                  <option key={row.weekStart} value={row.weekStart}>
                    {formatWeekLabel(row.weekStart, row.weekEnd)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {archiveWeek ? (
          <AnatomyBody
            snapshot={archiveWeek}
            mode="weekly"
            caption={`Saved from completed work during ${formatWeekLabel(archiveWeek.weekStart, archiveWeek.weekEnd)}.`}
          />
        ) : (
          <p style={{ ...styles.sectionLead, margin: 0 }}>
            After the week rolls over, this chart keeps a snapshot of the muscles you trained.
          </p>
        )}
      </div>

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
          <div style={{ ...styles.cardTitle, marginBottom: 0 }}>Monthly heatmap</div>
          {monthKeys.length > 0 && (
            <label style={{ ...styles.label, margin: 0, maxWidth: 240 }}>
              Month
              <select
                value={selectedMonth}
                onChange={(event) => setMonthKey(event.target.value)}
                style={styles.select}
              >
                {monthKeys.map((key) => (
                  <option key={key} value={key}>
                    {formatMonthLabel(key)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p style={{ ...styles.sectionLead, margin: "0 0 12px" }}>
          Darker muscle = a higher share of scheduled workouts for that muscle that you completed
          this month.
        </p>
        {monthHeatmap ? (
          <AnatomyBody heatmap={monthHeatmap} mode="heatmap" />
        ) : (
          <p style={{ ...styles.sectionLead, margin: 0 }}>
            Complete workouts this month to fill the heatmap.
          </p>
        )}
      </div>
    </div>
  );
}

function AnatomyCard({
  title,
  lead,
  snapshot,
  mode,
}: {
  title: string;
  lead: string;
  snapshot: MuscleWeekSnapshot | undefined;
  mode: "weekly";
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <p style={{ ...styles.sectionLead, margin: "0 0 12px" }}>{lead}</p>
      {snapshot ? (
        <AnatomyBody snapshot={snapshot} mode={mode} />
      ) : (
        <p style={{ ...styles.sectionLead, margin: 0 }}>
          Schedule a plan or complete a session to see this week&apos;s muscles.
        </p>
      )}
    </div>
  );
}

function AnatomyBody({
  snapshot,
  heatmap,
  mode,
  caption,
}: {
  snapshot?: MuscleWeekSnapshot;
  heatmap?: MuscleMonthHeatmap;
  mode: AnatomyMode;
  caption?: string;
}) {
  const [hovered, setHovered] = useState<MuscleId | null>(null);

  const fillFor = (id: MuscleId) => {
    if (mode === "heatmap") {
      return heatmapFill(heatmap?.byMuscle[id]?.percent);
    }
    return weeklyFill(muscleStatusFromCounts(snapshot?.byMuscle[id]));
  };

  const hoverLabel = hovered ? muscleLabel(hovered) : undefined;
  const hoverDetail = hovered
    ? mode === "heatmap"
      ? formatHeatmapDetail(heatmap?.byMuscle[hovered])
      : formatWeeklyDetail(snapshot?.byMuscle[hovered])
    : undefined;

  const completed = snapshot ? musclesWithStatus(snapshot, "completed") : [];
  const scheduledOnly = snapshot ? musclesWithStatus(snapshot, "scheduled") : [];
  const unmapped = snapshot ? uniqueUnmapped(snapshot) : [];

  const aria = mode === "heatmap"
    ? `Front and back muscle heatmap for ${heatmap ? formatMonthLabel(heatmap.yearMonth) : "this month"}`
    : `Front and back muscle map for ${snapshot ? formatWeekLabel(snapshot.weekStart, snapshot.weekEnd) : "this week"}`;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <svg
        viewBox={ANATOMY_VIEWBOX}
        role="img"
        aria-label={aria}
        style={svgFrame}
        onMouseLeave={() => setHovered(null)}
      >
        <rect width="1000" height="980" fill="var(--aether-surface-sunken, #fafafa)" rx="18" />
        <text x={FRONT_ORIGIN.x} y={22} textAnchor="middle" fill={AETHER_TEXT.secondary} fontSize={15} fontWeight={700}>
          Front
        </text>
        <text x={BACK_ORIGIN.x} y={22} textAnchor="middle" fill={AETHER_TEXT.secondary} fontSize={15} fontWeight={700}>
          Back
        </text>
        <line
          x1={500}
          y1={36}
          x2={500}
          y2={910}
          stroke={SURFACE.border}
          strokeDasharray="5 7"
        />
        <Figure
          origin={FRONT_ORIGIN}
          view="front"
          fillFor={fillFor}
          hovered={hovered}
          onHover={setHovered}
        />
        <Figure
          origin={BACK_ORIGIN}
          view="back"
          fillFor={fillFor}
          hovered={hovered}
          onHover={setHovered}
        />
        {hoverLabel && (
          <g>
            <rect
              x={340}
              y={920}
              width={320}
              height={42}
              rx={10}
              fill={SURFACE.raised}
              stroke={SURFACE.border}
            />
            <text x={500} y={938} textAnchor="middle" fill={AETHER_TEXT.primary} fontSize={13} fontWeight={700}>
              {hoverLabel}
            </text>
            {hoverDetail && (
              <text x={500} y={954} textAnchor="middle" fill={AETHER_TEXT.muted} fontSize={11}>
                {hoverDetail}
              </text>
            )}
          </g>
        )}
      </svg>

      {mode === "weekly" ? <WeeklyLegend /> : <HeatmapLegend />}
      {caption && <p style={{ ...styles.captionText, margin: 0 }}>{caption}</p>}

      {mode === "weekly" && snapshot && (
        <MuscleLists completed={completed} scheduled={scheduledOnly} unmapped={unmapped} />
      )}
      {mode === "heatmap" && heatmap && <HeatmapMuscleList heatmap={heatmap} />}
    </div>
  );
}

function Figure({
  origin,
  view,
  fillFor,
  hovered,
  onHover,
}: {
  origin: { x: number; y: number };
  view: "front" | "back";
  fillFor: (id: MuscleId) => { fill: string; stroke: string };
  hovered: MuscleId | null;
  onHover: (id: MuscleId | null) => void;
}) {
  const muscles = view === "front" ? FRONT_MUSCLES : BACK_MUSCLES;
  const skinTorso = view === "front" ? FRONT_SKIN_TORSO : BACK_SKIN_TORSO;
  const skinArm = view === "front" ? FRONT_SKIN_ARM : BACK_SKIN_ARM;
  const head = view === "front" ? FRONT_HEAD : BACK_HEAD;
  const neck = view === "front" ? FRONT_NECK : BACK_NECK;
  const hand = view === "front" ? FRONT_HAND : BACK_HAND;
  const foot = view === "front" ? FRONT_FOOT : BACK_FOOT;

  return (
    <g transform={`translate(${origin.x} ${origin.y})`}>
      <path d={head} fill={FEATURE_FILL} stroke={IDLE_STROKE} strokeWidth={1.2} />
      {view === "front" && (
        <g>
          <ellipse cx={-11} cy={40} rx={3.4} ry={4.2} fill={AETHER_TEXT.primary} opacity={0.4} />
          <ellipse cx={11} cy={40} rx={3.4} ry={4.2} fill={AETHER_TEXT.primary} opacity={0.4} />
          <path d="M-9 62 Q0 70 9 62" fill="none" stroke={IDLE_STROKE} strokeWidth={1.1} />
          <path d={JAW} fill="none" stroke={IDLE_STROKE} strokeWidth={1} />
        </g>
      )}
      <path d={neck} fill={FEATURE_FILL} stroke={IDLE_STROKE} strokeWidth={1} />
      <HalfBody
        skinTorso={skinTorso}
        skinArm={skinArm}
        muscles={muscles}
        hand={hand}
        foot={foot}
        view={view}
        fillFor={fillFor}
        hovered={hovered}
        onHover={onHover}
      />
      <g transform="scale(-1 1)">
        <HalfBody
          skinTorso={skinTorso}
          skinArm={skinArm}
          muscles={muscles}
          hand={hand}
          foot={foot}
          view={view}
          fillFor={fillFor}
          hovered={hovered}
          onHover={onHover}
        />
      </g>
    </g>
  );
}

function HalfBody({
  skinTorso,
  skinArm,
  muscles,
  hand,
  foot,
  view,
  fillFor,
  hovered,
  onHover,
}: {
  skinTorso: string;
  skinArm: string;
  muscles: MuscleShape[];
  hand: string;
  foot: string;
  view: "front" | "back";
  fillFor: (id: MuscleId) => { fill: string; stroke: string };
  hovered: MuscleId | null;
  onHover: (id: MuscleId | null) => void;
}) {
  return (
    <g>
      <path d={skinTorso} fill={SKIN_FILL} stroke={IDLE_STROKE} strokeWidth={1.1} onMouseEnter={() => onHover(null)} />
      <path d={skinArm} fill={SKIN_FILL} stroke={IDLE_STROKE} strokeWidth={1.1} onMouseEnter={() => onHover(null)} />
      <path d={hand} fill={FEATURE_FILL} stroke={IDLE_STROKE} strokeWidth={1} />
      <path d={foot} fill={FEATURE_FILL} stroke={IDLE_STROKE} strokeWidth={1} />
      {view === "front" && (
        <g pointerEvents="none">
          <path d={CLAVICLE} fill="none" stroke={IDLE_STROKE} strokeWidth={1} />
          <path d={LINEA_ALBA} fill="none" stroke={IDLE_STROKE} strokeWidth={1.1} />
          <path d={ILIAC_CREST} fill="none" stroke={IDLE_STROKE} strokeWidth={1} />
          <path d={KNEE_CAP} fill={FEATURE_FILL} stroke={IDLE_STROKE} strokeWidth={0.8} />
          <path d={EAR} fill={FEATURE_FILL} stroke={IDLE_STROKE} strokeWidth={0.8} />
        </g>
      )}
      {view === "back" && (
        <g pointerEvents="none">
          <path d={SPINE} fill="none" stroke={IDLE_STROKE} strokeWidth={1.2} />
          <path d={ACHILLES} fill="none" stroke={IDLE_STROKE} strokeWidth={1.4} />
        </g>
      )}
      {muscles.map((shape, index) => {
        const paint = fillFor(shape.id);
        const isHovered = hovered === shape.id;
        return (
          <g key={`${shape.id}:${index}`}>
            <path
              d={shape.d}
              fill={paint.fill}
              stroke={isHovered ? "var(--aether-accent, #46c6ff)" : paint.stroke}
              strokeWidth={isHovered ? 2 : 1.05}
              strokeLinejoin="round"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => onHover(shape.id)}
              onFocus={() => onHover(shape.id)}
            >
              <title>{muscleLabel(shape.id)}</title>
            </path>
            {shape.fibers?.map((fiber, fiberIndex) => (
              <path
                key={fiberIndex}
                d={fiber}
                fill="none"
                stroke={FIBER_STROKE}
                strokeWidth={0.7}
                pointerEvents="none"
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

function WeeklyLegend() {
  return (
    <ul
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 16px",
        listStyle: "none",
        margin: 0,
        padding: 0,
        fontSize: 12,
        color: AETHER_TEXT.secondary,
      }}
    >
      <LegendSwatch fill={SCHEDULED_FILL} stroke={SCHEDULED_STROKE} label="Scheduled this week" />
      <LegendSwatch fill={COMPLETED_FILL} stroke={COMPLETED_STROKE} label="Completed this week" />
      <LegendSwatch fill={IDLE_FILL} stroke={IDLE_STROKE} label="Not in this week's work" />
    </ul>
  );
}

function HeatmapLegend() {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div
        style={{
          height: 10,
          borderRadius: 99,
          border: `1px solid ${SURFACE.border}`,
          background:
            "linear-gradient(90deg, var(--aether-surface-raised, #f6f6f6), #5c1324)",
          maxWidth: 280,
        }}
        aria-hidden="true"
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          maxWidth: 280,
          fontSize: 11,
          color: AETHER_TEXT.muted,
        }}
      >
        <span>0% completed</span>
        <span>100% completed</span>
      </div>
    </div>
  );
}

function LegendSwatch({
  fill,
  stroke,
  label,
}: {
  fill: string;
  stroke: string;
  label: string;
}) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        aria-hidden="true"
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: fill,
          border: `1px solid ${stroke}`,
          flex: "0 0 auto",
        }}
      />
      {label}
    </li>
  );
}

function MuscleLists({
  completed,
  scheduled,
  unmapped,
}: {
  completed: MuscleId[];
  scheduled: MuscleId[];
  unmapped: string[];
}) {
  if (completed.length === 0 && scheduled.length === 0 && unmapped.length === 0) {
    return (
      <p style={{ ...styles.captionText, margin: 0 }}>
        No mapped muscles yet. Named lifts such as bicep curl only color that muscle.
      </p>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 10,
      }}
    >
      {scheduled.length > 0 && (
        <MuscleNameList title="Scheduled" ids={scheduled} />
      )}
      {completed.length > 0 && (
        <MuscleNameList title="Completed" ids={completed} />
      )}
      {unmapped.length > 0 && (
        <div>
          <div style={styles.captionText}>Not on the map</div>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: AETHER_TEXT.secondary, fontSize: 13 }}>
            {unmapped.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MuscleNameList({ title, ids }: { title: string; ids: MuscleId[] }) {
  return (
    <div>
      <div style={styles.captionText}>{title}</div>
      <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: AETHER_TEXT.secondary, fontSize: 13 }}>
        {ids.map((id) => (
          <li key={id}>{muscleLabel(id)}</li>
        ))}
      </ul>
    </div>
  );
}

function HeatmapMuscleList({ heatmap }: { heatmap: MuscleMonthHeatmap }) {
  const rows = MUSCLE_CATALOG.map((entry) => {
    const counts = heatmap.byMuscle[entry.id];
    if (!counts || (counts.scheduledCount === 0 && counts.completedCount === 0)) return null;
    return { id: entry.id, label: entry.label, percent: counts.percent, counts };
  }).filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return (
      <p style={{ ...styles.captionText, margin: 0 }}>
        No mapped muscles completed this month yet.
      </p>
    );
  }

  return (
    <ul
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 6,
        listStyle: "none",
        margin: 0,
        padding: 0,
        fontSize: 13,
        color: AETHER_TEXT.secondary,
      }}
    >
      {rows.map((row) => (
        <li key={row.id}>
          {row.label} · {Math.round(row.percent * 100)}%
          <span style={{ color: AETHER_TEXT.muted }}>
            {" "}
            ({row.counts.completedCount} completed
            {row.counts.scheduledCount > 0 ? ` / ${row.counts.scheduledCount} scheduled` : ""})
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatWeeklyDetail(
  counts: MuscleWeekSnapshot["byMuscle"][MuscleId]
): string | undefined {
  if (!counts) return "Not scheduled or completed";
  if (counts.completedCount > 0 && counts.scheduledCount > 0) {
    return `Completed ${counts.completedCount} of ${counts.scheduledCount} scheduled`;
  }
  if (counts.completedCount > 0) return `Completed ${counts.completedCount}× this week`;
  if (counts.scheduledCount > 0) return `Scheduled ${counts.scheduledCount}× this week`;
  return undefined;
}

function formatHeatmapDetail(
  counts: MuscleMonthHeatmap["byMuscle"][MuscleId]
): string | undefined {
  if (!counts) return "No sessions this month";
  return `${Math.round(counts.percent * 100)}% · ${counts.completedCount} completed / ${counts.scheduledCount} scheduled`;
}
