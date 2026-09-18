/**
 * Phase 9E — labeled print preview of the in-app CSS pages.
 *
 * Architecture §39 / ADR-004: this is not an authoritative PDF. Do not use
 * html2pdf, jsPDF, Playwright, or server conversion. The user may Save as PDF
 * from the browser print dialog; Word remains pagination truth.
 */

export const RESUME_PRINT_PREVIEW_BUTTON_LABEL = "Print preview (approximate)";

export const RESUME_PRINT_PREVIEW_DISCLAIMER =
  "Prints this on-screen preview only. It is an approximation, not a Microsoft Word PDF, and not an ATS score. Use Download Word for the real document.";

export function printResumePreviewApproximation(
  printFn: () => void = () => window.print()
): void {
  printFn();
}
