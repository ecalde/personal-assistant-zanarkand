import { describe, expect, it } from "vitest";
import type { ResumeStructureBlock, ResumeStructureRun } from "./resumeModel";
import {
  canRedoResumeEditor,
  canUndoResumeEditor,
  emptyResumeEditorHistory,
  recordResumeEditorEdit,
  redoResumeEditor,
  restoreResumeEditorBlocks,
  resumeEditorHistoryKeyAction,
  undoResumeEditor,
} from "./resumeEditorHistory";

function run(text: string, overrides: Partial<ResumeStructureRun> = {}): ResumeStructureRun {
  return {
    text,
    bold: false,
    italic: false,
    underline: false,
    font: null,
    sizePt: null,
    hyperlinkRelId: null,
    ...overrides,
  };
}

function block(order: number, text: string, runs?: ResumeStructureRun[]): ResumeStructureBlock {
  return {
    order,
    text,
    blockId: `id-${order}`,
    bookmarkName: `pa_id-${order}`,
    runs: runs ?? [run(text)],
  };
}

describe("resumeEditorHistory", () => {
  it("records an edit and undoes/redoes the stored block, including mixed runs", () => {
    const before = block(0, "Led TeamAlpha", [
      run("Led "),
      run("TeamAlpha", { bold: true }),
    ]);
    const after = block(0, "Ran TeamAlpha", [
      run("Ran "),
      run("TeamAlpha", { bold: true }),
    ]);
    const other = block(1, "Other");
    let history = recordResumeEditorEdit(emptyResumeEditorHistory(), {
      blockId: "id-0",
      before,
      after,
    });
    expect(canUndoResumeEditor(history)).toBe(true);
    expect(canRedoResumeEditor(history)).toBe(false);

    const undone = undoResumeEditor(history);
    expect(undone).not.toBeNull();
    history = undone!.history;
    const blocks = restoreResumeEditorBlocks([after, other], undone!.entry, "undo");
    expect(blocks[0]).toEqual(before);
    expect(blocks[1]).toEqual(other);
    expect(canRedoResumeEditor(history)).toBe(true);

    const redone = redoResumeEditor(history);
    expect(redone).not.toBeNull();
    const restored = restoreResumeEditorBlocks(blocks, redone!.entry, "redo");
    expect(restored[0]).toEqual(after);
    expect(restored[0]?.runs[1]?.bold).toBe(true);
  });

  it("coalesces consecutive edits to the same block into one undo step", () => {
    const a = block(0, "A");
    const ab = block(0, "AB");
    const abc = block(0, "ABC");
    let history = recordResumeEditorEdit(emptyResumeEditorHistory(), {
      blockId: "id-0",
      before: a,
      after: ab,
    });
    history = recordResumeEditorEdit(history, { blockId: "id-0", before: ab, after: abc });
    expect(history.past).toHaveLength(1);
    expect(history.past[0]?.before.text).toBe("A");
    expect(history.past[0]?.after.text).toBe("ABC");

    const undone = undoResumeEditor(history);
    expect(undone?.entry.before.text).toBe("A");
    expect(undone?.history.past).toHaveLength(0);
  });

  it("keeps a separate step when the edited block changes", () => {
    const a0 = block(0, "A");
    const a1 = block(0, "AA");
    const b0 = block(1, "B");
    const b1 = block(1, "BB");
    let history = recordResumeEditorEdit(emptyResumeEditorHistory(), {
      blockId: "id-0",
      before: a0,
      after: a1,
    });
    history = recordResumeEditorEdit(history, { blockId: "id-1", before: b0, after: b1 });
    expect(history.past).toHaveLength(2);
  });

  it("clears redo when a new edit is recorded", () => {
    const a = block(0, "A");
    const b = block(0, "B");
    const c = block(0, "C");
    let history = recordResumeEditorEdit(emptyResumeEditorHistory(), {
      blockId: "id-0",
      before: a,
      after: b,
    });
    history = undoResumeEditor(history)!.history;
    history = recordResumeEditorEdit(history, { blockId: "id-0", before: a, after: c });
    expect(canRedoResumeEditor(history)).toBe(false);
    expect(history.past).toHaveLength(1);
    expect(history.past[0]?.after.text).toBe("C");
  });

  it("maps modifier+Z / Shift+Z / Y to undo and redo", () => {
    expect(
      resumeEditorHistoryKeyAction({
        key: "z",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      })
    ).toBe("undo");
    expect(
      resumeEditorHistoryKeyAction({
        key: "Z",
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      })
    ).toBe("redo");
    expect(
      resumeEditorHistoryKeyAction({
        key: "y",
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
      })
    ).toBe("redo");
    expect(
      resumeEditorHistoryKeyAction({
        key: "z",
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      })
    ).toBeNull();
  });
});
