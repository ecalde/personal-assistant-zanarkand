import { describe, expect, it } from "vitest";
import {
  RESUME_MOBILE_ANALYSIS_SUMMARY,
  RESUME_MOBILE_EDITOR_HELP,
  RESUME_MOBILE_FIDELITY_BANNER,
  shouldHidePaginatedResumePaper,
} from "./resumeMobileLayout";

describe("resumeMobileLayout", () => {
  it("uses the architecture §47 phone banner verbatim", () => {
    expect(RESUME_MOBILE_FIDELITY_BANNER).toBe(
      "High-fidelity editing is best on a computer."
    );
  });

  it("hides paginated paper below the 1024px desktop breakpoint", () => {
    expect(shouldHidePaginatedResumePaper(true)).toBe(false);
    expect(shouldHidePaginatedResumePaper(false)).toBe(true);
  });

  it("keeps analysis and editor copy as readable text, not color-only", () => {
    expect(RESUME_MOBILE_ANALYSIS_SUMMARY.length).toBeGreaterThan(0);
    expect(RESUME_MOBILE_EDITOR_HELP).toMatch(/paginated/i);
    expect(RESUME_MOBILE_EDITOR_HELP).not.toMatch(/ATS Score/i);
  });
});
