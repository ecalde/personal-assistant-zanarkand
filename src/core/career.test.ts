import { describe, expect, it } from "vitest";
import type { CareerTarget, JobApplication, Skill } from "./model";
import { defaultWeeklySchedule } from "./state";
import {
  applicationMatchesQuery,
  buildApplicationPipelineSummary,
  buildDreamJobSkillGap,
  filterAndSortApplications,
  formatSalaryRange,
  isActiveApplication,
} from "./career";

const NOW = "2026-05-26T12:00:00.000Z";
const SKILL_A = "22222222-2222-4222-8222-222222222222";
const SKILL_B = "33333333-3333-4333-8333-333333333333";
const APP_ID = "44444444-4444-4444-8444-444444444444";
const TARGET_ID = "55555555-5555-4555-8555-555555555555";

function sampleSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: SKILL_A,
    name: "TypeScript",
    schedule: defaultWeeklySchedule(),
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function sampleApplication(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: APP_ID,
    company: "Acme Corp",
    roleTitle: "Software Engineer",
    status: "applied",
    requiredSkillIds: [SKILL_A],
    appliedDate: "2026-05-20",
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function sampleTarget(overrides: Partial<CareerTarget> = {}): CareerTarget {
  return {
    id: TARGET_ID,
    roleTitle: "Staff Engineer",
    requiredSkillIds: [SKILL_A, SKILL_B],
    requiredSkillsText: "System design",
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("formatSalaryRange", () => {
  it("formats both min and max", () => {
    expect(formatSalaryRange(120000, 160000)).toBe("$120k–$160k");
  });

  it("formats min only", () => {
    expect(formatSalaryRange(100000, undefined)).toBe("$100k+");
  });

  it("formats max only", () => {
    expect(formatSalaryRange(undefined, 150000)).toBe("Up to $150k");
  });

  it("returns undefined when neither set", () => {
    expect(formatSalaryRange(undefined, undefined)).toBeUndefined();
  });
});

describe("buildDreamJobSkillGap", () => {
  it("returns null when no target", () => {
    expect(buildDreamJobSkillGap([sampleSkill()], undefined)).toBeNull();
  });

  it("resolves linked skills and surfaces unlinked text", () => {
    const skills = [sampleSkill({ id: SKILL_A, name: "TypeScript" })];
    const gap = buildDreamJobSkillGap(skills, sampleTarget());

    expect(gap?.linkedRequirements).toEqual([{ skillId: SKILL_A, skillName: "TypeScript" }]);
    expect(gap?.missingSkillIds).toEqual([SKILL_B]);
    expect(gap?.unlinkedText).toBe("System design");
  });
});

describe("applicationMatchesQuery", () => {
  it("matches company and role case-insensitively", () => {
    const app = sampleApplication();
    expect(applicationMatchesQuery(app, "acme")).toBe(true);
    expect(applicationMatchesQuery(app, "engineer")).toBe(true);
    expect(applicationMatchesQuery(app, "google")).toBe(false);
  });

  it("returns true for empty query", () => {
    expect(applicationMatchesQuery(sampleApplication(), "")).toBe(true);
  });
});

describe("filterAndSortApplications", () => {
  const apps: JobApplication[] = [
    sampleApplication({
      id: "11111111-1111-4111-8111-111111111111",
      company: "Beta",
      status: "screening",
      appliedDate: "2026-05-10",
    }),
    sampleApplication({
      id: "22222222-2222-4222-8222-222222222222",
      company: "Alpha",
      status: "applied",
      appliedDate: "2026-05-25",
    }),
  ];

  it("sorts by company", () => {
    const result = filterAndSortApplications(apps, { sortMode: "company" });
    expect(result.map((a) => a.company)).toEqual(["Alpha", "Beta"]);
  });

  it("sorts by recent applied date", () => {
    const result = filterAndSortApplications(apps, { sortMode: "recent" });
    expect(result[0]?.company).toBe("Alpha");
  });

  it("filters in-progress statuses", () => {
    const result = filterAndSortApplications(apps, {
      sortMode: "recent",
      statusFilter: "in-progress",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe("screening");
  });
});

describe("buildApplicationPipelineSummary", () => {
  it("counts active applications and recent list", () => {
    const apps = [
      sampleApplication({ status: "applied" }),
      sampleApplication({
        id: "66666666-6666-4666-8666-666666666666",
        status: "rejected",
      }),
      sampleApplication({
        id: "77777777-7777-4777-8777-777777777777",
        status: "screening",
        appliedDate: "2026-05-27",
      }),
    ];

    const summary = buildApplicationPipelineSummary(apps, { recentLimit: 2 });

    expect(summary.total).toBe(3);
    expect(summary.activeCount).toBe(2);
    expect(summary.byStatus.rejected).toBe(1);
    expect(summary.recentApplications).toHaveLength(2);
  });
});

describe("isActiveApplication", () => {
  it("treats pipeline statuses as active", () => {
    expect(isActiveApplication("applied")).toBe(true);
    expect(isActiveApplication("screening")).toBe(true);
  });

  it("treats terminal statuses as inactive", () => {
    expect(isActiveApplication("rejected")).toBe(false);
    expect(isActiveApplication("offer")).toBe(false);
  });
});
