import { describe, expect, it } from "vitest";
import {
  collectTargetMuscleIds,
  expandMuscleIdsForChart,
  formatMuscleList,
  getMuscleById,
  isMuscleId,
  listMuscles,
  normalizeTargetMuscleIds,
  resolveMuscleId,
  suggestMuscles,
} from "./muscles";

describe("muscles catalog", () => {
  it("exposes a non-empty catalog of unique ids", () => {
    const muscles = listMuscles();
    expect(muscles.length).toBeGreaterThan(40);
    const ids = new Set(muscles.map((muscle) => muscle.id));
    expect(ids.size).toBe(muscles.length);
  });

  it("resolves anatomical and informal synonyms to one canonical id", () => {
    expect(resolveMuscleId("gastrocnemius")).toBe("gastrocnemius");
    expect(resolveMuscleId("Gastroc")).toBe("gastrocnemius");
    expect(resolveMuscleId("calf muscle")).toBe("gastrocnemius");
    expect(resolveMuscleId("CALF")).toBe("gastrocnemius");

    expect(resolveMuscleId("quads")).toBe("quadriceps");
    expect(resolveMuscleId("quad")).toBe("quadriceps");
    expect(resolveMuscleId("Quadriceps")).toBe("quadriceps");

    expect(resolveMuscleId("lats")).toBe("latissimus_dorsi");
    expect(resolveMuscleId("pecs")).toBe("chest");
    expect(resolveMuscleId("hams")).toBe("hamstrings");
    expect(resolveMuscleId("rear delts")).toBe("posterior_deltoid");
    expect(resolveMuscleId("traps")).toBe("trapezius");
  });

  it("keeps calves group distinct from gastrocnemius while chart-expanding both", () => {
    expect(resolveMuscleId("calves")).toBe("calves");
    expect(resolveMuscleId("calf")).toBe("gastrocnemius");

    const fromGroup = expandMuscleIdsForChart(["calves"]);
    const fromSpecific = expandMuscleIdsForChart(["gastrocnemius"]);
    expect(fromGroup).toEqual(expect.arrayContaining(["gastrocnemius", "soleus"]));
    expect(fromSpecific).toContain("gastrocnemius");
  });

  it("suggests muscles from partial and synonym queries", () => {
    const calfHits = suggestMuscles("calf");
    expect(calfHits.some((hit) => hit.id === "gastrocnemius")).toBe(true);

    const quadHits = suggestMuscles("quad");
    expect(quadHits[0]?.id).toBe("quadriceps");

    const excluded = suggestMuscles("quad", { excludeIds: ["quadriceps"] });
    expect(excluded.every((hit) => hit.id !== "quadriceps")).toBe(true);
  });

  it("normalizes free-text and duplicate ids into catalog ids", () => {
    expect(
      normalizeTargetMuscleIds(["quads", "quadriceps", "calf muscle", "not-a-muscle", 12])
    ).toEqual(["quadriceps", "gastrocnemius"]);
  });

  it("formats display names and collects coverage ids", () => {
    expect(formatMuscleList(["quadriceps", "gastrocnemius"])).toBe(
      "Quadriceps, Gastrocnemius"
    );
    expect(isMuscleId("quadriceps")).toBe(true);
    expect(isMuscleId("eyeballs")).toBe(false);
    expect(getMuscleById("chest")?.kind).toBe("group");

    expect(
      collectTargetMuscleIds([
        { targetMuscleIds: ["chest", "triceps"] },
        { targetMuscleIds: ["chest", "unknown"] },
      ])
    ).toEqual(["chest", "triceps"]);
  });
});
