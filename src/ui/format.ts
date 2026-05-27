import type { Priority } from "../core/model";

export function formatLocal(tsIso: string) {
  try {
    return new Date(tsIso).toLocaleString();
  } catch {
    return tsIso;
  }
}

export function formatTimeOnly(tsIso: string) {
  try {
    return new Date(tsIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return tsIso;
  }
}

export function priorityEmoji(p?: Priority) {
  if (!p) return "⚪";
  if (p === 1) return "🔴";
  if (p === 2) return "🟡";
  if (p === 3) return "🟢";
  return "🔵";
}

/** Formats non-negative integer minutes for dashboard labels (e.g. 90 → "1h 30m"). */
export function formatMinutes(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError("formatMinutes expects a non-negative integer");
  }
  if (minutes === 0) return "0m";

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

/** Display label for 1-based skill/account level. */
export function formatLevel(level: number): string {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError("formatLevel expects a positive integer");
  }
  return `Lv ${level}`;
}

/** Formats lifetime XP (1 XP = 1 minute logged). */
export function formatXp(xp: number): string {
  if (!Number.isInteger(xp) || xp < 0) {
    throw new RangeError("formatXp expects a non-negative integer");
  }
  return `${xp.toLocaleString()} XP`;
}
