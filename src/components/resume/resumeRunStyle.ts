import type { CSSProperties } from "react";
import type { ResumeStructureRun } from "../../core/resume/resumeModel";
import { PREVIEW_FONT_STACK } from "../../core/resume/resumeFonts";
import { pointsToCssPx } from "../../core/resume/resumePreviewGeometry";

/** Inline run formatting for the paper preview / per-block editor. */
export function resumeRunStyle(run: ResumeStructureRun): CSSProperties {
  return {
    fontWeight: run.bold ? 700 : undefined,
    fontStyle: run.italic ? "italic" : undefined,
    textDecoration: run.underline ? "underline" : undefined,
    fontFamily: run.font ? `"${run.font}", ${PREVIEW_FONT_STACK}` : undefined,
    fontSize: run.sizePt !== null ? pointsToCssPx(run.sizePt) : undefined,
  };
}

/** Apply the same run style through the DOM API (imperative editor host). */
export function applyResumeRunDomStyle(el: HTMLElement, run: ResumeStructureRun): void {
  const style = resumeRunStyle(run);
  el.style.fontWeight = style.fontWeight === undefined ? "" : String(style.fontWeight);
  el.style.fontStyle = typeof style.fontStyle === "string" ? style.fontStyle : "";
  el.style.textDecoration = typeof style.textDecoration === "string" ? style.textDecoration : "";
  el.style.fontFamily = typeof style.fontFamily === "string" ? style.fontFamily : "";
  if (typeof style.fontSize === "number") {
    el.style.fontSize = `${style.fontSize}px`;
  } else if (typeof style.fontSize === "string") {
    el.style.fontSize = style.fontSize;
  } else {
    el.style.fontSize = "";
  }
}
