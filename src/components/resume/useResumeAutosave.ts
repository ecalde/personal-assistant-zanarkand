import { useCallback, useEffect, useRef, useState } from "react";
import {
  RESUME_AUTOSAVE_DEBOUNCE_MS,
  decideWorkingCopyUpload,
} from "../../core/resume/resumeAutosave";
import type { ResumeExtractedStructure, ResumeStructureGraph } from "../../core/resume/resumeModel";
import { resumeSafeMessage } from "../../core/resume/resumeErrors";
import { updateWorkingVersion } from "../../lib/resumeRemote";

export type ResumeAutosaveStatus = "idle" | "saving" | "saved" | "error";

export type ResumeAutosavePayload = {
  bytes: Uint8Array;
  graph: ResumeStructureGraph;
};

export type UseResumeAutosaveArgs = {
  userId: string | undefined;
  resumeId: string | undefined;
  versionId: string | undefined;
  workingStoragePath: string | null | undefined;
  resumeUpdatedAtIso: string | undefined;
  previousStructure: ResumeExtractedStructure | undefined;
  payload: ResumeAutosavePayload | null;
  localDirty: boolean;
};

export type UseResumeAutosaveResult = {
  status: ResumeAutosaveStatus;
  error: string | null;
  conflict: boolean;
  retry: () => void;
  saveNow: (override?: ResumeAutosavePayload | null) => Promise<boolean>;
};

type AutosaveIdentity = {
  userId: string | undefined;
  resumeId: string | undefined;
  versionId: string | undefined;
  workingStoragePath: string | null | undefined;
};

/**
 * Debounced working-copy upload after a successful fail-closed patch (Phase 4F).
 * Isolated from AppPayload / `replaceRemotePayload`.
 */
export function useResumeAutosave(args: UseResumeAutosaveArgs): UseResumeAutosaveResult {
  const {
    userId,
    resumeId,
    versionId,
    workingStoragePath,
    resumeUpdatedAtIso,
    previousStructure,
    payload,
    localDirty,
  } = args;

  const [status, setStatus] = useState<ResumeAutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const structureRef = useRef(previousStructure);
  const lastUploadedRef = useRef<Uint8Array | null>(null);
  const hydratedRef = useRef(false);
  const expectedUpdatedAtRef = useRef(resumeUpdatedAtIso);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const identityRef = useRef<AutosaveIdentity>({
    userId,
    resumeId,
    versionId,
    workingStoragePath,
  });
  identityRef.current = { userId, resumeId, versionId, workingStoragePath };

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const performSave = useCallback(
    async (
      override: ResumeAutosavePayload | null | undefined,
      updateUi: boolean,
      ids: AutosaveIdentity
    ): Promise<boolean> => {
      if (override) payloadRef.current = override;
      const next = payloadRef.current;
      const decision = decideWorkingCopyUpload({
        lastGoodBytes: next?.bytes ?? null,
        lastUploadedBytes: lastUploadedRef.current,
      });
      if (decision !== "upload" || !next) return true;

      const structure = structureRef.current;
      if (
        !ids.userId ||
        !ids.resumeId ||
        !ids.versionId ||
        !ids.workingStoragePath ||
        !structure
      ) {
        return true;
      }

      if (updateUi) {
        setStatus("saving");
        setError(null);
      }

      try {
        const result = await updateWorkingVersion({
          userId: ids.userId,
          resumeId: ids.resumeId,
          versionId: ids.versionId,
          workingStoragePath: ids.workingStoragePath,
          bytes: next.bytes,
          graph: next.graph,
          previousStructure: structure,
          expectedUpdatedAtIso: expectedUpdatedAtRef.current,
        });
        lastUploadedRef.current = next.bytes;
        expectedUpdatedAtRef.current = result.resumeUpdatedAtIso;
        structureRef.current = result.version.extractedStructure;
        if (updateUi) {
          setConflict(result.conflict);
          setStatus("saved");
          setError(null);
        }
        const leftover = payloadRef.current;
        if (
          leftover &&
          decideWorkingCopyUpload({
            lastGoodBytes: leftover.bytes,
            lastUploadedBytes: lastUploadedRef.current,
          }) === "upload"
        ) {
          return performSave(leftover, updateUi, ids);
        }
        return true;
      } catch (err) {
        if (updateUi) {
          setStatus("error");
          setError(resumeSafeMessage(err, "Could not save resume."));
        }
        return false;
      }
    },
    []
  );

  const saveNow = useCallback(
    async (override?: ResumeAutosavePayload | null): Promise<boolean> => {
      clearTimer();
      if (inFlightRef.current) {
        await inFlightRef.current.catch(() => false);
      }
      const run = performSave(override, true, identityRef.current);
      inFlightRef.current = run;
      try {
        return await run;
      } finally {
        if (inFlightRef.current === run) inFlightRef.current = null;
      }
    },
    [clearTimer, performSave]
  );

  useEffect(() => {
    hydratedRef.current = false;
    lastUploadedRef.current = null;
    expectedUpdatedAtRef.current = undefined;
    setStatus("idle");
    setError(null);
    setConflict(false);
    clearTimer();

    const ids = { userId, resumeId, versionId, workingStoragePath };
    return () => {
      clearTimer();
      const next = payloadRef.current;
      if (
        decideWorkingCopyUpload({
          lastGoodBytes: next?.bytes ?? null,
          lastUploadedBytes: lastUploadedRef.current,
        }) !== "upload"
      ) {
        return;
      }
      void performSave(next, false, ids);
    };
  }, [userId, resumeId, versionId, workingStoragePath, clearTimer, performSave]);

  useEffect(() => {
    if (hydratedRef.current) return;
    expectedUpdatedAtRef.current = resumeUpdatedAtIso;
    if (previousStructure) structureRef.current = previousStructure;
  }, [resumeUpdatedAtIso, previousStructure, userId, resumeId, versionId, workingStoragePath]);

  useEffect(() => {
    if (!payload) return;
    if (!hydratedRef.current) {
      lastUploadedRef.current = payload.bytes;
      hydratedRef.current = true;
      return;
    }
    if (
      decideWorkingCopyUpload({
        lastGoodBytes: payload.bytes,
        lastUploadedBytes: lastUploadedRef.current,
      }) !== "upload"
    ) {
      return;
    }
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void saveNow();
    }, RESUME_AUTOSAVE_DEBOUNCE_MS);
    return () => {
      clearTimer();
    };
  }, [payload, clearTimer, saveNow]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      const pending =
        decideWorkingCopyUpload({
          lastGoodBytes: payloadRef.current?.bytes ?? null,
          lastUploadedBytes: lastUploadedRef.current,
        }) === "upload";
      if (localDirty || pending || status === "saving" || status === "error") {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [localDirty, status]);

  const retry = useCallback(() => {
    void saveNow();
  }, [saveNow]);

  return { status, error, conflict, retry, saveNow };
}
