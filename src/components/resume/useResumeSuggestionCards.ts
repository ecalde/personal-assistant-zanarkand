import { useCallback, useEffect, useRef, useState } from "react";
import {
  resumeGroundingUserMessage,
  resumeOllamaUserMessage,
  resumeSafeMessage,
  resumeZipUserMessage,
} from "../../core/resume/resumeErrors";
import {
  isLoopbackOllamaBaseUrl,
  loadResumeAiPreferences,
} from "../../core/resume/resumeAiPreferences";
import {
  blocksWithLivePlaintext,
  refreshCoverageAfterAccept,
} from "../../core/resume/resumeCoverage";
import { detectResumeSections } from "../../core/resume/resumeFacts";
import {
  createCanvasMeasureTextFn,
  layoutDocumentBlocksFromGraph,
  layoutFontStyleFromRuns,
} from "../../core/resume/resumeLayout";
import type {
  MatchResult,
  Requirement,
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
  acceptReviewedSuggestion,
  applyRegeneratedProposal,
  isReviewableSuggestion,
  markSuggestionApplied,
  markSuggestionBlockedFormatting,
  markSuggestionStale,
  normalizeRegenerationOptions,
  regenerationConstraintIsValid,
  rejectReviewedSuggestion,
  suggestionReviewErrorCopy,
  type ResumeRegenerationOptions,
  type SuggestionReviewErrorCode,
} from "../../core/resume/resumeSuggestionState";
import {
  currentPlaintextForSuggestionBlock,
  originalTextHashMatchesCurrent,
  type ApplyAcceptedSuggestionToDocumentInput,
  type ApplyAcceptedSuggestionToDocumentResult,
} from "../../core/resume/resumeSuggestionApply";
import { mayStartResumeSuggestionGenerate } from "../../core/resume/resumeLimits";
import {
  createOllamaResumeLLM,
  generateBlockSuggestion,
} from "../../core/resume/resumeSuggestions";
import { isOllamaClientError } from "../../lib/ollamaClient";
import {
  insertResumeSuggestion,
  listResumeSuggestions,
  updateResumeSuggestion,
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
  applyToDocument?: (
    input: ApplyAcceptedSuggestionToDocumentInput
  ) => Promise<ApplyAcceptedSuggestionToDocumentResult>;
  persistMatchResult?: (matchResult: MatchResult) => Promise<boolean>;
  substitutionActive?: boolean;
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
  drafts: Record<string, string>;
  setDraft: (suggestionId: string, proposedText: string) => void;
  reviewError: string | null;
  busySuggestionId: string | null;
  requirements: Requirement[];
  accept: (suggestionId: string) => Promise<boolean>;
  reject: (suggestionId: string) => Promise<boolean>;
  regenerate: (suggestionId: string, options: ResumeRegenerationOptions) => Promise<void>;
};

