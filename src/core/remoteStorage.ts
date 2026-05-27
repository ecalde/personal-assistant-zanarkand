// Remote persistence via Supabase (authenticated client + RLS).

import { supabase } from "../lib/supabaseClient";
import type { AppPayload } from "./model";
import { defaultPayload } from "./state";
import { nowIso, saveAppData, type AppData } from "./storage";
import {
  MapperError,
  isUuid,
  overrideToRow,
  payloadFromRows,
  sessionToRow,
  skillToRow,
  validatePayloadForUpload,
  type OverrideRow,
  type SessionRow,
  type SkillRow,
} from "./dbMappers";

type AppTable = "skills" | "sessions" | "overrides";

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
    const code = typeof (err as { code: unknown }).code === "string" ? (err as { code: string }).code : undefined;
    return new RemoteStorageError(`Could not sync ${table}. Please try again.`, {
      code,
      table,
    });
  }
  return new RemoteStorageError(`Could not sync ${table}. Please try again.`, { table });
}

function throwOnSupabaseError(
  error: { code?: string; message?: string } | null,
  table: AppTable
): void {
  if (!error) return;
  throw new RemoteStorageError(`Could not sync ${table}. Please try again.`, {
    code: error.code,
    table,
  });
}

function asRows<T>(data: unknown[] | null): T[] {
  return (data ?? []) as T[];
}

function buildInList(ids: string[]): string {
  return `(${ids.join(",")})`;
}

async function upsertRows(table: AppTable, rows: SkillRow[] | SessionRow[] | OverrideRow[]): Promise<void> {
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

export async function fetchRemotePayload(userId: string): Promise<AppPayload> {
  assertUserId(userId);

  const [skillsResult, sessionsResult, overridesResult] = await Promise.all([
    supabase.from("skills").select("*").eq("user_id", userId),
    supabase.from("sessions").select("*").eq("user_id", userId),
    supabase.from("overrides").select("*").eq("user_id", userId),
  ]);

  throwOnSupabaseError(skillsResult.error, "skills");
  throwOnSupabaseError(sessionsResult.error, "sessions");
  throwOnSupabaseError(overridesResult.error, "overrides");

  try {
    return payloadFromRows(
      asRows<SkillRow>(skillsResult.data),
      asRows<SessionRow>(sessionsResult.data),
      asRows<OverrideRow>(overridesResult.data)
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

  await upsertRows("skills", skillRows);
  await upsertRows("sessions", sessionRows);
  await upsertRows("overrides", overrideRows);

  const sessionIds = payload.sessions.map((s) => s.id);
  const skillIds = payload.skills.map((s) => s.id);
  const overrideIds = overrideRows.map((r) => r.id);

  await deleteRowsNotIn("sessions", userId, sessionIds);
  await deleteRowsNotIn("skills", userId, skillIds);
  await deleteRowsNotIn("overrides", userId, overrideIds);
}

export function payloadHasData(payload: AppPayload): boolean {
  return (
    payload.skills.length > 0 ||
    payload.sessions.length > 0 ||
    payload.overrides.length > 0
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
