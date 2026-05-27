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
