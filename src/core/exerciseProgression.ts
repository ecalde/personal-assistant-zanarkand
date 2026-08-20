/**
 * Pure aggregators for per-exercise weight progression (Phase 46).
 *
 * Catalog identity is normalized name — no exercise table. Session rows from
 * **completed** workouts only; plans supply known-name fallback via
 * {@link collectRecentExerciseNames}. Chart geometry is also pure so the SVG
 * UI stays presentational.
 */

import { startOfWeekLocal } from "./dashboardStats";
import {
  collectRecentExerciseNames,
  isWorkoutSessionComplete,
  normalizeExerciseName,
} from "./fitness";
import type { WorkoutPlan, WorkoutSession } from "./model";
import { formatLocalDateKey } from "./timeline";

export type ExerciseWeightPoint = {
  date: string;
  weight: number;
};

export type ExerciseFrequencyBar = {
  weekStart: string;
  count: number;
};

export type ExerciseProgression = {
  key: string;
  displayName: string;
  weights: ExerciseWeightPoint[];
  firstLoggedDate: string | undefined;
  lastLoggedDate: string | undefined;
  completionCount: number;
  personalRecord: number | undefined;
  frequencyByWeek: ExerciseFrequencyBar[];
};

export type ChartPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type WeightChartDot = {
  x: number;
  y: number;
  date: string;
  weight: number;
  isPr: boolean;
};

export type WeightChartLayout = {
  width: number;
  height: number;
  linePath: string | undefined;
  areaPath: string | undefined;
  dots: WeightChartDot[];
  yTicks: Array<{ y: number; label: string }>;
  xLabels: Array<{ x: number; label: string }>;
};

export type FrequencyBarRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
  weekStart: string;
  label: string;
  showLabel: boolean;
};

export type FrequencyChartLayout = {
  width: number;
  height: number;
  bars: FrequencyBarRect[];
  yTicks: Array<{ y: number; label: string }>;
};

export const EXERCISE_CHART_WIDTH = 640;
export const EXERCISE_CHART_HEIGHT = 220;
export const EXERCISE_CHART_PAD: ChartPadding = {
  top: 18,
  right: 16,
  bottom: 34,
  left: 44,
};

/** Cap frequency bars so a long history stays readable. */
export const FREQUENCY_WEEK_CAP = 24;

/** Dropdown value for overlaying every exercise on one chart. */
export const ALL_EXERCISES_KEY = "__all__";

/** Distinct series colors so overlay lines stay readable in light and dark mode. */
export const EXERCISE_SERIES_COLORS = [
  "#46c6ff",
  "#7b9bff",
  "#3ecf8e",
  "#ff6b6b",
  "#f5a623",
  "#c084fc",
  "#22d3ee",
  "#fb7185",
  "#a3e635",
  "#f472b6",
] as const;

export function exerciseSeriesColor(index: number): string {
  return EXERCISE_SERIES_COLORS[index % EXERCISE_SERIES_COLORS.length]!;
}

export type WeightChartSeries = {
  key: string;
  displayName: string;
  color: string;
  linePath: string | undefined;
  dots: WeightChartDot[];
};

export type MultiWeightChartLayout = {
  width: number;
  height: number;
  series: WeightChartSeries[];
  yTicks: Array<{ y: number; label: string }>;
  xLabels: Array<{ x: number; label: string }>;
};

export type FrequencyStackSegment = {
  key: string;
  displayName: string;
  color: string;
  y: number;
  height: number;
  count: number;
};

export type FrequencyStackBar = {
  x: number;
  width: number;
  weekStart: string;
  label: string;
  showLabel: boolean;
  total: number;
  segments: FrequencyStackSegment[];
};

export type FrequencyChartSeriesMeta = {
  key: string;
  displayName: string;
  color: string;
};

export type MultiFrequencyChartLayout = {
  width: number;
  height: number;
  bars: FrequencyStackBar[];
  yTicks: Array<{ y: number; label: string }>;
  series: FrequencyChartSeriesMeta[];
};

const DEFAULT_CATALOG_LIMIT = Number.POSITIVE_INFINITY;

