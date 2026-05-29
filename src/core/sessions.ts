import { stripSkillIdFromCareerPayload, stripUnknownSkillIdsFromCareer } from "./career";
import type { AppPayload, Session } from "./model";
import { cleanupInvalidSkillScheduleSeries } from "./skillSeries";
import { cleanupInvalidWorkoutScheduleSeries } from "./workoutSeries";
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

/** Strips invalid workout plan schedule series (safe for load/import). */
export function sanitizeFitnessReferences(payload: AppPayload): AppPayload {
  return cleanupInvalidWorkoutScheduleSeries(payload);
}

/** Removes orphaned sessions and unknown career skill ids (safe for load/import). */
export function sanitizeSkillReferences(payload: AppPayload): AppPayload {
  const afterFitness = sanitizeFitnessReferences(payload);
  const afterSeries = cleanupInvalidSkillScheduleSeries(afterFitness);
  const afterSessions = cleanupOrphanedSessions(afterSeries);
  const career = stripUnknownSkillIdsFromCareer(afterSessions);
  if (
    afterFitness === payload &&
    afterSeries === afterFitness &&
    afterSessions === afterSeries &&
    career.jobApplications === afterSessions.jobApplications &&
    career.careerTarget === afterSessions.careerTarget
  ) {
    return payload;
  }
  return { ...afterSessions, ...career };
}