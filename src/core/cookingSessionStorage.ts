import type { CookingSession } from "./model";

const ACTIVE_COOKING_SESSION_KEY = "pa.cooking.activeSession.v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readActiveCookingSessionMirror(): CookingSession | undefined {
  if (!canUseStorage()) return undefined;
  try {
    const raw = window.localStorage.getItem(ACTIVE_COOKING_SESSION_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const session = parsed as CookingSession;
    if (typeof session.id !== "string" || session.status !== "in_progress") return undefined;
    if (!Array.isArray(session.timers)) return undefined;
    return session;
  } catch {
    return undefined;
  }
}

export function writeActiveCookingSessionMirror(session: CookingSession): void {
  if (!canUseStorage()) return;
  try {
    if (session.status !== "in_progress") {
      clearActiveCookingSessionMirror(session.id);
      return;
    }
    window.localStorage.setItem(ACTIVE_COOKING_SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage may be unavailable; the payload remaining in App.tsx is the fallback.
  }
}

export function clearActiveCookingSessionMirror(sessionId?: string): void {
  if (!canUseStorage()) return;
  try {
    if (sessionId) {
      const current = readActiveCookingSessionMirror();
      if (current && current.id !== sessionId) return;
    }
    window.localStorage.removeItem(ACTIVE_COOKING_SESSION_KEY);
  } catch {
    // ignore
  }
}
