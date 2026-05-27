import { describe, expect, it } from "vitest";
import type { CareerTarget, JobApplication, Skill } from "./model";
import { defaultWeeklySchedule } from "./state";
import {
  APPLIED_NO_RESPONSE_DAYS,
  STUCK_IN_STAGE_DAYS,
  applicationMatchesQuery,
  applyQuickStatusTransition,
  buildApplicationPipelineSummary,
  buildApplicationsNeedingAttention,
  buildDreamJobSkillGap,
  buildInterviewStageSummary,
  buildSkillGapPriorityList,
  filterAndSortApplications,
  formatSalaryRange,
  getApplicationAttentionStatus,
  getQuickStatusActions,
  getSecondaryQuickStatusActions,
  getStatusBadgeVariant,
  isActiveApplication,
} from "./career";

const TODAY = "2026-05-27";
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

describe("getApplicationAttentionStatus", () => {
  it("flags saved applications", () => {
    const status = getApplicationAttentionStatus(
      sampleApplication({ status: "saved", appliedDate: undefined }),
      TODAY
    );
    expect(status?.reasons).toEqual(["saved_not_applied"]);
  });

  it("flags no response after threshold", () => {
    const appliedDate = "2026-05-01";
    const status = getApplicationAttentionStatus(
      sampleApplication({ status: "applied", appliedDate }),
      TODAY
    );
    expect(status?.reasons).toContain("no_response");
    expect(status!.daysSinceApplied).toBeGreaterThanOrEqual(APPLIED_NO_RESPONSE_DAYS);
  });

  it("does not flag applied without appliedDate for no_response", () => {
    const status = getApplicationAttentionStatus(
      sampleApplication({ status: "applied", appliedDate: undefined }),
      TODAY
    );
    expect(status).toBeNull();
  });

  it("flags stuck interview stages", () => {
    const oldUpdate = "2026-04-01T10:00:00.000Z";
    const status = getApplicationAttentionStatus(
      sampleApplication({ status: "screening", updatedAtIso: oldUpdate }),
      TODAY
    );
    expect(status?.reasons).toContain("stuck_in_stage");
    expect(status!.daysInStage).toBeGreaterThanOrEqual(STUCK_IN_STAGE_DAYS);
  });

  it("returns null for terminal statuses", () => {
    expect(getApplicationAttentionStatus(sampleApplication({ status: "rejected" }), TODAY)).toBeNull();
    expect(getApplicationAttentionStatus(sampleApplication({ status: "offer" }), TODAY)).toBeNull();
  });
});

describe("buildApplicationsNeedingAttention", () => {
  it("orders stuck before no_response before saved", () => {
    const apps = [
      sampleApplication({ id: "1", status: "saved", company: "Saved Co" }),
      sampleApplication({
        id: "2",
        status: "applied",
        company: "Applied Co",
        appliedDate: "2026-05-01",
      }),
      sampleApplication({
        id: "3",
        status: "screening",
        company: "Stuck Co",
        updatedAtIso: "2026-04-01T10:00:00.000Z",
      }),
    ];
    const items = buildApplicationsNeedingAttention(apps, TODAY);
    expect(items[0]?.application.company).toBe("Stuck Co");
    expect(items.map((i) => i.application.company)).toEqual(["Stuck Co", "Applied Co", "Saved Co"]);
  });
});

describe("buildInterviewStageSummary", () => {
  it("counts interview stages only", () => {
    const summary = buildInterviewStageSummary([
      sampleApplication({ status: "screening" }),
      sampleApplication({ id: "2", status: "technical" }),
      sampleApplication({ id: "3", status: "applied" }),
    ]);
    expect(summary.count).toBe(2);
    expect(summary.byStage.screening).toBe(1);
    expect(summary.byStage.technical).toBe(1);
  });
});

describe("getQuickStatusActions", () => {
  it("returns pipeline actions per status", () => {
    expect(getQuickStatusActions("saved")[0]?.nextStatus).toBe("applied");
    expect(getQuickStatusActions("applied")[0]?.nextStatus).toBe("screening");
    expect(getQuickStatusActions("rejected")).toEqual([]);
  });

  it("includes secondary terminal actions for mid-pipeline", () => {
    expect(getSecondaryQuickStatusActions("applied").map((a) => a.nextStatus)).toEqual([
      "rejected",
      "withdrawn",
    ]);
  });
});

describe("applyQuickStatusTransition", () => {
  it("sets appliedDate when marking saved as applied", () => {
    const app = sampleApplication({ status: "saved", appliedDate: undefined });
    const next = applyQuickStatusTransition(
      app,
      { label: "Mark applied", nextStatus: "applied", setAppliedDateToday: true },
      TODAY
    );
    expect(next.status).toBe("applied");
    expect(next.appliedDate).toBe(TODAY);
    expect(next.company).toBe("Acme Corp");
  });
});

describe("buildSkillGapPriorityList", () => {
  it("orders linked skills by priority and splits unlinked text", () => {
    const skills = [
      sampleSkill({ id: SKILL_A, name: "TypeScript", priority: 2 }),
      sampleSkill({ id: SKILL_B, name: "Rust", priority: 4 }),
    ];
    const items = buildSkillGapPriorityList(
      skills,
      sampleTarget({ requiredSkillIds: [SKILL_A, SKILL_B], requiredSkillsText: "K8s, System design" })
    );
    expect(items[0]?.kind).toBe("linked");
    expect(items[0]?.kind === "linked" && items[0].skillName).toBe("Rust");
    expect(items.filter((i) => i.kind === "unlinked")).toHaveLength(2);
  });
});

describe("getStatusBadgeVariant", () => {
  it("returns overdue for stuck applications", () => {
    const attention = getApplicationAttentionStatus(
      sampleApplication({ status: "screening", updatedAtIso: "2026-04-01T10:00:00.000Z" }),
      TODAY
    );
    expect(getStatusBadgeVariant("screening", attention)).toBe("overdue");
  });

  it("returns positive for offer", () => {
    expect(getStatusBadgeVariant("offer", null)).toBe("positive");
  });
});

describe("filterAndSortApplications attention modes", () => {
  const apps = [
    sampleApplication({ id: "1", status: "saved", company: "Saved Co" }),
    sampleApplication({
      id: "2",
      status: "applied",
      company: "Applied Co",
      appliedDate: "2026-05-01",
    }),
  ];

  it("filters needs-attention", () => {
    const result = filterAndSortApplications(apps, {
      sortMode: "recent",
      statusFilter: "needs-attention",
      todayKey: TODAY,
    });
    expect(result).toHaveLength(2);
  });

  it("sorts by needsAttention", () => {
    const result = filterAndSortApplications(apps, {
      sortMode: "needsAttention",
      todayKey: TODAY,
    });
    expect(result[0]?.company).toBe("Applied Co");
  });
});
