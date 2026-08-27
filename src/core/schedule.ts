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

/** Form-friendly 12-hour clock, e.g. 18:30 → "6:30 PM". */
export function formatHHMMTo12HourClock(hhmm: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return hhmm;
  const hours24 = Number(match[1]);
  const mins = Number(match[2]);
  if (hours24 > 23 || mins > 59) return hhmm;
  const period = hours24 < 12 ? "AM" : "PM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${period}`;
}

/**
 * Parses typed times such as "6:30 PM", "18:30", "6pm", or HTML time values
 * with seconds into stored HH:MM. Empty or invalid input → undefined.
 */
export function parseFlexibleTimeToHHMM(value: string): string | undefined {
  let text = value.trim().toLowerCase();
  if (!text) return undefined;
  text = text.replace(/\./g, "").replace(/\s+/g, " ").trim();

  let meridiem: "am" | "pm" | undefined;
  const meridiemMatch = /\s*([ap]m?)$/.exec(text);
  if (meridiemMatch && meridiemMatch.index !== undefined) {
    meridiem = meridiemMatch[1]!.startsWith("p") ? "pm" : "am";
    text = text.slice(0, meridiemMatch.index).trim();
  }

  const timeText = text.replace(/\s/g, "");
  let hours: number;
  let minutes: number;

  const withColon = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(timeText);
  if (withColon) {
    hours = Number(withColon[1]);
    minutes = Number(withColon[2]);
  } else if (/^\d{1,2}$/.test(timeText)) {
    hours = Number(timeText);
    minutes = 0;
  } else if (/^\d{3,4}$/.test(timeText)) {
    const padded = timeText.padStart(4, "0");
    hours = Number(padded.slice(0, 2));
    minutes = Number(padded.slice(2));
  } else {
    return undefined;
  }

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return undefined;
  if (minutes < 0 || minutes > 59) return undefined;

  if (meridiem) {
    if (hours < 1 || hours > 12) return undefined;
    hours = meridiem === "am" ? (hours === 12 ? 0 : hours) : hours === 12 ? 12 : hours + 12;
  } else if (hours < 0 || hours > 23) {
    return undefined;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
