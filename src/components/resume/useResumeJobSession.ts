import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeJobSession } from "../../core/resume/resumeModel";
import {
  emptyReplacedJobSessionFields,
  jobAnalysisClearPatch,
  shouldDropStoredJobAnalysis,
} from "../../core/resume/resumeInvalidation";
import {
  EMPTY_JOB_SESSION_DRAFT,
  RESUME_JD_AUTOSAVE_DEBOUNCE_MS,
  draftFromJobSession,
  jobSessionTooLongMessage,
  jobSessionWriteFields,
  planJobSessionPersist,
  planJobSessionReplace,
  planJobSessionReset,
  type JobSessionDraft,
} from "../../core/resume/resumeJobSessionPersist";
import {
  archiveResumeJobSession,
  getActiveResumeJobSession,
  insertResumeJobSession,
  ResumeRemoteError,
  updateResumeJobSession,
} from "../../lib/resumeRemote";

export type ResumeJobSessionStatus = "idle" | "loading" | "saving" | "saved" | "error";

export type UseResumeJobSessionArgs = {
  userId: string;
  resumeId: string | undefined;
  resumeVersionId: string | undefined;
  enabled: boolean;
};

export type PersistJobSessionResult = {
  ok: boolean;
  session: ResumeJobSession | null;
};

export type UseResumeJobSessionResult = {
  draft: JobSessionDraft;
  setDraft: (next: JobSessionDraft) => void;
  status: ResumeJobSessionStatus;
  error: string | null;
  session: ResumeJobSession | null;
  hasActiveSession: boolean;
  persistNow: () => Promise<PersistJobSessionResult>;
  persistAnalysis: (
    parsedJob: ResumeJobSession["parsedJob"],
    matchResult: ResumeJobSession["matchResult"]
  ) => Promise<boolean>;
  resetSession: () => Promise<void>;
  replaceSession: () => Promise<void>;
  retry: () => void;
};

type BoundIdentity = {
  userId: string;
  resumeId: string | undefined;
  resumeVersionId: string | undefined;
  enabled: boolean;
};

/**
 * Load / debounce-save the active JD session for one resume (Phase 5B/5F).
 * Isolated from AppPayload / `replaceRemotePayload`. Debounced saves stay
 * company / title / raw text and drop stale analysis when those fields change.
 * Analyze (5E) writes `parsed_job` / `match_result`. Replace archives and
 * inserts an empty session with null analysis. Document bytes are never written.
 */
