import {
  parseFocusPhaseState,
  withWorkoutFocusDraft,
  type FocusPhaseState,
} from "./focusPhase";
import type { WorkoutLoggerDraft } from "./fitness";

export const FOCUS_PHASE_STORAGE_KEY = "pa.focusPhase.v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readFocusPhase(): FocusPhaseState | undefined {
  if (!canUseStorage()) return undefined;
  try {
    const raw = window.localStorage.getItem(FOCUS_PHASE_STORAGE_KEY);
    if (!raw) return undefined;
    return parseFocusPhaseState(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function writeFocusPhase(phase: FocusPhaseState): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(FOCUS_PHASE_STORAGE_KEY, JSON.stringify(phase));
  } catch {
    // localStorage may be unavailable; in-memory App state is the fallback.
  }
}

export function clearFocusPhase(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(FOCUS_PHASE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function writeWorkoutFocusDraft(draft: WorkoutLoggerDraft): void {
  const current = readFocusPhase();
  if (!current || current.kind !== "workout") return;
  writeFocusPhase(withWorkoutFocusDraft(current, draft));
}
