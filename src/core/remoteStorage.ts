// Remote persistence via Supabase (authenticated client + RLS).

import { supabase } from "../lib/supabaseClient";
import type { AppPayload } from "./model";
import { defaultPayload } from "./state";
import { nowIso, saveAppData, type AppData } from "./storage";
import {
  MapperError,
  calendarPreferencesToRow,
  careerTargetToRow,
  eventToRow,
  gamificationStateToRow,
  isUuid,
  jobApplicationToRow,
  overrideToRow,
  focusFeedbackToRow,
  payloadFromRows,
  personToRow,
  sessionToRow,
  skillToRow,
  workoutPlanToRow,
  workoutSessionToRow,
  validatePayloadForUpload,
  type CalendarPreferencesRow,
  type GamificationStateRow,
  type CareerTargetRow,
  type EventRow,
  type JobApplicationRow,
  type OverrideRow,
  type PersonRow,
  type SessionRow,
  type SkillRow,
  type WorkoutPlanRow,
  type WorkoutSessionRow,
  type FocusFeedbackRow,
} from "./dbMappers";

type AppTable =
  | "skills"
  | "sessions"
  | "overrides"
  | "events"
  | "people"
  | "job_applications"
  | "career_targets"
  | "workout_plans"
  | "workout_sessions"
  | "focus_feedback"
  | "calendar_preferences"
  | "gamification_state";

export class RemoteStorageError extends Error {
  readonly code?: string;
  readonly table?: AppTable;

  constructor(message: string, options?: { code?: string; table?: AppTable }) {
    super(message);
    this.name = "RemoteStorageError";
    this.code = options?.code;
    this.table = options?.table;
  }
}

/** Remote sync is on unless VITE_ENABLE_REMOTE_SYNC is explicitly "false". */
export function isRemoteSyncEnabled(): boolean {
  const flag = import.meta.env.VITE_ENABLE_REMOTE_SYNC;
  if (typeof flag === "string" && flag.trim().toLowerCase() === "false") {
    return false;
  }
  return true;
}

function assertUserId(userId: string): void {
  if (!isUuid(userId)) {
    throw new RemoteStorageError("Invalid user id.");
  }
}

function toRemoteStorageError(err: unknown, table: AppTable): RemoteStorageError {
  if (err instanceof RemoteStorageError) {
    return err;
  }
  if (err instanceof MapperError) {
    return new RemoteStorageError(err.message, { table });
  }
  if (err && typeof err === "object" && "code" in err) {
    const supaErr = err as { code?: string; message?: string };
    return new RemoteStorageError(syncFailureMessage(supaErr, table), {
      code: supaErr.code,
      table,
    });
  }
  return new RemoteStorageError(syncFailureMessage({}, table), { table });
}

function syncFailureMessage(
  error: { code?: string; message?: string },
  table: AppTable
): string {
  const msg = (error.message ?? "").toLowerCase();

  if (
    table === "events" &&
    (error.code === "PGRST204" ||
      (msg.includes("column") &&
        (msg.includes("recurrence") || msg.includes("series_id"))))
  ) {
    return (
      "Could not sync events. Your Supabase database is missing the event recurrence " +
      "migration (20260528000000_event_recurrence.sql). Apply it, then retry cloud save."
    );
  }

  if (table === "events" && error.code === "23503") {
    return "Could not sync events. An event links to a person that no longer exists.";
  }

  return `Could not sync ${table}. Please try again.`;
}

function throwOnSupabaseError(
  error: { code?: string; message?: string } | null,
  table: AppTable
): void {
  if (!error) return;
  throw new RemoteStorageError(syncFailureMessage(error, table), {
    code: error.code,
    table,
  });
}

function isMissingRecurrenceColumnsError(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error.code === "PGRST204") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("column") && (msg.includes("recurrence") || msg.includes("series_id"))
  );
}

type EventRowWithoutRecurrence = Omit<EventRow, "recurrence" | "series_id">;

function stripEventRecurrenceColumns(row: EventRow): EventRowWithoutRecurrence {
  // Omit recurrence columns for databases that have not run the Phase 22B migration yet.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentional omit
  const { recurrence, series_id, ...rest } = row;
  return rest;
}

/** Upserts events; retries without recurrence columns when the DB schema is not migrated yet. */
async function upsertEventRows(rows: EventRow[]): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabase.from("events").upsert(rows, { onConflict: "id" });
  if (!error) return;

  if (isMissingRecurrenceColumnsError(error)) {
    const legacyRows = rows.map(stripEventRecurrenceColumns);
    const { error: retryError } = await supabase
      .from("events")
      .upsert(legacyRows, { onConflict: "id" });
    throwOnSupabaseError(retryError, "events");
    return;
  }

  throwOnSupabaseError(error, "events");
}

function asRows<T>(data: unknown[] | null): T[] {
  return (data ?? []) as T[];
}

function buildInList(ids: string[]): string {
  return `(${ids.join(",")})`;
}

