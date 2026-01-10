import type { AppPayload, Session } from "./model";
import { isSameLocalDay, startOfTodayLocal } from "./time";

export function minutesTodayForSkill(payload: AppPayload, skillId: string): number {
  const today = startOfTodayLocal();
  return payload.sessions
    .filter((s) => s.skillId === skillId && isSameLocalDay(s.startedAtIso, today))
    .reduce((sum, s) => sum + s.minutes, 0);
}

export function addSession(payload: AppPayload, session: Session): AppPayload {
  return {
    ...payload,
    sessions: [session, ...payload.sessions],
  };
}