function layoutInputForSuggestionBlock(
  graph: ResumeStructureGraph | null,
  blockId: string,
  substitutionActive: boolean
) {
  const block = graph?.blocks.find((item) => item.blockId === blockId);
  const documentBlocks = layoutDocumentBlocksFromGraph(graph?.blocks ?? [], substitutionActive);
  return {
    measure: createCanvasMeasureTextFn(),
    substitutionActive,
    style: layoutFontStyleFromRuns(block?.runs ?? [], substitutionActive),
    documentBlocks,
    targetBlockId: blockId,
  };
}

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
 * Load, generate, and review suggestion cards (Phase 7B–7E).
 * Sequential one-block generation; persist grounded pending rows; reject /
 * regenerate persist status or replacement wording. Accept patches OOXML via
 * the 0D bookmark patcher, then marks `applied` (or `blocked_formatting`).
 * Hash mismatch marks `stale` and does not write the document. A successful
 * apply rematches coverage on current plaintext (no JD re-parse, no LLM).
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
    applyToDocument,
    persistMatchResult,
    substitutionActive = false,
  } = args;

  const [records, setRecords] = useState<ResumeSuggestionRecord[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const generatingRef = useRef(false);
  const recordsRef = useRef<ResumeSuggestionRecord[]>([]);
  const draftsRef = useRef<Record<string, string>>({});
  const sessionId = session?.id ?? null;
  recordsRef.current = records;
  draftsRef.current = drafts;

  useEffect(() => {
    if (!enabled || !sessionId) {
      setRecords([]);
      setDrafts({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listResumeSuggestions(userId, sessionId);
        if (!cancelled) {
          setRecords(rows);
          setDrafts((current) => {
            const next = { ...current };
            for (const row of rows) {
              if (next[row.id] === undefined) next[row.id] = row.proposedText;
            }
            return next;
          });
        }
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
  const requirements = session?.parsedJob?.requirements ?? [];

  const cancelGenerate = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const setDraft = useCallback((suggestionId: string, proposedText: string) => {
    setDrafts((current) => ({ ...current, [suggestionId]: proposedText }));
  }, []);

  const replaceRecord = useCallback((saved: ResumeSuggestionRecord) => {
    setRecords((current) => current.map((row) => (row.id === saved.id ? saved : row)));
    setDrafts((current) => ({ ...current, [saved.id]: saved.proposedText }));
  }, []);

  const generate = useCallback(async () => {
    if (!mayStartResumeSuggestionGenerate(generatingRef.current)) return;
    generatingRef.current = true;
    if (!session || !resumeVersionId) {
      generatingRef.current = false;
      return;
    }
    const reason = generateDisabledReason(session);
    if (reason) {
      generatingRef.current = false;
      setGenerateError(reason);
      return;
    }
    const prefs = loadResumeAiPreferences();
    const blocks = factBlocksFromGraph(workingGraph);
    const alreadyPending = new Set(
      recordsRef.current
        .filter(
          (row) =>
            row.status === "pending" ||
            row.status === "blocked_formatting" ||
            row.status === "stale"
        )
        .map((row) => row.sourceBlockId)
    );
    const eligible = eligibleBlocksForSuggestionCards(blocks).filter(
      (block) => !alreadyPending.has(block.blockId)
    );
    if (eligible.length === 0) {
      generatingRef.current = false;
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
    setReviewError(null);
    setGenerateProgress({ current: 0, total: eligible.length });

    try {
      const llm = createOllamaResumeLLM({
        model: prefs.modelName,
        baseUrl: prefs.baseUrl,
        timeoutMs: REWRITE_TIMEOUT_MS,
      });
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
          layout: layoutInputForSuggestionBlock(workingGraph, block.blockId, substitutionActive),
        });
        if (!result.ok) {
          if (result.code === "llm_error") {
            setGenerateError(
              resumeOllamaUserMessage(
                "Could not reach Ollama. Open Settings → Resume AI and use Test connection."
              )
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
        setDrafts((current) => ({ ...current, [record.id]: record.proposedText }));
      }
      if (!cancelRef.current && grounded === 0) {
        setGenerateError((current) =>
          current ?? resumeGroundingUserMessage("No grounded suggestions were produced.")
        );
      }
    } catch (error) {
      if (isOllamaClientError(error)) {
        setGenerateError(resumeSafeMessage(error, resumeOllamaUserMessage()));
      } else {
        setGenerateError("Could not generate suggestions.");
      }
    } finally {
      generatingRef.current = false;
      setGenerating(false);
      setGenerateProgress(null);
    }
  }, [session, resumeVersionId, workingGraph, importFactLedger, userId, resumeId, substitutionActive]);

  const accept = useCallback(
    async (suggestionId: string): Promise<boolean> => {
      const current = recordsRef.current.find((row) => row.id === suggestionId);
      if (!current || !isReviewableSuggestion(current)) {
        setReviewError(suggestionReviewErrorCopy("not_reviewable"));
        return false;
      }
      setBusySuggestionId(suggestionId);
      setReviewError(null);
      let appliedProposedText: string | null = null;
      let appliedSourceBlockId: string | null = null;
      try {
        const blocks = factBlocksFromGraph(workingGraph);
        const currentPlaintext = currentPlaintextForSuggestionBlock(
          blocks,
          current.sourceBlockId
        );
        const hashFresh =
          currentPlaintext !== null &&
          (await originalTextHashMatchesCurrent({
            originalTextHash: current.originalTextHash,
            currentPlaintext,
          }));
        if (!hashFresh) {
          const saved = await updateResumeSuggestion(userId, {
            ...current,
            ...markSuggestionStale(current),
          });
          replaceRecord(saved);
          setReviewError(suggestionReviewErrorCopy("stale"));
          return false;
        }
        const result = acceptReviewedSuggestion({
          suggestion: current,
          proposedText: draftsRef.current[suggestionId] ?? current.proposedText,
          ledger: importFactLedger,
          blocks,
          scope: detectResumeSections(blocks),
        });
        if (!result.ok) {
          setReviewError(reviewUserMessage(result.code));
          return false;
        }
        const patched = applyToDocument
          ? await applyToDocument({
              sourceBlockId: result.suggestion.sourceBlockId,
              proposedText: result.suggestion.proposedText,
              originalTextHash: result.suggestion.originalTextHash,
            })
          : {
              ok: false as const,
              code: "not_ready" as const,
              message: suggestionReviewErrorCopy("apply_not_ready"),
            };
        if (!patched.ok) {
          if (patched.code === "stale") {
            const saved = await updateResumeSuggestion(userId, {
              ...current,
              ...markSuggestionStale(result.suggestion),
            });
            replaceRecord(saved);
            setReviewError(patched.message);
            return false;
          }
          if (patched.code === "blocked_formatting") {
            const saved = await updateResumeSuggestion(userId, {
              ...current,
              ...markSuggestionBlockedFormatting(result.suggestion),
            });
            replaceRecord(saved);
            setReviewError(resumeZipUserMessage(patched.message));
            return false;
          }
          setReviewError(patched.message);
          return false;
        }
        const saved = await updateResumeSuggestion(userId, {
          ...current,
          ...markSuggestionApplied(result.suggestion),
        });
        replaceRecord(saved);
        appliedProposedText = result.suggestion.proposedText;
        appliedSourceBlockId = result.suggestion.sourceBlockId;
      } catch {
        setReviewError("Could not apply the suggestion to the Word document.");
        return false;
      } finally {
        if (!appliedProposedText) setBusySuggestionId(null);
      }

      try {
        const parsedJob = session?.parsedJob;
        const versionId = resumeVersionId ?? current.resumeVersionId;
        if (parsedJob && persistMatchResult && versionId && appliedProposedText && appliedSourceBlockId) {
          const graphBlocks = workingGraph?.blocks ?? [];
          const workingBlocks = blocksWithLivePlaintext(graphBlocks, {
            [appliedSourceBlockId]: appliedProposedText,
          });
          const refreshed = refreshCoverageAfterAccept({
            parsedJob,
            importLedger: importFactLedger,
            workingBlocks,
            firstSeenVersionId: versionId,
          });
          const coverageSaved = await persistMatchResult(refreshed.matchResult);
          if (!coverageSaved) {
            setReviewError("Suggestion applied. Coverage could not be refreshed.");
          }
        }
      } catch {
        setReviewError("Suggestion applied. Coverage could not be refreshed.");
      } finally {
        setBusySuggestionId(null);
      }
      return true;
    },
    [
      workingGraph,
      importFactLedger,
      userId,
      replaceRecord,
      applyToDocument,
      persistMatchResult,
      session,
      resumeVersionId,
    ]
  );

  const reject = useCallback(
    async (suggestionId: string): Promise<boolean> => {
      const current = recordsRef.current.find((row) => row.id === suggestionId);
      if (!current) {
        setReviewError(suggestionReviewErrorCopy("not_reviewable"));
        return false;
      }
      const result = rejectReviewedSuggestion(current);
      if (!result.ok) {
        setReviewError(reviewUserMessage(result.code));
        return false;
      }
      setBusySuggestionId(suggestionId);
      setReviewError(null);
      try {
        const saved = await updateResumeSuggestion(userId, {
          ...current,
          ...result.suggestion,
        });
        replaceRecord(saved);
        return true;
      } catch {
        setReviewError("Could not save the reject decision.");
        return false;
      } finally {
        setBusySuggestionId(null);
      }
    },
    [userId, replaceRecord]
  );

  const regenerate = useCallback(
    async (suggestionId: string, options: ResumeRegenerationOptions) => {
      if (!session) return;
      const current = recordsRef.current.find((row) => row.id === suggestionId);
      if (!current || !isReviewableSuggestion(current)) {
        setReviewError(suggestionReviewErrorCopy("not_reviewable"));
        return;
      }
      const regeneration = normalizeRegenerationOptions(options);
      if (!regeneration) {
        setReviewError(suggestionReviewErrorCopy("invalid_constraint"));
        return;
      }
      const requirementIds = (session.parsedJob?.requirements ?? []).map((item) => item.id);
      if (!regenerationConstraintIsValid(regeneration, requirementIds)) {
        setReviewError(suggestionReviewErrorCopy("invalid_constraint"));
        return;
      }
      const prefs = loadResumeAiPreferences();
      if (!isLoopbackOllamaBaseUrl(prefs.baseUrl) || !prefs.modelName.trim()) {
        setReviewError(
          "Choose a model in Settings → Resume AI after Test connection succeeds before regenerating."
        );
        return;
      }

      setBusySuggestionId(suggestionId);
      setReviewError(null);
      const blocks = factBlocksFromGraph(workingGraph);
      const liveText = currentPlaintextForSuggestionBlock(blocks, current.sourceBlockId);
      const llm = createOllamaResumeLLM({
        model: prefs.modelName,
        baseUrl: prefs.baseUrl,
        timeoutMs: REWRITE_TIMEOUT_MS,
      });
      try {
        const generated = await generateBlockSuggestion({
          blockId: current.sourceBlockId,
          originalText: liveText ?? current.originalText,
          blocks,
          ledger: importFactLedger,
          session,
          llm,
          model: prefs.modelName,
          regeneration,
          layout: layoutInputForSuggestionBlock(
            workingGraph,
            current.sourceBlockId,
            substitutionActive
          ),
        });
        if (!generated.ok) {
          setReviewError(
            generated.code === "rejected_ungrounded"
              ? resumeGroundingUserMessage(suggestionReviewErrorCopy("rejected_ungrounded"))
              : suggestionReviewErrorCopy("regenerate_failed")
          );
          return;
        }
        const merged = applyRegeneratedProposal(current, generated.suggestion);
        if (!merged.ok) {
          setReviewError(reviewUserMessage(merged.code));
          return;
        }
        const saved = await updateResumeSuggestion(userId, {
          ...current,
          ...merged.suggestion,
        });
        replaceRecord(saved);
      } catch (error) {
        if (isOllamaClientError(error)) {
          setReviewError(resumeSafeMessage(error, resumeOllamaUserMessage()));
        } else {
          setReviewError(suggestionReviewErrorCopy("regenerate_failed"));
        }
      } finally {
        setBusySuggestionId(null);
      }
    },
    [session, workingGraph, importFactLedger, userId, replaceRecord, substitutionActive]
  );

  const currentTextByBlockId = Object.fromEntries(
    factBlocksFromGraph(workingGraph).map((block) => [block.blockId, block.text])
  );

  return {
    cards: buildSuggestionCardViews(records, { currentTextByBlockId }),
    generating,
    generateProgress,
    generateError,
    generateDisabledReason: disabledReason,
    canGenerate: Boolean(enabled && session && resumeVersionId && !disabledReason && !generating),
    generate,
    cancelGenerate,
    drafts,
    setDraft,
    reviewError,
    busySuggestionId,
    requirements,
    accept,
    reject,
    regenerate,
  };
}

function reviewUserMessage(code: SuggestionReviewErrorCode): string {
  const copy = suggestionReviewErrorCopy(code);
  if (code === "rejected_ungrounded") return resumeGroundingUserMessage(copy);
  if (code === "blocked_formatting") return resumeZipUserMessage(copy);
  return copy;
}
