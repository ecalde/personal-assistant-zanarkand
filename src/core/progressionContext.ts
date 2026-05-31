// Phase 35 — Progression context builder.
//
// Normalizes raw AppPayload domain data into a derived, read-only structure
// that the reward / achievement / quest engines consume. Pure: no React,
// storage, or Supabase; never mutates inputs. Dates are local YYYY-MM-DD keys
// compared lexicographically (matching the rest of the core layer).

import type {
  AppPayload,
  JobApplication,
  Person,
  Session,
  Skill,
  WorkoutSession,
} from "./model";
import {
  buildGlobalProgression,
  buildSkillProgressions,
  dayKeyFromIso,
  isStreakActiveDay,
  type GlobalProgression,
  type SkillProgression,
} from "./progression";
import { startOfWeekLocal } from "./dashboardStats";
import { formatLocalDateKey, weekdayFromDateString } from "./timeline";
import { isWorkoutPlanActiveOnDate } from "./workoutSeries";
import { isPlanSchedulable, resolveWorkoutPlanSchedule } from "./fitness";
import type { ProgressionAxis } from "./progressionModel";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Forward-progress order for the career pipeline (terminal states excluded). */
const CAREER_PROGRESS_ORDER: Record<string, number> = {
  saved: 0,
  applied: 1,
  screening: 2,
  technical: 3,
  onsite: 4,
  offer: 5,
};

const SOCIAL_EVENT_TYPES = new Set(["hangout", "birthday"]);

export type PeriodBounds = { startKey: string; endKey: string };

export type CareerStatusReached = {
  applicationId: string;
  status: string;
  progressOrder: number;
  dayKey?: string;
};

export type ScheduledWorkoutCompletion = { planId: string; dateKey: string };

export type AttendedEvent = { eventId: string; dateKey: string; isSocial: boolean };

export type PeopleContact = { personId: string; dayKey: string };

export type ProgressionContext = {
  now: Date;
  todayKey: string;
  week: PeriodBounds;
  month: PeriodBounds;

  skills: Skill[];
  axisBySkillId: Map<string, ProgressionAxis>;

  /** skillId -> dayKey -> minutes. */
  minutesBySkillDay: Map<string, Map<string, number>>;
  totalMinutesBySkill: Map<string, number>;
  totalSkillMinutes: number;
  /** dayKey -> minutes across all skills. */
  minutesByDay: Map<string, number>;
  /** Days where at least one skill qualifies for the streak. */
  globalActiveDayKeys: Set<string>;

  globalProgression: GlobalProgression;
  skillProgressions: SkillProgression[];
  skillProgressionById: Map<string, SkillProgression>;

  /** skillId -> set of dayKeys where the daily goal was met (goal must be set). */
  dailyGoalMetDaysBySkill: Map<string, Set<string>>;
  /** skillId -> set of week-start keys where the weekly goal was met. */
  weeklyGoalMetWeeksBySkill: Map<string, Set<string>>;
  weeklyGoalsMetCount: number;

  workoutSessions: WorkoutSession[];
  workoutsCompletedTotal: number;
  scheduledWorkoutCompletions: ScheduledWorkoutCompletion[];

  jobApplications: JobApplication[];
  applicationsCount: number;
  careerStatusReached: CareerStatusReached[];

  people: Person[];
  peopleContacts: PeopleContact[];

  attendedEvents: AttendedEvent[];
  socialEventsAttendedCount: number;
};

function isValidDateKey(key: string): boolean {
  return DATE_KEY_RE.test(key);
}

export function inPeriod(dayKey: string, bounds: PeriodBounds): boolean {
  return dayKey >= bounds.startKey && dayKey <= bounds.endKey;
}