function parseDateKey(dateKey: string): Date | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function dateKeyToMs(dateKey: string): number {
  const date = parseDateKey(dateKey);
  return date ? date.getTime() : 0;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatShortDate(dateKey: string): string {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatWeightTick(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

function isUsableWeight(weight: number | undefined): weight is number {
  return weight !== undefined && Number.isFinite(weight) && weight >= 0;
}

function weekStartKeyFromDateKey(dateKey: string): string | undefined {
  const date = parseDateKey(dateKey);
  if (!date) return undefined;
  return formatLocalDateKey(startOfWeekLocal(date));
}

function enumerateWeekStarts(fromKey: string, toKey: string): string[] {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to || fromKey > toKey) return [];

  let cursor = startOfWeekLocal(from);
  const end = startOfWeekLocal(to);
  const keys: string[] = [];
  while (cursor <= end) {
    keys.push(formatLocalDateKey(cursor));
    cursor = addDays(cursor, 7);
  }
  return keys;
}

type ExerciseBucket = {
  displayName: string;
  dates: string[];
  weightByDate: Map<string, number>;
  sessionIds: Set<string>;
};

function emptyBucket(displayName: string): ExerciseBucket {
  return {
    displayName,
    dates: [],
    weightByDate: new Map(),
    sessionIds: new Set(),
  };
}

/**
 * Per-exercise series and stats from completed sessions. Catalog order comes
 * from {@link collectRecentExerciseNames} (session names, then plan fallback).
 * Plan-only names with no completed logs are omitted.
 */
export function buildExerciseProgressions(
  plans: WorkoutPlan[],
  sessions: WorkoutSession[]
): ExerciseProgression[] {
  const catalog = collectRecentExerciseNames(plans, sessions, DEFAULT_CATALOG_LIMIT);
  const buckets = new Map<string, ExerciseBucket>();

  for (const displayName of catalog) {
    const key = normalizeExerciseName(displayName);
    if (!key) continue;
    buckets.set(key, emptyBucket(displayName));
  }

  const completed = sessions.filter(isWorkoutSessionComplete);
  for (const session of completed) {
    const seenThisSession = new Set<string>();
    for (const entry of session.exercises) {
      const key = normalizeExerciseName(entry.name);
      if (!key) continue;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = emptyBucket(entry.name.trim().replace(/\s+/g, " "));
        buckets.set(key, bucket);
      }

      if (!seenThisSession.has(key)) {
        seenThisSession.add(key);
        bucket.sessionIds.add(session.id);
        bucket.dates.push(session.date);
      }

      if (isUsableWeight(entry.weight)) {
        const previous = bucket.weightByDate.get(session.date);
        if (previous === undefined || entry.weight > previous) {
          bucket.weightByDate.set(session.date, entry.weight);
        }
      }
    }
  }

  const progressions: ExerciseProgression[] = [];
  const emitted = new Set<string>();

  const emit = (key: string, bucket: ExerciseBucket) => {
    if (emitted.has(key)) return;
    if (bucket.sessionIds.size === 0) return;
    emitted.add(key);

    const sortedDates = [...bucket.dates].sort((a, b) => a.localeCompare(b));
    const firstLoggedDate = sortedDates[0];
    const lastLoggedDate = sortedDates[sortedDates.length - 1];
    const weights: ExerciseWeightPoint[] = [...bucket.weightByDate.entries()]
      .map(([date, weight]) => ({ date, weight }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.weight - b.weight);

    let personalRecord: number | undefined;
    for (const point of weights) {
      if (personalRecord === undefined || point.weight > personalRecord) {
        personalRecord = point.weight;
      }
    }

    progressions.push({
      key,
      displayName: bucket.displayName,
      weights,
      firstLoggedDate,
      lastLoggedDate,
      completionCount: bucket.sessionIds.size,
      personalRecord,
      frequencyByWeek: buildFrequencyByWeek(sortedDates),
    });
  };

  for (const displayName of catalog) {
    const key = normalizeExerciseName(displayName);
    const bucket = buckets.get(key);
    if (bucket) emit(key, bucket);
  }

  for (const [key, bucket] of buckets) {
    emit(key, bucket);
  }

  return progressions;
}

function buildFrequencyByWeek(sortedDates: string[]): ExerciseFrequencyBar[] {
  if (sortedDates.length === 0) return [];
  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];
  if (!first || !last) return [];

  const firstWeek = weekStartKeyFromDateKey(first);
  const lastWeek = weekStartKeyFromDateKey(last);
  if (!firstWeek || !lastWeek) return [];

  let weeks = enumerateWeekStarts(firstWeek, lastWeek);
  if (weeks.length > FREQUENCY_WEEK_CAP) {
    weeks = weeks.slice(weeks.length - FREQUENCY_WEEK_CAP);
  }

  const counts = new Map<string, number>();
  for (const date of sortedDates) {
    const week = weekStartKeyFromDateKey(date);
    if (!week) continue;
    if (weeks[0] && week < weeks[0]) continue;
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }

  return weeks.map((weekStart) => ({
    weekStart,
    count: counts.get(weekStart) ?? 0,
  }));
}

function plotRect(width: number, height: number, pad: ChartPadding) {
  return {
    x: pad.left,
    y: pad.top,
    width: Math.max(0, width - pad.left - pad.right),
    height: Math.max(0, height - pad.top - pad.bottom),
  };
}

function scaleY(value: number, yMin: number, yMax: number, plotY: number, plotH: number): number {
  if (yMax <= yMin) return plotY + plotH / 2;
  const t = (value - yMin) / (yMax - yMin);
  return plotY + plotH - t * plotH;
}

function niceWeightDomain(min: number, max: number): { yMin: number; yMax: number } {
  if (min === max) {
    const pad = min === 0 ? 1 : Math.max(1, Math.abs(min) * 0.1);
    return { yMin: Math.max(0, min - pad), yMax: max + pad };
  }
  const range = max - min;
  const pad = range * 0.12;
  return { yMin: Math.max(0, min - pad), yMax: max + pad };
}

function polylinePath(points: Array<{ x: number; y: number }>): string | undefined {
  if (points.length < 2) return undefined;
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function areaPath(
  points: Array<{ x: number; y: number }>,
  baselineY: number
): string | undefined {
  const line = polylinePath(points);
  if (!line || points.length < 2) return undefined;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return undefined;
  return `${line} L${last.x.toFixed(2)} ${baselineY.toFixed(2)} L${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

export function buildWeightChartLayout(
  points: ExerciseWeightPoint[],
  personalRecord: number | undefined,
  width = EXERCISE_CHART_WIDTH,
  height = EXERCISE_CHART_HEIGHT,
  pad = EXERCISE_CHART_PAD
): WeightChartLayout {
  const plot = plotRect(width, height, pad);
  if (points.length === 0) {
    return { width, height, linePath: undefined, areaPath: undefined, dots: [], yTicks: [], xLabels: [] };
  }

  let minW = points[0]!.weight;
  let maxW = minW;
  for (const point of points) {
    if (point.weight < minW) minW = point.weight;
    if (point.weight > maxW) maxW = point.weight;
  }
  const { yMin, yMax } = niceWeightDomain(minW, maxW);
  const minMs = dateKeyToMs(points[0]!.date);
  const maxMs = dateKeyToMs(points[points.length - 1]!.date);
  const span = Math.max(1, maxMs - minMs);

  const dots: WeightChartDot[] = points.map((point) => {
    const x =
      points.length === 1
        ? plot.x + plot.width / 2
        : plot.x + ((dateKeyToMs(point.date) - minMs) / span) * plot.width;
    const y = scaleY(point.weight, yMin, yMax, plot.y, plot.height);
    return {
      x,
      y,
      date: point.date,
      weight: point.weight,
      isPr: personalRecord !== undefined && point.weight === personalRecord,
    };
  });

  const baselineY = plot.y + plot.height;
  const yTicks = [yMin, (yMin + yMax) / 2, yMax].map((value) => ({
    y: scaleY(value, yMin, yMax, plot.y, plot.height),
    label: formatWeightTick(value),
  }));

  const first = dots[0];
  const last = dots[dots.length - 1];
  const xLabels: Array<{ x: number; label: string }> = [];
  if (first) xLabels.push({ x: first.x, label: formatShortDate(first.date) });
  if (last && last.date !== first?.date) {
    xLabels.push({ x: last.x, label: formatShortDate(last.date) });
  }

  return {
    width,
    height,
    linePath: polylinePath(dots),
    areaPath: areaPath(dots, baselineY),
    dots,
    yTicks,
    xLabels,
  };
}

export function buildFrequencyChartLayout(
  bars: ExerciseFrequencyBar[],
  width = EXERCISE_CHART_WIDTH,
  height = EXERCISE_CHART_HEIGHT,
  pad = EXERCISE_CHART_PAD
): FrequencyChartLayout {
  const plot = plotRect(width, height, pad);
  if (bars.length === 0) {
    return { width, height, bars: [], yTicks: [] };
  }

  const maxCount = bars.reduce((max, bar) => Math.max(max, bar.count), 0);
  const yMax = Math.max(1, maxCount);
  const gap = bars.length > 1 ? Math.min(8, plot.width / bars.length / 4) : 0;
  const barWidth = bars.length === 0 ? 0 : (plot.width - gap * (bars.length - 1)) / bars.length;
  const labelEvery = bars.length <= 8 ? 1 : Math.ceil(bars.length / 6);

  const rects: FrequencyBarRect[] = bars.map((bar, index) => {
    const heightPx = yMax === 0 ? 0 : (bar.count / yMax) * plot.height;
    const x = plot.x + index * (barWidth + gap);
    const y = plot.y + plot.height - heightPx;
    const isEdge = index === 0 || index === bars.length - 1;
    return {
      x,
      y,
      width: Math.max(0, barWidth),
      height: Math.max(0, heightPx),
      count: bar.count,
      weekStart: bar.weekStart,
      label: formatShortDate(bar.weekStart),
      showLabel: isEdge || index % labelEvery === 0,
    };
  });

  const yTicks = [0, Math.round(yMax / 2), yMax].map((value) => ({
    y: scaleY(value, 0, yMax, plot.y, plot.height),
    label: String(value),
  }));

  return { width, height, bars: rects, yTicks };
}

export function pickDefaultExerciseKey(exercises: ExerciseProgression[]): string | undefined {
  if (exercises.length === 0) return undefined;
  return ALL_EXERCISES_KEY;
}

export function buildMultiWeightChartLayout(
  exercises: ExerciseProgression[],
  width = EXERCISE_CHART_WIDTH,
  height = EXERCISE_CHART_HEIGHT,
  pad = EXERCISE_CHART_PAD
): MultiWeightChartLayout {
  const plot = plotRect(width, height, pad);
  const withWeights = exercises
    .map((entry, index) => ({ entry, color: exerciseSeriesColor(index) }))
    .filter(({ entry }) => entry.weights.length > 0);

  if (withWeights.length === 0) {
    return { width, height, series: [], yTicks: [], xLabels: [] };
  }

  let minW = withWeights[0]!.entry.weights[0]!.weight;
  let maxW = minW;
  let minDate = withWeights[0]!.entry.weights[0]!.date;
  let maxDate = minDate;

  for (const { entry } of withWeights) {
    for (const point of entry.weights) {
      if (point.weight < minW) minW = point.weight;
      if (point.weight > maxW) maxW = point.weight;
      if (point.date < minDate) minDate = point.date;
      if (point.date > maxDate) maxDate = point.date;
    }
  }

  const { yMin, yMax } = niceWeightDomain(minW, maxW);
  const minMs = dateKeyToMs(minDate);
  const maxMs = dateKeyToMs(maxDate);
  const span = Math.max(1, maxMs - minMs);
  const singleX = plot.x + plot.width / 2;

  const series: WeightChartSeries[] = withWeights.map(({ entry, color }) => {
    const dots: WeightChartDot[] = entry.weights.map((point) => {
      const x =
        minDate === maxDate
          ? singleX
          : plot.x + ((dateKeyToMs(point.date) - minMs) / span) * plot.width;
      return {
        x,
        y: scaleY(point.weight, yMin, yMax, plot.y, plot.height),
        date: point.date,
        weight: point.weight,
        isPr: entry.personalRecord !== undefined && point.weight === entry.personalRecord,
      };
    });
    return {
      key: entry.key,
      displayName: entry.displayName,
      color,
      linePath: polylinePath(dots),
      dots,
    };
  });

  const yTicks = [yMin, (yMin + yMax) / 2, yMax].map((value) => ({
    y: scaleY(value, yMin, yMax, plot.y, plot.height),
    label: formatWeightTick(value),
  }));

  const xLabels: Array<{ x: number; label: string }> = [
    {
      x: minDate === maxDate ? singleX : plot.x,
      label: formatShortDate(minDate),
    },
  ];
  if (maxDate !== minDate) {
    xLabels.push({ x: plot.x + plot.width, label: formatShortDate(maxDate) });
  }

  return { width, height, series, yTicks, xLabels };
}

export function buildMultiFrequencyChartLayout(
  exercises: ExerciseProgression[],
  width = EXERCISE_CHART_WIDTH,
  height = EXERCISE_CHART_HEIGHT,
  pad = EXERCISE_CHART_PAD
): MultiFrequencyChartLayout {
  const plot = plotRect(width, height, pad);
  const series: FrequencyChartSeriesMeta[] = exercises.map((entry, index) => ({
    key: entry.key,
    displayName: entry.displayName,
    color: exerciseSeriesColor(index),
  }));

  let first: string | undefined;
  let last: string | undefined;
  for (const entry of exercises) {
    if (entry.firstLoggedDate && (!first || entry.firstLoggedDate < first)) {
      first = entry.firstLoggedDate;
    }
    if (entry.lastLoggedDate && (!last || entry.lastLoggedDate > last)) {
      last = entry.lastLoggedDate;
    }
  }

  if (!first || !last) {
    return { width, height, bars: [], yTicks: [], series };
  }

  const firstWeek = weekStartKeyFromDateKey(first);
  const lastWeek = weekStartKeyFromDateKey(last);
  if (!firstWeek || !lastWeek) {
    return { width, height, bars: [], yTicks: [], series };
  }

  let weeks = enumerateWeekStarts(firstWeek, lastWeek);
  if (weeks.length > FREQUENCY_WEEK_CAP) {
    weeks = weeks.slice(weeks.length - FREQUENCY_WEEK_CAP);
  }

  const countsByKey = new Map(
    exercises.map((entry) => [
      entry.key,
      new Map(entry.frequencyByWeek.map((bar) => [bar.weekStart, bar.count])),
    ])
  );

  const totals = weeks.map((weekStart) =>
    exercises.reduce(
      (sum, entry) => sum + (countsByKey.get(entry.key)?.get(weekStart) ?? 0),
      0
    )
  );
  const yMax = Math.max(1, ...totals);
  const gap = weeks.length > 1 ? Math.min(8, plot.width / weeks.length / 4) : 0;
  const barWidth = weeks.length === 0 ? 0 : (plot.width - gap * (weeks.length - 1)) / weeks.length;
  const labelEvery = weeks.length <= 8 ? 1 : Math.ceil(weeks.length / 6);

  const bars: FrequencyStackBar[] = weeks.map((weekStart, index) => {
    const x = plot.x + index * (barWidth + gap);
    const isEdge = index === 0 || index === weeks.length - 1;
    const segments: FrequencyStackSegment[] = [];
    let stacked = 0;
    for (let seriesIndex = 0; seriesIndex < exercises.length; seriesIndex++) {
      const entry = exercises[seriesIndex]!;
      const count = countsByKey.get(entry.key)?.get(weekStart) ?? 0;
      if (count <= 0) continue;
      const heightPx = (count / yMax) * plot.height;
      segments.push({
        key: entry.key,
        displayName: entry.displayName,
        color: series[seriesIndex]!.color,
        y: plot.y + plot.height - stacked - heightPx,
        height: heightPx,
        count,
      });
      stacked += heightPx;
    }
    return {
      x,
      width: Math.max(0, barWidth),
      weekStart,
      label: formatShortDate(weekStart),
      showLabel: isEdge || index % labelEvery === 0,
      total: totals[index] ?? 0,
      segments,
    };
  });

  const yTicks = [0, Math.round(yMax / 2), yMax].map((value) => ({
    y: scaleY(value, 0, yMax, plot.y, plot.height),
    label: String(value),
  }));

  return { width, height, bars, yTicks, series };
}
