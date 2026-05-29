import { describe, expect, it } from "vitest";
import { minutesFromMidnight } from "./useNowMinutes";

describe("minutesFromMidnight", () => {
  it("returns 0 at local midnight", () => {
    expect(minutesFromMidnight(new Date(2026, 4, 29, 0, 0))).toBe(0);
  });

  it("computes minutes for a mid-day time", () => {
    expect(minutesFromMidnight(new Date(2026, 4, 29, 9, 30))).toBe(9 * 60 + 30);
  });

  it("computes minutes for the last minute of the day", () => {
    expect(minutesFromMidnight(new Date(2026, 4, 29, 23, 59))).toBe(23 * 60 + 59);
  });
});