export function useResumeJobSession(args: UseResumeJobSessionArgs): UseResumeJobSessionResult {
  const { userId, resumeId, resumeVersionId, enabled } = args;

  const [draft, setDraftState] = useState<JobSessionDraft>(EMPTY_JOB_SESSION_DRAFT);
  const [status, setStatus] = useState<ResumeJobSessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ResumeJobSession | null>(null);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const lastPersistedRef = useRef<JobSessionDraft | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<PersistJobSessionResult> | null>(null);
  const skipDebounceRef = useRef(true);
  const boundRef = useRef<BoundIdentity>({ userId, resumeId, resumeVersionId, enabled });

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persistNow = useCallback(async (): Promise<PersistJobSessionResult> => {
    const bound = boundRef.current;
    if (!bound.enabled || !bound.resumeId || !bound.resumeVersionId) {
      return { ok: false, session: sessionRef.current };
    }

    const rid = bound.resumeId;
    const uid = bound.userId;
    const vid = bound.resumeVersionId;
    const current = draftRef.current;
    const plan = planJobSessionPersist({
      draft: current,
      lastPersisted: lastPersistedRef.current,
      activeSessionId: sessionRef.current?.id ?? null,
    });
    if (plan.action === "skip") return { ok: true, session: sessionRef.current };
    if (plan.action === "too_long") {
      setStatus("error");
      setError(jobSessionTooLongMessage());
      return { ok: false, session: sessionRef.current };
    }

    const run = (async (): Promise<PersistJobSessionResult> => {
      setStatus("saving");
      setError(null);
      try {
        const fields = jobSessionWriteFields(plan.draft);
        let next: ResumeJobSession;
        if (plan.action === "insert") {
          try {
            next = await insertResumeJobSession({
              userId: uid,
              resumeId: rid,
              resumeVersionId: vid,
              ...fields,
            });
          } catch (err) {
            if (err instanceof ResumeRemoteError && err.code === "23505") {
              const existing = await getActiveResumeJobSession(uid, rid);
              if (!existing) throw err;
              next = await updateResumeJobSession(uid, existing.id, {
                ...fields,
                ...(shouldDropStoredJobAnalysis(existing, plan.draft)
                  ? jobAnalysisClearPatch()
                  : {}),
              });
            } else {
              throw err;
            }
          }
        } else {
          const dropAnalysis = shouldDropStoredJobAnalysis(sessionRef.current, plan.draft);
          next = await updateResumeJobSession(uid, plan.sessionId, {
            ...fields,
            ...(dropAnalysis ? jobAnalysisClearPatch() : {}),
          });
        }
        if (boundRef.current.resumeId !== rid) return { ok: true, session: next };
        sessionRef.current = next;
        setSession(next);
        lastPersistedRef.current = draftFromJobSession(next);
        setStatus("saved");
        return { ok: true, session: next };
      } catch (err) {
        if (boundRef.current.resumeId !== rid) {
          return { ok: false, session: sessionRef.current };
        }
        setStatus("error");
        setError(safeMessage(err, "Could not save job description."));
        return { ok: false, session: sessionRef.current };
      }
    })();

    inFlightRef.current = run;
    try {
      return await run;
    } finally {
      if (inFlightRef.current === run) inFlightRef.current = null;
    }
  }, []);

  const persistAnalysis = useCallback(
    async (
      parsedJob: ResumeJobSession["parsedJob"],
      matchResult: ResumeJobSession["matchResult"]
    ): Promise<boolean> => {
      const bound = boundRef.current;
      const current = sessionRef.current;
      if (!bound.enabled || !current) return false;
      setStatus("saving");
      setError(null);
      try {
        const next = await updateResumeJobSession(bound.userId, current.id, {
          parsedJob,
          matchResult,
        });
        if (boundRef.current.resumeId !== bound.resumeId) return true;
        sessionRef.current = next;
        setSession(next);
        setStatus("saved");
        return true;
      } catch (err) {
        if (boundRef.current.resumeId !== bound.resumeId) return false;
        setStatus("error");
        setError(safeMessage(err, "Could not save coverage."));
        return false;
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      clearTimer();
      const pending = planJobSessionPersist({
        draft: draftRef.current,
        lastPersisted: lastPersistedRef.current,
        activeSessionId: sessionRef.current?.id ?? null,
      });
      if (pending.action === "insert" || pending.action === "update") {
        void persistNow();
      }
    };
  }, [enabled, userId, resumeId, clearTimer, persistNow]);

  useEffect(() => {
    boundRef.current = { userId, resumeId, resumeVersionId, enabled };

    if (!enabled || !resumeId) {
      skipDebounceRef.current = true;
      clearTimer();
      setDraftState(EMPTY_JOB_SESSION_DRAFT);
      setSession(null);
      sessionRef.current = null;
      lastPersistedRef.current = null;
      setStatus("idle");
      setError(null);
      return;
    }

    let cancelled = false;
    skipDebounceRef.current = true;
    clearTimer();
    setStatus("loading");
    setError(null);
    setDraftState(EMPTY_JOB_SESSION_DRAFT);
    setSession(null);
    sessionRef.current = null;
    lastPersistedRef.current = null;

    void (async () => {
      try {
        const row = await getActiveResumeJobSession(userId, resumeId);
        if (cancelled) return;
        if (row) {
          const loaded = draftFromJobSession(row);
          setSession(row);
          sessionRef.current = row;
          setDraftState(loaded);
          lastPersistedRef.current = loaded;
        } else {
          setSession(null);
          sessionRef.current = null;
          setDraftState(EMPTY_JOB_SESSION_DRAFT);
          lastPersistedRef.current = null;
        }
        setStatus("idle");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(safeMessage(err, "Could not load job description."));
      }
    })();

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [enabled, userId, resumeId, resumeVersionId, clearTimer]);

  useEffect(() => {
    if (!enabled || !resumeId || !resumeVersionId) return;
    if (skipDebounceRef.current) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persistNow();
    }, RESUME_JD_AUTOSAVE_DEBOUNCE_MS);
    return () => {
      clearTimer();
    };
  }, [draft, enabled, resumeId, resumeVersionId, clearTimer, persistNow]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      const pending = planJobSessionPersist({
        draft: draftRef.current,
        lastPersisted: lastPersistedRef.current,
        activeSessionId: sessionRef.current?.id ?? null,
      });
      if (pending.action === "insert" || pending.action === "update" || status === "saving") {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [status]);

  const setDraft = useCallback((next: JobSessionDraft) => {
    skipDebounceRef.current = false;
    setDraftState(next);
  }, []);

  const resetSession = useCallback(async () => {
    clearTimer();
    const plan = planJobSessionReset(sessionRef.current?.id ?? null);
    if (plan.action === "archive") {
      setStatus("saving");
      setError(null);
      try {
        await archiveResumeJobSession(boundRef.current.userId, plan.sessionId);
      } catch (err) {
        setStatus("error");
        setError(safeMessage(err, "Could not reset job description."));
        return;
      }
    }
    sessionRef.current = null;
    lastPersistedRef.current = null;
    skipDebounceRef.current = true;
    setSession(null);
    setDraftState(EMPTY_JOB_SESSION_DRAFT);
    setStatus("idle");
    setError(null);
  }, [clearTimer]);

  const replaceSession = useCallback(async () => {
    clearTimer();
    const bound = boundRef.current;
    const plan = planJobSessionReplace(sessionRef.current?.id ?? null);
    if (plan.action === "noop" || !bound.resumeId || !bound.resumeVersionId) return;

    setStatus("saving");
    setError(null);
    try {
      await archiveResumeJobSession(bound.userId, plan.sessionId);
      const next = await insertResumeJobSession({
        userId: bound.userId,
        resumeId: bound.resumeId,
        resumeVersionId: bound.resumeVersionId,
        ...emptyReplacedJobSessionFields(),
      });
      if (boundRef.current.resumeId !== bound.resumeId) return;
      sessionRef.current = next;
      lastPersistedRef.current = draftFromJobSession(next);
      skipDebounceRef.current = true;
      setSession(next);
      setDraftState(EMPTY_JOB_SESSION_DRAFT);
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError(safeMessage(err, "Could not replace job description."));
    }
  }, [clearTimer]);

  const retry = useCallback(() => {
    void persistNow();
  }, [persistNow]);

  return {
    draft,
    setDraft,
    status,
    error,
    session,
    hasActiveSession: session !== null,
    persistNow,
    persistAnalysis,
    resetSession,
    replaceSession,
    retry,
  };
}

function safeMessage(err: unknown, fallback: string): string {
  return err instanceof ResumeRemoteError ? err.message : fallback;
}
