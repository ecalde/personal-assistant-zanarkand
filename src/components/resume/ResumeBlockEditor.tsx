import { useLayoutEffect, useRef, useState, type CSSProperties, type ClipboardEvent, type KeyboardEvent } from "react";
import {
  editorInputPlaintext,
  resumeBlockPaintNodes,
} from "../../core/resume/resumeBlockEdit";
import type { ResumeStructureBlock } from "../../core/resume/resumeModel";
import {
  LINE_HEIGHT_FACTOR,
  blockFontSizePt,
  pointsToCssPx,
} from "../../core/resume/resumePreviewGeometry";
import { applyResumeRunDomStyle } from "./resumeRunStyle";
import "./resumeEditor.css";

/**
 * One contentEditable resume paragraph (Phase 4C + 4D flush from the pane).
 *
 * Per-block only — never wrap the whole page in a single contentEditable
 * (architecture §18.1). Run spans are painted imperatively. React must not
 * own those descendants: a large native deletion removes the span nodes, and
 * reconciling them (including on pagination remount) throws `removeChild` and
 * blanks the page. OOXML patching is owned by ResumeDocumentPane via
 * `flushBlockPlaintextByBookmark` (Phase 4D). Undo/redo is owned by the pane
 * (Phase 4E) so native contentEditable undo cannot desync OOXML.
 */

export type ResumeBlockEditorProps = {
  block: ResumeStructureBlock;
  ariaLabel: string;
  highlighted?: boolean;
  onPlaintextChange: (text: string) => void;
};

function paintResumeBlockHost(host: HTMLParagraphElement, block: ResumeStructureBlock): void {
  const children: Node[] = [];
  for (const item of resumeBlockPaintNodes(block)) {
    if (item.kind === "placeholder") {
      children.push(document.createTextNode(item.text));
      continue;
    }
    const span = document.createElement("span");
    applyResumeRunDomStyle(span, item.run);
    span.textContent = item.run.text;
    children.push(span);
  }
  host.replaceChildren(...children);
}

export function ResumeBlockEditor({
  block,
  ariaLabel,
  highlighted = false,
  onPlaintextChange,
}: ResumeBlockEditorProps) {
  const hostRef = useRef<HTMLParagraphElement | null>(null);
  const [focused, setFocused] = useState(false);
  const composingRef = useRef(false);
  const paintingRef = useRef(false);

  const style: CSSProperties = {
    margin: 0,
    fontSize: pointsToCssPx(blockFontSizePt(block)),
    lineHeight: LINE_HEIGHT_FACTOR,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || focused) return;
    paintingRef.current = true;
    try {
      paintResumeBlockHost(host, block);
    } finally {
      paintingRef.current = false;
    }
  }, [block, focused]);

  function emit(textContent: string | null) {
    onPlaintextChange(editorInputPlaintext(textContent ?? ""));
  }

  function handlePaste(event: ClipboardEvent<HTMLParagraphElement>) {
    event.preventDefault();
    const pasted = editorInputPlaintext(event.clipboardData.getData("text/plain"));
    document.execCommand("insertText", false, pasted);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLParagraphElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
    // Cmd/Ctrl+Z handled in capture on ResumeDocumentPane (Phase 4E).
  }

  return (
    <p
      ref={hostRef}
      data-resume-block-id={block.blockId ?? undefined}
      className={
        highlighted ? "resume-block-editor resume-block-editor--card-target" : "resume-block-editor"
      }
      style={style}
      contentEditable={true}
      suppressContentEditableWarning
      spellCheck={true}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        if (paintingRef.current) return;
        emit(event.currentTarget.textContent);
      }}
      onInput={(event) => {
        if (composingRef.current || paintingRef.current) return;
        emit(event.currentTarget.textContent);
      }}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
    />
  );
}
