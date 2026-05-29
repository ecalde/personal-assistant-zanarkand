import { stripSkillIdFromCareerPayload, stripUnknownSkillIdsFromCareer } from "./career";
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

/** Drops sessions whose skillId is not in payload.skills (does not remove valid sessions). */
export function cleanupOrphanedSessions(payload: AppPayload): AppPayload {
  const skillIds = new Set(payload.skills.map((s) => s.id));
  const sessions = payload.sessions.filter((s) => skillIds.has(s.skillId));
  if (sessions.length === payload.sessions.length) {
    return payload;
  }
  return { ...payload, sessions };
}

/** Removes a skill and all dependent session rows; strips career skill references. */
export function removeSkillFromPayload(payload: AppPayload, skillId: string): AppPayload {
  const skills = payload.skills.filter((s) => s.id !== skillId);
  const sessions = payload.sessions.filter((s) => s.skillId !== skillId);
  const career = stripSkillIdFromCareerPayload(payload, skillId);
  return { ...payload, skills, sessions, ...career };
}

/** Removes orphaned sessions and unknown career skill ids (safe for load/import). */
export function sanitizeSkillReferences(payload: AppPayload): AppPayload {
  const afterSessions = cleanupOrphanedSessions(payload);
  const career = stripUnknownSkillIdsFromCareer(afterSessions);
  if (
    afterSessions === payload &&
    career.jobApplications === afterSessions.jobApplications &&
    career.careerTarget === afterSessions.careerTarget
  ) {
    return payload;
  }
  return { ...afterSessions, ...career };
}