// duration.ts contains helper functions to parse duration strings

export type DurationParseResult =
  | { ok: true; minutes: number }
  | { ok: false; message: string };

export function parseDurationToMinutes(input: string): DurationParseResult {
  const raw = input.trim().toLowerCase();

  if (!raw) return { ok: false, message: "Duration is required." };

  // If user typed only digits, treat as minutes
  if (/^\d+$/.test(raw)) {
    const minutes = parseInt(raw, 10);
    if (minutes <= 0) return { ok: false, message: "Minutes must be > 0." };
    return { ok: true, minutes };
  }

  // Minutes formats: "30m", "30 min", "30mins", "60min"
  // NOTE: no decimals for minutes allowed
  const minMatch = raw.match(/^(\d+)\s*(m|min|mins|minute|minutes)$/);
  if (minMatch) {
    const minutes = parseInt(minMatch[1], 10);
    if (minutes <= 0) return { ok: false, message: "Minutes must be > 0." };
    return { ok: true, minutes };
  }

  // Hours formats: "1hr", "0.5 hr", "2hrs"
  // Decimal hours are allowed (e.g., 0.5hr = 30min)
  const hrMatch = raw.match(/^(\d+(\.\d+)?)\s*(h|hr|hrs|hour|hours)$/);
  if (hrMatch) {
    const hours = Number(hrMatch[1]);
    if (!Number.isFinite(hours) || hours <= 0) {
      return { ok: false, message: "Hours must be > 0." };
    }
    const minutes = Math.round(hours * 60);
    if (minutes <= 0) return { ok: false, message: "Duration too small." };
    return { ok: true, minutes };
  }

  return {
    ok: false,
    message:
      "Invalid duration. Examples: 30, 30min, 45m, 1hr, 0.5hr. Decimals allowed only for hours.",
  };
}