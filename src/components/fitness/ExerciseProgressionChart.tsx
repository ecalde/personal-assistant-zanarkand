import { useMemo, useState, type CSSProperties } from "react";
import {
  buildFrequencyChartLayout,
  buildWeightChartLayout,
  EXERCISE_CHART_PAD,
  pickDefaultExerciseKey,
  type ExerciseProgression,
} from "../../core/exerciseProgression";
import { AETHER_TEXT, styles } from "../../ui/appStyles";
import { usePrefersReducedMotion } from "../../ui/useMediaQuery";

export type ProgressionChartView = "weight" | "frequency" | "stats";

export type ExerciseProgressionChartProps = {
  exercises: ExerciseProgression[];
};

const toggleGroup: CSSProperties = {
  display: "inline-flex",
  border: "1px solid var(--aether-border, #e5e5e5)",
  borderRadius: 10,
  overflow: "hidden",
};

const toggleBtn: CSSProperties = {
  ...styles.actionBtn,
  border: "none",
  borderRadius: 0,
  fontSize: 13,
};

const toggleBtnActive: CSSProperties = {
  ...toggleBtn,
  background: "var(--aether-accent-soft, rgba(70,198,255,0.16))",
  fontWeight: 700,
};

const chartFrame: CSSProperties = {
  width: "100%",
  height: "auto",
  display: "block",
  overflow: "visible",
};