async function upsertRows(
  table: AppTable,
  rows:
    | SkillRow[]
    | SessionRow[]
    | OverrideRow[]
    | EventRow[]
    | PersonRow[]
    | JobApplicationRow[]
    | CareerTargetRow[]
    | WorkoutPlanRow[]
    | WorkoutSessionRow[]
    | FocusFeedbackRow[]
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  throwOnSupabaseError(error, table);
}

async function deleteRowsNotIn(table: AppTable, userId: string, keepIds: string[]): Promise<void> {
  let query = supabase.from(table).delete().eq("user_id", userId);

  if (keepIds.length > 0) {
    query = query.not("id", "in", buildInList(keepIds));
  }

  const { error } = await query;
  throwOnSupabaseError(error, table);
}

// calendar_preferences is a user_id-keyed singleton (no id column): upsert the
// single row when present, otherwise delete the user's row.
async function replaceCalendarPreferences(
  userId: string,
  row: CalendarPreferencesRow | null
): Promise<void> {
  if (row) {
    const { error } = await supabase
      .from("calendar_preferences")
      .upsert(row, { onConflict: "user_id" });
    throwOnSupabaseError(error, "calendar_preferences");
    return;
  }

  const { error } = await supabase
    .from("calendar_preferences")
    .delete()
    .eq("user_id", userId);
  throwOnSupabaseError(error, "calendar_preferences");
}

// gamification_state is a user_id-keyed singleton (no id column): upsert the
// single row when present, otherwise delete the user's row.
async function replaceGamificationState(
  userId: string,
  row: GamificationStateRow | null
): Promise<void> {
  if (row) {
    const { error } = await supabase
      .from("gamification_state")
      .upsert(row, { onConflict: "user_id" });
    throwOnSupabaseError(error, "gamification_state");
    return;
  }

  const { error } = await supabase
    .from("gamification_state")
    .delete()
    .eq("user_id", userId);
  throwOnSupabaseError(error, "gamification_state");
}

export async function fetchRemotePayload(userId: string): Promise<AppPayload> {
  assertUserId(userId);

  const [skillsResult, sessionsResult, overridesResult, eventsResult, peopleResult, jobApplicationsResult, careerTargetsResult, workoutPlansResult, workoutSessionsResult, focusFeedbackResult, calendarPreferencesResult, gamificationStateResult] =
    await Promise.all([
    supabase.from("skills").select("*").eq("user_id", userId),
    supabase.from("sessions").select("*").eq("user_id", userId),
    supabase.from("overrides").select("*").eq("user_id", userId),
    supabase.from("events").select("*").eq("user_id", userId),
    supabase.from("people").select("*").eq("user_id", userId),
    supabase.from("job_applications").select("*").eq("user_id", userId),
    supabase.from("career_targets").select("*").eq("user_id", userId),
    supabase.from("workout_plans").select("*").eq("user_id", userId),
    supabase.from("workout_sessions").select("*").eq("user_id", userId),
    supabase.from("focus_feedback").select("*").eq("user_id", userId),
    supabase.from("calendar_preferences").select("*").eq("user_id", userId),
    supabase.from("gamification_state").select("*").eq("user_id", userId),
  ]);

  throwOnSupabaseError(skillsResult.error, "skills");
  throwOnSupabaseError(sessionsResult.error, "sessions");
  throwOnSupabaseError(overridesResult.error, "overrides");
  throwOnSupabaseError(eventsResult.error, "events");
  throwOnSupabaseError(peopleResult.error, "people");
  throwOnSupabaseError(jobApplicationsResult.error, "job_applications");
  throwOnSupabaseError(careerTargetsResult.error, "career_targets");
  throwOnSupabaseError(workoutPlansResult.error, "workout_plans");
  throwOnSupabaseError(workoutSessionsResult.error, "workout_sessions");
  throwOnSupabaseError(focusFeedbackResult.error, "focus_feedback");
  throwOnSupabaseError(calendarPreferencesResult.error, "calendar_preferences");
  throwOnSupabaseError(gamificationStateResult.error, "gamification_state");

  try {
    return payloadFromRows(
      asRows<SkillRow>(skillsResult.data),
      asRows<SessionRow>(sessionsResult.data),
      asRows<OverrideRow>(overridesResult.data),
      asRows<EventRow>(eventsResult.data),
      asRows<PersonRow>(peopleResult.data),
      asRows<JobApplicationRow>(jobApplicationsResult.data),
      asRows<CareerTargetRow>(careerTargetsResult.data),
      asRows<WorkoutPlanRow>(workoutPlansResult.data),
      asRows<WorkoutSessionRow>(workoutSessionsResult.data),
      asRows<FocusFeedbackRow>(focusFeedbackResult.data),
      asRows<CalendarPreferencesRow>(calendarPreferencesResult.data),
      asRows<GamificationStateRow>(gamificationStateResult.data)
    );
  } catch (err) {
    throw toRemoteStorageError(err, "skills");
  }
}

