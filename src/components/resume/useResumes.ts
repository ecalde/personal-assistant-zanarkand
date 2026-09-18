import { useCallback, useEffect, useState } from "react";
import {
  resumeNameFromFilename,
  validateResumeDocxBytes,
  validateResumeFileMetadata,
} from "../../core/resume/resumeFileValidation";
import {
  applyDefaultResumeSelection,
  removeResumeById,
  renameResumeInList,
  normalizeResumeName,
  validateResumeName,
} from "../../core/resume/resumeLibrary";
import { resumeSafeMessage, resumeZipUserMessage } from "../../core/resume/resumeErrors";
import type { Resume } from "../../core/resume/resumeModel";
import {
  deleteResume,
  duplicateResume,
  insertResumeWithOriginal,
  listResumes,
  renameResume,
  saveResumeAsNew,
  setDefaultResume,
} from "../../lib/resumeRemote";

export type UseResumesResult = {
  resumes: Resume[];
  loading: boolean;
  uploading: boolean;
  /** Resume id currently being renamed / set-default / deleted, or null. */
  mutatingId: string | null;
  error: string | null;
  uploadResume: (file: File) => Promise<void>;
  renameResume: (resumeId: string, name: string) => Promise<void>;
  setDefaultResume: (resumeId: string) => Promise<void>;
  deleteResume: (resumeId: string) => Promise<void>;
  duplicateResume: (resumeId: string) => Promise<void>;
  saveAsNewResume: (
    sourceResumeId: string,
    bytes: Uint8Array,
    jobTitle?: string
  ) => Promise<boolean>;
  refresh: () => void;
};

/**
 * Resume library fetch/upload, isolated from AppPayload and `replaceRemotePayload`
 * (architecture §33). Rows load only while the Resume pane is open.
 */
export function useResumes(userId: string, options: { enabled: boolean }): UseResumesResult {
  const { enabled } = options;
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const rows = await listResumes(userId);
        if (cancelled) return;
        setResumes(rows);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(safeMessage(err, "Could not load resumes."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, userId, reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const uploadResume = useCallback(
    async (file: File) => {
      const metadataError = validateResumeFileMetadata({
        name: file.name,
        size: file.size,
        type: file.type,
      });
      if (metadataError) {
        setError(resumeZipUserMessage(metadataError));
        return;
      }

      setUploading(true);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const packageError = await validateResumeDocxBytes(bytes);
        if (packageError) {
          setError(resumeZipUserMessage(packageError));
          return;
        }

        await insertResumeWithOriginal({
          userId,
          name: resumeNameFromFilename(file.name),
          sourceFilename: file.name,
          bytes,
        });
        setError(null);
        setReloadToken((token) => token + 1);
      } catch (err) {
        setError(safeMessage(err, "Could not save resume."));
      } finally {
        setUploading(false);
      }
    },
    [userId]
  );

  const renameResumeById = useCallback(
    async (resumeId: string, name: string) => {
      const validationError = validateResumeName(name);
      if (validationError) {
        setError(validationError);
        return;
      }
      const normalized = normalizeResumeName(name);
      setMutatingId(resumeId);
      try {
        await renameResume(userId, resumeId, normalized);
        setResumes((current) => renameResumeInList(current, resumeId, normalized));
        setError(null);
      } catch (err) {
        setError(safeMessage(err, "Could not rename resume."));
        setReloadToken((token) => token + 1);
      } finally {
        setMutatingId(null);
      }
    },
    [userId]
  );

  const setDefaultResumeById = useCallback(
    async (resumeId: string) => {
      setMutatingId(resumeId);
      try {
        await setDefaultResume(userId, resumeId);
        setResumes((current) => applyDefaultResumeSelection(current, resumeId));
        setError(null);
      } catch (err) {
        setError(safeMessage(err, "Could not update default resume."));
        setReloadToken((token) => token + 1);
      } finally {
        setMutatingId(null);
      }
    },
    [userId]
  );

  const deleteResumeById = useCallback(
    async (resumeId: string) => {
      setMutatingId(resumeId);
      try {
        await deleteResume(userId, resumeId);
        setResumes((current) => removeResumeById(current, resumeId));
        setError(null);
      } catch (err) {
        setError(safeMessage(err, "Could not delete resume."));
        setReloadToken((token) => token + 1);
      } finally {
        setMutatingId(null);
      }
    },
    [userId]
  );

  const duplicateResumeById = useCallback(
    async (resumeId: string) => {
      setMutatingId(resumeId);
      try {
        await duplicateResume(userId, resumeId);
        // The copy is a new row; refresh to load it (and its server-side timestamps).
        setError(null);
        setReloadToken((token) => token + 1);
      } catch (err) {
        setError(safeMessage(err, "Could not duplicate resume."));
        setReloadToken((token) => token + 1);
      } finally {
        setMutatingId(null);
      }
    },
    [userId]
  );

  const saveAsNewResumeById = useCallback(
    async (sourceResumeId: string, bytes: Uint8Array, jobTitle?: string) => {
      setMutatingId(sourceResumeId);
      try {
        await saveResumeAsNew({
          userId,
          sourceResumeId,
          bytes,
          jobTitle,
        });
        setError(null);
        setReloadToken((token) => token + 1);
        return true;
      } catch (err) {
        setError(safeMessage(err, "Could not save as a new resume."));
        setReloadToken((token) => token + 1);
        return false;
      } finally {
        setMutatingId(null);
      }
    },
    [userId]
  );

  return {
    resumes,
    loading,
    uploading,
    mutatingId,
    error,
    uploadResume,
    renameResume: renameResumeById,
    setDefaultResume: setDefaultResumeById,
    deleteResume: deleteResumeById,
    duplicateResume: duplicateResumeById,
    saveAsNewResume: saveAsNewResumeById,
    refresh,
  };
}

/** Never surface resume/JD text or mapper/Supabase payloads. */
function safeMessage(err: unknown, fallback: string): string {
  return resumeSafeMessage(err, fallback);
}
