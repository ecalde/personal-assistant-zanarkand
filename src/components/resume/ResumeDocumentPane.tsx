import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from "react";
import type {
  ResumeExtractedStructure,
  ResumeStructureBlock,
  ResumeStructureGraph,
} from "../../core/resume/resumeModel";
import {
  MIXED_RUN_FAIL_MESSAGE,
  applyGraphBlockPlaintext,
  blockEditorAriaLabel,
  editorInputPlaintext,
  sectionKindLabel,
} from "../../core/resume/resumeBlockEdit";
import {
  resumeBytesEqual,
} from "../../core/resume/resumeAutosave";
import {
  blocksWithLivePlaintext,
  editorBlocksForCoverageAnalyze,
} from "../../core/resume/resumeCoverage";
import {
  resumeWorkingDownloadFilename,
  triggerResumeWorkingDocxDownload,
} from "../../core/resume/resumeEditorDownload";
import {
  RESUME_OOXML_FLUSH_DEBOUNCE_MS,
  flushBlockPlaintextByBookmark,
} from "../../core/resume/resumeEditorFlush";
import {
  canRedoResumeEditor,
  canUndoResumeEditor,
  emptyResumeEditorHistory,
  recordResumeEditorEdit,
  redoResumeEditor,
  restoreResumeEditorBlocks,
  resumeEditorHistoryKeyAction,
  undoResumeEditor,
  type ResumeEditorHistory,
} from "../../core/resume/resumeEditorHistory";
import { detectResumeSections } from "../../core/resume/resumeFacts";
import { documentFontFamilies } from "../../core/resume/resumeFonts";
import { paginatePreviewBlocks } from "../../core/resume/resumePreviewGeometry";
import { downloadResumeWorkingDocx, ResumeRemoteError } from "../../lib/resumeRemote";
import { styles } from "../../ui/appStyles";
import { ResumePageSurface } from "./ResumePageSurface";
import {
  useResumeAutosave,
  type ResumeAutosavePayload,
} from "./useResumeAutosave";
import { useResumeFontPreflight } from "./useResumeFontPreflight";

/**
 * Document pane (4A–4G). Local graph updates immediately. After a debounce,
 * each dirty block is flushed through the same fail-closed
 * `patchParagraphPlaintext` as Wave 0 (bookmark locator). Undo/redo is an
 * in-memory block stack (not suggestion undo). Successful last-good bytes
 * autosave to the working copy (not the original). Download Word emits those
 * flushed working bytes — never the immutable original, never HTML-to-docx.
 */

export type ResumeDocumentPaneProps = {
  resumeName: string;
  userId?: string;
  resumeId?: string;
  versionId?: string;
  resumeUpdatedAtIso?: string;
  workingStoragePath?: string | null;
  extractedStructure?: ResumeExtractedStructure;
  graph?: ResumeStructureGraph;
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
  /** Current editor graph (draft, last flushed, or open snapshot). Used by Analyze coverage. */
  onWorkingGraphChange?: (graph: ResumeStructureGraph) => void;
  /**
   * Analyze calls this to flush pending OOXML patches, wait for working-copy
   * autosave, and read the live graph from refs (not a stale React snapshot).
   */
  coveragePrepareRef?: MutableRefObject<(() => Promise<ResumeStructureGraph | null>) | null>;
  /** Suggestion card click: scroll/focus this bookmark id. */
  focusedBlockId?: string | null;
  focusNonce?: number;
};