export async function replaceRemotePayload(userId: string, payload: AppPayload): Promise<void> {
  assertUserId(userId);

  try {
    validatePayloadForUpload(payload);
  } catch (err) {
    throw toRemoteStorageError(err, "skills");
  }

  const skillRows = payload.skills.map((skill) => skillToRow(skill, userId));
  const sessionRows = payload.sessions.map((session) => sessionToRow(session, userId));
  const overrideRows = payload.overrides.map((item) => overrideToRow(item, userId));
  const peopleRows = payload.people.map((person) => personToRow(person, userId));
  const eventRows = payload.events.map((event) => eventToRow(event, userId));
  const jobApplicationRows = payload.jobApplications.map((app) =>
    jobApplicationToRow(app, userId)
  );
  const careerTargetRows = payload.careerTarget
    ? [careerTargetToRow(payload.careerTarget, userId)]
    : [];
  const workoutPlanRows = payload.workoutPlans.map((plan) =>
    workoutPlanToRow(plan, userId)
  );
  const workoutSessionRows = payload.workoutSessions.map((session) =>
    workoutSessionToRow(session, userId)
  );
  const focusFeedbackRows = payload.focusFeedback.map((entry) =>
    focusFeedbackToRow(entry, userId)
  );
  const calendarPreferencesRow = payload.calendarPreferences
    ? calendarPreferencesToRow(payload.calendarPreferences, userId)
    : null;
  const gamificationStateRow = payload.gamificationState
    ? gamificationStateToRow(payload.gamificationState, userId)
    : null;

  await upsertRows("skills", skillRows);
  await upsertRows("sessions", sessionRows);
  await upsertRows("overrides", overrideRows);
  await upsertRows("people", peopleRows);
  await upsertEventRows(eventRows);
  await upsertRows("job_applications", jobApplicationRows);
  await upsertRows("career_targets", careerTargetRows);
  await upsertRows("workout_plans", workoutPlanRows);
  await upsertRows("workout_sessions", workoutSessionRows);
  await upsertRows("focus_feedback", focusFeedbackRows);

  const sessionIds = payload.sessions.map((s) => s.id);
  const skillIds = payload.skills.map((s) => s.id);
  const overrideIds = overrideRows.map((r) => r.id);
  const eventIds = payload.events.map((e) => e.id);
  const peopleIds = payload.people.map((p) => p.id);
  const jobApplicationIds = payload.jobApplications.map((a) => a.id);
  const careerTargetIds = payload.careerTarget ? [payload.careerTarget.id] : [];
  const workoutPlanIds = payload.workoutPlans.map((p) => p.id);
  const workoutSessionIds = payload.workoutSessions.map((s) => s.id);
  const focusFeedbackIds = payload.focusFeedback.map((f) => f.id);

  await deleteRowsNotIn("sessions", userId, sessionIds);
  await deleteRowsNotIn("skills", userId, skillIds);
  await deleteRowsNotIn("overrides", userId, overrideIds);
  await deleteRowsNotIn("events", userId, eventIds);
  await deleteRowsNotIn("people", userId, peopleIds);
  await deleteRowsNotIn("job_applications", userId, jobApplicationIds);
  await deleteRowsNotIn("career_targets", userId, careerTargetIds);
  await deleteRowsNotIn("workout_plans", userId, workoutPlanIds);
  await deleteRowsNotIn("workout_sessions", userId, workoutSessionIds);
  await deleteRowsNotIn("focus_feedback", userId, focusFeedbackIds);

  await replaceCalendarPreferences(userId, calendarPreferencesRow);
  await replaceGamificationState(userId, gamificationStateRow);
}

export function payloadHasData(payload: AppPayload): boolean {
  return (
    payload.skills.length > 0 ||
    payload.sessions.length > 0 ||
    payload.overrides.length > 0 ||
    payload.events.length > 0 ||
    payload.people.length > 0 ||
    payload.jobApplications.length > 0 ||
    payload.careerTarget !== undefined ||
    payload.workoutPlans.length > 0 ||
    payload.workoutSessions.length > 0 ||
    payload.focusFeedback.length > 0 ||
    payload.calendarPreferences !== undefined ||
    payload.gamificationState !== undefined
  );
}

/**
 * Initial sync: remote wins when populated; otherwise upload local if non-empty;
 * otherwise empty default. Always persists to user-scoped localStorage.
 */
export async function initialSync(
  userId: string,
  localLoader: () => AppData
): Promise<AppData> {
  assertUserId(userId);

  if (!isRemoteSyncEnabled()) {
    return saveAppData(localLoader(), userId);
  }

  const remote = await fetchRemotePayload(userId);
  if (payloadHasData(remote)) {
    return saveAppData(
      { version: 1, updatedAtIso: nowIso(), payload: remote },
      userId
    );
  }

  const local = localLoader();
  if (payloadHasData(local.payload)) {
    await replaceRemotePayload(userId, local.payload);
    return saveAppData(local, userId);
  }

  return saveAppData(
    { version: 1, updatedAtIso: nowIso(), payload: defaultPayload() },
    userId
  );
}
