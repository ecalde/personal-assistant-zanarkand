import { describe, expect, it, vi } from "vitest";
import {
  RESUME_PRINT_PREVIEW_BUTTON_LABEL,
  RESUME_PRINT_PREVIEW_DISCLAIMER,
  printResumePreviewApproximation,
} from "./resumePrintPreview";

describe("resumePrintPreview", () => {
  it("labels the control as an approximate print preview, not a Word PDF", () => {
    expect(RESUME_PRINT_PREVIEW_BUTTON_LABEL).toBe("Print preview (approximate)");
    expect(RESUME_PRINT_PREVIEW_DISCLAIMER.toLowerCase()).toContain("approximation");
    expect(RESUME_PRINT_PREVIEW_DISCLAIMER.toLowerCase()).toContain("not a microsoft word pdf");
    expect(RESUME_PRINT_PREVIEW_DISCLAIMER.toLowerCase()).not.toContain("ats score: ");
  });

  it("calls the injected print function once (window.print in the product)", () => {
    const printFn = vi.fn();
    printResumePreviewApproximation(printFn);
    expect(printFn).toHaveBeenCalledTimes(1);
  });
});
