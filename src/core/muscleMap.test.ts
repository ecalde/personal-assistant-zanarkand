import { describe, expect, it } from "vitest";
import {
  canonicalExerciseName,
  collectUnmappedExerciseNames,
  musclesForExerciseName,
  musclesForExerciseNames,
} from "./muscleMap";

describe("canonicalExerciseName", () => {
  it("strips equipment prefixes and set schemes", () => {
    expect(canonicalExerciseName("DB Bicep Curl 3x10")).toBe("bicep curl");
    expect(canonicalExerciseName("Barbell bench press")).toBe("bench press");
  });
});

describe("musclesForExerciseName", () => {
  it("maps bicep curls to biceps only", () => {
    expect(musclesForExerciseName("Bicep curls")).toEqual(["biceps_brachii"]);
    expect(musclesForExerciseName("dumbbell bicep curl")).toEqual(["biceps_brachii"]);
    expect(musclesForExerciseName("incline curl")).toEqual(["biceps_brachii"]);
  });

  it("does not treat leg curls as biceps", () => {
    expect(musclesForExerciseName("Lying leg curl")).toEqual(["hamstrings"]);
  });

  it("maps hammer curls to brachialis, not the whole arm", () => {
    expect(musclesForExerciseName("Hammer curl")).toEqual(["brachialis", "brachioradialis"]);
  });

  it("maps flat bench to pecs and incline to upper pecs only", () => {
    expect(musclesForExerciseName("Bench press")).toEqual(["pectoralis_upper", "pectoralis_lower"]);
    expect(musclesForExerciseName("Incline dumbbell press")).toEqual(["pectoralis_upper"]);
    expect(musclesForExerciseName("Decline bench")).toEqual(["pectoralis_lower"]);
  });

  it("maps isolation raises to a single deltoid head", () => {
    expect(musclesForExerciseName("Lateral raise")).toEqual(["deltoid_lateral"]);
    expect(musclesForExerciseName("Front raise")).toEqual(["deltoid_anterior"]);
    expect(musclesForExerciseName("Face pull")).toEqual(["deltoid_posterior"]);
  });

  it("maps standing vs seated calf raises to different muscles", () => {
    expect(musclesForExerciseName("Standing calf raise")).toEqual(["gastrocnemius"]);
    expect(musclesForExerciseName("Seated calf raise")).toEqual(["soleus"]);
  });

  it("returns no muscles for unknown names", () => {
    expect(musclesForExerciseName("Mystery machine")).toEqual([]);
    expect(musclesForExerciseName("")).toEqual([]);
  });
});

describe("musclesForExerciseNames", () => {
  it("unions unique ids in catalog order", () => {
    expect(musclesForExerciseNames(["Bicep curl", "Leg curl", "Bicep curl"])).toEqual([
      "biceps_brachii",
      "hamstrings",
    ]);
  });
});

describe("collectUnmappedExerciseNames", () => {
  it("returns unique original names that have no mapping", () => {
    expect(collectUnmappedExerciseNames(["Bicep curl", "Foam roll", "foam  roll"])).toEqual([
      "Foam roll",
    ]);
  });
});
