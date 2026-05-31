import type { ScheduleBlock, Weekday } from "./model";

export type CompletionStatus = "idle" | "onTrack" | "overdue";
export type BlockStatus = "upcoming" | "inProgress" | "done" | "behind";

export function weekdayFromDate(d: Date): Weekday {
  // JS getDay(): 0=Sun, 1=Mon, ... 6=Sat
  const map: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[d.getDay()];
}

export function parseHHMMToMinutes(hhmm: string): number {
  // expects "HH:MM"
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return 0;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

/** Display label for stored HH:MM values, e.g. 19:15 → "7:15pm". */
export function formatHHMMToDisplayTime(hhmm: string): string {
  const minutes = parseHHMMToMinutes(hhmm);
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = hours24 < 12 ? "am" : "pm";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, "0")}${period}`;
}

export function addMinutesToHHMM(hhmm: string, add: number): string {
  const start = parseHHMMToMinutes(hhmm);
  const end = Math.max(0, start + add);
  const hh = Math.floor(end / 60) % 24;
  const mm = end % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function expectedMinutesByNow(blocks: ScheduleBlock[], now: Date): number {
  const nowMin = minutesSinceMidnight(now);
  let total = 0;

  for (const b of blocks) {
    const start = parseHHMMToMinutes(b.startTime);
    const end = start + (Number.isInteger(b.minutes) ? b.minutes : 0);

    // Block hasn't started
    if (nowMin < start) continue;

    // Block fully completed time window
    if (nowMin >= end) {
      total += b.minutes;
      continue;
    }

    // Block is in progress → do NOT count yet
    break;
  }

  return total;
}
