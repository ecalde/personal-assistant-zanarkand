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

export type AppPayload = {
  skills: Skill[];
  sessions: Session[];
  overrides: Array<unknown>;
  events: LifeEvent[];
  people: Person[];
};