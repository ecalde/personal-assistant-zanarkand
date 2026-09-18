/**
 * Phase 10D — degraded Resume UX below the 1024px desktop breakpoint.
 *
 * Architecture §47: side-by-side paginated paper is desktop-primary. Narrow
 * viewports keep library + JD + suggestion review, allow per-block editing,
 * and must not claim WYSIWYG page fidelity.
 */

export const RESUME_MOBILE_FIDELITY_BANNER =
  "High-fidelity editing is best on a computer.";

export const RESUME_MOBILE_ANALYSIS_SUMMARY = "Job description and suggestions";

export const RESUME_MOBILE_EDITOR_HELP =
  "Paginated Word-like pages are hidden on this screen size. You can still edit paragraphs and review suggestions. Microsoft Word remains the source of truth for wrapping and page count.";

/** Hide US Letter CSS pages when the viewport is below `useIsDesktopViewport`. */
export function shouldHidePaginatedResumePaper(isDesktopViewport: boolean): boolean {
  return !isDesktopViewport;
}
