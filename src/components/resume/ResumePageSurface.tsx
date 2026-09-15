import type { CSSProperties } from "react";
import type { ResumeStructureBlock, ResumeStructureRun } from "../../core/resume/resumeModel";
import { PREVIEW_FONT_STACK } from "../../core/resume/resumeFonts";
import {
  DEFAULT_US_LETTER_GEOMETRY,
  LINE_HEIGHT_FACTOR,
  blockFontSizePt,
  pointsToCssPx,
  type PreviewGeometry,
  type PreviewPage,
} from "../../core/resume/resumePreviewGeometry";
import "./resumeEditor.css";

/**
 * One paginated preview page (Phase 4A).
 *
 * Renders the persisted block graph as escaped text nodes on a light "paper"
 * surface sized to the page geometry. Runs carry their own bold/italic/
 * underline/font/size so mixed formatting shows without flattening. The paper
 * stays light even in dark mode (architecture §46) using fixed ink colors.
 *
 * This is a CSS approximation, never `dangerouslySetInnerHTML` of Word HTML.
 * Carlito is bundled (Phase 4B); missing Calibri is a warning, not a restyle
 * of the OOXML font names.
 */

const PAPER_BG = "#ffffff";
const PAPER_INK = "#1a1a1a";

export type ResumePageSurfaceProps = {
  page: PreviewPage;
  pageNumber: number;
  pageCount: number;
  geometry?: PreviewGeometry;
};

function runStyle(run: ResumeStructureRun): CSSProperties {
  return {
    fontWeight: run.bold ? 700 : undefined,
    fontStyle: run.italic ? "italic" : undefined,
    textDecoration: run.underline ? "underline" : undefined,
    fontFamily: run.font ? `"${run.font}", ${PREVIEW_FONT_STACK}` : undefined,
    fontSize: run.sizePt !== null ? pointsToCssPx(run.sizePt) : undefined,
  };
}

function BlockParagraph({ block }: { block: ResumeStructureBlock }) {
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
          <span key={index} style={runStyle(run)}>
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
        aria-label={`Resume preview page ${pageNumber} of ${pageCount}`}
      >
        {page.blocks.map((block) => (
          <BlockParagraph key={block.order} block={block} />
        ))}
      </div>
    </div>
  );
}
