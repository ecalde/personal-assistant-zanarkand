import { describe, expect, it } from "vitest";
import { validatePayloadForUpload } from "./dbMappers";
import type { Session, Skill } from "./model";
import { defaultPayload, defaultWeeklySchedule } from "./state";
import {
  cleanupOrphanedSessions,
  removeSkillFromPayload,
} from "./sessions";

const NOW = "2026-05-26T12:00:00.000Z";
const SKILL_A = "22222222-2222-4222-8222-222222222222";
const SKILL_B = "33333333-3333-4333-8333-333333333333";
const SESSION_A = "44444444-4444-4444-8444-444444444444";
const SESSION_B = "55555555-5555-4555-8555-555555555555";

function sampleSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: SKILL_A,
    name: "Piano",
    schedule: defaultWeeklySchedule(),
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function sampleSession(overrides: Partial<Session> = {}): Session {
  return {
    id: SESSION_A,
    skillId: SKILL_A,
    minutes: 25,
    startedAtIso: NOW,
    createdAtIso: NOW,
    ...overrides,
  };
}

describe("removeSkillFromPayload", () => {
  it("removes the skill and all sessions for that skill", () => {
    const skillA = sampleSkill();
    const skillB = sampleSkill({ id: SKILL_B, name: "Guitar" });
    const sessionForA = sampleSession();
    const sessionForB = sampleSession({
      id: SESSION_B,
      skillId: SKILL_B,
    });

    const payload = {
      ...defaultPayload(),
      skills: [skillA, skillB],
      sessions: [sessionForA, sessionForB],
    };

    const next = removeSkillFromPayload(payload, SKILL_A);

    expect(next.skills).toEqual([skillB]);
    expect(next.sessions).toEqual([sessionForB]);
  });

  it("allows validatePayloadForUpload after skill deletion", () => {
    const skill = sampleSkill();
    const payload = {
      ...defaultPayload(),
      skills: [skill],
      sessions: [sampleSession()],
    };

    const next = removeSkillFromPayload(payload, SKILL_A);

    expect(() => validatePayloadForUpload(next)).not.toThrow();
  });
});

describe("cleanupOrphanedSessions", () => {
  it("removes sessions whose skill no longer exists but keeps valid sessions", () => {
    const skill = sampleSkill();
    const validSession = sampleSession();
    const orphanSession = sampleSession({
      id: SESSION_B,
      skillId: "66666666-6666-4666-8666-666666666666",
    });

    const payload = {
      ...defaultPayload(),
      skills: [skill],
      sessions: [validSession, orphanSession],
    };

    const cleaned = cleanupOrphanedSessions(payload);

    expect(cleaned.sessions).toEqual([validSession]);
    expect(() => validatePayloadForUpload(cleaned)).not.toThrow();
  });

  it("returns the same payload reference when nothing to clean", () => {
    const skill = sampleSkill();
    const payload = {
      ...defaultPayload(),
      skills: [skill],
      sessions: [sampleSession()],
    };

    expect(cleanupOrphanedSessions(payload)).toBe(payload);
  });
});
