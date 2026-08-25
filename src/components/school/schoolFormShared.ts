import { isSchoolDateKey, normalizeSchoolTimeInput } from "../../core/school";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseOptionalNonNegativeNumber(
  raw: string,
  fieldLabel: string
): ParseResult<number | undefined> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: undefined };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, error: `${fieldLabel} must be a number that is 0 or greater.` };
  }
  return { ok: true, value: parsed };
}

export function parseOptionalNonNegativeInteger(
  raw: string,
  fieldLabel: string
): ParseResult<number | undefined> {
  const parsed = parseOptionalNonNegativeNumber(raw, fieldLabel);
  if (!parsed.ok) return parsed;
  if (parsed.value !== undefined && !Number.isInteger(parsed.value)) {
    return { ok: false, error: `${fieldLabel} must be a whole number.` };
  }
  return parsed;
}

export function parseOptionalDate(raw: string, fieldLabel: string): ParseResult<string | undefined> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: undefined };
  if (!isSchoolDateKey(trimmed)) {
    return { ok: false, error: `${fieldLabel} must be a valid date.` };
  }
  return { ok: true, value: trimmed };
}

export function parseOptionalTime(raw: string, fieldLabel: string): ParseResult<string | undefined> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: undefined };
  const normalized = normalizeSchoolTimeInput(trimmed);
  if (!normalized) return { ok: false, error: `${fieldLabel} must be a valid time.` };
  return { ok: true, value: normalized };
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
