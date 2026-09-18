import { describe, expect, it } from "vitest";
import {
  parseResumeApplicationLinkSelectValue,
  resumeApplicationLinkLabel,
  resumeApplicationLinkOptions,
  resumeApplicationLinkSelectValue,
} from "./resumeApplicationLink";

const APP_A = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  company: "Acme",
  roleTitle: "Backend Engineer",
};

describe("resumeApplicationLinkLabel", () => {
  it("uses company and role with text, not color", () => {
    expect(resumeApplicationLinkLabel(APP_A)).toBe("Acme — Backend Engineer");
  });

  it("does not invent a company or role when those fields are blank", () => {
    expect(resumeApplicationLinkLabel({ id: APP_A.id, company: "  ", roleTitle: "" })).toBe(
      "Untitled company — Untitled role"
    );
  });
});

describe("resumeApplicationLinkSelectValue", () => {
  it("maps null to the empty option and a uuid back from the select", () => {
    expect(resumeApplicationLinkSelectValue(null)).toBe("");
    expect(parseResumeApplicationLinkSelectValue("")).toBeNull();
    expect(parseResumeApplicationLinkSelectValue(APP_A.id)).toBe(APP_A.id);
  });
});

describe("resumeApplicationLinkOptions", () => {
  it("keeps a saved id when the Career application is missing", () => {
    const orphan = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const options = resumeApplicationLinkOptions([APP_A], orphan);
    expect(options.map((row) => row.id)).toEqual([APP_A.id, orphan]);
    expect(resumeApplicationLinkLabel(options[1]!)).toContain("no longer in Career list");
  });
});
