/** Client-local storage key for Career vs School tab (not synced). */
export const CAREER_SECTION_PREFERENCES_KEY = "pa.career.section.v1";

export type PersistedCareerSection = "career" | "school" | "resume";

export const CAREER_SECTION_ORDER: readonly PersistedCareerSection[] = [
  "career",
  "school",
  "resume",
];

function isCareerSection(value: unknown): value is PersistedCareerSection {
  return value === "career" || value === "school" || value === "resume";
}

/** Arrow keys for the Career | School | Resume radiogroup (Phase 10C). */
export function neighborCareerSection(
  current: PersistedCareerSection,
  key: string
): PersistedCareerSection | null {
  if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "ArrowDown" && key !== "ArrowUp") {
    return null;
  }
  const index = CAREER_SECTION_ORDER.indexOf(current);
  if (index < 0) return null;
  const delta = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  const next = (index + delta + CAREER_SECTION_ORDER.length) % CAREER_SECTION_ORDER.length;
  return CAREER_SECTION_ORDER[next] ?? null;
}

export function readCareerSection(
  fallback: PersistedCareerSection = "career"
): PersistedCareerSection {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(CAREER_SECTION_PREFERENCES_KEY);
    return isCareerSection(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function persistCareerSection(section: PersistedCareerSection): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CAREER_SECTION_PREFERENCES_KEY, section);
  } catch {
    // localStorage may be unavailable; preference stays in memory for this session.
  }
}
