import { useEffect, useMemo, useState } from "react";
import { versionOnePlaintextByBlockId } from "../../core/resume/resumeDiff";
import type { ResumeBlockMapEntry } from "../../core/resume/resumeModel";
import { listParagraphPlaintexts } from "../../core/resume/resumeOoxmlRead";
import { resumeSafeMessage } from "../../core/resume/resumeErrors";
import { downloadResumeOriginalDocx } from "../../lib/resumeRemote";

export type UseResumeVersionOneBaselineResult = {
  baseByBlockId: Readonly<Record<string, string>> | null;
  loading: boolean;
  error: string | null;
};

/**
 * Load version-1 plaintext from the immutable original object (Phase 9C).
 * Uses the frozen ingest block map. Does not parse the working copy as baseline.
 */
export function useResumeVersionOneBaseline(args: {
  userId: string;
  resumeId: string;
  originalStoragePath: string | null | undefined;
  blockMap: readonly ResumeBlockMapEntry[] | undefined;
  enabled: boolean;
}): UseResumeVersionOneBaselineResult {
  const { userId, resumeId, originalStoragePath, blockMap, enabled } = args;
  const blockMapKey = useMemo(
    () => (blockMap ?? []).map((entry) => `${entry.order}:${entry.blockId}`).join("|"),
    [blockMap]
  );

  const [baseByBlockId, setBaseByBlockId] = useState<Readonly<Record<string, string>> | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !originalStoragePath || !blockMap || blockMap.length === 0) {
      setBaseByBlockId(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const bytes = await downloadResumeOriginalDocx(userId, resumeId, originalStoragePath);
        if (cancelled) return;
        const paragraphs = await listParagraphPlaintexts(bytes);
        const map = versionOnePlaintextByBlockId(paragraphs, blockMap);
        if (cancelled) return;
        setBaseByBlockId(map);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setBaseByBlockId(null);
        setError(safeMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, userId, resumeId, originalStoragePath, blockMap, blockMapKey]);

  return { baseByBlockId, loading, error };
}

function safeMessage(err: unknown): string {
  return resumeSafeMessage(err, "Could not compare this resume to version 1.");
}