export function ResumeDocumentPane({
  resumeName,
  userId,
  resumeId,
  versionId,
  resumeUpdatedAtIso,
  workingStoragePath = null,
  extractedStructure,
  graph,
  loading = false,
  error = null,
  onClose,
  onWorkingGraphChange,
  coveragePrepareRef,
  focusedBlockId = null,
  focusNonce = 0,
}: ResumeDocumentPaneProps) {
  const [draftBlocks, setDraftBlocks] = useState<ResumeStructureBlock[] | null>(null);
  /** Graph matching `lastGoodBytes` (last successful OOXML flush). */
  const [baselineBlocks, setBaselineBlocks] = useState<ResumeStructureBlock[] | null>(null);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [bytesReady, setBytesReady] = useState(false);
  const [bytesError, setBytesError] = useState<string | null>(null);
  const [flushing, setFlushing] = useState(false);
  const [history, setHistory] = useState<ResumeEditorHistory>(emptyResumeEditorHistory);
  const [editorGenerationByBlockId, setEditorGenerationByBlockId] = useState<
    Record<string, number>
  >({});
  const [autosavePayload, setAutosavePayload] = useState<ResumeAutosavePayload | null>(null);
  const [downloading, setDownloading] = useState(false);

  const lastGoodBytesRef = useRef<Uint8Array | null>(null);
  const pendingFlushIdsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftBlocksRef = useRef<ResumeStructureBlock[] | null>(null);
  const baselineBlocksRef = useRef<ResumeStructureBlock[] | null>(null);
  const persistedBlocksRef = useRef<ResumeStructureBlock[]>([]);
  const paneRootRef = useRef<HTMLElement | null>(null);
  const flushGenerationRef = useRef(0);
  const bytesErrorRef = useRef<string | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;

  const persistedBlocks = useMemo(() => graph?.blocks ?? [], [graph]);
  const blocks = draftBlocks ?? persistedBlocks;

  draftBlocksRef.current = draftBlocks;
  baselineBlocksRef.current = baselineBlocks;
  persistedBlocksRef.current = persistedBlocks;
  bytesErrorRef.current = bytesError;

  useEffect(() => {
    if (!onWorkingGraphChange) return;
    const source = editorBlocksForCoverageAnalyze({
      draftBlocks,
      baselineBlocks,
      persistedBlocks,
    });
    if (source.length === 0) return;
    onWorkingGraphChange({ blocks: source });
  }, [draftBlocks, baselineBlocks, persistedBlocks, onWorkingGraphChange]);

  const pages = useMemo(() => paginatePreviewBlocks(blocks), [blocks]);

  useEffect(() => {
    if (!focusedBlockId) return;
    const root = paneRootRef.current;
    if (!root) return;
    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(focusedBlockId)
        : focusedBlockId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const host = root.querySelector(`[data-resume-block-id="${escaped}"]`);
    if (!(host instanceof HTMLElement)) return;
    host.scrollIntoView({ block: "center", inline: "nearest" });
    host.focus();
  }, [focusedBlockId, focusNonce, pages]);
  const fontFamilies = useMemo(() => documentFontFamilies(blocks), [blocks]);
  const fontPreflight = useResumeFontPreflight(fontFamilies);

  const sectionLabelByBlockId = useMemo(() => {
    const labeled = persistedBlocks
      .filter((block): block is ResumeStructureBlock & { blockId: string } => block.blockId !== null)
      .map((block) => ({ blockId: block.blockId, text: block.text }));
    const detected = detectResumeSections(labeled);
    const labels: Record<string, string> = {};
    for (const block of persistedBlocks) {
      if (!block.blockId) continue;
      labels[block.blockId] = sectionKindLabel(detected.sectionKindByBlockId[block.blockId]);
    }
    return labels;
  }, [persistedBlocks]);

  const dirty = useMemo(() => {
    const baseline = baselineBlocks ?? persistedBlocks;
    const current = draftBlocks ?? persistedBlocks;
    if (current.length !== baseline.length) return true;
    return current.some((block, index) => block.text !== baseline[index]?.text);
  }, [draftBlocks, baselineBlocks, persistedBlocks]);

  const {
    status: autosaveStatus,
    error: autosaveError,
    conflict: autosaveConflict,
    retry: retryAutosave,
    saveNow,
  } = useResumeAutosave({
    userId,
    resumeId,
    versionId,
    workingStoragePath,
    resumeUpdatedAtIso,
    previousStructure: extractedStructure,
    payload: autosavePayload,
    localDirty: dirty || flushing,
  });

  const hasContent = graph !== undefined && blocks.length > 0;

  async function flushPendingBlocks(): Promise<ResumeAutosavePayload | null> {
    const bytes = lastGoodBytesRef.current;
    if (!bytes) {
      setEditNotice(
        bytesErrorRef.current ??
          "The Word document is still loading. Try again in a moment, or reopen the preview."
      );
      return null;
    }

    const pendingIds = [...pendingFlushIdsRef.current];
    pendingFlushIdsRef.current.clear();
    if (pendingIds.length === 0) {
      const blocks = editorBlocksForCoverageAnalyze({
        draftBlocks: draftBlocksRef.current,
        baselineBlocks: baselineBlocksRef.current,
        persistedBlocks: persistedBlocksRef.current,
      });
      return { bytes, graph: { blocks } };
    }

    const generation = flushGenerationRef.current;
    const draft = draftBlocksRef.current ?? persistedBlocksRef.current;
    const baseline = baselineBlocksRef.current ?? persistedBlocksRef.current;
    const baselineById = new Map(
      baseline.filter((block) => block.blockId).map((block) => [block.blockId!, block])
    );

    const orderedIds = draft
      .map((block) => block.blockId)
      .filter((id): id is string => id !== null && pendingIds.includes(id));

    setFlushing(true);
    let nextBytes = bytes;
    const nextBaseline = baseline.slice();
    const nextDraft = draft.slice();
    let failed = false;

    try {
      for (const blockId of orderedIds) {
        if (generation !== flushGenerationRef.current) return null;

        const draftIndex = nextDraft.findIndex((block) => block.blockId === blockId);
        const draftBlock = draftIndex >= 0 ? nextDraft[draftIndex] : undefined;
        if (!draftBlock?.bookmarkName) continue;

        const base = baselineById.get(blockId);
        if (base && base.text === draftBlock.text) continue;

        const result = await flushBlockPlaintextByBookmark(
          nextBytes,
          draftBlock.bookmarkName,
          draftBlock.text
        );

        if (!result.ok) {
          failed = true;
          setEditNotice(result.message);
          if (base && draftIndex >= 0) {
            nextDraft[draftIndex] = base;
          }
          // Keep last-good bytes; do not write a flattened paragraph.
          continue;
        }

        nextBytes = result.bytes;
        const baselineIndex = nextBaseline.findIndex((block) => block.blockId === blockId);
        if (baselineIndex >= 0) {
          nextBaseline[baselineIndex] = draftBlock;
        }
        baselineById.set(blockId, draftBlock);
      }
    } finally {
      if (generation === flushGenerationRef.current) {
        lastGoodBytesRef.current = nextBytes;
        setBaselineBlocks(nextBaseline);
        setDraftBlocks(nextDraft);
        setFlushing(false);
        if (!failed) {
          setEditNotice(null);
        }
        if (!resumeBytesEqual(nextBytes, bytes)) {
          setAutosavePayload({ bytes: nextBytes, graph: { blocks: nextBaseline } });
        }
      }
    }

    if (generation !== flushGenerationRef.current) return null;
    return { bytes: nextBytes, graph: { blocks: nextBaseline } };
  }

  const flushPendingBlocksRef = useRef(flushPendingBlocks);
  flushPendingBlocksRef.current = flushPendingBlocks;
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  useEffect(() => {
    if (!coveragePrepareRef) return;
    coveragePrepareRef.current = async () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      const liveById = livePlaintextByBlockId(paneRootRef.current);
      const current = editorBlocksForCoverageAnalyze({
        draftBlocks: draftBlocksRef.current,
        baselineBlocks: baselineBlocksRef.current,
        persistedBlocks: persistedBlocksRef.current,
      });
      let nextDraft = current;
      for (const [blockId, text] of Object.entries(liveById)) {
        const existing = nextDraft.find((block) => block.blockId === blockId);
        if (!existing || existing.text === text) continue;
        const applied = applyGraphBlockPlaintext(nextDraft, blockId, text);
        if (applied.ok) {
          nextDraft = applied.blocks;
          pendingFlushIdsRef.current.add(blockId);
        }
      }
      if (nextDraft !== current) {
        draftBlocksRef.current = nextDraft;
        setDraftBlocks(nextDraft);
      }
      const flushed = await flushPendingBlocksRef.current();
      if (flushed) {
        await saveNowRef.current(flushed);
        const overlaid = blocksWithLivePlaintext(flushed.graph.blocks, liveById);
        return { blocks: overlaid };
      }
      const live = blocksWithLivePlaintext(
        editorBlocksForCoverageAnalyze({
          draftBlocks: draftBlocksRef.current,
          baselineBlocks: baselineBlocksRef.current,
          persistedBlocks: persistedBlocksRef.current,
        }),
        liveById
      );
      if (live.length === 0) return null;
      return { blocks: live };
    };
    return () => {
      coveragePrepareRef.current = null;
    };
  }, [coveragePrepareRef]);

  function scheduleFlush() {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void flushPendingBlocksRef.current();
    }, RESUME_OOXML_FLUSH_DEBOUNCE_MS);
  }

  useEffect(() => {
    lastGoodBytesRef.current = null;
    setBytesReady(false);
    setBytesError(null);
    setBaselineBlocks(null);
    setDraftBlocks(null);
    setAutosavePayload(null);
    pendingFlushIdsRef.current.clear();
    const cleared = emptyResumeEditorHistory();
    historyRef.current = cleared;
    setHistory(cleared);
    setEditorGenerationByBlockId({});
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flushGenerationRef.current += 1;

    if (!userId || !workingStoragePath) {
      return;
    }

    const generation = flushGenerationRef.current;
    let cancelled = false;

    void (async () => {
      try {
        const bytes = await downloadResumeWorkingDocx(userId, workingStoragePath);
        if (cancelled || generation !== flushGenerationRef.current) return;
        lastGoodBytesRef.current = bytes;
        setAutosavePayload({
          bytes,
          graph: { blocks: persistedBlocksRef.current },
        });
        setBytesReady(true);
        setBytesError(null);
      } catch (err) {
        if (cancelled || generation !== flushGenerationRef.current) return;
        lastGoodBytesRef.current = null;
        setBytesReady(false);
        setBytesError(
          err instanceof ResumeRemoteError
            ? err.message
            : "Could not load the Word document for editing."
        );
      }
    })();

    return () => {
      cancelled = true;
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [userId, workingStoragePath]);

  useEffect(() => {
    if (!bytesReady || pendingFlushIdsRef.current.size === 0) return;
    scheduleFlush();
  }, [bytesReady]);

  function bumpEditorGeneration(blockId: string) {
    setEditorGenerationByBlockId((current) => ({
      ...current,
      [blockId]: (current[blockId] ?? 0) + 1,
    }));
  }

  function applyHistoryDirection(direction: "undo" | "redo") {
    const stepped =
      direction === "undo"
        ? undoResumeEditor(historyRef.current)
        : redoResumeEditor(historyRef.current);
    if (!stepped) return;
    historyRef.current = stepped.history;
    setHistory(stepped.history);
    const current = draftBlocksRef.current ?? persistedBlocksRef.current;
    setDraftBlocks(restoreResumeEditorBlocks(current, stepped.entry, direction));
    pendingFlushIdsRef.current.add(stepped.entry.blockId);
    bumpEditorGeneration(stepped.entry.blockId);
    setEditNotice(null);
    scheduleFlush();
  }

  function handlePaneKeyDown(event: KeyboardEvent<HTMLElement>) {
    const action = resumeEditorHistoryKeyAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    applyHistoryDirection(action);
  }

  function handleBlockPlaintextChange(blockId: string, text: string) {
    const current = draftBlocks ?? persistedBlocks;
    const before = current.find((block) => block.blockId === blockId);
    const result = applyGraphBlockPlaintext(current, blockId, text);
    if (!result.ok) {
      setEditNotice(MIXED_RUN_FAIL_MESSAGE);
      return;
    }
    const after = result.blocks.find((block) => block.blockId === blockId);
    if (!after || (before && before.text === after.text)) {
      return;
    }
    const nextHistory = recordResumeEditorEdit(historyRef.current, {
      blockId,
      before: before ?? after,
      after,
    });
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setEditNotice(null);
    setDraftBlocks(result.blocks);
    pendingFlushIdsRef.current.add(blockId);
    scheduleFlush();
  }

  function ariaLabelForBlock(block: ResumeStructureBlock): string {
    const section = block.blockId ? sectionLabelByBlockId[block.blockId] : undefined;
    return blockEditorAriaLabel(section ?? "Resume", block.text);
  }

  const combinedError = error ?? bytesError;
  const undoEnabled = canUndoResumeEditor(history);
  const redoEnabled = canRedoResumeEditor(history);

  async function handleClose() {
    if (!onClose) return;
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const flushed = await flushPendingBlocks();
    const saved = await saveNow(flushed);
    if (saved) onClose();
  }

  async function handleDownloadWord() {
    if (downloading) return;
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    setDownloading(true);
    try {
      const flushed = await flushPendingBlocks();
      const bytes = flushed?.bytes ?? lastGoodBytesRef.current;
      if (!bytes) {
        setEditNotice(
          bytesErrorRef.current ??
            "The Word document is still loading. Try again in a moment, or reopen the preview."
        );
        return;
      }
      triggerResumeWorkingDocxDownload(bytes, resumeWorkingDownloadFilename(resumeName));
    } finally {
      setDownloading(false);
    }
  }

  const saveStatusText = downloading
    ? "Preparing Word file…"
    : flushing
    ? "Applying edits to the in-memory Word document…"
    : dirty
      ? bytesReady
        ? "Unsaved local edits. Saving to cloud after a short pause…"
        : "Unsaved local edits. Waiting for the Word document to load before applying…"
      : autosaveStatus === "saving"
        ? "Saving to cloud…"
        : autosaveStatus === "error"
          ? null
          : autosaveStatus === "saved"
            ? autosaveConflict
              ? "Saved. Another tab may have saved this resume just before; last write won."
              : "Saved."
            : null;

  return (
    <section
      ref={paneRootRef}
      aria-label={`Document editor for ${resumeName}`}
      style={styles.card}
      onKeyDownCapture={handlePaneKeyDown}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div style={styles.cardTitle}>{resumeName}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => applyHistoryDirection("undo")}
            disabled={!undoEnabled}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => applyHistoryDirection("redo")}
            disabled={!redoEnabled}
          >
            Redo
          </button>
          <button
            type="button"
            aria-label="Download Word"
            onClick={() => void handleDownloadWord()}
            disabled={!bytesReady || downloading}
          >
            Download Word
          </button>
          {onClose && (
            <button type="button" onClick={() => void handleClose()}>
              Close preview
            </button>
          )}
        </div>
      </div>

      <p style={{ ...styles.metaText, margin: "0 0 12px 0" }}>
        Approximate on-screen preview. Click a paragraph to edit. Undo and Redo
        apply to block text in this tab. Edits patch the Word document after a
        short pause and save the working copy to the cloud. Download Word saves
        the flushed working copy (not the original upload). Microsoft Word is
        the source of truth for exact fonts, wrapping, and page count.
      </p>

      {saveStatusText ? (
        <p style={{ ...styles.metaText, margin: "0 0 12px 0" }} role="status">
          {saveStatusText}
        </p>
      ) : null}

      {autosaveStatus === "error" ? (
        <div style={{ ...styles.errorInline, margin: "0 0 12px 0" }}>
          <b>Cloud save failed:</b> {autosaveError ?? "Could not save resume."}{" "}
          <button type="button" style={styles.smallBtn} onClick={() => retryAutosave()}>
            Retry cloud save
          </button>
        </div>
      ) : null}

      {fontPreflight?.warning ? (
        <div
          role="status"
          style={{
            ...styles.statusWarning,
            padding: 10,
            borderRadius: 12,
            margin: "0 0 12px 0",
          }}
        >
          {fontPreflight.warning}
        </div>
      ) : null}

      {editNotice ? (
        <div
          role="alert"
          style={{
            ...styles.statusWarning,
            padding: 10,
            borderRadius: 12,
            margin: "0 0 12px 0",
          }}
        >
          {editNotice}
        </div>
      ) : null}

      {loading ? (
        <p style={{ ...styles.helpText, margin: 0 }} role="status">
          Loading preview…
        </p>
      ) : combinedError && !hasContent ? (
        <div style={styles.errorInline}>{combinedError}</div>
      ) : !hasContent ? (
        <p style={{ ...styles.helpText, margin: 0 }}>
          No preview is available for this resume yet.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 20,
            justifyItems: "center",
            padding: "12px 4px",
            overflowX: "auto",
            background: "var(--aether-surface-sunken, #fafafa)",
            borderRadius: 12,
          }}
        >
          {combinedError ? (
            <div style={{ ...styles.errorInline, width: "100%", maxWidth: 640 }}>
              {combinedError}
            </div>
          ) : null}
          {pages.map((page, index) => (
            <ResumePageSurface
              key={index}
              page={page}
              pageNumber={index + 1}
              pageCount={pages.length}
              ariaLabelForBlock={ariaLabelForBlock}
              onBlockPlaintextChange={handleBlockPlaintextChange}
              editorGenerationByBlockId={editorGenerationByBlockId}
              highlightedBlockId={focusedBlockId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function livePlaintextByBlockId(root: HTMLElement | null): Record<string, string> {
  if (!root) return {};
  const out: Record<string, string> = {};
  for (const node of root.querySelectorAll("[data-resume-block-id]")) {
    const id = node.getAttribute("data-resume-block-id");
    if (!id) continue;
    out[id] = editorInputPlaintext(node.textContent ?? "");
  }
  return out;
}