function weekBounds(now: Date): PeriodBounds {
  const start = startOfWeekLocal(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { startKey: formatLocalDateKey(start), endKey: formatLocalDateKey(end) };
}

function monthBounds(now: Date): PeriodBounds {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { startKey: formatLocalDateKey(start), endKey: formatLocalDateKey(end) };
}

function weekStartKeyForDayKey(dayKey: string): string | null {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return null;
  return formatLocalDateKey(startOfWeekLocal(new Date(y, m - 1, d)));
}

function dailyGoalMet(skill: Skill, minutes: number): boolean {
  return (
    skill.dailyGoalMinutes !== undefined &&
    skill.dailyGoalMinutes > 0 &&
    minutes >= skill.dailyGoalMinutes
  );
}

function buildMinutesBySkillDay(sessions: Session[]): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const session of sessions) {
    if (!Number.isInteger(session.minutes) || session.minutes <= 0) continue;
    const dayKey = dayKeyFromIso(session.startedAtIso);
    let days = map.get(session.skillId);
    if (!days) {
      days = new Map();
      map.set(session.skillId, days);
    }
    days.set(dayKey, (days.get(dayKey) ?? 0) + session.minutes);
  }
  return map;
}

export function buildProgressionContext(
  payload: AppPayload,
  now: Date = new Date()
): ProgressionContext {
  const skills = payload.skills ?? [];
  const sessions = payload.sessions ?? [];
  const workoutSessions = payload.workoutSessions ?? [];
  const workoutPlans = payload.workoutPlans ?? [];
  const jobApplications = payload.jobApplications ?? [];
  const people = payload.people ?? [];
  const events = payload.events ?? [];

  const todayKey = formatLocalDateKey(now);
  const week = weekBounds(now);
  const month = monthBounds(now);

  // v1 axis routing: every skill maps to "mind" until per-skill tagging lands.
  const axisBySkillId = new Map<string, ProgressionAxis>();
  for (const skill of skills) {
    axisBySkillId.set(skill.id, "mind");
  }

  const minutesBySkillDay = buildMinutesBySkillDay(sessions);
  const totalMinutesBySkill = new Map<string, number>();
  const minutesByDay = new Map<string, number>();
  const globalActiveDayKeys = new Set<string>();
  const dailyGoalMetDaysBySkill = new Map<string, Set<string>>();
  const weeklyMinutesBySkillWeek = new Map<string, Map<string, number>>();

  const skillById = new Map(skills.map((s) => [s.id, s]));

  for (const [skillId, days] of minutesBySkillDay) {
    const skill = skillById.get(skillId);
    let skillTotal = 0;
    const dailyMet = new Set<string>();
    const weekly = new Map<string, number>();

    for (const [dayKey, minutes] of days) {
      skillTotal += minutes;
      minutesByDay.set(dayKey, (minutesByDay.get(dayKey) ?? 0) + minutes);

      if (skill) {
        if (isStreakActiveDay(skill, minutes)) {
          globalActiveDayKeys.add(dayKey);
        }
        if (dailyGoalMet(skill, minutes)) {
          dailyMet.add(dayKey);
        }
        const weekKey = weekStartKeyForDayKey(dayKey);
        if (weekKey) {
          weekly.set(weekKey, (weekly.get(weekKey) ?? 0) + minutes);
        }
      }
    }

    totalMinutesBySkill.set(skillId, skillTotal);
    if (dailyMet.size > 0) dailyGoalMetDaysBySkill.set(skillId, dailyMet);
    weeklyMinutesBySkillWeek.set(skillId, weekly);
  }

  const totalSkillMinutes = [...totalMinutesBySkill.values()].reduce((a, b) => a + b, 0);

  // Weekly goals met (lifetime) per skill.
  const weeklyGoalMetWeeksBySkill = new Map<string, Set<string>>();
  let weeklyGoalsMetCount = 0;
  for (const skill of skills) {
    if (skill.weeklyGoalMinutes === undefined || skill.weeklyGoalMinutes <= 0) continue;
    const weekly = weeklyMinutesBySkillWeek.get(skill.id);
    if (!weekly) continue;
    const met = new Set<string>();
    for (const [weekKey, minutes] of weekly) {
      if (minutes >= skill.weeklyGoalMinutes) met.add(weekKey);
    }
    if (met.size > 0) {
      weeklyGoalMetWeeksBySkill.set(skill.id, met);
      weeklyGoalsMetCount += met.size;
    }
  }

  const skillProgressions = buildSkillProgressions(skills, sessions, now);
  const skillProgressionById = new Map(skillProgressions.map((p) => [p.skill.id, p]));
  const globalProgression = buildGlobalProgression(skills, sessions, now);

  // Scheduled workout completions (deduped by plan + date).
  const planById = new Map(workoutPlans.map((p) => [p.id, p]));
  const scheduledSeen = new Set<string>();
  const scheduledWorkoutCompletions: ScheduledWorkoutCompletion[] = [];
  for (const session of workoutSessions) {
    if (!session.planId) continue;
    if (!isValidDateKey(session.date)) continue;
    const plan = planById.get(session.planId);
    if (!plan || !isPlanSchedulable(plan)) continue;
    if (!isWorkoutPlanActiveOnDate(plan, session.date)) continue;
    const weekday = weekdayFromDateString(session.date);
    const blocks = resolveWorkoutPlanSchedule(plan)[weekday] ?? [];
    if (blocks.length === 0) continue;
    const dedupeKey = `${session.planId}:${session.date}`;
    if (scheduledSeen.has(dedupeKey)) continue;
    scheduledSeen.add(dedupeKey);
    scheduledWorkoutCompletions.push({ planId: session.planId, dateKey: session.date });
  }

  // Career reached statuses (one entry per application that progressed past saved).
  const careerStatusReached: CareerStatusReached[] = [];
  for (const app of jobApplications) {
    const progressOrder = CAREER_PROGRESS_ORDER[app.status];
    if (progressOrder === undefined || progressOrder < 1) continue;
    const dayKey = app.updatedAtIso.slice(0, 10);
    careerStatusReached.push({
      applicationId: app.id,
      status: app.status,
      progressOrder,
      dayKey: isValidDateKey(dayKey) ? dayKey : undefined,
    });
  }

  // People contacts (one per person with a recorded last-contact date).
  const peopleContacts: PeopleContact[] = [];
  for (const person of people) {
    if (person.lastContactDate && isValidDateKey(person.lastContactDate)) {
      peopleContacts.push({ personId: person.id, dayKey: person.lastContactDate });
    }
  }

  // Event attendance proxy (v1): one-time, non-deadline events already in the past.
  const attendedEvents: AttendedEvent[] = [];
  for (const event of events) {
    if (event.recurrence) continue;
    if (event.type === "deadline") continue;
    if (!isValidDateKey(event.date) || event.date >= todayKey) continue;
    attendedEvents.push({
      eventId: event.id,
      dateKey: event.date,
      isSocial: SOCIAL_EVENT_TYPES.has(event.type),
    });
  }
  const socialEventsAttendedCount = attendedEvents.filter((e) => e.isSocial).length;

  return {
    now,
    todayKey,
    week,
    month,
    skills,
    axisBySkillId,
    minutesBySkillDay,
    totalMinutesBySkill,
    totalSkillMinutes,
    minutesByDay,
    globalActiveDayKeys,
    globalProgression,
    skillProgressions,
    skillProgressionById,
    dailyGoalMetDaysBySkill,
    weeklyGoalMetWeeksBySkill,
    weeklyGoalsMetCount,
    workoutSessions,
    workoutsCompletedTotal: workoutSessions.length,
    scheduledWorkoutCompletions,
    jobApplications,
    applicationsCount: jobApplications.length,
    careerStatusReached,
    people,
    peopleContacts,
    attendedEvents,
    socialEventsAttendedCount,
  };
}
