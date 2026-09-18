import { useEffect, useState } from "react";
import type { Resume, ResumeVersion } from "../../core/resume/resumeModel";
import { resumeSafeMessage } from "../../core/resume/resumeErrors";
import { getResumeVersionById } from "../../lib/resumeRemote";

export type UseResumeVersionResult = {
  version: ResumeVersion | null;
  loading: boolean;
  error: string | null;
};

/**
 * Fetch the active version (with its `extracted_structure`) for one resume so
 * the document pane can render a read-only preview (Phase 4A). Isolated from
 * AppPayload / `replaceRemotePayload`; only runs while a resume is open.
 */
export function useResumeVersion(
  userId: string,
  resume: Resume | null,
  options: { enabled: boolean }
): UseResumeVersionResult {
  const { enabled } = options;
  const resumeId = resume?.id ?? null;
  const activeVersionId = resume?.activeVersionId ?? null;

  const [version, setVersion] = useState<ResumeVersion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !resumeId || !activeVersionId) {
      setVersion(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setVersion(null);
    setError(null);

    void (async () => {
      try {
        const row = await getResumeVersionById(userId, resumeId, activeVersionId);
        if (cancelled) return;
        setVersion(row);
        setError(row ? null : "This resume's preview could not be found.");
      } catch (err) {
        if (!cancelled) {
          setError(safeMessage(err, "Could not load resume preview."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, userId, resumeId, activeVersionId]);

  return { version, loading, error };
}

function safeMessage(err: unknown, fallback: string): string {
  return resumeSafeMessage(err, fallback);
}
