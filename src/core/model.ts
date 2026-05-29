// model.ts defines the core data types for the personal assistant app

// Re-exported so AppPayload can reference the persisted calendar preferences
// singleton without depending on the (pure) calendarColors module's logic.
export type { CalendarColorPreferences } from "./calendarColors";
import type { CalendarColorPreferences } from "./calendarColors";

export type Priority = 1 | 2 | 3 | 4;

export type Weekday =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

export type ScheduleBlock = {
  id: string;
  startTime: string;
  // planned minutes (integer)
  minutes: number;
};

export type WeeklySchedule = Record<Weekday, ScheduleBlock[]>;

export type Skill = {
  id: string;
  name: string;

  // Optional 1–4; undefined means “no priority”
  priority?: Priority;

  // Goals (minutes)
  dailyGoalMinutes?: number;
  weeklyGoalMinutes?: number;

  // Template schedule (recurring weekly plan)
  schedule: WeeklySchedule;

  createdAtIso: string;
  updatedAtIso: string;
};

export type Session = {
  id: string;
  skillId: string;

  // minutes completed (integer, no decimals)
  minutes: number;

  // for now: when you logged it (later we’ll add optional true start time)
  startedAtIso: string;

  createdAtIso: string;
};

export type EventType =
  | "birthday"
  | "hangout"
  | "trip"
  | "holiday"
  | "deadline"
  | "other";

export type LifeEvent = {
  id: string;
  title: string;
  date: string;
  type: EventType;
  startTime?: string;
  endTime?: string;
  personName?: string;
  personId?: string;
  notes?: string;
  reminder: boolean;
  createdAtIso: string;
  updatedAtIso: string;
};

export type Person = {
  id: string;
  name: string;
  nickname?: string;
  birthdayMonthDay?: string;
  relationship?: string;
  likes?: string;
  dislikes?: string;
  giftIdeas?: string;
  notes?: string;
  lastContactDate?: string;
  contactCadenceDays?: number;
  createdAtIso: string;
  updatedAtIso: string;
};

export type ApplicationStatus =
  | "saved"
  | "applied"
  | "screening"
  | "technical"
  | "onsite"
  | "offer"
  | "rejected"
  | "withdrawn";

export type RemotePolicy = "remote" | "hybrid" | "onsite" | "unknown";

export type JobApplication = {
  id: string;
  company: string;
  roleTitle: string;
  status: ApplicationStatus;
  salaryMin?: number;
  salaryMax?: number;
  location?: string;
  remotePolicy?: RemotePolicy;
  appliedDate?: string;
  url?: string;
  notes?: string;
  requiredSkillIds: string[];
  requiredSkillsText?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type CareerTarget = {
  id: string;
  roleTitle: string;
  company?: string;
  notes?: string;
  requiredSkillIds: string[];
  requiredSkillsText?: string;
  updatedAtIso: string;
};

export type WorkoutFocus =
  | "push"
  | "pull"
  | "legs"
  | "full_body"
  | "cardio"
  | "mobility";

export type ExerciseEntry = {
  id: string;
  name: string;
  sets?: number;
  reps?: number;
  weight?: number;
  notes?: string;
};

export type WorkoutPlan = {
  id: string;
  name: string;
  focus?: WorkoutFocus;
  exercises: ExerciseEntry[];
  notes?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type WorkoutSession = {
  id: string;
  date: string;
  focus?: WorkoutFocus;
  planId?: string;
  exercises: ExerciseEntry[];
  notes?: string;
  durationMinutes?: number;
  completedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type FocusFeedbackAction = "dismissed" | "snoozed";

export type FocusFeedback = {
  id: string;
  focusItemId: string;
  action: FocusFeedbackAction;
  untilIso?: string;
  sourceSnapshot?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type AppPayload = {
  skills: Skill[];
  sessions: Session[];
  overrides: Array<unknown>;
  events: LifeEvent[];
  people: Person[];
  jobApplications: JobApplication[];
  careerTarget?: CareerTarget;
  workoutPlans: WorkoutPlan[];
  workoutSessions: WorkoutSession[];
  focusFeedback: FocusFeedback[];
  calendarPreferences?: CalendarColorPreferences;
};