function formatStatDate(dateKey: string | undefined): string {
  if (!dateKey) return "—";
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPr(value: number | undefined): string {
  if (value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export function ExerciseProgressionChart({ exercises }: ExerciseProgressionChartProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() =>
    pickDefaultExerciseKey(exercises)
  );
  const [view, setView] = useState<ProgressionChartView>("weight");

  const selected =
    exercises.find((entry) => entry.key === selectedKey) ??
    exercises.find((entry) => entry.key === pickDefaultExerciseKey(exercises));

  const weightLayout = useMemo(
    () =>
      selected ? buildWeightChartLayout(selected.weights, selected.personalRecord) : undefined,
    [selected]
  );
  const frequencyLayout = useMemo(
    () => (selected ? buildFrequencyChartLayout(selected.frequencyByWeek) : undefined),
    [selected]
  );

  const emptyHint = "Log a completed exercise with weight to see the chart.";

  return (
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
        <div style={{ ...styles.cardTitle, marginBottom: 0 }}>Progress</div>
        {exercises.length > 0 && (
          <div style={toggleGroup} role="group" aria-label="Progress chart view">
            {(
              [
                ["weight", "Weight"],
                ["frequency", "Frequency"],
                ["stats", "Stats"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
                style={view === id ? toggleBtnActive : toggleBtn}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {exercises.length === 0 || !selected ? (
        <p style={{ ...styles.sectionLead, margin: 0 }}>{emptyHint}</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ ...styles.label, maxWidth: 280 }}>
            Exercise
            <select
              value={selected.key}
              onChange={(event) => setSelectedKey(event.target.value)}
              style={styles.select}
            >
              {exercises.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </label>

          {view === "weight" &&
            (selected.weights.length === 0 || !weightLayout ? (
              <p style={{ ...styles.sectionLead, margin: 0 }}>{emptyHint}</p>
            ) : (
              <WeightSvg layout={weightLayout} name={selected.displayName} staticChart={prefersReducedMotion} />
            ))}

          {view === "frequency" &&
            (selected.frequencyByWeek.length === 0 || !frequencyLayout ? (
              <p style={{ ...styles.sectionLead, margin: 0 }}>
                Complete a session to see weekly frequency.
              </p>
            ) : (
              <FrequencySvg
                layout={frequencyLayout}
                name={selected.displayName}
                staticChart={prefersReducedMotion}
              />
            ))}

          {view === "stats" && (
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 12,
                margin: 0,
              }}
            >
              <StatBlock label="First logged" value={formatStatDate(selected.firstLoggedDate)} />
              <StatBlock
                label="Times completed"
                value={String(selected.completionCount)}
              />
              <StatBlock label="Last logged" value={formatStatDate(selected.lastLoggedDate)} />
              <StatBlock label="PR" value={formatPr(selected.personalRecord)} />
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--aether-border, #e5e5e5)",
        borderRadius: 10,
        padding: 10,
        background: "var(--aether-surface-sunken, #fafafa)",
      }}
    >
      <dt style={{ ...styles.captionText, margin: 0 }}>{label}</dt>
      <dd style={{ margin: "4px 0 0", fontWeight: 800, color: AETHER_TEXT.primary }}>{value}</dd>
    </div>
  );
}

type WeightSvgProps = {
  layout: NonNullable<ReturnType<typeof buildWeightChartLayout>>;
  name: string;
  staticChart: boolean;
};

function WeightSvg({ layout, name, staticChart }: WeightSvgProps) {
  const pr = layout.dots.find((dot) => dot.isPr);
  const firstLabel = layout.xLabels[0]?.label ?? "";
  const lastLabel = layout.xLabels[layout.xLabels.length - 1]?.label ?? firstLabel;
  const label = pr
    ? `${name} weight from ${firstLabel} to ${lastLabel}, PR ${formatPr(pr.weight)}`
    : `${name} weight over time`;

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={label}
      style={{
        ...chartFrame,
        ...(staticChart ? { animation: "none" } : undefined),
      }}
    >
      {layout.yTicks.map((tick, index) => (
        <g key={`y-${index}`}>
          <line
            x1={EXERCISE_CHART_PAD.left}
            x2={layout.width - EXERCISE_CHART_PAD.right}
            y1={tick.y}
            y2={tick.y}
            stroke="var(--aether-border, #e5e5e5)"
            strokeWidth={1}
          />
          <text
            x={EXERCISE_CHART_PAD.left - 4}
            y={tick.y}
            textAnchor="end"
            dominantBaseline="middle"
            fill={AETHER_TEXT.muted}
            fontSize={11}
          >
            {tick.label}
          </text>
        </g>
      ))}
      {layout.areaPath && (
        <path d={layout.areaPath} fill="var(--aether-accent-soft, rgba(70,198,255,0.16))" />
      )}
      {layout.linePath && (
        <path
          d={layout.linePath}
          fill="none"
          stroke="var(--aether-accent, #46c6ff)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {layout.dots.map((dot) => (
        <circle
          key={`${dot.date}:${dot.weight}`}
          cx={dot.x}
          cy={dot.y}
          r={dot.isPr ? 6 : 4}
          fill="var(--aether-accent, #46c6ff)"
          stroke={dot.isPr ? "var(--aether-text-on-accent, #04101f)" : "none"}
          strokeWidth={dot.isPr ? 1.5 : 0}
        >
          <title>
            {formatStatDate(dot.date)} · {formatPr(dot.weight)}
            {dot.isPr ? " · PR" : ""}
          </title>
        </circle>
      ))}
      {layout.xLabels.map((labelTick) => (
        <text
          key={labelTick.label}
          x={labelTick.x}
          y={layout.height - 12}
          textAnchor="middle"
          fill={AETHER_TEXT.muted}
          fontSize={11}
        >
          {labelTick.label}
        </text>
      ))}
    </svg>
  );
}

type FrequencySvgProps = {
  layout: NonNullable<ReturnType<typeof buildFrequencyChartLayout>>;
  name: string;
  staticChart: boolean;
};

function FrequencySvg({ layout, name, staticChart }: FrequencySvgProps) {
  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={`${name} weekly completion frequency`}
      style={{
        ...chartFrame,
        ...(staticChart ? { animation: "none" } : undefined),
      }}
    >
      {layout.yTicks.map((tick, index) => (
        <g key={`fy-${index}`}>
          <line
            x1={EXERCISE_CHART_PAD.left}
            x2={layout.width - EXERCISE_CHART_PAD.right}
            y1={tick.y}
            y2={tick.y}
            stroke="var(--aether-border, #e5e5e5)"
            strokeWidth={1}
          />
          <text
            x={EXERCISE_CHART_PAD.left - 4}
            y={tick.y}
            textAnchor="end"
            dominantBaseline="middle"
            fill={AETHER_TEXT.muted}
            fontSize={11}
          >
            {tick.label}
          </text>
        </g>
      ))}
      {layout.bars.map((bar) => (
        <g key={bar.weekStart}>
          {bar.count > 0 && (
            <rect
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx={3}
              fill="var(--aether-accent-soft, rgba(70,198,255,0.16))"
              stroke="var(--aether-accent, #46c6ff)"
              strokeWidth={1}
            >
              <title>
                Week of {formatStatDate(bar.weekStart)} · {bar.count}
              </title>
            </rect>
          )}
          {bar.showLabel && (
            <text
              x={bar.x + bar.width / 2}
              y={layout.height - 12}
              textAnchor="middle"
              fill={AETHER_TEXT.muted}
              fontSize={10}
            >
              {bar.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
