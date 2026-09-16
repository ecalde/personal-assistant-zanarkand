import type { CSSProperties } from "react";
import type { ResumeStructureBlock } from "../../core/resume/resumeModel";
import { PREVIEW_FONT_STACK } from "../../core/resume/resumeFonts";
import {
  DEFAULT_US_LETTER_GEOMETRY,
  LINE_HEIGHT_FACTOR,
  blockFontSizePt,
  pointsToCssPx,
  type PreviewGeometry,
  type PreviewPage,
} from "../../core/resume/resumePreviewGeometry";
import { ResumeBlockEditor } from "./ResumeBlockEditor";
import { resumeRunStyle } from "./resumeRunStyle";
import "./resumeEditor.css";

/**
 * One paginated preview page (Phase 4A + 4C per-block editing).
 *
 * Renders the (possibly locally edited) block graph as escaped text nodes on a
 * light "paper" surface. Each paragraph is its own contentEditable when the
 * block has a stable id. The paper stays light even in dark mode
 * (architecture §46). Never `dangerouslySetInnerHTML` of Word HTML.
 */

const PAPER_BG = "#ffffff";
const PAPER_INK = "#1a1a1a";

export type ResumePageSurfaceProps = {
  page: PreviewPage;
  pageNumber: number;
  pageCount: number;
  geometry?: PreviewGeometry;
  ariaLabelForBlock: (block: ResumeStructureBlock) => string;
  onBlockPlaintextChange: (blockId: string, text: string) => void;
  /** Bump per block after undo/redo so a focused contentEditable remounts. */
  editorGenerationByBlockId?: Readonly<Record<string, number>>;
};

function ReadOnlyParagraph({ block }: { block: ResumeStructureBlock }) {
  const style: CSSProperties = {
    margin: 0,
    fontSize: pointsToCssPx(blockFontSizePt(block)),
    lineHeight: LINE_HEIGHT_FACTOR,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };
  return (
    <p style={style}>
      {block.runs.length === 0 ? (
        "\u00a0"
      ) : (
        block.runs.map((run, index) => (
          <span key={index} style={resumeRunStyle(run)}>
            {run.text}
          </span>
        ))
      )}
    </p>
  );
}

export function ResumePageSurface({
  page,
  pageNumber,
  pageCount,
  geometry = DEFAULT_US_LETTER_GEOMETRY,
  ariaLabelForBlock,
  onBlockPlaintextChange,
  editorGenerationByBlockId,
}: ResumePageSurfaceProps) {
  const paperStyle: CSSProperties = {
    width: geometry.pageWidthPx,
    minHeight: geometry.pageHeightPx,
    boxSizing: "border-box",
    paddingTop: geometry.marginTopPx,
    paddingRight: geometry.marginRightPx,
    paddingBottom: geometry.marginBottomPx,
    paddingLeft: geometry.marginLeftPx,
    background: PAPER_BG,
    color: PAPER_INK,
    fontFamily: PREVIEW_FONT_STACK,
    boxShadow: "0 2px 14px rgba(4, 16, 31, 0.35)",
    borderRadius: 2,
    display: "grid",
    gap: 2,
    alignContent: "start",
  };

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
      <div
        style={paperStyle}
        role="group"
        aria-label={`Resume page ${pageNumber} of ${pageCount}`}
      >
        {page.blocks.map((block) => {
          const blockId = block.blockId;
          if (!blockId) {
            return <ReadOnlyParagraph key={block.order} block={block} />;
          }
          return (
            <ResumeBlockEditor
              key={`${blockId}:${editorGenerationByBlockId?.[blockId] ?? 0}`}
              block={block}
              ariaLabel={ariaLabelForBlock(block)}
              onPlaintextChange={(text) => onBlockPlaintextChange(blockId, text)}
            />
          );
        })}
      </div>
    </div>
  );
}
