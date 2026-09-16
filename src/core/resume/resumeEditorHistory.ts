/**
 * In-memory undo/redo for resume block plaintext (Phase 4E).
 *
 * Suggestion-accept undo is Wave 7. This stack does not persist across
 * reload (4F autosaves the document, not the undo stack) and does not
 * download (4G). Consecutive edits to the same block coalesce so a burst
 * of typing is one undo step.
 */

import type { ResumeStructureBlock } from "./resumeModel";

export const RESUME_EDITOR_HISTORY_LIMIT = 50;

export type ResumeEditorUndoEntry = {
  blockId: string;
  before: ResumeStructureBlock;
  after: ResumeStructureBlock;
};

export type ResumeEditorHistory = {
  past: ResumeEditorUndoEntry[];
  future: ResumeEditorUndoEntry[];
};

export function emptyResumeEditorHistory(): ResumeEditorHistory {
  return { past: [], future: [] };
}

export function canUndoResumeEditor(history: ResumeEditorHistory): boolean {
  return history.past.length > 0;
}

export function canRedoResumeEditor(history: ResumeEditorHistory): boolean {
  return history.future.length > 0;
}

/**
 * Record a successful local block edit. Consecutive edits to the same
 * paragraph replace `after` instead of pushing a new step.
 */
export function recordResumeEditorEdit(
  history: ResumeEditorHistory,
  entry: ResumeEditorUndoEntry,
  limit: number = RESUME_EDITOR_HISTORY_LIMIT
): ResumeEditorHistory {
  if (entry.before.blockId !== entry.blockId || entry.after.blockId !== entry.blockId) {
    return history;
  }
  if (entry.before.text === entry.after.text) {
    return history;
  }

  const last = history.past[history.past.length - 1];
  if (last && last.blockId === entry.blockId) {
    const coalesced: ResumeEditorUndoEntry = { ...last, after: entry.after };
    if (coalesced.before.text === coalesced.after.text) {
      return { past: history.past.slice(0, -1), future: [] };
    }
    return {
      past: [...history.past.slice(0, -1), coalesced].slice(-limit),
      future: [],
    };
  }

  return {
    past: [...history.past, entry].slice(-limit),
    future: [],
  };
}

export function undoResumeEditor(
  history: ResumeEditorHistory
): { history: ResumeEditorHistory; entry: ResumeEditorUndoEntry } | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, entry],
    },
    entry,
  };
}

export function redoResumeEditor(
  history: ResumeEditorHistory
): { history: ResumeEditorHistory; entry: ResumeEditorUndoEntry } | null {
  const entry = history.future[history.future.length - 1];
  if (!entry) return null;
  return {
    history: {
      past: [...history.past, entry],
      future: history.future.slice(0, -1),
    },
    entry,
  };
}

export function restoreResumeEditorBlocks(
  blocks: readonly ResumeStructureBlock[],
  entry: ResumeEditorUndoEntry,
  direction: "undo" | "redo"
): ResumeStructureBlock[] {
  const replacement = direction === "undo" ? entry.before : entry.after;
  const index = blocks.findIndex((block) => block.blockId === entry.blockId);
  if (index < 0) return [...blocks];
  const next = blocks.slice();
  next[index] = replacement;
  return next;
}

export type ResumeEditorHistoryKeyAction = "undo" | "redo";

/** Cmd/Ctrl+Z undo; Cmd/Ctrl+Shift+Z or Ctrl+Y redo. */
export function resumeEditorHistoryKeyAction(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): ResumeEditorHistoryKeyAction | null {
  if (event.altKey) return null;
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) return null;
  const key = event.key.toLowerCase();
  if (key === "z" && event.shiftKey) return "redo";
  if (key === "y" && !event.shiftKey) return "redo";
  if (key === "z") return "undo";
  return null;
}
