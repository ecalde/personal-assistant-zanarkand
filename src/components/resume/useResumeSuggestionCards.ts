import { useCallback, useEffect, useRef, useState } from "react";
import {
  classifyResumeAiConnectionError,
  resumeAiConnectionCopy,
} from "../../core/resume/resumeAiConnection";
import {
  isLoopbackOllamaBaseUrl,
  loadResumeAiPreferences,
} from "../../core/resume/resumeAiPreferences";
import type {
  ResumeFactLedger,
  ResumeJobSession,
  ResumeStructureGraph,
  ResumeSuggestionRecord,
} from "../../core/resume/resumeModel";
import {
  eligibleBlocksForSuggestionCards,
  buildSuggestionCardViews,
} from "../../core/resume/resumeSuggestionCards";
import {
  createOllamaResumeLLM,
  generateBlockSuggestion,
} from "../../core/resume/resumeSuggestions";
import { isOllamaClientError } from "../../lib/ollamaClient";
import {
  insertResumeSuggestion,
  listResumeSuggestions,
} from "../../lib/resumeRemote";

const REWRITE_TIMEOUT_MS = 120_000;

export type UseResumeSuggestionCardsArgs = {
  userId: string;
  resumeId: string;
  resumeVersionId: string | null;
  session: ResumeJobSession | null;
  importFactLedger: ResumeFactLedger;
  workingGraph: ResumeStructureGraph | null;
  enabled: boolean;
};

export type UseResumeSuggestionCardsResult = {
  cards: ReturnType<typeof buildSuggestionCardViews>;
  generating: boolean;
  generateProgress: { current: number; total: number } | null;
  generateError: string | null;
  generateDisabledReason: string | null;
  canGenerate: boolean;
  generate: () => Promise<void>;
  cancelGenerate: () => void;
};

function factBlocksFromGraph(graph: ResumeStructureGraph | null) {
  if (!graph) return [];
  const out: { blockId: string; text: string }[] = [];
  for (const block of graph.blocks) {
    if (!block.blockId) continue;
    out.push({ blockId: block.blockId, text: block.text });
  }
  return out;
}

function generateDisabledReason(session: ResumeJobSession | null): string | null {
  if (!session?.parsedJob) {
    return "Analyze a job description before generating suggestions.";
  }
  const prefs = loadResumeAiPreferences();
  if (!isLoopbackOllamaBaseUrl(prefs.baseUrl)) {
    return "Resume AI must use loopback Ollama (http://127.0.0.1:11434). Open Settings → Resume AI.";
  }
  if (!prefs.modelName.trim()) {
    return "Choose a model in Settings → Resume AI after Test connection succeeds. Coverage still works without rewriting.";
  }
  return null;
}

/**
 * Load and generate suggestion cards for the active JD session (Phase 7A).
 * Sequential one-block generation; persist only grounded rows. No accept/apply.
 */
export function useResumeSuggestionCards(
  args: UseResumeSuggestionCardsArgs
): UseResumeSuggestionCardsResult {
  const {
    userId,
    resumeId,
    resumeVersionId,
    session,
    importFactLedger,
    workingGraph,
    enabled,
  } = args;

  const [records, setRecords] = useState<ResumeSuggestionRecord[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const recordsRef = useRef<ResumeSuggestionRecord[]>([]);
  const sessionId = session?.id ?? null;
  recordsRef.current = records;

  useEffect(() => {
    if (!enabled || !sessionId) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listResumeSuggestions(userId, sessionId);
        if (!cancelled) setRecords(rows);
      } catch {
        if (!cancelled) {
          setRecords([]);
          setGenerateError("Could not load suggestions.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, sessionId]);

  const disabledReason = generateDisabledReason(session);

  const cancelGenerate = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const generate = useCallback(async () => {
    if (!session || !resumeVersionId) return;
    const reason = generateDisabledReason(session);
    if (reason) {
      setGenerateError(reason);
      return;
    }
    const prefs = loadResumeAiPreferences();
    const blocks = factBlocksFromGraph(workingGraph);
    const alreadyPending = new Set(
      recordsRef.current
        .filter((row) => row.status === "pending")
        .map((row) => row.sourceBlockId)
    );
    const eligible = eligibleBlocksForSuggestionCards(blocks).filter(
      (block) => !alreadyPending.has(block.blockId)
    );
    if (eligible.length === 0) {
      setGenerateError(
        alreadyPending.size > 0
          ? "Suggestions are already listed for the rewriteable paragraphs."
          : "No rewriteable resume paragraphs were found."
      );
      return;
    }

    cancelRef.current = false;
    setGenerating(true);
    setGenerateError(null);
    setGenerateProgress({ current: 0, total: eligible.length });

    const llm = createOllamaResumeLLM({
      model: prefs.modelName,
      baseUrl: prefs.baseUrl,
      timeoutMs: REWRITE_TIMEOUT_MS,
    });

    try {
      let grounded = 0;
      for (let index = 0; index < eligible.length; index += 1) {
        if (cancelRef.current) break;
        const block = eligible[index];
        setGenerateProgress({ current: index + 1, total: eligible.length });
        const result = await generateBlockSuggestion({
          blockId: block.blockId,
          originalText: block.text,
          blocks,
          ledger: importFactLedger,
          session,
          llm,
          model: prefs.modelName,
        });
        if (!result.ok) {
          if (result.code === "llm_error") {
            setGenerateError(
              "Could not reach Ollama. Open Settings → Resume AI and use Test connection."
            );
            break;
          }
          continue;
        }
        const record = await insertResumeSuggestion({
          userId,
          sessionId: session.id,
          resumeId,
          resumeVersionId,
          suggestion: result.suggestion,
        });
        grounded += 1;
        setRecords((current) => [...current, record]);
      }
      if (!cancelRef.current && grounded === 0) {
        setGenerateError((current) => current ?? "No grounded suggestions were produced.");
      }
    } catch (error) {
      if (isOllamaClientError(error)) {
        setGenerateError(resumeAiConnectionCopy(classifyResumeAiConnectionError(error)).headline);
      } else {
        setGenerateError("Could not generate suggestions.");
      }
    } finally {
      setGenerating(false);
      setGenerateProgress(null);
    }
  }, [session, resumeVersionId, workingGraph, importFactLedger, userId, resumeId]);

  return {
    cards: buildSuggestionCardViews(records),
    generating,
    generateProgress,
    generateError,
    generateDisabledReason: disabledReason,
    canGenerate: Boolean(enabled && session && resumeVersionId && !disabledReason && !generating),
    generate,
    cancelGenerate,
  };
}
