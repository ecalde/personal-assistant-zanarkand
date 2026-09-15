import { useEffect, useState } from "react";
import {
  checkBrowserFont,
  ensureCarlitoLoaded,
  evaluateFontPreflight,
  type FontPreflightResult,
} from "../../core/resume/resumeFonts";

/**
 * Load bundled Carlito, then check whether the document's fonts (typically
 * Calibri) are installed. Runs only in the browser; the checker is injected
 * into the pure evaluator so Vitest can cover the decision without `document`.
 */
export function useResumeFontPreflight(families: readonly string[]): FontPreflightResult | null {
  const key = families.join("\0");
  const [checkedKey, setCheckedKey] = useState("");
  const [result, setResult] = useState<FontPreflightResult | null>(null);

  useEffect(() => {
    if (key.length === 0) return;

    const requested = key.split("\0");
    let cancelled = false;
    void (async () => {
      await ensureCarlitoLoaded();
      if (cancelled) return;
      setCheckedKey(key);
      setResult(evaluateFontPreflight(requested, checkBrowserFont));
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);

  if (key.length === 0) return null;
  if (checkedKey !== key) return null;
  return result;
}
