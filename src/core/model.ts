// model.ts defines the core data types for the personal assistant app

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

export type AppPayload = {
  skills: Skill[];
  // TODO: add these soon (sessions, overrides, etc.)
  sessions: Array<unknown>;
  overrides: Array<unknown>;
};